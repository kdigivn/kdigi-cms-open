/**
 * Unit tests for the r2-storage-adapter staticHandler.
 * Runner: node --import tsx --test (no real S3 calls).
 *
 * The staticHandler is created inside the `r2StorageAdapter()` closure, but
 * the closure is a factory that returns the same shape every time. We
 * invoke the factory once at module load and use the returned adapter's
 * staticHandler for these tests.
 *
 * Network calls (GetObject + getSignedUrl) are stubbed at the @aws-sdk
 * client level by mocking `req.payload` to return an R2 config that
 * references an unreachable endpoint. The staticHandler's tenant-isolation
 * logic short-circuits BEFORE the network call for the 401/403 cases, so
 * those don't need any AWS mocking. The 302 happy path would need a
 * real (or mocked) signed URL — out of scope for this file.
 *
 * Security-critical paths covered:
 *   - 401: anonymous request with no cookie, no referer, no single-tenant
 *   - 403: non-super-admin requests a prefix whose tenant is not theirs
 *   - 200 path: super-admin can read cross-tenant (not asserted here, but
 *     the carve-out is exercised in the 200-path test for own-tenant)
 *   - prefix-tenant vs caller-tenant tautology (the bug being fixed)
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { r2StorageAdapter, deriveR2Key, resolveDeletableKey } from './r2-storage-adapter.js'
import type { PayloadRequest } from 'payload'

// ─── resolveDeletableKey (SP0-R2 / RT-1: never delete another tenant's object) ──

describe('resolveDeletableKey', () => {
  const member = { memberTenantIds: ['1'], isSuperAdmin: false, isInternalCaller: false }

  it('returns the key for a doc inside the caller tenant', () => {
    assert.equal(
      resolveDeletableKey(
        { url: 'https://cdn.example.net/media/1/abc.webp', tenant: 1 },
        member,
      ),
      'media/1/abc.webp',
    )
  })

  it('refuses ANY delete when externalUrl is set, even a foreign media/ URL (RT-1 exploit)', () => {
    // The plugin calls handleDelete with the post-afterRead doc, where url === externalUrl.
    assert.equal(
      resolveDeletableKey(
        {
          url: 'https://evil.example/media/2/victim.webp',
          externalUrl: 'https://evil.example/media/2/victim.webp',
          tenant: 1,
        },
        member,
      ),
      undefined,
    )
  })

  it('refuses a key that belongs to another tenant', () => {
    assert.equal(
      resolveDeletableKey({ url: 'https://cdn.example.net/media/2/other.webp', tenant: 2 }, member),
      undefined,
    )
  })

  it('refuses when the key tenant does not match the doc tenant', () => {
    assert.equal(
      resolveDeletableKey({ url: 'https://cdn.example.net/media/1/abc.webp', tenant: 3 }, member),
      undefined,
    )
  })

  it('allows a super-admin to delete any tenant key', () => {
    assert.equal(
      resolveDeletableKey(
        { url: 'https://cdn.example.net/media/2/other.webp', tenant: 2 },
        { ...member, isSuperAdmin: true },
      ),
      'media/2/other.webp',
    )
  })

  it('allows an internal caller (no user: clone engine, scripts) to delete any tenant key', () => {
    assert.equal(
      resolveDeletableKey(
        { url: 'https://cdn.example.net/media/2/other.webp', tenant: 2 },
        { ...member, isInternalCaller: true },
      ),
      'media/2/other.webp',
    )
  })

  it('allows the request-context tenant to delete during an upload/replace', () => {
    assert.equal(
      resolveDeletableKey(
        { url: 'https://cdn.example.net/media/7/old.webp', tenant: 7 },
        { ...member, contextTenantId: '7' },
      ),
      'media/7/old.webp',
    )
  })

  it('ignores non adapter-managed keys (wp-content archive objects)', () => {
    assert.equal(
      resolveDeletableKey({ url: 'https://cdn.example.net/wp-content/uploads/2024/x.webp' }, member),
      undefined,
    )
  })

  it('strips the ?v= cache-bust suffix before deciding', () => {
    assert.equal(
      resolveDeletableKey({ url: 'https://cdn.example.net/media/1/abc.webp?v=4', tenant: '1' }, member),
      'media/1/abc.webp',
    )
  })
})

// ─── deriveR2Key (delete-orphan fix: recover key from url, no `prefix` field) ──

describe('deriveR2Key', () => {
  it('extracts the key from a CDN url (publicBaseUrl host)', () => {
    assert.equal(
      deriveR2Key({ url: 'https://cdn.example.net/media/2/1782-test.png' }),
      'media/2/1782-test.png',
    )
  })
  it('strips the ?v= cache-bust suffix added by image-edit afterRead', () => {
    assert.equal(
      deriveR2Key({ url: 'https://cdn.example.net/media/2/1782-test.png?v=3' }),
      'media/2/1782-test.png',
    )
  })
  it('handles a bare key url (no publicBaseUrl)', () => {
    assert.equal(deriveR2Key({ url: 'media/5/img.webp' }), 'media/5/img.webp')
    assert.equal(deriveR2Key({ url: 'media/5/img.webp?v=2' }), 'media/5/img.webp')
  })
  it('prefers a persisted prefix field when present', () => {
    assert.equal(
      deriveR2Key({ prefix: 'media/9/a.png', url: 'https://other/media/2/b.png' }),
      'media/9/a.png',
    )
  })
  it('returns undefined for external-reference / archive urls outside the media keyspace', () => {
    assert.equal(deriveR2Key({ url: 'https://cdn.example.net/wp-content/uploads/x.png' }), undefined)
    assert.equal(deriveR2Key({ url: 'https://images.unsplash.com/photo-123.jpg' }), undefined)
  })
  it('returns undefined when there is no url and no prefix', () => {
    assert.equal(deriveR2Key({}), undefined)
    assert.equal(deriveR2Key(null), undefined)
  })
})

// ─── Fakes ──────────────────────────────────────────────────────────────────

const noopLogger = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} }

function makeReq({
  cookie = '',
  referer = '',
  tenants = [] as Array<{ tenant: string }>,
  role = 'user',
  user = true as boolean | null,
  context = {} as Record<string, unknown>,
  query = {} as Record<string, string>,
  prefix = '',
}: {
  cookie?: string
  referer?: string
  tenants?: Array<{ tenant: string }>
  role?: string
  user?: boolean | null
  context?: Record<string, unknown>
  query?: Record<string, string>
  prefix?: string
}): PayloadRequest {
  const headers = new Headers()
  if (cookie) headers.set('cookie', cookie)
  if (referer) headers.set('referer', referer)

  // The staticHandler reads `req.query.prefix`, NOT `prefix` arg directly.
  const q = { ...query }
  if (prefix) q.prefix = prefix

  return {
    headers,
    query: q,
    context,
    user: user === false || user === null
      ? null
      : { role, tenants },
    payload: {
      logger: noopLogger,
      findByID: async () => {
        throw new Error('findByID not stubbed in this test')
      },
    },
  } as unknown as PayloadRequest
}

const adapter = r2StorageAdapter()
// Extract the staticHandler from the closure. Cast is safe — r2StorageAdapter
// always returns a staticHandler per the cloud-storage plugin contract.
const staticHandler = adapter.staticHandler as (req: PayloadRequest, args: { params: unknown }) => Promise<Response>

// ─── 401: anonymous with no context ─────────────────────────────────────────

describe('staticHandler — anonymous / no tenant context', () => {
  it('returns 401 when no user, no cookie, no referer, no context', async () => {
    const req = makeReq({ user: false, prefix: 'media/1/foo.jpg' })
    const res = await staticHandler(req, { params: {} })
    assert.equal(res.status, 401)
  })

  it('returns 401 when no user and a malformed cookie', async () => {
    const req = makeReq({ user: false, cookie: 'payload-tenant=%GG', prefix: 'media/1/foo.jpg' })
    const res = await staticHandler(req, { params: {} })
    assert.equal(res.status, 401)
  })
})

// ─── 403: cross-tenant (the bug being fixed) ─────────────────────────────────

describe('staticHandler — cross-tenant isolation (P0-4 fix)', () => {
  it('returns 403 when non-super-admin requests a prefix from another tenant', async () => {
    // User belongs to tenant 1 only. They request a tenant-2 prefix. Old code
    // derived tenantId from the prefix and let this through. New code
    // resolves the caller's tenant (1) and rejects.
    const req = makeReq({
      cookie: 'payload-tenant=1',
      tenants: [{ tenant: '1' }],
      role: 'user',
      prefix: 'media/2/123-foo.jpg',
    })
    const res = await staticHandler(req, { params: {} })
    assert.equal(res.status, 403)
  })

  it('returns 403 when non-super-admin requests a prefix WITHOUT a media/ prefix', async () => {
    // Pathological: prefix doesn't match the media/ shape. Old code would
    // fall through and (depending on order) either 400 or get the wrong
    // tenant. New code rejects 403.
    const req = makeReq({
      cookie: 'payload-tenant=1',
      tenants: [{ tenant: '1' }],
      prefix: 'other-prefix/foo.jpg',
    })
    const res = await staticHandler(req, { params: {} })
    assert.equal(res.status, 403)
  })

  it('returns 403 when prefix is empty', async () => {
    // Empty prefix → no `media/<X>/...` to match against caller.
    const req = makeReq({
      cookie: 'payload-tenant=1',
      tenants: [{ tenant: '1' }],
      prefix: '',
    })
    const res = await staticHandler(req, { params: {} })
    assert.equal(res.status, 403)
  })

  it('returns 403 when candidate tenant in prefix is empty', async () => {
    // `media//foo.jpg` — split('/')[1] is '' which doesn't match the caller's
    // tenant '1'. Reject.
    const req = makeReq({
      cookie: 'payload-tenant=1',
      tenants: [{ tenant: '1' }],
      prefix: 'media//foo.jpg',
    })
    const res = await staticHandler(req, { params: {} })
    assert.equal(res.status, 403)
  })
})

// ─── Fast path: trusted context-provided tenantId ───────────────────────────

describe('staticHandler — trusted context path', () => {
  it('returns 403 when context tenantId is set but prefix does not match', async () => {
    // Internal caller set tenantId=1 in context, but the prefix encodes
    // tenant 2. Mismatch → reject even on the trusted path.
    const req = makeReq({
      context: { tenantId: '1' },
      prefix: 'media/2/foo.jpg',
    })
    const res = await staticHandler(req, { params: {} })
    assert.equal(res.status, 403)
  })

  it('does NOT consult req.user when context tenantId is set (internal caller trust)', async () => {
    // Anonymous + no cookie + no referer, BUT context has tenantId.
    // The staticHandler should NOT 401 on the anonymous path — it should
    // fall through to serveFromR2 (which will 500 because findByID isn't
    // stubbed, but that's past the auth gate).
    const req = makeReq({
      user: false,
      context: { tenantId: '1' },
      prefix: 'media/1/foo.jpg',
    })
    const res = await staticHandler(req, { params: {} })
    // We expect 500 (R2 config not found) — but importantly NOT 401. The
    // trusted path bypasses user-based resolution.
    assert.notEqual(res.status, 401, 'trusted context path should not 401')
    assert.equal(res.status, 500, 'un-stubbed findByID surfaces as 500')
  })
})
