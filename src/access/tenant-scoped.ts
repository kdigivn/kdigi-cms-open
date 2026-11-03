import type { Access } from 'payload'

import { isSuperAdminUser, userTenantIds, type TenantUser } from '../lib/admin-selected-tenant'
import { isApiKeySession } from '../lib/api-key-session'

/**
 * Tenant-scoped read access: super-admin sees all; all other roles see only their tenant(s).
 *
 * Enforces tenant isolation at the access predicate level — not just via baseListFilter.
 * The plugin-multi-tenant injects a `tenant` relationship field on every content collection.
 * Each User document has a `tenants[]` array (plugin default field name) containing objects
 * with a `tenant` relationship to their assigned Sites document.
 *
 * Advisory baseListFilter (from plugin) scopes the admin UI; this predicate secures the API.
 * Applies to all roles: admin, editor, author (super-admin bypasses entirely).
 */
export const tenantScopedRead: Access = ({ req: { user } }) => {
  if (!user) return false
  if (isSuperAdminUser(user as TenantUser)) return true
  const tenantIds = userTenantIds(user as TenantUser)
  if (!tenantIds.length) return false
  return { tenant: { in: tenantIds } }
}

/**
 * Version history read access (SP1a-1): versions are full document snapshots (SEO/internal
 * fields included), so they follow the same tenant boundary as the documents — through the
 * snapshot's `version.tenant`. Anonymous callers get nothing; there is no public history.
 * The multi-tenant plugin adds its own filter too; this predicate is the repo's real boundary.
 */
export const tenantScopedVersionsRead: Access = ({ req: { user } }) => {
  if (!user) return false
  if (isSuperAdminUser(user as TenantUser)) return true
  const tenantIds = userTenantIds(user as TenantUser)
  if (!tenantIds.length) return false
  return { 'version.tenant': { in: tenantIds } }
}

/**
 * Tenant-scoped write access: super-admin can write all; all other authenticated roles
 * write only within their assigned tenant(s). Author ownership enforcement is layered
 * on top via collection-level beforeChange hooks (not here).
 */
export const tenantScopedWrite: Access = ({ req: { user } }) => {
  if (!user) return false
  if (isSuperAdminUser(user as TenantUser)) return true
  const tenantIds = userTenantIds(user as TenantUser)
  if (!tenantIds.length) return false
  return { tenant: { in: tenantIds } }
}

/**
 * Delete access for tenant data without a trash (media, taxonomies, menus, …): `tenantScopedWrite`,
 * but never from an API-key session — the delete is irreversible (media also loses its file), and
 * a leaked key must not be able to wipe a site.
 */
export const tenantScopedDelete: Access = (args) => (isApiKeySession(args.req.user) ? false : tenantScopedWrite(args))

/**
 * Create access for collections whose rows must belong to a tenant (e.g. `media`,
 * whose tenant is assigned by a beforeChange hook rather than by the caller).
 *
 * A `Where` on a document that does not exist yet cannot express "the row this
 * request will create", so this is a boolean gate: super-admins, or any user who
 * belongs to at least one tenant. A user with zero memberships cannot create —
 * the tenant field would be unresolvable, and their row would be orphaned.
 *
 * Tenant *assignment* stays enforced elsewhere: the collection's beforeChange hook
 * writes the resolved tenant (numeric, validated) and the field-level update rule
 * keeps later reassignment to super-admins.
 */
export const hasAnyTenantOrSuperAdmin: Access = ({ req: { user } }) => {
  if (!user) return false
  if (isSuperAdminUser(user as TenantUser)) return true
  return userTenantIds(user as TenantUser).length > 0
}
