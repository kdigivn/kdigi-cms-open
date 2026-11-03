/**
 * Tenant resolution helpers for Payload endpoint handlers.
 *
 * Resolution order (applied by `resolveTenantId`):
 *   1. Query-param `tenantId` — honoured only when the caller may use it: a super-admin,
 *      or a user who is a member of that tenant (B2 / SP0-R2).
 *   2. `payload-tenant` cookie — honoured only for a super-admin or a member of that
 *      tenant; a forged/stale cookie falls back to the user's own membership (RT-7).
 *   3. First tenant from `req.user.tenants[]`.
 *
 * If none of these resolve to a non-empty string, returns undefined so the caller can
 * respond with 400 / reject the request (never run unscoped, B3 fix).
 *
 * The membership rules themselves live in `src/lib/admin-selected-tenant.ts` so the
 * access predicates, the dashboard widgets and these resolvers cannot drift apart.
 */
import {
  resolveRequestedTenantId,
  userTenantIds,
  type TenantUser,
} from './admin-selected-tenant'

/** First tenant id assigned to the user (plugin-injected `tenants[]`), or undefined. */
export function resolveTenantFromUser(user: TenantUser): string | undefined {
  return userTenantIds(user)[0]
}

/**
 * Resolve a concrete tenantId for an endpoint request.
 *
 * @param user          Authenticated user from req.user
 * @param cookieHeader  Value of the `cookie` request header
 * @param queryTenantId Value of the `tenantId` query param (super-admin or member tenants only)
 * @returns tenantId string, or undefined when no tenant can be resolved
 */
export function resolveTenantId(
  user: TenantUser,
  cookieHeader: string | null | undefined,
  queryTenantId?: string | null,
): string | undefined {
  return resolveRequestedTenantId({ requested: queryTenantId, cookieHeader, user })
}
