/**
 * MCP endpoint (`POST /api/mcp`) against real Postgres + Payload.
 *
 *   PAYLOAD_INTEGRATION=1 node --env-file-if-exists=.env --import tsx --test src/mcp/mcp.integration.test.ts
 *
 * Every request goes through Payload's own pipeline (`handleEndpoints` → `createPayloadRequest` →
 * strategies → the real `mcpEndpoints` handler), so `req.user` is populated as in production.
 * Pins the matrix of the AI-native MCP phase: auth, site isolation, relationship integrity,
 * role rules, publish/schedule, localized partial updates, optimistic concurrency, admin locks,
 * legacy bodies, trash, taxonomy resolution, SSRF refusal and the API-key REST hardening.
 * Refuses a non-local DATABASE_URI (see test-utils/payload-integration.ts).
 */
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { randomUUID } from 'node:crypto'
import type { Payload } from 'payload'

import type { User } from '../payload-types'
import {
  callApi,
  callMcp,
  callTool,
  cleanupTwoTenants,
  closeIntegrationPayload,
  getIntegrationPayload,
  isIntegrationEnabled,
  setupTwoTenants,
  type TwoTenantsFixture,
} from '../test-utils/payload-integration'

type Localized<T> = { vi?: T; en?: T }
interface RawPost {
  id: number
  slug?: string
  status?: string
  updatedAt: string
  deletedAt?: string | null
  featuredImage?: number | { id: number } | null
  categories?: Array<number | { id: number }>
  title?: Localized<string> | string
  excerpt?: Localized<string> | string
  contentMd?: Localized<string> | string | null
  seo?: {
    title?: Localized<string> | string
    description?: Localized<string> | string
    breadcrumbs?: Array<{ url?: string; text?: Localized<string> | string; isHidden?: boolean }>
  }
}

const PAST = '2020-01-01T00:00:00.000Z'
const FUTURE = '2099-01-01T00:00:00.000Z'

describe('MCP endpoint (integration)', { skip: !isIntegrationEnabled ? 'PAYLOAD_INTEGRATION=1 is not set' : false }, () => {
  let payload: Payload
  let fixture: TwoTenantsFixture
  let seq = 0

  const uniq = (tag: string) => `${tag}-${(seq += 1)}-${fixture.runId}`

  const siteA = () => fixture.tenantA.site.siteKey
  const keyA = () => fixture.tenantA.editorKey
  const call = (key: string, name: string, args: Record<string, unknown> = {}) => callTool(payload, key, name, args)

  /** A post created through the Local API (access overridden) with the given owner. */
  const seedPost = async (owner: User, siteId: number, data: Record<string, unknown> = {}): Promise<RawPost> => {
    const slug = (data.slug as string | undefined) ?? uniq('seed')
    const doc = await payload.create({
      collection: 'posts',
      locale: 'vi',
      data: { type: 'blog', status: 'draft', tenant: siteId, title: `Seed ${slug}`, slug, contentMd: 'seed body', ...data } as never,
      user: owner,
      overrideAccess: true,
    })
    fixture.trackPost(doc.id)
    return doc as unknown as RawPost
  }

  const rawPost = async (id: number, locale: 'vi' | 'en' | 'all' = 'all'): Promise<RawPost> =>
    (await payload.findByID({ collection: 'posts', id, locale, depth: 0, overrideAccess: true, trash: true })) as unknown as RawPost

  const versionCount = async (collection: 'posts' | 'pages', id: number): Promise<number> =>
    (await payload.findVersions({ collection, where: { parent: { equals: id } }, overrideAccess: true, limit: 1, depth: 0 })).totalDocs

  /** `updatedAt` as an agent sees it (get_content), the token every write needs. */
  const stamp = async (key: string, collection: 'posts' | 'pages', id: number): Promise<string> => {
    const read = await call(key, 'get_content', { collection, id })
    assert.equal(read.isError, false, read.text)
    return read.data.updatedAt as string
  }

  const countBySlug = async (collection: 'posts' | 'pages' | 'taxonomies', siteId: number, slug: string): Promise<number> =>
    (
      await payload.count({
        collection,
        where: { and: [{ tenant: { equals: siteId } }, { slug: { equals: slug } }] },
        overrideAccess: true,
        trash: true,
      })
    ).totalDocs

  const seedTaxonomy = async (siteId: number, type: 'category' | 'tag', slug: string): Promise<number> => {
    const doc = await payload.create({
      collection: 'taxonomies',
      data: { name: `Tax ${slug}`, slug, type, tenant: siteId },
      overrideAccess: true,
    })
    fixture.trackTaxonomy(doc.id)
    return doc.id
  }

  before(async () => {
    payload = await getIntegrationPayload()
    fixture = await setupTwoTenants(payload, 'mcp')
  })

  after(async () => {
    delete process.env.MCP_ENABLED
    if (payload && fixture) await cleanupTwoTenants(payload, fixture)
    await closeIntegrationPayload(payload)
  })

  // ── 1, 2: authentication ───────────────────────────────────────────────────

  test('1. no Authorization, cookie-only, JWT and garbage keys → 401 + WWW-Authenticate', async () => {
    const body = { jsonrpc: '2.0', id: 1, method: 'tools/list' }
    const none = await callMcp(payload, { body })
    assert.equal(none.status, 401)
    assert.match(none.headers.get('www-authenticate') ?? '', /^Bearer /)

    const login = await payload.login({ collection: 'users', data: { email: fixture.tenantA.editor.email, password: 'Password123!' } })
    assert.ok(login.token, 'login returned a JWT')
    const cookie = `${payload.config.cookiePrefix ?? 'payload'}-token=${login.token}`

    // Control: the very same cookie IS a valid browser session on the REST API (Payload's CSRF
    // rule wants `Sec-Fetch-Site` when a csrf allowlist is configured) …
    const browser = { 'Sec-Fetch-Site': 'same-origin' }
    const me = await callApi(payload, '/api/users/me', { method: 'GET', cookie, headers: browser })
    assert.equal(me.status, 200)
    assert.equal(((await me.json()) as { user?: { id: number } }).user?.id, fixture.tenantA.editor.id)
    // … but never an MCP credential.
    const cookieOnly = await callMcp(payload, { cookie, headers: browser, body })
    assert.equal(cookieOnly.status, 401)
    assert.match(cookieOnly.headers.get('www-authenticate') ?? '', /^Bearer /)

    const jwtAsBearer = await callMcp(payload, { key: login.token ?? '', body })
    assert.equal(jwtAsBearer.status, 401, 'a JWT in the Bearer slot is not an API key')
    const jwtScheme = await callMcp(payload, { headers: { Authorization: `JWT ${login.token}` }, body })
    assert.equal(jwtScheme.status, 401)
    assert.equal((await callMcp(payload, { key: randomUUID(), body })).status, 401, 'unknown key')
    assert.equal((await callMcp(payload, { key: randomUUID(), scheme: 'users API-Key', body })).status, 401, 'unknown key (native scheme)')
  })

  test('2. Bearer and `users API-Key` resolve to the same user; a disabled key → 401', async () => {
    const bearer = await callMcp(payload, {
      key: keyA(),
      body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'whoami', arguments: {} } },
    })
    assert.equal(bearer.status, 200)
    const native = await callMcp(payload, {
      key: keyA(),
      scheme: 'users API-Key',
      body: { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'whoami', arguments: {} } },
    })
    assert.equal(native.status, 200)
    const idOf = async (res: Response) =>
      ((await res.json()) as { result: { structuredContent: { id: number; email: string } } }).result.structuredContent
    const viaBearer = await idOf(bearer)
    const viaNative = await idOf(native)
    assert.equal(viaBearer.id, fixture.tenantA.editor.id)
    assert.deepEqual(viaNative, viaBearer)
    assert.equal(viaBearer.email, fixture.tenantA.editor.email)

    const key = randomUUID()
    const user = await payload.create({
      collection: 'users',
      data: {
        email: `disabled-key-${fixture.runId}@example.com`,
        password: 'Password123!',
        role: 'editor',
        enableAPIKey: true,
        apiKey: key,
        tenants: [{ tenant: fixture.tenantA.site.id }],
      },
      overrideAccess: true,
    })
    fixture.trackUser(user.id)
    const whoami = { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'whoami', arguments: {} } }
    assert.equal((await callMcp(payload, { key, body: whoami })).status, 200, 'enabled key works')
    await payload.update({ collection: 'users', id: user.id, data: { enableAPIKey: false }, overrideAccess: true })
    const disabled = await callMcp(payload, { key, body: whoami })
    assert.equal(disabled.status, 401)
    assert.match(disabled.headers.get('www-authenticate') ?? '', /^Bearer /)
  })

  // ── 3–7: site isolation and relationship integrity ──────────────────────────

  test('3. editor A cannot read or write a site-B document (not_found, nothing changes)', async () => {
    const draftB = await seedPost(fixture.tenantB.editor, fixture.tenantB.site.id, { title: 'B draft', slug: uniq('b-draft') })
    const liveB = await seedPost(fixture.tenantB.editor, fixture.tenantB.site.id, {
      title: 'B live',
      slug: uniq('b-live'),
      status: 'published',
      publishedAt: PAST,
    })
    for (const doc of [draftB, liveB]) {
      const before = await rawPost(doc.id)
      const read = await call(keyA(), 'get_content', { collection: 'posts', id: doc.id })
      assert.equal(read.code, 'not_found', `get_content on ${doc.slug}: ${read.text}`)
      const write = await call(keyA(), 'update_post', { id: doc.id, expectedUpdatedAt: before.updatedAt, title: 'hijacked' })
      assert.equal(write.code, 'not_found', `update_post on ${doc.slug}: ${write.text}`)
      const status = await call(keyA(), 'set_status', { collection: 'posts', id: doc.id, status: 'draft', expectedUpdatedAt: before.updatedAt })
      assert.equal(status.code, 'not_found', `set_status on ${doc.slug}: ${status.text}`)
      const after = await rawPost(doc.id)
      assert.equal(after.updatedAt, before.updatedAt, 'document untouched')
      assert.deepEqual(after.title, before.title)
      assert.equal(after.status, before.status)
    }
    const bySlug = await call(keyA(), 'get_content', { collection: 'posts', slug: liveB.slug, site: fixture.tenantB.site.siteKey })
    assert.equal(bySlug.code, 'not_found', 'a lookup by slug on the foreign site: the site itself is invisible')
  })

  test('4. editor A: list_sites shows only A; any site=B access → not_found, B media alt edit → forbidden', async () => {
    const sites = await call(keyA(), 'list_sites')
    assert.deepEqual(
      (sites.data.sites as Array<{ siteKey: string }>).map((s) => s.siteKey),
      [siteA()],
    )
    const siteB = fixture.tenantB.site.siteKey
    // Foreign sites are invisible (sites read is tenant-scoped), so the answer is not_found, never an existence oracle.
    assert.equal((await call(keyA(), 'search_media', { site: siteB })).code, 'not_found')
    assert.equal((await call(keyA(), 'search_content', { collection: 'posts', site: siteB })).code, 'not_found')
    assert.equal((await call(keyA(), 'search_content', { collection: 'pages', site: siteB })).code, 'not_found')
    assert.equal((await call(keyA(), 'get_site', { site: siteB })).code, 'not_found')
    assert.equal((await call(keyA(), 'list_taxonomies', { site: siteB })).code, 'not_found')
    assert.equal((await call(keyA(), 'create_post', { site: siteB, title: 'Nope', markdown: 'x', slug: uniq('nope') })).code, 'not_found')

    // A media item is publicly readable, so it IS found → the membership check answers `forbidden`.
    const mediaB = (await payload.findByID({ collection: 'media', id: fixture.tenantB.media.id, overrideAccess: true, depth: 0 })) as unknown as { alt: string; updatedAt: string }
    const alt = await call(keyA(), 'update_media_alt', { id: fixture.tenantB.media.id, alt: 'hijacked', expectedUpdatedAt: mediaB.updatedAt })
    assert.equal(alt.code, 'forbidden', alt.text)
    const mediaAfter = (await payload.findByID({ collection: 'media', id: fixture.tenantB.media.id, overrideAccess: true, depth: 0 })) as unknown as { alt: string; updatedAt: string }
    assert.equal(mediaAfter.alt, mediaB.alt)
    assert.equal(mediaAfter.updatedAt, mediaB.updatedAt)
    assert.equal((await call(keyA(), 'search_content', { collection: 'posts', site: `no-such-site-${fixture.runId}` })).code, 'not_found')
    const own = await call(keyA(), 'search_media', {})
    assert.equal(own.isError, false)
    assert.deepEqual(
      (own.data.media as Array<{ id: number }>).map((m) => m.id),
      [fixture.tenantA.media.id],
    )
  })

  test('5. cross-site featuredImage / categories / taxonomy parent → invalid, nothing linked', async () => {
    const taxB = await seedTaxonomy(fixture.tenantB.site.id, 'category', uniq('tax-b'))
    const mediaB = fixture.tenantB.media.id

    for (const [label, extra] of [
      ['featuredImage', { featuredImage: mediaB }],
      ['categories', { categories: [taxB] }],
    ] as const) {
      const slug = uniq(`x-create-${label.toLowerCase()}`)
      const res = await call(keyA(), 'create_post', { title: 'Cross', markdown: 'x', slug, ...extra })
      assert.equal(res.code, 'invalid', `${label}: ${res.text}`)
      assert.equal(await countBySlug('posts', fixture.tenantA.site.id, slug), 0, `${label}: nothing was created`)
    }

    const post = await seedPost(fixture.tenantA.editor, fixture.tenantA.site.id)
    const before = await rawPost(post.id)
    const badMedia = await call(keyA(), 'update_post', { id: post.id, expectedUpdatedAt: before.updatedAt, featuredImage: mediaB })
    assert.equal(badMedia.code, 'invalid', badMedia.text)
    const badCategory = await call(keyA(), 'update_post', { id: post.id, expectedUpdatedAt: before.updatedAt, categories: [taxB] })
    assert.equal(badCategory.code, 'invalid', badCategory.text)
    const after = await rawPost(post.id)
    assert.equal(after.updatedAt, before.updatedAt)
    assert.ok(!after.featuredImage)
    assert.deepEqual(after.categories ?? [], [])

    const own = await call(keyA(), 'update_post', {
      id: post.id,
      expectedUpdatedAt: before.updatedAt,
      featuredImage: fixture.tenantA.media.id,
    })
    assert.equal(own.isError, false, `control — own-site media is accepted: ${own.text}`)

    const taxSlug = uniq('tax-parent-x')
    const parent = await call(keyA(), 'create_taxonomy', { type: 'category', name: 'Child', slug: taxSlug, parent: taxB })
    assert.equal(parent.code, 'invalid', parent.text)
    assert.equal(await countBySlug('taxonomies', fixture.tenantA.site.id, taxSlug), 0)
  })

  test('6. multi-site editor omitting `site` → invalid listing the siteKeys; explicit site works', async () => {
    const key = fixture.multiEditorKey
    const keys = [fixture.tenantA.site.siteKey, fixture.tenantB.site.siteKey].sort()
    const slug = uniq('multi')
    for (const [tool, args] of [
      ['search_content', { collection: 'posts' }],
      ['create_post', { title: 'Multi', markdown: 'x', slug }],
      ['list_taxonomies', {}],
    ] as const) {
      const res = await call(key, tool, args)
      assert.equal(res.code, 'invalid', `${tool}: ${res.text}`)
      for (const siteKey of keys) assert.ok(res.message.includes(siteKey), `${tool} names ${siteKey}: ${res.message}`)
      assert.deepEqual(res.details?.sites, keys)
    }
    assert.equal(await countBySlug('posts', fixture.tenantA.site.id, slug), 0)
    assert.equal(await countBySlug('posts', fixture.tenantB.site.id, slug), 0)

    const listed = await call(key, 'list_sites')
    assert.deepEqual(
      (listed.data.sites as Array<{ siteKey: string }>).map((s) => s.siteKey),
      keys,
    )
    const created = await call(key, 'create_post', { site: fixture.tenantB.site.siteKey, title: 'Multi B', markdown: 'x', slug })
    assert.equal(created.isError, false, created.text)
    assert.equal(created.data.site, fixture.tenantB.site.siteKey)
    assert.equal(await countBySlug('posts', fixture.tenantB.site.id, slug), 1)
  })

  test('7. zero-tenant user: create_post is invalid without a site, forbidden with one; nothing created', async () => {
    const key = fixture.zeroTenantKey
    const slug = uniq('zero')
    const noSite = await call(key, 'create_post', { title: 'Zero', markdown: 'x', slug })
    assert.equal(noSite.code, 'invalid', noSite.text)
    assert.match(noSite.message, /no site membership/i)
    assert.deepEqual(noSite.details?.sites, [])
    const withSite = await call(key, 'create_post', { site: siteA(), title: 'Zero', markdown: 'x', slug })
    assert.equal(withSite.code, 'forbidden', withSite.text)
    assert.equal(await countBySlug('posts', fixture.tenantA.site.id, slug), 0)
    assert.deepEqual((await call(key, 'list_sites')).data.sites, [])
  })

  // ── 8, 9: roles and publishing ──────────────────────────────────────────────

  test('8. author cannot publish (set_status) nor restore a published version', async () => {
    const author = fixture.tenantA.author
    const authorKey = fixture.tenantA.authorKey
    const own = await seedPost(author, fixture.tenantA.site.id, { title: 'By author', slug: uniq('author-own') })
    assert.equal((await rawPost(own.id, 'vi')).status, 'draft')

    const publish = await call(authorKey, 'set_status', {
      collection: 'posts',
      id: own.id,
      status: 'published',
      expectedUpdatedAt: await stamp(authorKey, 'posts', own.id),
    })
    assert.equal(publish.code, 'forbidden', publish.text)
    assert.equal((await rawPost(own.id, 'vi')).status, 'draft', 'stays draft')

    // Version history: draft (author) → published (editor) → draft again (editor).
    await payload.update({ collection: 'posts', id: own.id, locale: 'vi', data: { status: 'published', publishedAt: PAST } as never, user: fixture.tenantA.editor, overrideAccess: true })
    await payload.update({ collection: 'posts', id: own.id, locale: 'vi', data: { status: 'draft' } as never, user: fixture.tenantA.editor, overrideAccess: true })
    const versions = await call(authorKey, 'list_versions', { collection: 'posts', id: own.id })
    assert.equal(versions.isError, false, versions.text)
    const publishedVersion = (versions.data.versions as Array<{ versionId: number | string; status: string }>).find((v) => v.status === 'published')
    assert.ok(publishedVersion, 'a published version exists')

    const before = await rawPost(own.id)
    const restore = await call(authorKey, 'restore_version', {
      collection: 'posts',
      versionId: publishedVersion.versionId,
      expectedUpdatedAt: await stamp(authorKey, 'posts', own.id),
    })
    assert.equal(restore.code, 'forbidden', restore.text)
    const after = await rawPost(own.id)
    assert.equal(after.status, 'draft')
    assert.equal(after.updatedAt, before.updatedAt)

    const viaEditor = await call(keyA(), 'restore_version', {
      collection: 'posts',
      versionId: publishedVersion.versionId,
      expectedUpdatedAt: await stamp(keyA(), 'posts', own.id),
    })
    assert.equal(viaEditor.isError, false, `control — an editor may restore it: ${viaEditor.text}`)
    assert.equal(viaEditor.data.status, 'published')
  })

  test('9. editor set_status published: past date → live; future date → not live + scheduledFor', async () => {
    const created = await call(keyA(), 'create_post', { title: 'Publish me', markdown: 'body', slug: uniq('publish') })
    assert.equal(created.isError, false, created.text)
    assert.equal(created.data.status, 'draft')
    assert.equal(created.data.live, false)
    const id = created.data.id as number

    const past = await call(keyA(), 'set_status', { collection: 'posts', id, status: 'published', publishedAt: PAST, expectedUpdatedAt: created.data.updatedAt })
    assert.equal(past.isError, false, past.text)
    assert.equal(past.data.live, true)
    assert.equal(past.data.scheduledFor, null)
    assert.equal(past.data.status, 'published')

    const future = await call(keyA(), 'set_status', { collection: 'posts', id, status: 'published', publishedAt: FUTURE, expectedUpdatedAt: past.data.updatedAt })
    assert.equal(future.isError, false, future.text)
    assert.equal(future.data.live, false)
    assert.equal(future.data.status, 'published')
    assert.equal(new Date(future.data.scheduledFor as string).toISOString(), FUTURE)

    const read = await call(keyA(), 'get_content', { collection: 'posts', id })
    assert.equal(read.data.live, false)
    assert.equal(new Date(read.data.scheduledFor as string).toISOString(), FUTURE)
  })

  // ── 10, 11: partial-update preservation ─────────────────────────────────────

  test('10. update_post seo.title in en leaves vi seo and the other en seo subfields alone', async () => {
    const post = await seedPost(fixture.tenantA.editor, fixture.tenantA.site.id, {
      title: 'Tiêu đề vi',
      slug: uniq('seo-locale'),
      seo: { title: 'SEO vi', description: 'Mô tả vi' },
    })
    const first = await call(keyA(), 'update_post', {
      id: post.id,
      locale: 'en',
      expectedUpdatedAt: post.updatedAt,
      title: 'English title',
      markdown: 'english body',
      seo: { title: 'SEO en', description: 'Description en' },
    })
    assert.equal(first.isError, false, first.text)
    const second = await call(keyA(), 'update_post', {
      id: post.id,
      locale: 'en',
      expectedUpdatedAt: first.data.updatedAt,
      seo: { title: 'SEO en 2' },
    })
    assert.equal(second.isError, false, second.text)

    const stored = await rawPost(post.id)
    assert.deepEqual(stored.seo?.title, { vi: 'SEO vi', en: 'SEO en 2' })
    assert.deepEqual(stored.seo?.description, { vi: 'Mô tả vi', en: 'Description en' })
    assert.deepEqual(stored.title, { vi: 'Tiêu đề vi', en: 'English title' })
  })

  test('11. markdown-only update keeps a curated excerpt; set_status keeps custom breadcrumbs (isHidden)', async () => {
    const created = await call(keyA(), 'create_post', {
      title: 'Excerpt keeper',
      markdown: 'first body that would otherwise become the excerpt',
      slug: uniq('excerpt'),
      excerpt: 'Hand-written curated excerpt',
    })
    assert.equal(created.isError, false, created.text)
    const id = created.data.id as number
    const updated = await call(keyA(), 'update_post', {
      id,
      expectedUpdatedAt: created.data.updatedAt,
      markdown: 'a completely different second body',
    })
    assert.equal(updated.isError, false, updated.text)
    const read = await call(keyA(), 'get_content', { collection: 'posts', id })
    assert.equal(read.data.excerpt, 'Hand-written curated excerpt')
    assert.equal(read.data.markdown, 'a completely different second body')

    const crumbs = [
      { url: '/custom/', text: 'Custom', isHidden: true },
      { url: '/custom/leaf/', text: 'Leaf', isHidden: false },
    ]
    const post = await seedPost(fixture.tenantA.editor, fixture.tenantA.site.id, { slug: uniq('crumbs'), seo: { breadcrumbs: crumbs } })
    const before = (await rawPost(post.id, 'vi')).seo?.breadcrumbs?.map(({ url, text, isHidden }) => ({ url, text, isHidden }))
    assert.deepEqual(before, crumbs, 'seed stored the custom trail')
    const published = await call(keyA(), 'set_status', {
      collection: 'posts',
      id: post.id,
      status: 'published',
      publishedAt: PAST,
      expectedUpdatedAt: post.updatedAt,
    })
    assert.equal(published.isError, false, published.text)
    const after = (await rawPost(post.id, 'vi')).seo?.breadcrumbs?.map(({ url, text, isHidden }) => ({ url, text, isHidden }))
    assert.deepEqual(after, crumbs, 'trail (incl. isHidden) survives set_status')
  })

  // ── 12–14: concurrency and locks ────────────────────────────────────────────

  test('12. update needs expectedUpdatedAt; a stale one → conflict with currentUpdatedAt and no new version', async () => {
    const post = await seedPost(fixture.tenantA.editor, fixture.tenantA.site.id, { title: 'CAS', slug: uniq('cas') })
    const missing = await call(keyA(), 'update_post', { id: post.id, title: 'no token' })
    assert.equal(missing.code, 'schema', missing.text)
    assert.match(missing.message, /expectedUpdatedAt/)
    assert.equal((await rawPost(post.id, 'vi')).title, 'CAS')

    const t1 = await stamp(keyA(), 'posts', post.id)
    const ok = await call(keyA(), 'update_post', { id: post.id, expectedUpdatedAt: t1, title: 'CAS 2' })
    assert.equal(ok.isError, false, ok.text)
    const t2 = ok.data.updatedAt as string
    assert.notEqual(t2, t1)

    const versionsBefore = await versionCount('posts', post.id)
    const stale = await call(keyA(), 'update_post', { id: post.id, expectedUpdatedAt: t1, title: 'CAS stale' })
    assert.equal(stale.code, 'conflict', stale.text)
    assert.equal(stale.details?.currentUpdatedAt, new Date(t2).toISOString())
    assert.equal(await versionCount('posts', post.id), versionsBefore, 'no new version row')
    assert.equal((await rawPost(post.id, 'vi')).title, 'CAS 2')

    const staleStatus = await call(keyA(), 'set_status', { collection: 'posts', id: post.id, status: 'draft', expectedUpdatedAt: t1 })
    assert.equal(staleStatus.code, 'conflict')
    const staleTrash = await call(keyA(), 'trash_content', { collection: 'posts', id: post.id, expectedUpdatedAt: t1 })
    assert.equal(staleTrash.code, 'conflict')
    assert.equal((await rawPost(post.id)).deletedAt ?? null, null)
  })

  test('13. two concurrent updates with the same expectedUpdatedAt: exactly one ok, one conflict', async () => {
    const post = await seedPost(fixture.tenantA.editor, fixture.tenantA.site.id, { title: 'Race', slug: uniq('race') })
    const token = await stamp(keyA(), 'posts', post.id)
    const versionsBefore = await versionCount('posts', post.id)
    const [first, second] = await Promise.all([
      call(keyA(), 'update_post', { id: post.id, expectedUpdatedAt: token, title: 'Race winner 1' }),
      call(keyA(), 'update_post', { id: post.id, expectedUpdatedAt: token, title: 'Race winner 2' }),
    ])
    const outcomes = [first, second]
    const oks = outcomes.filter((o) => !o.isError)
    const conflicts = outcomes.filter((o) => o.code === 'conflict')
    assert.equal(oks.length, 1, outcomes.map((o) => o.text).join(' | '))
    assert.equal(conflicts.length, 1, outcomes.map((o) => o.text).join(' | '))
    assert.equal((await rawPost(post.id, 'vi')).title, oks[0].data.title)
    assert.equal(await versionCount('posts', post.id), versionsBefore + 1, 'one write → one version')
  })

  test('14. a document open in the admin by someone else → locked (names the holder); the lock survives', async () => {
    const holder = fixture.tenantA.author
    const post = await seedPost(fixture.tenantA.editor, fixture.tenantA.site.id, { title: 'Locked', slug: uniq('locked') })
    const lock = await payload.create({
      collection: 'payload-locked-documents',
      data: { document: { relationTo: 'posts', value: post.id }, user: { relationTo: 'users', value: holder.id } },
      overrideAccess: true,
    })
    try {
      const versions = await call(keyA(), 'list_versions', { collection: 'posts', id: post.id })
      assert.equal(versions.isError, false, versions.text)
      const versionId = (versions.data.versions as Array<{ versionId: number | string }>)[0].versionId
      const token = await stamp(keyA(), 'posts', post.id)

      const update = await call(keyA(), 'update_post', { id: post.id, expectedUpdatedAt: token, title: 'Overwritten' })
      assert.equal(update.code, 'locked', update.text)
      assert.ok(update.message.includes(holder.email), update.message)
      assert.equal(update.details?.lockedBy, holder.email)

      const restore = await call(keyA(), 'restore_version', { collection: 'posts', versionId, expectedUpdatedAt: token })
      assert.equal(restore.code, 'locked', restore.text)
      assert.ok(restore.message.includes(holder.email))

      for (const [tool, args] of [
        ['set_status', { collection: 'posts', id: post.id, status: 'published', expectedUpdatedAt: token }],
        ['trash_content', { collection: 'posts', id: post.id, expectedUpdatedAt: token }],
      ] as const) {
        const res = await call(keyA(), tool, args)
        assert.equal(res.code, 'locked', `${tool}: ${res.text}`)
      }

      const stored = await rawPost(post.id)
      assert.equal(stored.title && typeof stored.title === 'object' ? stored.title.vi : stored.title, 'Locked')
      assert.equal(stored.updatedAt, token)
      const still = await payload.find({ collection: 'payload-locked-documents', where: { id: { equals: lock.id } }, overrideAccess: true, limit: 1 })
      assert.equal(still.totalDocs, 1, 'the admin editor keeps their lock (no overrideLock)')
    } finally {
      await payload.delete({ collection: 'payload-locked-documents', where: { id: { equals: lock.id } }, overrideAccess: true }).catch(() => undefined)
    }
    const released = await call(keyA(), 'update_post', { id: post.id, expectedUpdatedAt: await stamp(keyA(), 'posts', post.id), title: 'After unlock' })
    assert.equal(released.isError, false, released.text)
  })

  // ── 15–18: schema, bodies, slugs ────────────────────────────────────────────

  test('15. unknown / forbidden keys are schema errors: tenant, unknown key, excerpt on a page', async () => {
    const post = await seedPost(fixture.tenantA.editor, fixture.tenantA.site.id, { title: 'Strict', slug: uniq('strict') })
    const before = await rawPost(post.id)
    const withTenant = await call(keyA(), 'update_post', { id: post.id, expectedUpdatedAt: before.updatedAt, tenant: fixture.tenantB.site.id })
    assert.equal(withTenant.code, 'schema', withTenant.text)
    assert.match(withTenant.message, /tenant/)
    const unknown = await call(keyA(), 'update_post', { id: post.id, expectedUpdatedAt: before.updatedAt, bogusField: 1 })
    assert.equal(unknown.code, 'schema', unknown.text)
    assert.match(unknown.message, /bogusField/)
    const seoUnknown = await call(keyA(), 'update_post', { id: post.id, expectedUpdatedAt: before.updatedAt, seo: { jsonLd: '{}' } })
    assert.equal(seoUnknown.code, 'schema', seoUnknown.text)
    assert.equal((await rawPost(post.id)).updatedAt, before.updatedAt)

    const slug = uniq('page-excerpt')
    const page = await call(keyA(), 'create_page', { title: 'Page', markdown: 'x', slug, excerpt: 'not a page field' })
    assert.equal(page.code, 'schema', page.text)
    assert.match(page.message, /excerpt/)
    assert.equal(await countBySlug('pages', fixture.tenantA.site.id, slug), 0)
  })

  test('16. create_post markdown round-trips through get_content (bodySource markdown, wordCount set)', async () => {
    const markdown = '# Heading\n\nHello **world** from MCP with several words.\n\n- one\n- two'
    const slug = uniq('roundtrip')
    const created = await call(keyA(), 'create_post', { title: 'Round trip', markdown, slug, type: 'news' })
    assert.equal(created.isError, false, created.text)
    assert.equal(created.data.status, 'draft')
    assert.equal(created.data.site, siteA())
    const read = await call(keyA(), 'get_content', { collection: 'posts', id: created.data.id })
    assert.equal(read.isError, false, read.text)
    assert.equal(read.data.markdown, markdown)
    assert.equal(read.data.bodySource, 'markdown')
    assert.equal(read.data.type, 'news')
    assert.equal(read.data.slug, slug)
    assert.equal(read.data.locale, 'vi')
    assert.equal(read.data.translated, true)
    assert.ok(Number.isInteger(read.data.wordCount) && (read.data.wordCount as number) > 0, `wordCount=${String(read.data.wordCount)}`)
    const bySlug = await call(keyA(), 'get_content', { collection: 'posts', slug, site: siteA() })
    assert.equal(bySlug.data.id, created.data.id)
  })

  test('17. legacy Lexical-only post: legacy-converted on read; markdown write needs acknowledgeLegacyConversion', async () => {
    const lexical = {
      root: {
        type: 'root',
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
        children: [
          {
            type: 'paragraph',
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
            children: [{ type: 'text', text: 'Legacy hello body', version: 1, detail: 0, format: 0, mode: 'normal', style: '' }],
          },
        ],
      },
    }
    const post = await seedPost(fixture.tenantA.editor, fixture.tenantA.site.id, {
      title: 'Legacy',
      slug: uniq('legacy'),
      contentMd: undefined,
      content: lexical,
    })
    const stored = await rawPost(post.id, 'vi')
    assert.ok(stored.contentMd === null || stored.contentMd === undefined, 'seed has no contentMd')

    const read = await call(keyA(), 'get_content', { collection: 'posts', id: post.id })
    assert.equal(read.isError, false, read.text)
    assert.equal(read.data.bodySource, 'legacy-converted')
    assert.match(read.data.markdown as string, /Legacy hello body/)

    const token = read.data.updatedAt as string
    const refused = await call(keyA(), 'update_post', { id: post.id, expectedUpdatedAt: token, markdown: 'New markdown body' })
    assert.equal(refused.code, 'invalid', refused.text)
    assert.match(refused.message, /acknowledgeLegacyConversion/)
    assert.equal((await rawPost(post.id)).updatedAt, token, 'nothing written')

    const titleOnly = await call(keyA(), 'update_post', { id: post.id, expectedUpdatedAt: token, title: 'Legacy retitled' })
    assert.equal(titleOnly.isError, false, `a non-body edit needs no acknowledgement: ${titleOnly.text}`)
    assert.equal((await call(keyA(), 'get_content', { collection: 'posts', id: post.id })).data.bodySource, 'legacy-converted')

    const accepted = await call(keyA(), 'update_post', {
      id: post.id,
      expectedUpdatedAt: titleOnly.data.updatedAt,
      markdown: 'New markdown body',
      acknowledgeLegacyConversion: true,
    })
    assert.equal(accepted.isError, false, accepted.text)
    const after = await call(keyA(), 'get_content', { collection: 'posts', id: post.id })
    assert.equal(after.data.bodySource, 'markdown')
    assert.equal(after.data.markdown, 'New markdown body')
  })

  test('18. duplicate slug → conflict (not internal), on create and on update', async () => {
    const slug = uniq('dup')
    const first = await call(keyA(), 'create_post', { title: 'Dup 1', markdown: 'x', slug })
    assert.equal(first.isError, false, first.text)
    const second = await call(keyA(), 'create_post', { title: 'Dup 2', markdown: 'x', slug })
    assert.equal(second.code, 'conflict', second.text)
    assert.equal(await countBySlug('posts', fixture.tenantA.site.id, slug), 1)

    const other = await call(keyA(), 'create_post', { title: 'Dup 3', markdown: 'x', slug: uniq('dup-other') })
    assert.equal(other.isError, false, other.text)
    const rename = await call(keyA(), 'update_post', { id: other.data.id, expectedUpdatedAt: other.data.updatedAt, slug })
    assert.equal(rename.code, 'conflict', rename.text)

    // The same slug on the other site is fine: uniqueness is per site.
    const onB = await call(fixture.multiEditorKey, 'create_post', { site: fixture.tenantB.site.siteKey, title: 'Dup B', markdown: 'x', slug })
    assert.equal(onB.isError, false, onB.text)
  })

  // ── 19–21: trash, locale, taxonomy refs ─────────────────────────────────────

  test('19. trash_content keeps the row (deletedAt set); restore_from_trash brings it back', async () => {
    const created = await call(keyA(), 'create_post', { title: 'Trash me', markdown: 'x', slug: uniq('trash') })
    assert.equal(created.isError, false, created.text)
    const id = created.data.id as number
    const trashed = await call(keyA(), 'trash_content', { collection: 'posts', id, expectedUpdatedAt: created.data.updatedAt })
    assert.equal(trashed.isError, false, trashed.text)
    assert.equal(trashed.data.trashed, true)
    assert.equal(trashed.data.undo, 'restore_from_trash')
    const row = await rawPost(id)
    assert.ok(row.deletedAt, 'row still exists with deletedAt')

    const edit = await call(keyA(), 'update_post', { id, expectedUpdatedAt: trashed.data.updatedAt, title: 'while trashed' })
    assert.equal(edit.code, 'invalid', 'a trashed document cannot be edited')

    const restored = await call(keyA(), 'restore_from_trash', { collection: 'posts', id })
    assert.equal(restored.isError, false, restored.text)
    assert.ok(!restored.data.trashed)
    assert.equal((await rawPost(id)).deletedAt ?? null, null)
    assert.equal((await call(keyA(), 'get_content', { collection: 'posts', id })).isError, false)
  })

  test('20. get_content locale=en on a vi-only post: translated false, no vi text leaks into en fields', async () => {
    const post = await seedPost(fixture.tenantA.editor, fixture.tenantA.site.id, {
      title: 'Chỉ có tiếng Việt',
      slug: uniq('vi-only'),
      contentMd: 'Nội dung tiếng Việt',
      excerpt: 'Tóm tắt tiếng Việt',
      seo: { title: 'SEO tiếng Việt' },
    })
    const en = await call(keyA(), 'get_content', { collection: 'posts', id: post.id, locale: 'en' })
    assert.equal(en.isError, false, en.text)
    assert.equal(en.data.locale, 'en')
    assert.equal(en.data.translated, false)
    assert.equal(en.data.title, null)
    assert.equal(en.data.markdown, '')
    assert.equal(en.data.bodySource, 'empty')
    assert.ok(!en.data.excerpt, `excerpt: ${String(en.data.excerpt)}`)
    assert.equal((en.data.seo as { title: unknown }).title, null)
    assert.ok(!en.text.includes('tiếng Việt'), 'no vi text anywhere in the en response')

    const vi = await call(keyA(), 'get_content', { collection: 'posts', id: post.id })
    assert.equal(vi.data.translated, true)
    assert.equal(vi.data.title, 'Chỉ có tiếng Việt')
  })

  test('21. {type, slug} refs and bare slugs resolve to the right taxonomy even when tag and category share a slug', async () => {
    const shared = uniq('shared')
    const categoryId = await seedTaxonomy(fixture.tenantA.site.id, 'category', shared)
    const tagId = await seedTaxonomy(fixture.tenantA.site.id, 'tag', shared)
    const onlyTag = uniq('only-tag')
    const onlyTagId = await seedTaxonomy(fixture.tenantA.site.id, 'tag', onlyTag)

    const idsOf = async (categories: unknown[]) => {
      const created = await call(keyA(), 'create_post', { title: 'Tax', markdown: 'x', slug: uniq('tax-post'), categories })
      assert.equal(created.isError, false, created.text)
      const read = await call(keyA(), 'get_content', { collection: 'posts', id: created.data.id })
      return (read.data.categories as Array<{ id: number; type: string }>).map((c) => `${c.type}:${c.id}`).sort()
    }
    assert.deepEqual(await idsOf([{ type: 'tag', slug: shared }]), [`tag:${tagId}`])
    assert.deepEqual(await idsOf([{ type: 'category', slug: shared }]), [`category:${categoryId}`])
    assert.deepEqual(await idsOf([shared]), [`category:${categoryId}`], 'a bare slug means category')
    assert.deepEqual(await idsOf([{ type: 'tag', slug: shared }, { type: 'category', slug: shared }]), [`category:${categoryId}`, `tag:${tagId}`].sort())
    assert.deepEqual(await idsOf([tagId, { type: 'tag', slug: onlyTag }]), [`tag:${tagId}`, `tag:${onlyTagId}`].sort())

    const wrongType = await call(keyA(), 'create_post', { title: 'Tax', markdown: 'x', slug: uniq('tax-bad'), categories: [onlyTag] })
    assert.equal(wrongType.code, 'invalid', 'bare slug of a tag does not resolve as a category')
    assert.match(wrongType.message, /tag/)

    const filtered = await call(keyA(), 'search_content', { collection: 'posts', taxonomy: { type: 'tag', slug: shared } })
    assert.equal(filtered.isError, false, filtered.text)
    assert.ok((filtered.data.totalDocs as number) >= 1)
  })

  // ── 22: SSRF ────────────────────────────────────────────────────────────────

  test('22. import_media_from_url refuses link-local / loopback targets → invalid; no media created', async () => {
    const countMedia = async () => (await payload.count({ collection: 'media', where: { tenant: { equals: fixture.tenantA.site.id } }, overrideAccess: true })).totalDocs
    const before = await countMedia()
    for (const url of ['http://169.254.169.254/latest/meta-data/', 'http://127.0.0.1:55510/x.png', 'http://localhost/x.png', 'http://[::1]/x.png']) {
      const res = await call(keyA(), 'import_media_from_url', { url })
      assert.equal(res.code, 'invalid', `${url}: ${res.text}`)
    }
    assert.equal(await countMedia(), before)
  })

  // ── 23: REST hardening for api-key sessions ─────────────────────────────────

  test('23. REST with an API key: no password/role change, no account creation, no permanent delete', async () => {
    const editor = fixture.tenantA.editor
    const rest = (path: string, method: string, key: string, body?: unknown) => callApi(payload, path, { key, scheme: 'users API-Key', method, body })
    const refused = async (res: Response, label: string) => assert.equal(res.status, 403, `${label}: ${await res.clone().text()}`)

    await refused(await rest(`/api/users/${editor.id}`, 'PATCH', fixture.tenantA.editorKey, { password: 'Hacked123!' }), 'password')
    await refused(await rest(`/api/users/${editor.id}`, 'PATCH', fixture.tenantA.editorKey, { email: `takeover-${fixture.runId}@example.com` }), 'email')
    // `role` and `tenants` are stripped by field-level update access for a non-super-admin before
    // any hook runs, so those requests are silent no-ops (200) rather than a 403 — what matters is
    // that nothing is escalated (checked below). The hook is exercised with the super-admin key.
    const roleAttempt = await rest(`/api/users/${editor.id}`, 'PATCH', fixture.tenantA.editorKey, { role: 'super-admin' })
    assert.ok([200, 403].includes(roleAttempt.status), `role: ${roleAttempt.status}`)
    const tenantsAttempt = await rest(`/api/users/${editor.id}`, 'PATCH', fixture.tenantA.editorKey, {
      tenants: [{ tenant: fixture.tenantA.site.id }, { tenant: fixture.tenantB.site.id }],
    })
    assert.ok([200, 403].includes(tenantsAttempt.status), `tenants: ${tenantsAttempt.status}`)
    const untouched = (await payload.findByID({ collection: 'users', id: editor.id, overrideAccess: true, depth: 0 })) as unknown as User
    assert.equal(untouched.email, editor.email)
    assert.equal(untouched.role, 'editor')
    assert.deepEqual(
      (untouched.tenants ?? []).map((row) => (typeof row.tenant === 'object' ? row.tenant.id : row.tenant)),
      [fixture.tenantA.site.id],
    )
    const stillLogsIn = await payload.login({ collection: 'users', data: { email: editor.email, password: 'Password123!' } })
    assert.ok(stillLogsIn.token, 'old password still valid')

    // Super-admin passes the field-level access, so only the key-session hook stands in the way.
    const target = fixture.tenantB.author
    await refused(await rest(`/api/users/${target.id}`, 'PATCH', fixture.superAdminKey, { role: 'super-admin' }), 'super-admin key role change')
    await refused(await rest(`/api/users/${target.id}`, 'PATCH', fixture.superAdminKey, { password: 'Hacked123!' }), 'super-admin key password change')
    const targetAfter = (await payload.findByID({ collection: 'users', id: target.id, overrideAccess: true, depth: 0 })) as unknown as User
    assert.equal(targetAfter.role, 'author')
    await refused(
      await rest(`/api/users/${target.id}`, 'PATCH', fixture.superAdminKey, { tenants: [{ tenant: fixture.tenantA.site.id }] }),
      'super-admin key tenants change',
    )

    const created = await rest('/api/users', 'POST', fixture.superAdminKey, {
      email: `minted-${fixture.runId}@example.com`,
      password: 'Password123!',
      role: 'editor',
    })
    await refused(created, 'create account')
    const minted = await payload.find({ collection: 'users', where: { email: { equals: `minted-${fixture.runId}@example.com` } }, overrideAccess: true, limit: 1 })
    assert.equal(minted.totalDocs, 0)

    // Permanent delete: refused for a key even when the owner is allowed to (super-admin) …
    const keep = await seedPost(fixture.tenantA.editor, fixture.tenantA.site.id, { slug: uniq('rest-keep') })
    await refused(await rest(`/api/posts/${keep.id}`, 'DELETE', fixture.superAdminKey), 'super-admin key DELETE')
    await refused(await rest(`/api/posts/${keep.id}`, 'DELETE', fixture.tenantA.editorKey), 'editor key DELETE')
    assert.equal((await rawPost(keep.id)).id, keep.id, 'row still there')
    // … while a browser-style session of the same super-admin may (control: the key rule is what blocks).
    const control = await seedPost(fixture.tenantA.editor, fixture.tenantA.site.id, { slug: uniq('rest-control') })
    await payload.delete({ collection: 'posts', id: control.id, user: fixture.superAdmin, overrideAccess: false, trash: true })
    await assert.rejects(rawPost(control.id), 'control post was deleted by the non-key session')
    // Trashing through the same key stays possible (reversible).
    const trash = await rest(`/api/posts/${keep.id}`, 'PATCH', fixture.tenantA.editorKey, { deletedAt: new Date().toISOString() })
    assert.equal(trash.status, 200, 'moving to the trash is allowed')
  })

  // ── 24: no secrets ──────────────────────────────────────────────────────────

  test('24. whoami / get_site expose no hash, salt, apiKey or storage secrets', async () => {
    const SECRET = /hash|salt|apikey|api_key|secret|password|token|accesskey|storage|bucket|r2/i
    const stored = (await payload.findByID({ collection: 'users', id: fixture.tenantA.editor.id, overrideAccess: true, depth: 0, showHiddenFields: true })) as unknown as Record<string, unknown>
    const hiddenValues = [fixture.tenantA.editorKey, stored.hash, stored.salt, stored.apiKeyIndex].filter((v): v is string => typeof v === 'string' && v.length > 8)

    const who = await call(keyA(), 'whoami')
    assert.equal(who.isError, false, who.text)
    assert.deepEqual(Object.keys(who.data).sort(), ['email', 'id', 'role', 'sites', 'strategy'])
    const site = await call(keyA(), 'get_site', {})
    assert.equal(site.isError, false, site.text)
    assert.deepEqual(Object.keys(site.data).sort(), ['counts', 'defaultLanguage', 'domain', 'id', 'locales', 'siteKey'])
    const admin = await call(fixture.superAdminKey, 'whoami')
    assert.ok(admin.data.warning, 'super-admin keys carry a warning')
    for (const res of [who, site, admin, await call(keyA(), 'list_sites'), await call(keyA(), 'list_shortcodes', {})]) {
      assert.equal(res.isError, false, res.text)
      assert.ok(!SECRET.test(res.text.replace(/"strategy":"api-key"/, '')), `secret-looking token in: ${res.text}`)
      for (const value of hiddenValues) assert.ok(!res.text.includes(value), 'hidden value leaked')
    }
  })

  // ── 25, 26: transport ───────────────────────────────────────────────────────

  test('25. JSON-RPC batches → 400; invalid JSON → 400; GET/DELETE → 405; oversized body → 413', async () => {
    const batch = await callMcp(payload, {
      key: keyA(),
      body: [
        { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'whoami', arguments: {} } },
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'whoami', arguments: {} } },
      ],
    })
    assert.equal(batch.status, 400)
    assert.equal(((await batch.json()) as { error: { code: number } }).error.code, -32600)
    assert.equal((await callMcp(payload, { key: keyA(), body: '{not json' })).status, 400)
    assert.equal((await callMcp(payload, { key: keyA(), method: 'GET' })).status, 405)
    assert.equal((await callMcp(payload, { key: keyA(), method: 'DELETE' })).status, 405)
    const huge = await callMcp(payload, { key: keyA(), body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping', pad: 'x'.repeat(2 * 1024 * 1024 + 1) }) })
    assert.equal(huge.status, 413)
  })

  test('26. MCP_ENABLED=false → 404 on every method, before any auth work', async () => {
    const body = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'whoami', arguments: {} } }
    process.env.MCP_ENABLED = 'false'
    try {
      assert.equal((await callMcp(payload, { key: keyA(), body })).status, 404)
      assert.equal((await callMcp(payload, { body })).status, 404, 'no key at all is 404, not 401')
      assert.equal((await callMcp(payload, { key: keyA(), method: 'GET' })).status, 404)
      assert.equal((await callMcp(payload, { key: keyA(), method: 'DELETE' })).status, 404)
    } finally {
      delete process.env.MCP_ENABLED
    }
    assert.equal((await callMcp(payload, { key: keyA(), body })).status, 200, 're-enabled')
  })

  // ── 27: pages ───────────────────────────────────────────────────────────────

  test('27. create_page with pageType; update_page in en leaves the vi title', async () => {
    const slug = uniq('landing')
    const created = await call(keyA(), 'create_page', { title: 'Trang đích', markdown: 'Nội dung trang', slug, pageType: 'landing', isPillarPage: true })
    assert.equal(created.isError, false, created.text)
    assert.equal(created.data.collection, 'pages')
    assert.equal(created.data.status, 'draft')
    const id = created.data.id as number
    fixture.trackPage(id)

    const read = await call(keyA(), 'get_content', { collection: 'pages', id })
    assert.equal(read.data.pageType, 'landing')
    assert.equal(read.data.isPillarPage, true)
    assert.equal(read.data.title, 'Trang đích')
    assert.ok(!('excerpt' in read.data), 'pages have no excerpt')

    const en = await call(keyA(), 'update_page', { id, locale: 'en', expectedUpdatedAt: read.data.updatedAt, title: 'Landing page', markdown: 'Page body' })
    assert.equal(en.isError, false, en.text)
    const stored = (await payload.findByID({ collection: 'pages', id, locale: 'all', depth: 0, overrideAccess: true })) as unknown as {
      title: Localized<string>
      contentMd: Localized<string>
      pageType: string
    }
    assert.deepEqual(stored.title, { vi: 'Trang đích', en: 'Landing page' })
    assert.deepEqual(stored.contentMd, { vi: 'Nội dung trang', en: 'Page body' })
    assert.equal(stored.pageType, 'landing')

    const vi = await call(keyA(), 'get_content', { collection: 'pages', id, locale: 'vi' })
    assert.equal(vi.data.title, 'Trang đích')
    const retype = await call(keyA(), 'update_page', { id, expectedUpdatedAt: en.data.updatedAt, pageType: 'blog' })
    assert.equal(retype.isError, false, retype.text)
    assert.equal((await call(keyA(), 'get_content', { collection: 'pages', id })).data.pageType, 'blog')
    assert.equal(await versionCount('pages', id) >= 3, true, 'each write left a version')
  })
})
