/**
 * POST /api/revalidate-frontend
 *
 * Proxy endpoint: triggers frontend cache revalidation.
 * Admin-only (requires logged-in Payload user).
 *
 * URL resolution: per-tenant Sites.domain (from the posted tenantId) →
 * https://{domain}/api/cms/revalidate, with http://localhost:3002 as a dev fallback.
 */
import type { Endpoint } from 'payload'

import { resolveRequestedTenantId, type TenantUser } from '../lib/admin-selected-tenant'

export const revalidateFrontendEndpoint: Endpoint = {
  method: 'post',
  path: '/revalidate-frontend',
  handler: async (req) => {
    const user = req.user as TenantUser | null
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let url: string | undefined

    // Resolve the frontend URL from the active tenant's configured domain.
    // SP0-R2 / RT-7: the posted tenantId is caller-supplied, so it is honoured
    // only for a super-admin or a member of that tenant; anything else falls back
    // to the caller's own validated tenant instead of letting them aim the
    // revalidate request at another tenant's frontend.
    try {
      const body = req.json ? (await req.json()) as { tenantId?: string } : {}
      const tenantId = resolveRequestedTenantId({
        requested: body?.tenantId,
        cookieHeader: req.headers?.get?.('cookie') ?? null,
        user,
      })
      if (tenantId) {
        const site = await req.payload.findByID({ collection: 'sites', id: tenantId, overrideAccess: true, depth: 0 })
        if (site?.domain) url = `https://${site.domain}/api/cms/revalidate`
      }
    } catch {
      // fall through
    }

    // Dev fallback applies only outside production. In production an unresolved
    // URL means no tenant was selected or the Site has no `domain` set — surface
    // a clear error instead of silently fetching an unreachable localhost.
    if (!url && process.env.NODE_ENV !== 'production') {
      url = 'http://localhost:3002/api/cms/revalidate'
    }
    if (!url) {
      return Response.json(
        {
          error:
            'Không xác định được domain frontend. Hãy chọn site (tenant) và đặt domain cho site trong Sites.',
        },
        { status: 400 },
      )
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manual: true }),
        signal: AbortSignal.timeout(8000),
      })

      if (!res.ok) {
        return Response.json({ error: `Frontend returned ${res.status}`, url }, { status: 502 })
      }

      const data = await res.json().catch(() => ({}))
      return Response.json({ ok: true, url, data })
    } catch (e) {
      return Response.json({ error: String(e), url }, { status: 502 })
    }
  },
}
