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
 * SSRF mitigation (red-team P0-3):
 *   - http(s) only (no file://, gopher://, data:, etc.)
 *   - Length cap (≤ 500 chars to match externalUrl maxLength)
 *   - Hostname safety: dns.lookup + IP range block-list (private,
 *     loopback, link-local, CGN, multicast, reserved). Both IPv4
 *     and IPv6. Implemented in src/lib/ssrf-guard.ts.
 *   - Redirects: redirect: 'manual' so we never blindly follow. The
 *     Location header is validated via the same SSRF guard.
 *   - AbortController timeout (~15s) so a slow/malicious server can't
 *     hang the request.
 *
 * Threat model: a logged-in admin pasting http://169.254.169.254/
 * (cloud metadata), http://10.0.0.5/admin (internal admin panel), or a
 * URL that 30x-redirects to such an address. Without the guard, the
 * backend's private network is exposed.
 */
import type { Endpoint, PayloadRequest } from 'payload'
import { resolveUploadTenantId, toTenantRelationshipId } from '../lib/resolve-upload-tenant'
import { validateUrl, FETCH_TIMEOUT_MS, MAX_BODY_BYTES, readBodyCapped } from './create-media-from-url-helpers'
import { assertUrlSafe, SsrfBlockedError } from '../lib/ssrf-guard'

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

    let url: string
    try {
      url = validateUrl(body.url)
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : 'Invalid url' },
        { status: 400 },
      )
    }

    const alt = typeof body.alt === 'string' && body.alt.trim() ? body.alt.trim() : undefined
    // folder is a Payload folder id; it may be null (root) or a numeric/string id.
    const folder = body.folder ?? null

    // SSRF guard: parse + DNS-resolve + IP block-list before fetching.
    // This rejects loopback / private / link-local / metadata addresses
    // both at the initial URL and at every redirect (P0-3).
    let safeUrl: string
    try {
      const safe = await assertUrlSafe(url)
      safeUrl = safe.url
    } catch (err) {
      if (err instanceof SsrfBlockedError) {
        return Response.json({ error: err.message }, { status: 422 })
      }
      return Response.json(
        { error: err instanceof Error ? err.message : 'URL không hợp lệ' },
        { status: 400 },
      )
    }

    // Fetch with manual redirect handling. We refuse to follow any
    // redirect whose Location points to a private/loopback address —
    // without this, a public URL that 30x's to http://10.0.0.5/admin
    // would still leak. We allow up to 3 hops (typical max for legit
    // shorteners/CDNs).
    const MAX_REDIRECTS = 3
    let currentUrl = safeUrl
    let resp: Response | null = null
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      try {
        // Residual risk (accepted): Node's global fetch re-resolves the hostname
        // at connect time, so a hostile DNS record with TTL 0 could rebind to a
        // private IP between assertUrlSafe() and this fetch(). Pinning the vetted
        // IP needs an undici dispatcher (not a direct dependency here), so we
        // accept the narrow window — exploiting it requires admin access plus
        // attacker-controlled DNS with precise timing, and the validation-time
        // block already rejects private targets on both the initial URL and
        // every redirect hop.
        resp = await fetch(currentUrl, {
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          headers: { 'User-Agent': 'kdigi-cms/1.0 (+paste-url)' },
          redirect: 'manual',
        })
      } catch (err) {
        return Response.json(
          { error: `Không tải được URL: ${err instanceof Error ? err.message : String(err)}` },
          { status: 422 },
        )
      }
      // Manual redirect: status 301/302/303/307/308 with a Location
      // header. Follow only if the Location passes the SSRF guard.
      if (resp.status >= 300 && resp.status < 400) {
        const location = resp.headers.get('location')
        if (!location) {
          // Redirect with no Location — refuse rather than guess.
          return Response.json({ error: 'Redirect thiếu Location header' }, { status: 422 })
        }
        if (hop === MAX_REDIRECTS) {
          return Response.json({ error: 'Quá nhiều redirects' }, { status: 422 })
        }
        // Re-validate the redirect target. We do NOT reuse the validated
        // set from the initial URL — DNS rebinding could have the
        // redirect hostname resolve to a different IP set.
        try {
          const safe = await assertUrlSafe(location)
          currentUrl = safe.url
        } catch (err) {
          if (err instanceof SsrfBlockedError) {
            return Response.json(
              { error: `Redirect bị chặn: ${err.message}` },
              { status: 422 },
            )
          }
          return Response.json(
            { error: err instanceof Error ? err.message : 'Redirect URL không hợp lệ' },
            { status: 400 },
          )
        }
        continue
      }
      // Not a redirect — fall out of the loop with the final response.
      break
    }
    if (!resp) {
      return Response.json({ error: 'Fetch không trả về response' }, { status: 422 })
    }
    if (!resp.ok) {
      return Response.json(
        { error: `URL trả về HTTP ${resp.status}` },
        { status: 422 },
      )
    }

    const buffer = await readBodyCapped(resp, MAX_BODY_BYTES)
    if (buffer === null) {
      return Response.json(
        { error: `URL response vượt giới hạn ${Math.round(MAX_BODY_BYTES / (1024 * 1024))} MB` },
        { status: 422 },
      )
    }
    if (buffer.length === 0) {
      return Response.json({ error: 'URL trả về response rỗng' }, { status: 422 })
    }

    const mimeType = resp.headers.get('content-type') ?? 'application/octet-stream'
    // Derive a filename from the URL last segment, stripping query params.
    const name = (url.split('/').pop() || 'image').split('?')[0] || 'image'

    // Create the media doc with file bytes + externalUrl. The Media
    // beforeChange hook resolves the tenant + bucket config; the storage
    // adapter stores the bytes in R2.
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
      const created = await (req.payload.create as Function)({
        collection: 'media',
        data: {
          alt: alt ?? name,
          externalUrl: url,
          folder,
          tenant,
        },
        file: { data: buffer, name, mimetype: mimeType, size: buffer.length },
        context: { tenantId },
        overrideAccess: true,
      })
      const doc = created as { id: string | number; url?: string; alt?: string; filename?: string }
      return Response.json({
        ok: true,
        id: doc.id,
        url: doc.url,
        alt: doc.alt,
        filename: doc.filename,
      }, { status: 201 })
    } catch (err) {
      // Log the real cause server-side; only surface Payload field-validation
      // messages (user-actionable) to the client. R2/DB/credential errors must
      // not leak their internal text.
      req.payload.logger?.error?.(
        `[create-media-from-url] payload.create failed: ${err instanceof Error ? err.message : String(err)}`,
      )
      const isValidationError = err instanceof Error && err.name === 'ValidationError'
      return Response.json(
        {
          error: 'Tạo media thất bại',
          ...(isValidationError ? { detail: (err as Error).message } : {}),
        },
        // A rejected field (e.g. an externalUrl inside the CMS media keyspace, see
        // collections/media.ts) is a client error, not a server fault — 400 keeps it
        // distinguishable from R2/DB failures, which stay 500.
        { status: isValidationError ? 400 : 500 },
      )
    }
  },
}
