import type { Access, Where } from 'payload'

import { canManageContent, canPermanentlyDelete, isAuthorRole } from './role-matrix'
import { tenantScopedWrite } from './tenant-scoped'

/**
 * Delete access for trash-enabled content collections (SP1a-2).
 *
 * Payload calls `delete` access for BOTH a trash (an update whose `data.deletedAt` is set — the
 * access receives that data) and a permanent delete (no data). So one function decides:
 *   - moving to the trash: anyone who manages content, authors only their own documents;
 *   - permanent delete (incl. emptying the trash): admins only (`canPermanentlyDelete`);
 *   - always AND-ed with the explicit tenant predicate [RT-13] — the multi-tenant plugin's
 *     filter is advisory, `tenantScopedWrite` is the boundary.
 *
 * `createdBy` exists only on posts/pages/products/landings; faqs/shortcodes have none, so the
 * author ownership clause is added only where the field exists (querying a missing field
 * would throw instead of denying).
 */
export function makeContentDeleteAccess({ hasCreatedBy }: { hasCreatedBy: boolean }): Access {
  return (args) => {
    const { user } = args.req
    if (!user || !canManageContent(user)) return false

    const deletedAt = (args.data as { deletedAt?: unknown } | undefined)?.deletedAt
    const permanent = deletedAt === undefined || deletedAt === null
    if (permanent && !canPermanentlyDelete(user)) return false

    const tenant = tenantScopedWrite(args)
    if (tenant === false) return false

    const conditions: Where[] = []
    if (tenant !== true) conditions.push(tenant as Where)
    if (hasCreatedBy && isAuthorRole(user)) conditions.push({ createdBy: { equals: user.id } })

    if (conditions.length === 0) return true
    return conditions.length === 1 ? conditions[0] : { and: conditions }
  }
}
