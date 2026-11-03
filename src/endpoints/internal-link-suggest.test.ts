/**
 * Unit tests for internal-link-suggest endpoint (UPDATED — tenant isolation).
 *
 * Tests ranking logic (tokenize + scoreCandidate) independently,
 * then tests the HTTP handler with stubbed payload.find().
 *
 * Runner: node --import tsx --test
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { tokenize, scoreCandidate, internalLinkSuggestEndpoint } from './internal-link-suggest.js'

// ─── tokenize ────────────────────────────────────────────────────────────────

describe('tokenize', () => {
  it('splits on whitespace and hyphens', () => {
    const tokens = tokenize('du-lich phu quoc')
    assert.ok(tokens.includes('lich'), `tokens=${JSON.stringify(tokens)}`)
    assert.ok(tokens.includes('phu'), `tokens=${JSON.stringify(tokens)}`)
    assert.ok(tokens.includes('quoc'), `tokens=${JSON.stringify(tokens)}`)
  })

  it('strips diacritics so Vietnamese matches normalized slug', () => {
    const tokens = tokenize('Phú Quốc')
    assert.ok(tokens.includes('phu'), `tokens=${JSON.stringify(tokens)}`)
    assert.ok(tokens.includes('quoc'), `tokens=${JSON.stringify(tokens)}`)
  })

  it('filters out short tokens (< 3 chars)', () => {
    const tokens = tokenize('du lịch')
    // 'du' (2 chars after normalize) should be filtered
    assert.ok(!tokens.includes('du'), `should filter 'du', tokens=${JSON.stringify(tokens)}`)
  })

  it('returns empty array for blank input', () => {
    assert.deepEqual(tokenize(''), [])
    assert.deepEqual(tokenize('   '), [])
  })
})

// ─── scoreCandidate ───────────────────────────────────────────────────────────

describe('scoreCandidate', () => {
  it('returns 0 for empty query tokens', () => {
    const s = scoreCandidate({ title: 'Du lịch Phú Quốc', slug: 'du-lich-phu-quoc' }, [])
    assert.equal(s, 0)
  })

  it('scores title match higher than slug-only match', () => {
    const tokens = ['phu', 'quoc']
    const titleMatch = scoreCandidate({ title: 'Du lich Phu Quoc guide', slug: 'unrelated' }, tokens)
    const slugOnly = scoreCandidate({ title: 'Unrelated title here', slug: 'phu-quoc' }, tokens)
    assert.ok(titleMatch > slugOnly, `titleMatch=${titleMatch} should > slugOnly=${slugOnly}`)
  })

  it('both title and slug match gives highest score', () => {
    const tokens = ['phu', 'quoc']
    const both = scoreCandidate({ title: 'Du lich Phu Quoc', slug: 'phu-quoc' }, tokens)
    const titleOnly = scoreCandidate({ title: 'Du lich Phu Quoc', slug: 'unrelated' }, tokens)
    assert.ok(both >= titleOnly, `both=${both} should >= titleOnly=${titleOnly}`)
  })

  it('returns 0 when no token matches', () => {
    const s = scoreCandidate({ title: 'Con tàu phà Cần Thơ', slug: 'pha-can-tho' }, ['nhatrang'])
    assert.equal(s, 0)
  })

  it('partial substring match counts (token contains query token)', () => {
    // 'tourism' contains 'tour'
    const s = scoreCandidate({ title: 'Tourism guide', slug: 'tourism-guide' }, ['tour'])
    assert.ok(s > 0, `expected score > 0, got ${s}`)
  })
})

// ─── Handler helpers ──────────────────────────────────────────────────────────

/** Minimal tenant-assigned user (matches TenantUser shape from resolve-tenant-from-request). */
const TENANT_USER = {
  id: 'u1',
  role: 'editor',
  tenants: [{ tenant: 'tenant-A' }],
}

function makeReq(opts: {
  user?: { id: string; role?: string; tenants?: Array<{ tenant: string | { id: string } }> } | null
  queryParams?: Record<string, string>
  findResults?: Record<string, { docs: unknown[] }>
  cookie?: string
}): Parameters<typeof internalLinkSuggestEndpoint.handler>[0] {
  const { user = TENANT_USER, queryParams = {}, findResults = {}, cookie } = opts
  const params = new URLSearchParams(queryParams)
  const url = `http://localhost/api/seo/internal-link-suggest?${params}`

  // Records every `where` the endpoint passes to find() so tenant-scope assertions
  // can check the actual query, not just the HTTP status.
  const whereLog: Array<Record<string, unknown>> = []

  return {
    user,
    url,
    headers: {
      get: (name: string) => (name === 'cookie' ? (cookie ?? null) : null),
    },
    payload: {
      find: async ({ collection, where }: { collection: string; where?: unknown }) => {
        whereLog.push((where ?? {}) as Record<string, unknown>)
        return findResults[collection] ?? { docs: [] }
      },
    },
    _whereLog: whereLog,
  } as unknown as Parameters<typeof internalLinkSuggestEndpoint.handler>[0]
}

async function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>
}

const candidateAlpha = {
  id: 'c1',
  title: 'Du lịch Phú Quốc chi tiết',
  slug: 'du-lich-phu-quoc',
}

const candidateHaLong = {
  id: 'c2',
  title: 'Vịnh Hạ Long đẹp nhất',
  slug: 'vinh-ha-long',
}

const candidateAlphaHotel = {
  id: 'c3',
  title: 'Khách sạn Phú Quốc tốt nhất',
  slug: 'khach-san-phu-quoc',
}

// ─── Security tests (B3) ─────────────────────────────────────────────────────

describe('internalLinkSuggestEndpoint — tenant isolation (B3)', () => {
  it('returns 401 when unauthenticated', async () => {
    const req = makeReq({ user: null, queryParams: { docId: 'd1', collection: 'posts' } })
    const res = await internalLinkSuggestEndpoint.handler(req)
    assert.equal((res as Response).status, 401)
  })

  it('returns 400 when user has no tenants and no cookie (B3: never unscoped)', async () => {
    const req = makeReq({
      user: { id: 'u-no-tenant', role: 'editor', tenants: [] },
      queryParams: { docId: 'd1', collection: 'posts', keyword: 'Phú Quốc' },
      // no cookie
    })
    const res = await internalLinkSuggestEndpoint.handler(req)
    assert.equal((res as Response).status, 400)
    const body = await json(res as Response)
    assert.ok(typeof body.error === 'string')
  })

  it('REJECTS a cookie tenant when the user has no memberships (RT-7: forged cookie cannot widen scope)', async () => {
    const req = makeReq({
      user: { id: 'u2', role: 'editor', tenants: [] },
      cookie: 'payload-tenant=cookie-tenant-id',
      queryParams: { docId: 'd1', collection: 'posts', keyword: 'Phú Quốc' },
      findResults: {
        posts: { docs: [candidateAlpha] },
        pages: { docs: [] },
        products: { docs: [] },
        landings: { docs: [] },
      },
    })
    const res = await internalLinkSuggestEndpoint.handler(req)
    assert.equal((res as Response).status, 400)
  })

  it('ignores a cookie naming a tenant the user does not belong to, and searches their own tenant (RT-7)', async () => {
    const req = makeReq({
      user: { id: 'u6', role: 'editor', tenants: [{ tenant: 'tenant-A' }] },
      cookie: 'payload-tenant=tenant-B',
      queryParams: { docId: 'd1', collection: 'posts', keyword: 'Phú Quốc' },
      findResults: {
        posts: { docs: [candidateAlpha] },
        pages: { docs: [] },
        products: { docs: [] },
        landings: { docs: [] },
      },
    })
    const res = await internalLinkSuggestEndpoint.handler(req)
    assert.equal((res as Response).status, 200)
    const log = (req as unknown as { _whereLog: Array<{ tenant?: { equals?: string } }> })._whereLog
    assert.ok(log.length > 0, 'endpoint must query with a tenant filter')
    for (const where of log) {
      assert.equal(where.tenant?.equals, 'tenant-A', 'every query must be scoped to the caller tenant')
    }
  })

  it('tenant resolved from user.tenants[] when no cookie', async () => {
    const req = makeReq({
      user: { id: 'u3', role: 'editor', tenants: [{ tenant: 'user-tenant-id' }] },
      // no cookie
      queryParams: { docId: 'd1', collection: 'posts', keyword: 'Phú Quốc' },
      findResults: {
        posts: { docs: [] },
        pages: { docs: [] },
        products: { docs: [] },
        landings: { docs: [] },
      },
    })
    const res = await internalLinkSuggestEndpoint.handler(req)
    assert.equal((res as Response).status, 200)
  })

  it('tenant resolved from nested {id} object in user.tenants[]', async () => {
    const req = makeReq({
      user: { id: 'u4', role: 'editor', tenants: [{ tenant: { id: 'nested-tenant-id' } }] },
      queryParams: { docId: 'd1', collection: 'posts', keyword: 'test' },
      findResults: { posts: { docs: [] }, pages: { docs: [] }, products: { docs: [] }, landings: { docs: [] } },
    })
    const res = await internalLinkSuggestEndpoint.handler(req)
    assert.equal((res as Response).status, 200)
  })
})

// ─── Functional tests (param validation + ranking) ───────────────────────────

describe('internalLinkSuggestEndpoint — validation and ranking', () => {
  it('returns 400 when docId is missing', async () => {
    const req = makeReq({ queryParams: { collection: 'posts' } })
    const res = await internalLinkSuggestEndpoint.handler(req)
    assert.equal((res as Response).status, 400)
  })

  it('returns 400 when collection is missing', async () => {
    const req = makeReq({ queryParams: { docId: 'd1' } })
    const res = await internalLinkSuggestEndpoint.handler(req)
    assert.equal((res as Response).status, 400)
  })

  it('returns empty suggestions when no keyword/title provided', async () => {
    const req = makeReq({
      queryParams: { docId: 'd1', collection: 'posts' },
      findResults: { posts: { docs: [candidateAlpha] } },
    })
    const res = await internalLinkSuggestEndpoint.handler(req)
    const body = await json(res as Response)
    // No tokens → no matches
    assert.deepEqual(body.suggestions, [])
  })

  it('excludes the current doc from suggestions', async () => {
    const req = makeReq({
      queryParams: {
        docId: 'c1',
        collection: 'posts',
        keyword: 'Phú Quốc',
      },
      findResults: {
        posts: { docs: [candidateAlpha, candidateHaLong] },
        pages: { docs: [] },
        products: { docs: [] },
        landings: { docs: [] },
      },
    })
    const res = await internalLinkSuggestEndpoint.handler(req)
    const body = await json(res as Response)
    const suggestions = body.suggestions as Array<{ id: string }>
    assert.ok(!suggestions.some(s => s.id === 'c1'), 'current doc should be excluded')
  })

  it('ranks higher-scoring candidates first', async () => {
    const req = makeReq({
      queryParams: {
        docId: 'current',
        collection: 'posts',
        keyword: 'Phú Quốc',
      },
      findResults: {
        posts: { docs: [candidateHaLong, candidateAlphaHotel, candidateAlpha] },
        pages: { docs: [] },
        products: { docs: [] },
        landings: { docs: [] },
      },
    })
    const res = await internalLinkSuggestEndpoint.handler(req)
    const body = await json(res as Response)
    const suggestions = body.suggestions as Array<{ id: string; score: number }>
    // Ha Long should not appear (no token match with 'phu quoc')
    assert.ok(!suggestions.some(s => s.id === 'c2'), 'ha long should not appear')
    // Phu Quoc candidates should appear; verify sorted desc by score
    for (let i = 1; i < suggestions.length; i++) {
      assert.ok(
        suggestions[i].score <= suggestions[i - 1].score,
        `scores not descending: ${JSON.stringify(suggestions.map(s => s.score))}`,
      )
    }
  })

  it('respects limit param (default 5, max 10)', async () => {
    const manyCandidates = Array.from({ length: 15 }, (_, i) => ({
      id: `doc-${i}`,
      title: `Du lịch Phú Quốc số ${i}`,
      slug: `du-lich-phu-quoc-${i}`,
    }))
    const req = makeReq({
      queryParams: { docId: 'other', collection: 'posts', keyword: 'Phú Quốc', limit: '3' },
      findResults: {
        posts: { docs: manyCandidates },
        pages: { docs: [] },
        products: { docs: [] },
        landings: { docs: [] },
      },
    })
    const res = await internalLinkSuggestEndpoint.handler(req)
    const body = await json(res as Response)
    assert.ok(
      (body.suggestions as unknown[]).length <= 3,
      `expected ≤3, got ${(body.suggestions as unknown[]).length}`,
    )
  })

  it('includes collection, adminUrl, and frontendSlug in results', async () => {
    const req = makeReq({
      queryParams: { docId: 'other', collection: 'posts', keyword: 'Phú Quốc' },
      findResults: {
        posts: { docs: [candidateAlpha] },
        pages: { docs: [] },
        products: { docs: [] },
        landings: { docs: [] },
      },
    })
    const res = await internalLinkSuggestEndpoint.handler(req)
    const body = await json(res as Response)
    const first = (body.suggestions as Array<{
      collection: string; adminUrl: string; frontendSlug: string
    }>)[0]
    assert.equal(first.collection, 'posts')
    assert.equal(first.adminUrl, '/admin/collections/posts/c1')
    assert.equal(first.frontendSlug, '/du-lich-phu-quoc')
  })

  it('suggests products at their real public route /product/{slug}', async () => {
    // Before `publicPathFor` the suggester emitted `/{slug}` for every collection, so a
    // copied product link pointed at a route frontend does not serve.
    const req = makeReq({
      queryParams: { docId: 'other', collection: 'posts', keyword: 'Phú Quốc' },
      findResults: {
        posts: { docs: [] },
        pages: { docs: [] },
        products: { docs: [{ id: 'p1', title: 'Vé sản phẩm Phú Quốc', slug: 've-tau-phu-quoc' }] },
        landings: { docs: [] },
      },
    })
    const res = await internalLinkSuggestEndpoint.handler(req)
    const body = await json(res as Response)
    const [product] = body.suggestions as Array<{ collection: string; frontendSlug: string }>
    assert.equal(product.collection, 'products')
    assert.equal(product.frontendSlug, '/product/ve-tau-phu-quoc')
  })
})
