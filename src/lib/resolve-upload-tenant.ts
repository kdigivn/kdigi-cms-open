/**
 * Resolves the tenant a media upload belongs to, so the R2 storage adapter can
 * pick the right per-tenant bucket. Media has NO tenant column (shared library) —
 * the tenant is a transient routing signal, resolved here in priority order:
 *
 *   1. `data.tenant` — explicit transient field. Used by importers/scripts,
 *      which pass the target tenant directly to payload.create({ data: { tenant } }).
 *   2. `payload-tenant` cookie — the tenant selected in the admin UI (multi-tenant
 *      plugin). This is how interactive admin uploads convey the current tenant,
 *      since the Media form has no tenant field.
 *   3. Single-tenant fallback — if the user belongs to exactly one tenant, use it.
 *
 * The resolved tenant is then validated against the user's tenant memberships
 * (super-admins are exempt) so a caller cannot route an upload into a bucket that
 * belongs to a tenant they have no access to.
 */
import type { PayloadRequest } from 'payload'

/** Default cookie name used by @payloadcms/plugin-multi-tenant for the selected tenant. */
const TENANT_COOKIE = 'payload-tenant'

/** Normalize a relationship value (id | { id } | number) to a string id, or undefined. */
function toId(value: unknown): string | undefined {
  if (value == null) return undefined
  if (typeof value === 'string') return value || undefined
  if (typeof value === 'number') return String(value)
  if (typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
    const inner = (value as { id: unknown }).id
    return inner == null ? undefined : String(inner)
  }
  return undefined
}

/** Read the selected-tenant id from the request's cookie header. */
function tenantFromCookie(req: PayloadRequest): string | undefined {
  const cookie = req.headers?.get?.('cookie') ?? ''
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${TENANT_COOKIE}=([^;]+)`))
  if (!match) return undefined
  try {
    return decodeURIComponent(match[1]) || undefined
  } catch {
    // Malformed percent-encoding in cookie value — treat as absent.
    return undefined
  }
}

/**
 * Infer the tenant from the request's referer when the upload originates from a
 * Sites document edit page (e.g. uploading a logo from `/admin/collections/sites/2`).
 * `sites` is the tenant collection, so the doc id IS the tenant id. This makes media
 * uploads work in the common "edit a site → upload an image" flow even when no
 * tenant has been explicitly selected via the multi-tenant cookie.
 */
function tenantFromSitesReferer(req: PayloadRequest): string | undefined {
  const referer = req.headers?.get?.('referer') ?? ''
  const match = referer.match(/\/admin\/collections\/sites\/([^/?#]+)/)
  const id = match?.[1]
  // Ignore the create route (`.../sites/create`) — there is no tenant id yet.
  if (!id || id === 'create') return undefined
  try {
    return decodeURIComponent(id) || undefined
  } catch {
    // Malformed percent-encoding in referer path — treat as absent.
    return undefined
  }
}

/** Tenant ids the current user is a member of (as strings). */
function userTenantIds(req: PayloadRequest): string[] {
  const tenants = (req.user as unknown as { tenants?: Array<{ tenant?: unknown }> })?.tenants ?? []
  return tenants.map((t) => toId(t?.tenant)).filter((v): v is string => Boolean(v))
}

function isSuperAdmin(req: PayloadRequest): boolean {
  return (req.user as unknown as { role?: string })?.role === 'super-admin'
}

/**
 * Convert a resolved tenant id into the value Payload's relationship validator
 * accepts for a serial-id collection (`sites` has integer ids).
 *
 * Payload's `isValidID` only accepts `typeof value === 'number'` when the target
 * collection's id type is `number` (`payload/dist/utilities/isValidID.js`, used by
 * the relationship/upload validators). `resolveUploadTenantId` returns STRINGS
 * (cookie/referer/data ids), so feeding that value straight into
 * `payload.create({ data: { tenant } })` fails with
 * "This relationship field has the following invalid relationships: 3 0" —
 * the bug that broke `POST /api/media/from-url` and `/api/media/fetch-from-r2`.
 *
 * Returns `undefined` for empty, non-numeric, zero or negative input so callers
 * reject the request instead of writing a bogus "tenant 0". Sites ids are a
 * 1-indexed Postgres serial.
 */
export function toTenantRelationshipId(tenantId: string | undefined): number | undefined {
  if (!tenantId) return undefined
  const n = Number(tenantId)
  return Number.isInteger(n) && n > 0 ? n : undefined
}

/**
 * Resolve the tenant id for a media upload. Returns a string id or undefined when
 * no tenant can be determined. Throws when a concrete tenant is resolved but the
 * authenticated non-super-admin user is not a member of it.
 */
export function resolveUploadTenantId(
  data: Record<string, unknown> | undefined,
  req: PayloadRequest,
): string | undefined {
  const resolved = toId(data?.['tenant']) ?? tenantFromCookie(req) ?? tenantFromSitesReferer(req) ?? undefined

  // Cache once — used for both the single-tenant fallback and the auth check below.
  const allowed = userTenantIds(req)

  const fallback = !resolved && allowed.length === 1 ? allowed[0] : undefined
  const tenantId = resolved ?? fallback
  if (!tenantId) return undefined

  // Authorization: an authenticated, non-super-admin user may only route uploads
  // into a tenant they belong to. Unauthenticated/server contexts (no req.user,
  // e.g. an importer running with overrideAccess) are trusted.
  // Note: the `allowed.length > 0` guard is intentionally absent — a user with
  // zero tenant memberships must NOT be allowed to upload into any tenant.
  if (req.user && !isSuperAdmin(req)) {
    if (!allowed.includes(tenantId)) {
      throw new Error(`[media] Upload tenant ${tenantId} is not in the current user's tenants`)
    }
  }

  return tenantId
}

/**
 * Resolve the tenant id for a media READ (the staticHandler path). This is the
 * read-side counterpart of `resolveUploadTenantId` and differs in two ways:
 *
 *   1. There is no `data` argument — reads are GETs with no payload body.
 *   2. It never throws on authorization. The caller's tenant membership is
 *      enforced by the caller (the staticHandler) by comparing the resolved
 *      tenant against the tenant encoded in the requested object key. We
 *      return the caller's tenant; the caller decides whether the request
 *      is allowed.
 *
 * Used by `r2-storage-adapter.ts` `staticHandler` to plug a pre-existing
 * security gap: the previous code derived the tenant id from the *client-
 * supplied prefix itself* (`prefix.split('/')[1]`) and then validated the
 * prefix with `prefix.startsWith("media/" + <derived> + "/")` — a tautology
 * true for any `media/<X>/...` prefix. A non-super-admin user in tenant A
 * could therefore read tenant B's objects by passing B's prefix. Fix:
 * resolve the caller's actual tenant here, then compare.
 */
export function resolveReadTenantId(req: PayloadRequest): string | undefined {
  // Same priority order as the upload resolver, minus the data-tenant branch.
  const resolved = tenantFromCookie(req) ?? tenantFromSitesReferer(req) ?? undefined

  // Same single-tenant fallback — a user with exactly one tenant membership
  // is unambiguous.
  const allowed = userTenantIds(req)
  const fallback = !resolved && allowed.length === 1 ? allowed[0] : undefined

  return resolved ?? fallback
}
