/**
 * Tenant identity helpers shared by the access predicates, the admin dashboard
 * widgets and the endpoint tenant resolvers.
 *
 * Why this module exists: before SP0-R2 the `payload-tenant` cookie was trusted
 * on its own in several places (dashboard widget, SEO audit widget, endpoint
 * resolvers), so a user could point queries at a tenant they do not belong to by
 * forging one cookie. Everything that turns "the tenant the admin selected" into
 * a query scope now goes through `getValidatedAdminTenantId` / `resolveRequestedTenantId`,
 * whose shared invariant is:
 *
 *   the returned tenant id is either the selected one (only when the caller may
 *   use it) or one the caller belongs to — never a tenant the caller cannot access.
 *
 * Super-admins are exempt by design: they own every tenant (`userHasAccessToAllTenants`
 * in payload.config.ts), so their selection is honoured as-is.
 */

/** User shape injected by `@payloadcms/plugin-multi-tenant` (plus the `role` field). */
export interface TenantUser {
  id?: string | number
  role?: string
  tenants?: Array<{ tenant?: string | number | { id?: string | number } | null }>
}

/** True when the user has cross-tenant access (mirrors `userHasAccessToAllTenants`). */
export function isSuperAdminUser(user: TenantUser | null | undefined): boolean {
  return user?.role === 'super-admin'
}

/**
 * Tenant ids the user is a member of, normalized to strings.
 * Handles the plugin's three shapes: bare id, numeric id, and `{ id }` object.
 */
export function userTenantIds(user: TenantUser | null | undefined): string[] {
  const tenants = user?.tenants
  if (!tenants?.length) return []
  const ids: string[] = []
  for (const entry of tenants) {
    const ref = entry?.tenant
    if (ref === null || ref === undefined) continue
    const id = typeof ref === 'object' ? ref.id : ref
    if (id === null || id === undefined || id === '') continue
    ids.push(String(id))
  }
  return ids
}

/**
 * Parse the `payload-tenant` cookie value.
 * The plugin stores the value as a JSON-encoded object `{id, value}` OR a plain string.
 * Malformed percent-encoding resolves to undefined instead of throwing.
 */
export function resolveCookieTenantId(cookieHeader: string | null | undefined): string | undefined {
  if (!cookieHeader) return undefined
  const match = cookieHeader.match(/(?:^|;\s*)payload-tenant=([^;]+)/)
  if (!match) return undefined
  let raw: string
  try {
    raw = decodeURIComponent(match[1])
  } catch {
    return undefined
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null) {
      const candidate = (parsed as { id?: unknown; value?: unknown }).id ?? (parsed as { value?: unknown }).value
      return candidate === null || candidate === undefined ? undefined : String(candidate)
    }
    const str = String(parsed).trim()
    return str || undefined
  } catch {
    return raw.trim() || undefined
  }
}

/**
 * The tenant the admin has selected, validated against the caller's access.
 *
 * - `payload-tenant` cookie when the user is a super-admin or a member of it.
 * - Otherwise the user's first tenant membership, so a stale/forged cookie can never
 *   silently widen or redirect scope, and a single-tenant user keeps working.
 * - `undefined` when neither resolves (callers treat that as "no scope" → 400 / empty).
 */
export function getValidatedAdminTenantId(args: {
  cookieHeader?: string | null
  user: TenantUser | null | undefined
}): string | undefined {
  const { cookieHeader, user } = args
  if (!user) return undefined

  const cookieTenant = resolveCookieTenantId(cookieHeader)
  if (cookieTenant && (isSuperAdminUser(user) || userTenantIds(user).includes(cookieTenant))) {
    return cookieTenant
  }

  return userTenantIds(user)[0]
}

/**
 * Resolve a caller-supplied tenant id (query param or request body) against the
 * caller's access. Only honoured when the caller is a super-admin or a member of
 * that tenant; anything else falls back to the validated admin-selected tenant.
 *
 * B2: regular users cannot widen scope by passing `?tenantId=` or a body field.
 */
export function resolveRequestedTenantId(args: {
  requested?: string | null
  cookieHeader?: string | null
  user: TenantUser | null | undefined
}): string | undefined {
  const { requested, cookieHeader, user } = args
  const trimmed = requested?.trim()
  if (trimmed && (isSuperAdminUser(user) || userTenantIds(user).includes(trimmed))) {
    return trimmed
  }
  return getValidatedAdminTenantId({ cookieHeader, user })
}
