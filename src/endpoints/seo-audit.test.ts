/**
 * Unit tests for seo-audit endpoint.
 *
 * Strategy: stub req.payload.find() to return controlled doc fixtures;
 * verify the endpoint returns only deficient docs, sorted by score asc,
 * with correct reasons — no real DB traffic.
 *
 * Security coverage (B2 / B3 / SP0-R2 RT-7):
 *  - No tenant resolved → 400 (never unscoped)
 *  - Non-super-admin cannot override tenantId via query param
 *  - Super-admin CAN override tenantId via query param
 *  - Tenant from user.tenants[] used as fallback when no cookie
 *  - A `payload-tenant` cookie is honoured only for a member of that tenant; a
 *    forged/stale cookie falls back to the caller's own tenant (or 400 if none)
 *
 * Runner: node --import tsx --test
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { seoAuditEndpoint } from './seo-audit.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal tenant-assigned user (matches TenantUser shape). */
const TENANT_USER = {
  id: 'u1',
  role: 'editor',
  tenants: [{ tenant: 'tenant-A' }],
}

const SUPER_ADMIN = { id: 'su1', role: 'super-admin', tenants: [] }

/** Build a minimal Payload-like request stub. */
function makeReq(opts: {
  user?: { id: string; role?: string; tenants?: Array<{ tenant: string | { id: string } }> } | null
  findResults?: Record<string, { docs: unknown[] }>
  cookie?: string
  queryParams?: Record<string, string>
}): Parameters<typeof seoAuditEndpoint.handler>[0] {
  const { user = TENANT_USER, findResults = {}, cookie, queryParams = {} } = opts

  const params = new URLSearchParams(queryParams)
  const url = `http://localhost/api/seo/audit${params.size ? `?${params}` : ''}`

  // Track which tenantWhere was actually passed to find() for assertion purposes
  let capturedWhere: unknown = undefined

  return {
    user,
    url,
    headers: {
      get: (name: string) => {
        if (name === 'cookie') return cookie ?? null
        return null
      },
    },
    payload: {
      find: async ({ collection, where }: { collection: string; where?: unknown }) => {
        capturedWhere = where
        return findResults[collection] ?? { docs: [] }
      },
    },
    // Expose captured where for assertion in tests
    _getCapturedWhere: () => capturedWhere,
  } as unknown as Parameters<typeof seoAuditEndpoint.handler>[0]
}

/** Extract JSON body from a Response. */
async function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** Doc with good SEO — should NOT appear in audit results. */
const goodDoc = {
  id: 'doc-good',
  title: 'Du lịch Phú Quốc — hướng dẫn chi tiết nhất 2026',
  seo: {
    title: 'Du lịch Phú Quốc — hướng dẫn chi tiết nhất 2026',
    description:
      'Khám phá Phú Quốc với hướng dẫn du lịch đầy đủ nhất, từ ăn uống đến lưu trú và điểm tham quan đẹp nhất.',
    focusKeywords: ['Phú Quốc'],
    robots: ['index', 'follow'],
  },
  slug: 'du-lich-phu-quoc',
  updatedAt: '2026-06-25T10:00:00Z',
}

/** Doc missing title — deficient. */
const noTitleDoc = {
  id: 'doc-no-title',
  title: 'Post without SEO title',
  seo: {
    title: '',
    description: 'Mô tả có nội dung nhưng thiếu tiêu đề SEO.',
  },
  slug: 'post-without-title',
  updatedAt: '2026-06-24T09:00:00Z',
}

/** Doc missing description — deficient. */
const noDescDoc = {
  id: 'doc-no-desc',
  title: 'Post without description',
  seo: {
    title: 'Tiêu đề SEO đầy đủ cho bài viết này rất quan trọng',
    description: '',
  },
  slug: 'post-without-desc',
  updatedAt: '2026-06-24T08:00:00Z',
}

/** Doc with noindex — deficient. */
const noindexDoc = {
  id: 'doc-noindex',
  title: 'Archive page',
  seo: {
    title: 'Trang lưu trữ nội bộ không nên xuất hiện trên Google',
    description: 'Mô tả đầy đủ trang lưu trữ nội bộ hơn 100 ký tự để đáp ứng yêu cầu về độ dài meta description.',
    robots: ['noindex', 'nofollow'],
  },
  slug: 'archive',
  updatedAt: '2026-06-23T07:00:00Z',
}

// ─── Security tests (B2 / B3) ─────────────────────────────────────────────────

describe('seoAuditEndpoint — tenant isolation (B2/B3)', () => {
  it('returns 401 when unauthenticated', async () => {
    const req = makeReq({ user: null })
    const res = await seoAuditEndpoint.handler(req)
    assert.equal((res as Response).status, 401)
  })

  it('returns 400 when user has no tenants and no cookie (B3: never unscoped)', async () => {
    const req = makeReq({
      user: { id: 'u-no-tenant', role: 'editor', tenants: [] },
      // no cookie
    })
    const res = await seoAuditEndpoint.handler(req)
    assert.equal((res as Response).status, 400)
    const body = await json(res as Response)
    assert.ok(typeof body.error === 'string', 'should return error message')
  })

  it('non-super-admin: ?tenantId= query param is IGNORED (B2 fix)', async () => {
    // Regular editor with tenant-A tries to pass tenantId=tenant-B
    // Should be scoped to tenant-A (from user.tenants[]), not tenant-B
    const req = makeReq({
      user: { id: 'u-editor', role: 'editor', tenants: [{ tenant: 'tenant-A' }] },
      queryParams: { tenantId: 'tenant-B' },
      findResults: { posts: { docs: [] }, pages: { docs: [] }, products: { docs: [] }, landings: { docs: [] } },
    })
    const res = await seoAuditEndpoint.handler(req)
    assert.equal((res as Response).status, 200)
    const body = await json(res as Response)
    // Response must report tenant-A (from user.tenants[]), NOT tenant-B
    assert.equal(body.tenantId, 'tenant-A', `expected tenant-A, got ${body.tenantId}`)
  })

  it('super-admin: ?tenantId= query param IS honoured (B2 fix)', async () => {
    const req = makeReq({
      user: SUPER_ADMIN,
      queryParams: { tenantId: 'tenant-X' },
      findResults: { posts: { docs: [] }, pages: { docs: [] }, products: { docs: [] }, landings: { docs: [] } },
    })
    const res = await seoAuditEndpoint.handler(req)
    assert.equal((res as Response).status, 200)
    const body = await json(res as Response)
    assert.equal(body.tenantId, 'tenant-X', `expected tenant-X, got ${body.tenantId}`)
  })

  it('super-admin with no queryParam and no cookie but no tenants → 400 (B3)', async () => {
    const req = makeReq({
      user: SUPER_ADMIN,
      // no cookie, no queryParam, no tenants[]
    })
    const res = await seoAuditEndpoint.handler(req)
    assert.equal((res as Response).status, 400)
  })

  it('REJECTS a cookie tenant when the user has no memberships (RT-7: forged cookie cannot widen scope)', async () => {
    const req = makeReq({
      user: { id: 'u2', role: 'editor', tenants: [] },
      cookie: 'payload-tenant=cookie-tenant-id',
      findResults: { posts: { docs: [] }, pages: { docs: [] }, products: { docs: [] }, landings: { docs: [] } },
    })
    const res = await seoAuditEndpoint.handler(req)
    assert.equal((res as Response).status, 400)
  })

  it('ignores a cookie naming a tenant the user does not belong to, and audits their own tenant (RT-7)', async () => {
    const req = makeReq({
      user: { id: 'u5', role: 'editor', tenants: [{ tenant: 'tenant-A' }] },
      cookie: 'payload-tenant=tenant-B',
      findResults: { posts: { docs: [] }, pages: { docs: [] }, products: { docs: [] }, landings: { docs: [] } },
    })
    const res = await seoAuditEndpoint.handler(req)
    assert.equal((res as Response).status, 200)
    const body = await json(res as Response)
    assert.equal(body.tenantId, 'tenant-A', 'must fall back to a tenant the user belongs to')
    const where = (req as unknown as { _getCapturedWhere: () => { tenant?: { equals?: string } } })._getCapturedWhere()
    assert.equal(where?.tenant?.equals, 'tenant-A', 'query must be scoped to the fallback tenant')
  })

  it('tenant resolved from user.tenants[] when no cookie (plugin array path)', async () => {
    const req = makeReq({
      user: { id: 'u3', role: 'editor', tenants: [{ tenant: 'user-tenant-id' }] },
      // no cookie
      findResults: { posts: { docs: [] }, pages: { docs: [] }, products: { docs: [] }, landings: { docs: [] } },
    })
    const res = await seoAuditEndpoint.handler(req)
    assert.equal((res as Response).status, 200)
    const body = await json(res as Response)
    assert.equal(body.tenantId, 'user-tenant-id')
  })

  it('tenant resolved from nested {id} object in user.tenants[]', async () => {
    const req = makeReq({
      user: { id: 'u4', role: 'editor', tenants: [{ tenant: { id: 'nested-tenant-id' } }] },
      findResults: { posts: { docs: [] }, pages: { docs: [] }, products: { docs: [] }, landings: { docs: [] } },
    })
    const res = await seoAuditEndpoint.handler(req)
    assert.equal((res as Response).status, 200)
    const body = await json(res as Response)
    assert.equal(body.tenantId, 'nested-tenant-id')
  })
})

// ─── Functional tests (existing, tenant now always resolved via TENANT_USER) ──

describe('seoAuditEndpoint — audit logic', () => {
  it('returns 200 with empty deficient list when all docs are good', async () => {
    const req = makeReq({
      findResults: {
        posts: { docs: [goodDoc] },
        pages: { docs: [] },
        products: { docs: [] },
        landings: { docs: [] },
      },
    })
    const res = await seoAuditEndpoint.handler(req)
    assert.equal((res as Response).status, 200)
    const body = await json(res as Response)
    assert.equal(body.total, 0)
    assert.deepEqual(body.deficient, [])
  })

  it('includes missing-title doc in results', async () => {
    const req = makeReq({
      findResults: {
        posts: { docs: [noTitleDoc] },
        pages: { docs: [] },
        products: { docs: [] },
        landings: { docs: [] },
      },
    })
    const res = await seoAuditEndpoint.handler(req)
    const body = await json(res as Response)
    assert.equal(body.total, 1)
    const deficient = body.deficient as Array<{ id: string; reasons: string[] }>
    assert.equal(deficient[0].id, 'doc-no-title')
    assert.ok(deficient[0].reasons.includes('missing-title'))
  })

  it('includes missing-desc doc in results', async () => {
    const req = makeReq({
      findResults: {
        posts: { docs: [noDescDoc] },
        pages: { docs: [] },
        products: { docs: [] },
        landings: { docs: [] },
      },
    })
    const res = await seoAuditEndpoint.handler(req)
    const body = await json(res as Response)
    const deficient = body.deficient as Array<{ reasons: string[] }>
    assert.ok(deficient.some(d => d.reasons.includes('missing-desc')))
  })

  it('includes noindex doc with noindex reason', async () => {
    const req = makeReq({
      findResults: {
        posts: { docs: [noindexDoc] },
        pages: { docs: [] },
        products: { docs: [] },
        landings: { docs: [] },
      },
    })
    const res = await seoAuditEndpoint.handler(req)
    const body = await json(res as Response)
    const deficient = body.deficient as Array<{ id: string; reasons: string[] }>
    const found = deficient.find(d => d.id === 'doc-noindex')
    assert.ok(found, 'noindex doc should be in deficient list')
    assert.ok(found!.reasons.includes('noindex'))
  })

  it('filters good docs out and only returns deficient ones', async () => {
    const req = makeReq({
      findResults: {
        posts: { docs: [goodDoc, noTitleDoc, noindexDoc] },
        pages: { docs: [noDescDoc] },
        products: { docs: [] },
        landings: { docs: [] },
      },
    })
    const res = await seoAuditEndpoint.handler(req)
    const body = await json(res as Response)
    const deficient = body.deficient as Array<{ id: string }>
    assert.ok(!deficient.some(d => d.id === 'doc-good'), 'good doc should not appear')
    assert.ok(deficient.some(d => d.id === 'doc-no-title'))
    assert.ok(deficient.some(d => d.id === 'doc-noindex'))
    assert.ok(deficient.some(d => d.id === 'doc-no-desc'))
    assert.equal(body.total, 3)
  })

  it('sorts deficient docs by score ascending (worst first)', async () => {
    const req = makeReq({
      findResults: {
        posts: { docs: [noTitleDoc, noindexDoc, noDescDoc] },
        pages: { docs: [] },
        products: { docs: [] },
        landings: { docs: [] },
      },
    })
    const res = await seoAuditEndpoint.handler(req)
    const body = await json(res as Response)
    const scores = (body.deficient as Array<{ score: number }>).map(d => d.score)
    for (let i = 1; i < scores.length; i++) {
      assert.ok(scores[i] >= scores[i - 1], `scores not ascending: ${JSON.stringify(scores)}`)
    }
  })

  it('includes collection and adminUrl in each result', async () => {
    const req = makeReq({
      findResults: {
        posts: { docs: [noTitleDoc] },
        pages: { docs: [] },
        products: { docs: [] },
        landings: { docs: [] },
      },
    })
    const res = await seoAuditEndpoint.handler(req)
    const body = await json(res as Response)
    const first = (body.deficient as Array<{ collection: string; adminUrl: string }>)[0]
    assert.equal(first.collection, 'posts')
    assert.equal(first.adminUrl, '/admin/collections/posts/doc-no-title')
  })

  it('returns 200 with empty results when no docs in any collection', async () => {
    const req = makeReq({
      findResults: {
        posts: { docs: [] },
        pages: { docs: [] },
        products: { docs: [] },
        landings: { docs: [] },
      },
    })
    const res = await seoAuditEndpoint.handler(req)
    assert.equal((res as Response).status, 200)
    const body = await json(res as Response)
    assert.equal(body.total, 0)
  })
})
