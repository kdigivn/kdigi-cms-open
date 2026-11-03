/**
 * Phase 7 — Paste URL → Import to R2 endpoint.
 *
 * Mounted at POST /api/media/from-url.
 *
 * Locked product decision (revised by Validation Session 1): server
 * fetches the URL, downloads bytes to the configured storage (R2 or local disk), and ALSO sets `externalUrl`
 * to the pasted URL. The bytes are stored (so the record survives
 * source rot); `externalUrl` is retained to serve the canonical URL
 * via the afterRead hook.
 *
 * Fileless external references
 * are not creatable in Payload's upload collections (they require file
 * bytes), so the upload path + the externalUrl field are both used.
 *
 * SSRF mitigation (red-team P0-3) lives in `src/lib/import-media-from-url.ts`
 * (shared with the agent op `import_media_from_url`):
 *   - http(s) only (no file://, gopher://, data:, etc.)
 *   - Length cap (≤ 500 chars to match externalUrl maxLength)
 *   - Hostname safety: dns.lookup + IP range block-list (private,
 *     loopback, link-local, CGN, multicast, reserved). Both IPv4
 *     and IPv6. Implemented in src/lib/ssrf-guard.ts.
 *   - The connection is pinned to the vetted IP (`src/lib/pinned-fetch.ts`),
 *     so DNS rebinding between check and connect is not possible.
 *   - Redirects: manual; every Location is validated + pinned the same way.
 *   - Timeout (~15s) and a 25 MB body cap.
 *
 * Threat model: a logged-in admin pasting http://169.254.169.254/
 * (cloud metadata), http://10.0.0.5/admin (internal admin panel), or a
 * URL that 30x-redirects to such an address. Without the guard, the
 * backend's private network is exposed.
 */
import type { Endpoint, PayloadRequest } from 'payload'
import { importMediaFromUrl, MediaImportError } from '../lib/import-media-from-url'
import { resolveUploadTenantId, toTenantRelationshipId } from '../lib/resolve-upload-tenant'
import { isApiKeySession } from '../lib/api-key-session'

export const createMediaFromUrlEndpoint: Endpoint = {
  method: 'post',
  path: '/from-url',
  handler: async (req) => {
    if (!req.user) {
      return Response.json({ error: 'Authentication required' }, { status: 401 })
    }

    let body: { url?: unknown; alt?: unknown; folder?: unknown; tenant?: unknown }
    try {
      body = ((await req.json?.()) ?? {}) as typeof body
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    // Resolve tenant so the storage adapter can find the bucket. `body.tenant`
    // (Phase 8 / F10 — the editor's media modal sends the DOCUMENT's tenant,
    // not the admin tenant-switcher cookie) is `resolveUploadTenantId`'s
    // highest-priority signal; the cookie is only a fallback when it's absent.
    // A non-super-admin who is not a member of the claimed tenant is rejected
    // by that same resolver regardless of source — see
    // src/lib/resolve-upload-tenant.test.ts's "data.tenant" coverage.
    let tenantId: string | undefined
    try {
      tenantId = resolveUploadTenantId(
        { tenant: body.tenant },
        req as unknown as PayloadRequest,
      )
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : 'Tenant resolution failed' },
        { status: 403 },
      )
    }
    if (!tenantId) {
      return Response.json({ error: 'Tenant context missing' }, { status: 400 })
    }

    // Payload's relationship validator needs a NUMBER for `sites` (serial ids);
    // `tenantId` is a string. Feeding the string through made every call fail
    // validation ("invalid relationships: 3 0") — see toTenantRelationshipId.
    const tenant = toTenantRelationshipId(tenantId)
    if (!tenant) {
      return Response.json({ error: 'Tenant không hợp lệ' }, { status: 400 })
    }

    const alt = typeof body.alt === 'string' && body.alt.trim() ? body.alt.trim() : undefined
    // API-key sessions (scripts, agents) get the agent path's rules: collection access applies and
    // only raster images are accepted. Admin browser sessions keep the original behavior.
    const mode = isApiKeySession(req.user) ? 'user' : 'system'
    try {
      // folder is a Payload folder id; it may be null (root) or a numeric/string id.
      const doc = await importMediaFromUrl(req, { url: body.url, alt, folder: body.folder, tenant, tenantId }, mode)
      return Response.json({ ok: true, id: doc.id, url: doc.url, alt: doc.alt, filename: doc.filename }, { status: 201 })
    } catch (err) {
      if (!(err instanceof MediaImportError)) throw err
      return Response.json(
        { error: err.message, ...(err.detail ? { detail: err.detail } : {}) },
        { status: err.status },
      )
    }
  },
}
