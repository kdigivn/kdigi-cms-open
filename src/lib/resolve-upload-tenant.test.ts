/**
 * Unit tests for resolve-upload-tenant.ts
 * Runner: node --import tsx --test
 *
 * Covers the security-critical paths:
 *   - zero-tenant user is denied (auth bypass regression)
 *   - cross-tenant throw for authenticated user
 *   - super-admin passes regardless of tenant membership
 *   - malformed cookie percent-encoding returns undefined, not 500
 *   - single-tenant fallback
 *   - resolveReadTenantId (read-side counterpart, no data branch, no throw)
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveUploadTenantId, resolveReadTenantId, toTenantRelationshipId } from './resolve-upload-tenant.js'
import type { PayloadRequest } from 'payload'

// ---------------------------------------------------------------------------
// Minimal stub factory — only the fields used by resolve-upload-tenant.ts
// ---------------------------------------------------------------------------
function makeReq({
  cookie = '',
  referer = '',
  tenants = [] as Array<{ tenant: string }>,
  role = 'user',
  user = true,
}: {
  cookie?: string
  referer?: string
  tenants?: Array<{ tenant: string }>
  role?: string
  user?: boolean | null
}): PayloadRequest {
  const headers = new Headers()
  if (cookie) headers.set('cookie', cookie)
  if (referer) headers.set('referer', referer)

  return {
    headers,
    user: user === false || user === null
      ? null
      : { role, tenants },
  } as unknown as PayloadRequest
}

// ---------------------------------------------------------------------------
// Fix #1: zero-tenant user must be denied (auth bypass was: allowed.length > 0 && ...)
// ---------------------------------------------------------------------------
test('zero-tenant user is denied when cookie names a tenant', () => {
  const req = makeReq({ cookie: 'payload-tenant=tenant-42', tenants: [] })
  assert.throws(
    () => resolveUploadTenantId(undefined, req),
    /Upload tenant tenant-42 is not in the current user's tenants/,
    'Should throw for zero-tenant user with cookie tenant'
  )
})

// ---------------------------------------------------------------------------
// Fix #1: cross-tenant throw for authenticated user with memberships
// ---------------------------------------------------------------------------
test('user with different tenant memberships is denied', () => {
  const req = makeReq({
    cookie: 'payload-tenant=tenant-evil',
    tenants: [{ tenant: 'tenant-123' }],
  })
  assert.throws(
    () => resolveUploadTenantId(undefined, req),
    /Upload tenant tenant-evil is not in the current user's tenants/
  )
})

// ---------------------------------------------------------------------------
// Fix #1: super-admin bypasses membership check regardless
// ---------------------------------------------------------------------------
test('super-admin can route to any tenant via cookie', () => {
  const req = makeReq({
    cookie: 'payload-tenant=any-tenant',
    tenants: [], // zero memberships
    role: 'super-admin',
  })
  const result = resolveUploadTenantId(undefined, req)
  assert.equal(result, 'any-tenant', 'Super-admin should pass with zero memberships')
})

test('super-admin with memberships can route outside their own tenants', () => {
  const req = makeReq({
    cookie: 'payload-tenant=other-tenant',
    tenants: [{ tenant: 'my-tenant' }],
    role: 'super-admin',
  })
  const result = resolveUploadTenantId(undefined, req)
  assert.equal(result, 'other-tenant')
})

// ---------------------------------------------------------------------------
// Fix #2: malformed cookie percent-encoding must not throw 500
// ---------------------------------------------------------------------------
test('malformed cookie percent-encoding returns undefined, not URIError', () => {
  // '%GG' is not valid percent-encoding
  const req = makeReq({ cookie: 'payload-tenant=%GG', tenants: [] })
  // Should not throw; resolves to undefined (no tenant in cookie, no fallback)
  const result = resolveUploadTenantId(undefined, req)
  assert.equal(result, undefined, 'Malformed cookie should yield undefined tenant')
})

test('malformed referer percent-encoding returns undefined', () => {
  const req = makeReq({ referer: '/admin/collections/sites/%GG', tenants: [] })
  const result = resolveUploadTenantId(undefined, req)
  assert.equal(result, undefined, 'Malformed referer should yield undefined tenant')
})

// ---------------------------------------------------------------------------
// Single-tenant fallback
// ---------------------------------------------------------------------------
test('single-tenant user gets their only tenant applied as fallback', () => {
  const req = makeReq({ tenants: [{ tenant: 'solo-tenant' }] })
  const result = resolveUploadTenantId(undefined, req)
  assert.equal(result, 'solo-tenant')
})

test('multi-tenant user with no cookie/referer/data gets undefined', () => {
  const req = makeReq({ tenants: [{ tenant: 'a' }, { tenant: 'b' }] })
  const result = resolveUploadTenantId(undefined, req)
  assert.equal(result, undefined)
})

// ---------------------------------------------------------------------------
// data.tenant (explicit, highest priority) — valid member passes
// ---------------------------------------------------------------------------
test('data.tenant is accepted when user is a member', () => {
  const req = makeReq({ tenants: [{ tenant: 'tenant-x' }] })
  const result = resolveUploadTenantId({ tenant: 'tenant-x' }, req)
  assert.equal(result, 'tenant-x')
})

// ---------------------------------------------------------------------------
// Unauthenticated / server context (no req.user) is trusted
// ---------------------------------------------------------------------------
test('unauthenticated request with cookie tenant passes without membership check', () => {
  const req = makeReq({ cookie: 'payload-tenant=server-tenant', user: false })
  const result = resolveUploadTenantId(undefined, req)
  assert.equal(result, 'server-tenant')
})

// ---------------------------------------------------------------------------
// resolveReadTenantId — read-side counterpart of resolveUploadTenantId
// Used by the staticHandler to plug the prefix-tenant-vs-caller-tenant
// tautology. Does NOT throw on auth (caller decides), does NOT consult data.
// ---------------------------------------------------------------------------

test('resolveReadTenantId: returns cookie tenant when present', () => {
  const req = makeReq({ cookie: 'payload-tenant=tenant-7', tenants: [{ tenant: 'tenant-7' }] })
  assert.equal(resolveReadTenantId(req), 'tenant-7')
})

test('resolveReadTenantId: returns referer tenant when no cookie', () => {
  const req = makeReq({
    referer: '/admin/collections/sites/tenant-99/edit',
    tenants: [{ tenant: 'tenant-99' }],
  })
  assert.equal(resolveReadTenantId(req), 'tenant-99')
})

test('resolveReadTenantId: single-tenant user gets their only tenant as fallback', () => {
  const req = makeReq({ tenants: [{ tenant: 'solo-tenant' }] })
  assert.equal(resolveReadTenantId(req), 'solo-tenant')
})

test('resolveReadTenantId: multi-tenant user with no cookie/referer returns undefined', () => {
  // No cookie, no referer, more than one membership — caller cannot be
  // disambiguated without explicit input, so the staticHandler will 401.
  const req = makeReq({ tenants: [{ tenant: 'a' }, { tenant: 'b' }] })
  assert.equal(resolveReadTenantId(req), undefined)
})

test('resolveReadTenantId: anonymous request (no user) with cookie still resolves', () => {
  // Server-internal callers (no req.user) are trusted and can drive the
  // staticHandler from a cookie. This matches the upload resolver's behavior
  // for the same case.
  const req = makeReq({ cookie: 'payload-tenant=server-tenant', user: false })
  assert.equal(resolveReadTenantId(req), 'server-tenant')
})

test('resolveReadTenantId: malformed cookie returns undefined, not URIError', () => {
  const req = makeReq({ cookie: 'payload-tenant=%GG' })
  assert.equal(resolveReadTenantId(req), undefined)
})

test('resolveReadTenantId: cookie takes priority over single-tenant fallback', () => {
  // A user with two tenants but a cookie selecting one — cookie wins.
  const req = makeReq({
    cookie: 'payload-tenant=tenant-A',
    tenants: [{ tenant: 'tenant-A' }, { tenant: 'tenant-B' }],
  })
  assert.equal(resolveReadTenantId(req), 'tenant-A')
})

test('resolveReadTenantId: never throws (no authorization check)', () => {
  // Critical: a user whose memberships do NOT include the cookie's tenant
  // must NOT throw here — the staticHandler needs to compare the resolved
  // tenant against the prefix's tenant and return 403 itself.
  const req = makeReq({
    cookie: 'payload-tenant=other-tenant',
    tenants: [{ tenant: 'my-tenant' }],
  })
  // No throw — returns the cookie value.
  assert.doesNotThrow(() => resolveReadTenantId(req))
  assert.equal(resolveReadTenantId(req), 'other-tenant')
})

// ---------------------------------------------------------------------------
// toTenantRelationshipId — payload.create relationship values must be numeric
// for serial-id collections (sites). Regression: the resolved string id was
// passed straight through, so /api/media/from-url and /api/media/fetch-from-r2
// failed with "This relationship field has the following invalid relationships".
// ---------------------------------------------------------------------------
test('toTenantRelationshipId: converts a numeric string id to a number', () => {
  assert.equal(toTenantRelationshipId('3'), 3)
  assert.equal(typeof toTenantRelationshipId('3'), 'number')
})

test('toTenantRelationshipId: rejects empty, zero, negative and fractional ids', () => {
  assert.equal(toTenantRelationshipId(''), undefined)
  assert.equal(toTenantRelationshipId('0'), undefined)
  assert.equal(toTenantRelationshipId('-1'), undefined)
  assert.equal(toTenantRelationshipId('1.5'), undefined)
})

test('toTenantRelationshipId: rejects a non-numeric or missing id', () => {
  assert.equal(toTenantRelationshipId('abc'), undefined)
  assert.equal(toTenantRelationshipId('tenant-42'), undefined)
  assert.equal(toTenantRelationshipId(undefined), undefined)
})
