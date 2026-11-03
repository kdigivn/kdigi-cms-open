'use client'
/**
 * Shared client-side helper to upload a file to the Payload Media collection
 * via the REST `/api/media` endpoint, returning the created media doc.
 *
 * Single source of truth for the Payload 3 multipart upload contract so every
 * admin surface (the media library dropzone, the Milkdown editor's image block)
 * uploads identically:
 *   - raw binary under the `file` part
 *   - sibling field values in a `_payload` JSON part
 *
 * The Media collection requires `alt` (collections/media.ts) — it MUST live
 * inside `_payload`; sending it as a loose form field is ignored by Payload and
 * the create fails validation with HTTP 400. By default the tenant is resolved
 * server-side from the admin selected-tenant cookie, so `credentials: 'include'`
 * is required. Callers that know the upload's tenant explicitly (e.g. the
 * editor's media modal scoping uploads to the DOCUMENT's tenant rather than the
 * admin tenant-switcher cookie — Phase 8 / F10) can pass `opts.tenant`, which
 * `resolveUploadTenantId` (src/lib/resolve-upload-tenant.ts) treats as the
 * highest-priority signal, overriding the cookie.
 */
import { deriveAltFromFilename } from './media-p3-helpers'

export interface UploadedMediaDoc {
  id?: string | number
  url?: string
  alt?: string
}

export async function uploadFileToPayloadMedia(
  file: File,
  opts: { folder?: number | null; alt?: string; tenant?: string | number | null } = {},
): Promise<UploadedMediaDoc> {
  const fd = new FormData()
  fd.append('file', file, file.name)
  fd.append(
    '_payload',
    JSON.stringify({
      alt: opts.alt ?? deriveAltFromFilename(file.name),
      folder: opts.folder ?? null,
      ...(opts.tenant != null ? { tenant: opts.tenant } : {}),
    }),
  )
  const res = await fetch('/api/media', { method: 'POST', credentials: 'include', body: fd })
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { errors?: { message: string }[] }
    throw new Error(errBody?.errors?.[0]?.message ?? `Upload thất bại (HTTP ${res.status})`)
  }
  const { doc } = await res.json()
  return doc as UploadedMediaDoc
}
