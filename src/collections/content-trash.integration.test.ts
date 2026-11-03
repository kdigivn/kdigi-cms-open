/**
 * Trash / soft delete (SP1a-2) against real Postgres + Payload.
 *
 *   PAYLOAD_INTEGRATION=1 R2_OFF=true node --env-file=.env --import tsx \
 *     --test src/collections/content-trash.integration.test.ts
 *
 * Anonymous calls use the Local API with `overrideAccess: false` and no user — the same access
 * functions the REST/GraphQL handlers run for an anonymous request, including a caller-supplied
 * `trash: true` [RT-4].
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

type User = TwoTenantsFixture['tenantA']['editor']
type Doc = { id: number; slug?: string; status?: string; deletedAt?: string | null }

const NOW = () => new Date().toISOString()

describe('Content trash (SP1a-2)', { skip: !isIntegrationEnabled ? 'PAYLOAD_INTEGRATION=1 is not set' : false }, () => {
  let payload: Payload
  let fixture: TwoTenantsFixture
  let adminA: User
  const faqIds: number[] = []
  const run = `${Date.now()}-${Math.floor(Math.random() * 1e5)}`
  let counter = 0

  const createPost = async (user: User, data: Record<string, unknown> = {}): Promise<Doc> => {
    counter += 1
    const doc = (await payload.create({
      collection: 'posts',
      data: {
        title: `Trash ${run} ${counter}`,
        slug: `trash-${run}-${counter}`,
        type: 'blog',
        status: 'draft',
        tenant: fixture.tenantA.site.id,
        ...data,
      } as never,
      user,
      overrideAccess: false,
    })) as unknown as Doc
    fixture.trackPost(doc.id)
    return doc
  }
  const publishedPost = async (owner: User) => {
    const post = await createPost(owner)
    await payload.update({ collection: 'posts', id: post.id, data: { status: 'published' }, user: fixture.tenantA.editor, overrideAccess: false })
    return post
  }
  const trash = (collection: 'posts' | 'faqs', id: number, user: User) =>
    payload.update({ collection, id, data: { deletedAt: NOW() }, user, overrideAccess: false })
  const restore = (id: number, user: User) =>
    payload.update({ collection: 'posts', id, data: { deletedAt: null }, trash: true, user, overrideAccess: false })
  const createFaq = async (tenant: number) => {
    const faq = await payload.create({
      collection: 'faqs',
      data: { group: `faq-${run}-${tenant}`, items: [{ question: 'Q?', answer: 'A.' }], tenant },
      overrideAccess: true,
    })
    faqIds.push(faq.id as number)
    return faq as unknown as Doc
  }

  before(async () => {
    payload = await getIntegrationPayload()
    fixture = await setupTwoTenants(payload, 'trash')
    adminA = (await payload.create({
      collection: 'users',
      data: { email: `admin-a-${run}@example.com`, password: 'Password123!', role: 'admin', tenants: [{ tenant: fixture.tenantA.site.id }] },
      overrideAccess: true,
    })) as unknown as User
    fixture.trackUser(adminA.id)
  })

  after(async () => {
    if (payload && fixture) {
      for (const id of faqIds) {
        await payload.delete({ collection: 'faqs', id, overrideAccess: true, trash: true }).catch(() => {})
      }
      await cleanupTwoTenants(payload, fixture)
    }
    await closeIntegrationPayload(payload)
  })

  test('[RT-4] a trashed published post is invisible to anonymous reads, even with trash=true', async () => {
    const post = await publishedPost(fixture.tenantA.editor)
    const anonymous = (trashFlag: boolean) =>
      payload.find({ collection: 'posts', where: { id: { equals: post.id } }, overrideAccess: false, trash: trashFlag })
    assert.equal((await anonymous(false)).totalDocs, 1, 'sanity: live before trashing')

    const trashed = (await trash('posts', post.id, fixture.tenantA.editor)) as unknown as Doc
    assert.ok(trashed.deletedAt)
    assert.equal((await anonymous(false)).totalDocs, 0)
    assert.equal((await anonymous(true)).totalDocs, 0, 'trash=true must not widen an anonymous read')
    await assert.rejects(payload.findByID({ collection: 'posts', id: post.id, overrideAccess: false, trash: true }))

    const trashView = await payload.find({
      collection: 'posts',
      where: { and: [{ id: { equals: post.id } }, { deletedAt: { exists: true } }] },
      trash: true,
      user: fixture.tenantA.editor,
      overrideAccess: false,
    })
    assert.equal(trashView.totalDocs, 1, 'the admin Trash view still lists it')
  })

  test('[RT-4] trashed faqs are hidden from anonymous reads with trash=true', async () => {
    const faq = await createFaq(fixture.tenantA.site.id as number)
    await trash('faqs', faq.id, fixture.tenantA.editor)
    const found = await payload.find({
      collection: 'faqs',
      where: { and: [{ id: { equals: faq.id } }, { deletedAt: { exists: true } }] },
      trash: true,
      overrideAccess: false,
    })
    assert.equal(found.totalDocs, 0)
  })

  test('permanent delete is admin-only; editors can only trash', async () => {
    const post = await createPost(fixture.tenantA.editor)
    await trash('posts', post.id, fixture.tenantA.editor)
    await assert.rejects(
      payload.delete({ collection: 'posts', id: post.id, trash: true, user: fixture.tenantA.editor, overrideAccess: false }),
      (err: Error) => err.name === 'Forbidden' || err.name === 'NotFound',
    )
    await payload.delete({ collection: 'posts', id: post.id, trash: true, user: adminA, overrideAccess: false })
    const gone = await payload.find({ collection: 'posts', where: { id: { equals: post.id } }, trash: true, overrideAccess: true })
    assert.equal(gone.totalDocs, 0)
  })

  test('a trashed slug is reusable; restoring into a taken slug is refused with a message', async () => {
    const original = await createPost(fixture.tenantA.editor)
    await trash('posts', original.id, fixture.tenantA.editor)
    const replacement = await createPost(fixture.tenantA.editor, { slug: original.slug })
    assert.equal(replacement.slug, original.slug, 'partial unique index lets the replacement reuse the slug')

    await assert.rejects(restore(original.id, fixture.tenantA.editor), (err: Error) => {
      assert.equal(err.name, 'ValidationError')
      assert.match(err.message + JSON.stringify((err as { data?: unknown }).data ?? ''), /đang được dùng|is used by another/)
      return true
    })

    await payload.update({ collection: 'posts', id: replacement.id, data: { slug: `${original.slug}-moi` }, user: fixture.tenantA.editor, overrideAccess: false })
    const restored = (await restore(original.id, fixture.tenantA.editor)) as unknown as Doc
    assert.equal(restored.deletedAt ?? null, null)
  })

  test('authors trash only their own posts; faqs are tenant-scoped with no createdBy query error [RT-13]', async () => {
    const own = await createPost(fixture.tenantA.author)
    await trash('posts', own.id, fixture.tenantA.author)

    const editors = await createPost(fixture.tenantA.editor)
    await assert.rejects(trash('posts', editors.id, fixture.tenantA.author))

    const faqA = await createFaq(fixture.tenantA.site.id as number)
    await trash('faqs', faqA.id, fixture.tenantA.author)
    const faqB = await createFaq(fixture.tenantB.site.id as number)
    await assert.rejects(trash('faqs', faqB.id, fixture.tenantA.author))
  })

  test('[RT-6] an author cannot restore their published post an editor trashed; the editor can', async () => {
    const post = await publishedPost(fixture.tenantA.author)
    await trash('posts', post.id, fixture.tenantA.editor)
    await assert.rejects(restore(post.id, fixture.tenantA.author), /Author/)
    const restored = (await restore(post.id, fixture.tenantA.editor)) as unknown as Doc
    assert.equal(restored.status, 'published')
    assert.equal(restored.deletedAt ?? null, null)
  })

  test('trashing a published post queues a frontend revalidate for its slug', async () => {
    const post = await publishedPost(fixture.tenantA.editor)
    await trash('posts', post.id, fixture.tenantA.editor)
    const jobs = await payload.find({
      collection: 'payload-jobs',
      where: { taskSlug: { equals: 'revalidateFrontend' } },
      sort: '-createdAt',
      limit: 20,
      overrideAccess: true,
    })
    const slugs = jobs.docs.map((job) => (job as unknown as { input?: { slug?: string } }).input?.slug)
    assert.ok(slugs.includes(post.slug), `expected a revalidate job for ${post.slug}`)
  })

  test('restoring a VERSION of a trashed document is refused (restore the document first)', async () => {
    const post = await createPost(fixture.tenantA.editor)
    const [version] = (await payload.findVersions({ collection: 'posts', where: { parent: { equals: post.id } }, overrideAccess: true })).docs
    await trash('posts', post.id, fixture.tenantA.editor)
    await assert.rejects(
      payload.restoreVersion({ collection: 'posts', id: String(version.id), user: fixture.tenantA.editor, overrideAccess: false }),
      /trashed/,
    )
  })
})
