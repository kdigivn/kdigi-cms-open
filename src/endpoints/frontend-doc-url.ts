/**
 * GET /api/frontend-doc-url?collection=&slug=&tenantId=
 *
 * Resolves the public frontend URL for a CMS document so the admin can
 * offer a "View on site" link. Admin-only (requires logged-in Payload user).
 *
 * Base URL resolution: FRONTEND_BASE_URL env → per-tenant Sites.domain →
 * http://localhost:3002 (dev fallback). The path comes from `publicPathFor`
 * (`src/lib/frontend-public-path.ts`), the single copy of frontend's routes.
 */
import type { Endpoint } from 'payload'

import { publicPathFor } from '../lib/frontend-public-path'

export const frontendDocUrlEndpoint: Endpoint = {
  method: 'get',
  path: '/frontend-doc-url',
  handler: async (req) => {
    if (!req.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const params = req.searchParams
    const collection = params?.get('collection') ?? ''
    const slug = params?.get('slug') ?? ''
    const tenantId = params?.get('tenantId') ?? ''

    const path = publicPathFor(collection, slug)
    if (!path) {
      return Response.json({ error: 'Missing or invalid collection/slug' }, { status: 400 })
    }

    // Resolve the site base URL
    let base = process.env.FRONTEND_BASE_URL
    if (!base && tenantId) {
      try {
        const site = await req.payload.findByID({
          collection: 'sites',
          id: tenantId,
          overrideAccess: true,
          depth: 0,
        })
        if (site?.domain) base = `https://${site.domain}`
      } catch {
        // fall through to dev fallback
      }
    }
    if (!base) base = 'http://localhost:3002'

    const url = `${base.replace(/\/$/, '')}${path}`
    return Response.json({ url })
  },
}
