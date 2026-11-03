/**
 * Content versions (SP1a-1) against real Postgres + Payload.
 *
 *   PAYLOAD_INTEGRATION=1 R2_OFF=true node --env-file=.env --import tsx \
 *     --test src/collections/content-versions.integration.test.ts
 *
 * Pins: one version per admin save (derived fields ride the same write), the admin reload
 * invariant (response `updatedAt` = stored), [RT-3] other-locale/relationship preservation,
 * restore (JSON-LD regenerated), tenant-scoped `readVersions`, and the author publish rule on
 * restore. Refuses a non-local DATABASE_URI (see test-utils/payload-integration.ts).
 */
import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Payload } from 'payload'

import {
  getIntegrationPayload,
  closeIntegrationPayload,
  setupTwoTenants,
  cleanupTwoTenants,
  isIntegrationEnabled,
  type TwoTenantsFixture,
} from '../test-utils/payload-integration'

type Localized<T> = { vi?: T; en?: T }
type PostDoc = {
  id: number
  title?: string
  updatedAt?: string
  wordCount?: number
  status?: string
  categories?: Array<number | { id: number }>
  seo?: { jsonLd?: { raw?: string | null } }
}

describe('Content versions (SP1a-1)', { skip: !isIntegrationEnabled ? 'PAYLOAD_INTEGRATION=1 is not set' : false }, () => {
  let payload: Payload
  let fixture: TwoTenantsFixture
  let termId: number
  const run = `${Date.now()}-${Math.floor(Math.random() * 1e5)}`

  const versionsOf = async (id: number) =>
    payload.findVersions({
      collection: 'posts',
      where: { parent: { equals: id } },
      overrideAccess: true,
      sort: 'createdAt',
      limit: 100,
      depth: 0,
    })

  const createPost = async (
    data: Record<string, unknown>,
    user: TwoTenantsFixture['tenantA']['editor'],
  ): Promise<PostDoc> => {
    const doc = (await payload.create({
      collection: 'posts',
      locale: 'vi',
      // Loose on purpose: each test sets different fields; Payload validates the shape.
      data: { type: 'blog', status: 'draft', tenant: fixture.tenantA.site.id, ...data } as never,
      user,
      overrideAccess: false,
    })) as unknown as PostDoc
    fixture.trackPost(doc.id)
    return doc
  }

  before(async () => {
    payload = await getIntegrationPayload()
    fixture = await setupTwoTenants(payload, 'versions')
    const term = await payload.create({
      collection: 'taxonomies',
      data: { name: `Term ${run}`, slug: `term-${run}`, type: 'category', tenant: fixture.tenantA.site.id },
      overrideAccess: true,
    })
    termId = term.id as number
  })

  after(async () => {
    if (payload && fixture) {
      await cleanupTwoTenants(payload, fixture)
      await payload.delete({ collection: 'taxonomies', id: termId, overrideAccess: true }).catch(() => {})
    }
    await closeIntegrationPayload(payload)
  })

  test('one admin save = exactly one version; wordCount + JSON-LD land; response updatedAt = stored', async () => {
    const editor = fixture.tenantA.editor
    const created = await createPost({ title: `Bài gốc ${run}`, slug: `bai-goc-${run}`, contentMd: 'một hai' }, editor)
    assert.equal((await versionsOf(created.id)).totalDocs, 1, 'create writes one version')

    const saved = (await payload.update({
      collection: 'posts',
      id: created.id,
      locale: 'vi',
      data: { title: `Bài sửa ${run}`, contentMd: '# Tiêu đề\n\nmột hai ba' },
      user: editor,
      overrideAccess: false,
    })) as unknown as PostDoc
    assert.equal((await versionsOf(created.id)).totalDocs, 2, 'an update writes ONE more version, not 2–4')

    assert.equal(saved.wordCount, 5)
    assert.match(saved.seo?.jsonLd?.raw ?? '', new RegExp(`Bài sửa ${run}`), 'JSON-LD reflects this save')

    const stored = (await payload.findByID({ collection: 'posts', id: created.id, depth: 0, overrideAccess: true })) as unknown as PostDoc
    assert.equal(saved.updatedAt, stored.updatedAt, 'admin reload invariant')
    assert.equal(stored.wordCount, 5)
    assert.equal(stored.seo?.jsonLd?.raw, saved.seo?.jsonLd?.raw)
  })

  test('[RT-3] a vi save leaves en values, relationships and localized SEO untouched', async () => {
    const editor = fixture.tenantA.editor
    const post = await createPost(
      { title: `Tiếng Việt ${run}`, slug: `rt3-${run}`, contentMd: 'thân bài', categories: [termId], seo: { title: 'SEO vi' } },
      editor,
    )
    await payload.update({
      collection: 'posts',
      id: post.id,
      locale: 'en',
      data: { title: `English ${run}`, contentMd: 'english body', seo: { title: 'SEO en' } },
      user: editor,
      overrideAccess: false,
    })
    const read = async () =>
      (await payload.findByID({ collection: 'posts', id: post.id, locale: 'all', depth: 0, overrideAccess: true })) as unknown as {
        title: Localized<string>
        contentMd: Localized<string>
        categories: Array<number | { id: number }>
        seo: { title?: Localized<string>; breadcrumbs?: Array<{ text?: Localized<string> }> }
      }
    const before = await read()

    await payload.update({
      collection: 'posts',
      id: post.id,
      locale: 'vi',
      data: { title: `Tiếng Việt sửa ${run}`, contentMd: 'thân bài mới hơn' },
      user: editor,
      overrideAccess: false,
    })
    const after = await read()

    assert.equal(after.title.vi, `Tiếng Việt sửa ${run}`)
    assert.equal(after.title.en, before.title.en)
    assert.equal(after.contentMd.en, before.contentMd.en)
    assert.equal(after.seo.title?.en, before.seo.title?.en)
    assert.deepEqual(after.categories, before.categories)
    assert.deepEqual(
      after.seo.breadcrumbs?.map((crumb) => crumb.text?.en),
      before.seo.breadcrumbs?.map((crumb) => crumb.text?.en),
    )
  })

  test('restoring an older version brings its fields back and regenerates JSON-LD', async () => {
    const editor = fixture.tenantA.editor
    const post = await createPost({ title: `Phiên bản 1 ${run}`, slug: `restore-${run}`, contentMd: 'một' }, editor)
    await payload.update({
      collection: 'posts',
      id: post.id,
      locale: 'vi',
      data: { title: `Phiên bản 2 ${run}` },
      user: editor,
      overrideAccess: false,
    })
    const first = (await versionsOf(post.id)).docs[0]

    await payload.restoreVersion({ collection: 'posts', id: first.id, user: editor, overrideAccess: false })

    const restored = (await payload.findByID({ collection: 'posts', id: post.id, depth: 0, overrideAccess: true })) as unknown as PostDoc
    assert.equal(restored.title, `Phiên bản 1 ${run}`)
    assert.match(restored.seo?.jsonLd?.raw ?? '', new RegExp(`Phiên bản 1 ${run}`))
    assert.equal((await versionsOf(post.id)).totalDocs, 3, 'the restore is itself one version')
  })

  test('readVersions is tenant-scoped; anonymous callers get nothing', async () => {
    const post = await createPost({ title: `Riêng tư ${run}`, slug: `private-${run}` }, fixture.tenantA.editor)
    const asUser = (user: TwoTenantsFixture['tenantA']['editor']) =>
      payload.findVersions({ collection: 'posts', where: { parent: { equals: post.id } }, user, overrideAccess: false })

    assert.equal((await asUser(fixture.tenantA.editor)).totalDocs, 1)
    assert.equal((await asUser(fixture.tenantB.editor)).totalDocs, 0, 'tenant B sees no tenant-A history')
    await assert.rejects(
      payload.findVersions({ collection: 'posts', where: { parent: { equals: post.id } }, overrideAccess: false }),
      (err: Error) => err.name === 'Forbidden',
    )
  })

  test('an author cannot restore a published version of their own post (publish rule holds)', async () => {
    const author = fixture.tenantA.author
    const editor = fixture.tenantA.editor
    const post = await createPost({ title: `Tác giả ${run}`, slug: `author-${run}` }, author)
    await payload.update({ collection: 'posts', id: post.id, data: { status: 'published' }, user: editor, overrideAccess: false })
    await payload.update({ collection: 'posts', id: post.id, data: { status: 'draft' }, user: editor, overrideAccess: false })

    const versions = (await versionsOf(post.id)).docs as unknown as Array<{ id: string; version: { status?: string } }>
    const published = versions.find((entry) => entry.version.status === 'published')
    const draft = versions.find((entry) => entry.version.status === 'draft')
    assert.ok(published && draft)

    await assert.rejects(
      payload.restoreVersion({ collection: 'posts', id: published.id, user: author, overrideAccess: false }),
      /Author/,
    )
    await payload.restoreVersion({ collection: 'posts', id: draft.id, user: author, overrideAccess: false })
    const stored = (await payload.findByID({ collection: 'posts', id: post.id, depth: 0, overrideAccess: true })) as unknown as PostDoc
    assert.equal(stored.status, 'draft')
  })
})
