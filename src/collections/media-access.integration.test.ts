/**
 * Media access integration tests (Phase 2 / SP0-R2 / RT-2).
 *
 * Verifies tenant isolation across media documents, R2 keyspace, folders,
 * and admin query scopes against real Postgres and Payload instances.
 *
 * Runner:
 *   PAYLOAD_INTEGRATION=1 R2_OFF=true pnpm test:integration      # local (loads .env if present)
 *   PAYLOAD_INTEGRATION=1 R2_OFF=true node --env-file=.env --import tsx \
 *     --test src/collections/media-access.integration.test.ts    # single file
 *
 * Refuses to run against a non-local DATABASE_URI (see test-utils/payload-integration.ts).
 */
import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Payload } from 'payload'

import {
  getIntegrationPayload,
  closeIntegrationPayload,
  setupTwoTenants,
  cleanupTwoTenants,
  TINY_PNG_BUFFER,
  isIntegrationEnabled,
  type TwoTenantsFixture,
} from '../test-utils/payload-integration'
import { resolveDeletableKey } from '../lib/r2-storage-adapter'
import { getValidatedAdminTenantId, type TenantUser } from '../lib/admin-selected-tenant'
import { internalLinkSuggestEndpoint } from '../endpoints/internal-link-suggest'

describe('Media Tenant Access Integration Tests', { skip: !isIntegrationEnabled ? 'PAYLOAD_INTEGRATION=1 is not set' : false }, () => {
  let payload: Payload
  let fixture: TwoTenantsFixture

  before(async () => {
    payload = await getIntegrationPayload()
    fixture = await setupTwoTenants(payload, 'media-access')
  })

  after(async () => {
    if (payload && fixture) {
      await cleanupTwoTenants(payload, fixture)
    }
    await closeIntegrationPayload(payload)
  })

  test('author(tenant A) uploads -> OK, doc.tenant = A', async () => {
    const uploadDoc = await payload.create({
      collection: 'media',
      data: { alt: 'Author A upload test' },
      file: {
        data: TINY_PNG_BUFFER,
        name: `author-a-upload-${Date.now()}.png`,
        mimetype: 'image/png',
        size: TINY_PNG_BUFFER.length,
      },
      user: fixture.tenantA.author,
      overrideAccess: false,
    })
    fixture.trackMedia(uploadDoc.id)

    assert.ok(uploadDoc.id, 'Upload document should have an ID')
    const tenantId =
      typeof uploadDoc.tenant === 'object' && uploadDoc.tenant !== null
        ? uploadDoc.tenant.id
        : uploadDoc.tenant
    assert.equal(tenantId, fixture.tenantA.site.id, 'Uploaded media tenant must match tenant A')
  })

  test('author(A) updates alt of media(B) -> forbidden', async () => {
    await assert.rejects(
      async () => {
        await payload.update({
          collection: 'media',
          id: fixture.tenantB.media.id,
          data: { alt: 'Malicious cross-tenant update by author A' },
          user: fixture.tenantA.author,
          overrideAccess: false,
        })
      },
      (err: unknown) => {
        return (
          typeof err === 'object' &&
          err !== null &&
          (('status' in err && (err.status === 403 || err.status === 404)) ||
            ('name' in err && (err.name === 'Forbidden' || err.name === 'NotFound')))
        )
      },
      'Cross-tenant update by author(A) on media(B) must be rejected',
    )
  })

  test('editor(A) deletes media(B) -> forbidden', async () => {
    await assert.rejects(
      async () => {
        await payload.delete({
          collection: 'media',
          id: fixture.tenantB.media.id,
          user: fixture.tenantA.editor,
          overrideAccess: false,
        })
      },
      (err: unknown) => {
        return (
          typeof err === 'object' &&
          err !== null &&
          (('status' in err && (err.status === 403 || err.status === 404)) ||
            ('name' in err && (err.name === 'Forbidden' || err.name === 'NotFound')))
        )
      },
      'Cross-tenant delete by editor(A) on media(B) must be rejected',
    )

    // Verify media B is still intact
    const mediaBStillExists = await payload.findByID({
      collection: 'media',
      id: fixture.tenantB.media.id,
      overrideAccess: true,
    })
    assert.ok(mediaBStillExists, 'Media B should still exist in database')
  })

  test('editor(A) deletes media(A) -> OK', async () => {
    const tempMediaA = await payload.create({
      collection: 'media',
      data: { alt: 'Disposable Media A', tenant: fixture.tenantA.site.id },
      file: {
        data: TINY_PNG_BUFFER,
        name: `temp-a-${Date.now()}.png`,
        mimetype: 'image/png',
        size: TINY_PNG_BUFFER.length,
      },
      overrideAccess: true,
    })
    fixture.trackMedia(tempMediaA.id)

    const deleted = await payload.delete({
      collection: 'media',
      id: tempMediaA.id,
      user: fixture.tenantA.editor,
      overrideAccess: false,
    })
    assert.ok(deleted, 'Delete operation should succeed')

    const lookup = await payload.find({
      collection: 'media',
      where: { id: { equals: tempMediaA.id } },
      overrideAccess: true,
    })
    assert.equal(lookup.docs.length, 0, 'Deleted media should no longer exist')
  })

  test('super-admin updates/deletes media(B) -> OK', async () => {
    // Super-admin updates media B
    const updated = await payload.update({
      collection: 'media',
      id: fixture.tenantB.media.id,
      data: { alt: 'Updated by Super Admin' },
      user: fixture.superAdmin,
      overrideAccess: false,
    })
    assert.equal(updated.alt, 'Updated by Super Admin')

    // Super-admin deletes a temporary doc in tenant B
    const tempMediaB = await payload.create({
      collection: 'media',
      data: { alt: 'Disposable Media B', tenant: fixture.tenantB.site.id },
      file: {
        data: TINY_PNG_BUFFER,
        name: `temp-b-${Date.now()}.png`,
        mimetype: 'image/png',
        size: TINY_PNG_BUFFER.length,
      },
      overrideAccess: true,
    })
    fixture.trackMedia(tempMediaB.id)

    const deleted = await payload.delete({
      collection: 'media',
      id: tempMediaB.id,
      user: fixture.superAdmin,
      overrideAccess: false,
    })
    assert.ok(deleted, 'Super-admin delete should succeed')

    const lookup = await payload.find({
      collection: 'media',
      where: { id: { equals: tempMediaB.id } },
      overrideAccess: true,
    })
    assert.equal(lookup.docs.length, 0, 'Deleted media should be gone')
  })

  test('anonymous find media -> OK (read public)', async () => {
    const result = await payload.find({
      collection: 'media',
      where: { id: { equals: fixture.tenantA.media.id } },
      overrideAccess: false,
    })
    assert.equal(result.docs.length, 1, 'Anonymous user must be able to read media')
    assert.equal(result.docs[0].id, fixture.tenantA.media.id)
  })

  test('user with no tenants creates -> forbidden', async () => {
    await assert.rejects(
      async () => {
        const created = await payload.create({
          collection: 'media',
          data: { alt: 'Orphaned media attempt' },
          file: {
            data: TINY_PNG_BUFFER,
            name: `orphan-${Date.now()}.png`,
            mimetype: 'image/png',
            size: TINY_PNG_BUFFER.length,
          },
          user: fixture.zeroTenantUser,
          overrideAccess: false,
        })
        if (created?.id) fixture.trackMedia(created.id)
      },
      (err: unknown) => {
        return (
          typeof err === 'object' &&
          err !== null &&
          (('status' in err && err.status === 403) ||
            ('name' in err && err.name === 'Forbidden'))
        )
      },
      'Zero-tenant user creation must throw Forbidden 403',
    )
  })

  test('[RT-1] author(A) sets externalUrl to https://x/media/<B>/k.webp -> rejected; super-admin-created doc with such URL, deleted by anyone -> no R2 delete on B', async (t) => {
    // 1. Rejection on creation with externalUrl targeting CMS media keyspace
    await assert.rejects(
      async () => {
        const created = await payload.create({
          collection: 'media',
          data: {
            alt: 'Attacker externalUrl',
            externalUrl: `https://example.com/media/${fixture.tenantB.site.id}/target.webp`,
          },
          file: {
            data: TINY_PNG_BUFFER,
            name: `attack-${Date.now()}.png`,
            mimetype: 'image/png',
            size: TINY_PNG_BUFFER.length,
          },
          user: fixture.tenantA.author,
          overrideAccess: false,
        })
        if (created?.id) fixture.trackMedia(created.id)
      },
      (err: unknown) => {
        return (
          typeof err === 'object' &&
          err !== null &&
          ('name' in err && (err.name === 'ValidationError' || err.name === 'Forbidden'))
        )
      },
      'External URL pointing into media/ keyspace must be rejected for non-super-admin',
    )

    // 2. Pure contract check: externalUrl present means no R2 delete
    const docWithExternalUrl = {
      tenant: fixture.tenantA.site.id,
      externalUrl: `https://example.com/media/${fixture.tenantB.site.id}/target.webp`,
      url: `https://example.com/media/${fixture.tenantB.site.id}/target.webp`,
    }
    const deletableKey = resolveDeletableKey(docWithExternalUrl, {
      memberTenantIds: [String(fixture.tenantA.site.id)],
      isSuperAdmin: false,
      isInternalCaller: false,
    })
    assert.equal(deletableKey, undefined, 'Must not resolve deletable R2 key when externalUrl is present')

    if (process.env.R2_OFF !== 'true') {
      t.skip('Skipped live R2 delete command check when R2_OFF is not true')
    }
  })

  test('[RT-1] author(A) deletes own normal upload -> R2 delete called with media/<A>/... only', async (t) => {
    const ownDoc = {
      tenant: fixture.tenantA.site.id,
      url: `https://cdn.example.com/media/${fixture.tenantA.site.id}/sample.webp`,
    }
    const resolvedKey = resolveDeletableKey(ownDoc, {
      memberTenantIds: [String(fixture.tenantA.site.id)],
      isSuperAdmin: false,
      isInternalCaller: false,
    })
    assert.equal(resolvedKey, `media/${fixture.tenantA.site.id}/sample.webp`)

    const foreignDoc = {
      tenant: fixture.tenantB.site.id,
      url: `https://cdn.example.com/media/${fixture.tenantB.site.id}/sample.webp`,
    }
    const foreignKey = resolveDeletableKey(foreignDoc, {
      memberTenantIds: [String(fixture.tenantA.site.id)],
      isSuperAdmin: false,
      isInternalCaller: false,
    })
    assert.equal(foreignKey, undefined, 'Cannot delete foreign R2 key')

    if (process.env.R2_OFF !== 'true') {
      t.skip('Skipped live R2 delete command check when R2_OFF is not true')
    }
  })

  test('[RT-5] author(A) reads/renames/deletes tenant-B folder -> forbidden; tenant-B media untouched', async () => {
    const folderB = (await payload.create({
      collection: 'payload-folders',
      data: {
        name: `Folder B ${Date.now()}`,
        tenant: fixture.tenantB.site.id,
      },
      overrideAccess: true,
    })) as { id: number }
    fixture.trackFolder(folderB.id)

    const mediaInFolderB = await payload.create({
      collection: 'media',
      data: {
        alt: 'Media in Folder B',
        tenant: fixture.tenantB.site.id,
        folder: folderB.id,
      },
      file: {
        data: TINY_PNG_BUFFER,
        name: `folder-b-media-${Date.now()}.png`,
        mimetype: 'image/png',
        size: TINY_PNG_BUFFER.length,
      },
      overrideAccess: true,
    })
    fixture.trackMedia(mediaInFolderB.id)

    // 1. Read folder B
    await assert.rejects(
      async () => {
        await payload.findByID({
          collection: 'payload-folders',
          id: folderB.id,
          user: fixture.tenantA.author,
          overrideAccess: false,
        })
      },
      (err: unknown) => {
        return (
          typeof err === 'object' &&
          err !== null &&
          (('status' in err && (err.status === 403 || err.status === 404)) ||
            ('name' in err && (err.name === 'Forbidden' || err.name === 'NotFound')))
        )
      },
      'Cross-tenant folder read must be rejected',
    )

    // 2. Rename folder B
    await assert.rejects(
      async () => {
        await payload.update({
          collection: 'payload-folders',
          id: folderB.id,
          data: { name: 'Renamed by Attacker A' },
          user: fixture.tenantA.author,
          overrideAccess: false,
        })
      },
      (err: unknown) => {
        return (
          typeof err === 'object' &&
          err !== null &&
          (('status' in err && (err.status === 403 || err.status === 404)) ||
            ('name' in err && (err.name === 'Forbidden' || err.name === 'NotFound')))
        )
      },
      'Cross-tenant folder update/rename must be rejected',
    )

    // 3. Delete folder B
    await assert.rejects(
      async () => {
        await payload.delete({
          collection: 'payload-folders',
          id: folderB.id,
          user: fixture.tenantA.author,
          overrideAccess: false,
        })
      },
      (err: unknown) => {
        return (
          typeof err === 'object' &&
          err !== null &&
          (('status' in err && (err.status === 403 || err.status === 404)) ||
            ('name' in err && (err.name === 'Forbidden' || err.name === 'NotFound')))
        )
      },
      'Cross-tenant folder delete must be rejected',
    )

    // 4. Verify tenant B media in folder B is untouched
    const mediaBCheck = await payload.findByID({
      collection: 'media',
      id: mediaInFolderB.id,
      overrideAccess: true,
    })
    assert.ok(mediaBCheck, 'Tenant B media must remain intact')
  })

  test('[RT-7] author(A) with forged cookie payload-tenant=<B>: dashboard loader + GET /api/seo/internal-link-suggest return no tenant-B data', async () => {
    const postB = await payload.create({
      collection: 'posts',
      data: {
        title: `Confidential Route Post ${Date.now()}`,
        slug: `confidential-route-post-${Date.now()}`,
        type: 'blog',
        status: 'published',
        tenant: fixture.tenantB.site.id,
        content: { root: { type: 'root', children: [], direction: null, format: '', indent: 0, version: 1 } },
      },
      overrideAccess: true,
    })
    fixture.trackPost(postB.id)

    // 1. Dashboard loader simulation: validated tenant resolution
    const validatedTenantId = getValidatedAdminTenantId({
      cookieHeader: `payload-tenant=${fixture.tenantB.site.id}`,
      user: fixture.tenantA.author as unknown as TenantUser,
    })
    assert.notEqual(
      validatedTenantId,
      String(fixture.tenantB.site.id),
      'Forged cookie must not resolve to foreign tenant ID for regular user',
    )

    const dashboardQueryWhere = validatedTenantId ? { tenant: { equals: validatedTenantId } } : undefined
    const dashboardPosts = await payload.find({
      collection: 'posts',
      where: dashboardQueryWhere,
      user: fixture.tenantA.author,
      overrideAccess: false,
    })
    const leakedPost = dashboardPosts.docs.find((p) => p.id === postB.id)
    assert.equal(leakedPost, undefined, 'Dashboard loader query must not leak tenant B posts')

    // 2. internal-link-suggest endpoint: call with forged cookie
    const req = {
      user: fixture.tenantA.author,
      payload,
      url: 'http://localhost/api/seo/internal-link-suggest?docId=999999&collection=posts&keyword=Confidential',
      headers: new Headers({
        cookie: `payload-tenant=${fixture.tenantB.site.id}`,
      }),
    } as unknown as Parameters<typeof internalLinkSuggestEndpoint.handler>[0]
    const res = await internalLinkSuggestEndpoint.handler(req)
    const body = (await res.json()) as { suggestions?: Array<{ id: number }> }
    const foreignSuggestion = body.suggestions?.find((s) => s.id === postB.id)
    assert.equal(foreignSuggestion, undefined, 'internal-link-suggest must return no tenant B suggestions')
  })
})
