/**
 * GET /api/seo/audit
 *
 * Returns deficient docs (missing title/desc, noindex, broken canonical,
 * or score < SEO_DEFICIENT_THRESHOLD) across posts, pages, products, and
 * landings — always tenant-scoped and bounded (top MAX_DOCS per collection).
 *
 * Tenant resolution order (SP0-R2 / RT-7):
 *   1. `?tenantId=` query param — honoured only for a super-admin or a member of that tenant
 *   2. `payload-tenant` cookie — honoured only for a super-admin or a member of that tenant
 *   3. First entry in req.user.tenants[]
 *   → If none resolves → 400 (never run an unscoped query, B3 fix)
 *
 * Query params:
 *   tenantId?  super-admin only: audit a specific tenant
 *   limit?     docs per collection to inspect (default 50, max 200)
 *
 * Response 200:
 *   {
 *     tenantId: string,
 *     total: number,
 *     deficient: Array<{
 *       id: string, collection: string, title: string,
 *       score: number, reasons: string[], adminUrl: string
 *     }>
 *   }
 *
 * Error responses:
 *   400 — no tenant could be resolved (user has no tenant assignment)
 *   401 — not authenticated
 *   500 — unexpected query error
 */
import type { Endpoint } from 'payload'
import { resolveTenantId } from '../lib/resolve-tenant-from-request'
import type { TenantUser } from '../lib/admin-selected-tenant'
import { runSeoAudit, MAX_DOCS_PER_COLLECTION } from '../lib/seo-audit-core'

export const seoAuditEndpoint: Endpoint = {
  method: 'get',
  path: '/seo/audit',
  handler: async (req) => {
    // 1. Auth guard
    const user = req.user as TenantUser | null
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
      const url = new URL(req.url ?? '', 'http://localhost')
      const queryTenantId = url.searchParams.get('tenantId')
      const cookieHeader = req.headers?.get?.('cookie') ?? null

      // 2. Resolve tenant — B2: query param only for super-admin; B3: always concrete
      const tenantId = resolveTenantId(user, cookieHeader, queryTenantId)
      if (!tenantId) {
        return Response.json(
          { error: 'No tenant resolved. Assign this user to a tenant or supply tenantId (super-admin only).' },
          { status: 400 },
        )
      }

      // 3. Parse limit (bounded)
      const limitParam = parseInt(url.searchParams.get('limit') ?? '50', 10)
      const limit = Math.min(Math.max(limitParam, 1), MAX_DOCS_PER_COLLECTION)

      // 4. Run the shared in-process audit (also used by the dashboard widget).
      const { total, deficient } = await runSeoAudit(req.payload, tenantId, limit)

      return Response.json({ tenantId, total, deficient }, { status: 200 })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return Response.json({ error: `Audit query failed: ${message}` }, { status: 500 })
    }
  },
}
