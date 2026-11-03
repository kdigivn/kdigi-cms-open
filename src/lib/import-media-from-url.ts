/**
 * Download a remote file and store it as a `media` doc of one tenant — shared by
 * `POST /api/media/from-url` and the agent op `import_media_from_url`.
 *
 * SSRF: every hop (initial URL + each redirect `location`) goes through `pinnedFetch`, which runs
 * `assertUrlSafe` and pins the connection to the vetted IPs (no DNS-rebinding window).
 *
 * Modes:
 *   - `system`: admin browser sessions on the endpoint, which already resolved + authorized the
 *     tenant (`resolveUploadTenantId`); the create runs with `overrideAccess: true` and no `req`.
 *   - `user`: agents and REST API-key sessions; the create runs as the caller (`req`,
 *     `overrideAccess: false`, so `hasAnyTenantOrSuperAdmin` applies) and only raster images are
 *     accepted — the type is sniffed from the bytes, never taken from the remote `content-type`.
 */
import { APIError, type PayloadRequest } from 'payload'
import sharp from 'sharp'

import { FETCH_TIMEOUT_MS, MAX_BODY_BYTES, validateUrl } from '../endpoints/create-media-from-url-helpers'
import { pinnedFetch, type PinnedResponse } from './pinned-fetch'
import { SsrfBlockedError } from './ssrf-guard'

const MAX_REDIRECTS = 3

/** Raster formats an agent may import (sharp `metadata().format` → stored mime type). */
const AGENT_IMAGE_FORMATS: Record<string, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
}

/** A user-facing failure with the HTTP status the paste-URL endpoint has always returned. */
export class MediaImportError extends Error {
  readonly status: number
  readonly detail?: string

  constructor(status: number, message: string, detail?: string) {
    super(message)
    this.name = 'MediaImportError'
    this.status = status
    this.detail = detail
  }
}

export interface ImportedMedia {
  id: number
  url?: string | null
  alt?: string | null
  filename?: string | null
}

async function fetchFollowingSafeRedirects(url: string): Promise<PinnedResponse> {
  let current = url
  for (let hop = 0; ; hop += 1) {
    let resp: PinnedResponse
    try {
      resp = await pinnedFetch(current, {
        headers: { 'User-Agent': 'kdigi-cms/1.0 (+paste-url)' },
        timeoutMs: FETCH_TIMEOUT_MS,
        maxBytes: MAX_BODY_BYTES,
      })
    } catch (err) {
      if (err instanceof SsrfBlockedError) {
        throw new MediaImportError(422, hop === 0 ? err.message : `Redirect bị chặn: ${err.message}`)
      }
      // assertUrlSafe throws a plain Error for protocol/length/parse problems (a client error).
      if (err instanceof Error && /^url /.test(err.message)) throw new MediaImportError(400, err.message)
      throw new MediaImportError(422, `Không tải được URL: ${err instanceof Error ? err.message : String(err)}`)
    }
    if (resp.status < 300 || resp.status >= 400) return resp
    const location = resp.headers.get('location')
    if (!location) throw new MediaImportError(422, 'Redirect thiếu Location header')
    if (hop === MAX_REDIRECTS) throw new MediaImportError(422, 'Quá nhiều redirects')
    try {
      current = new URL(location, resp.url).toString()
    } catch {
      throw new MediaImportError(400, 'Redirect URL không hợp lệ')
    }
  }
}

async function sniffImageMime(buffer: Buffer): Promise<string> {
  const format = await sharp(buffer)
    .metadata()
    .then((m) => m.format)
    .catch(() => undefined)
  const mime = format ? AGENT_IMAGE_FORMATS[format] : undefined
  if (!mime) {
    throw new MediaImportError(400, 'Chỉ nhập được ảnh JPEG, PNG, WebP, GIF hoặc AVIF. / Only JPEG, PNG, WebP, GIF or AVIF images can be imported.')
  }
  return mime
}

export async function importMediaFromUrl(
  req: PayloadRequest,
  input: { url: unknown; alt?: string; folder?: unknown; tenant: number; tenantId: string },
  mode: 'system' | 'user',
): Promise<ImportedMedia> {
  let url: string
  try {
    url = validateUrl(input.url)
  } catch (err) {
    throw new MediaImportError(400, err instanceof Error ? err.message : 'Invalid url')
  }

  const resp = await fetchFollowingSafeRedirects(url)
  if (resp.status < 200 || resp.status >= 300) throw new MediaImportError(422, `URL trả về HTTP ${resp.status}`)
  if (resp.body === null) {
    throw new MediaImportError(422, `URL response vượt giới hạn ${Math.round(MAX_BODY_BYTES / (1024 * 1024))} MB`)
  }
  if (resp.body.length === 0) throw new MediaImportError(422, 'URL trả về response rỗng')
  const buffer = resp.body

  const mimeType =
    mode === 'user' ? await sniffImageMime(buffer) : (resp.headers.get('content-type') ?? 'application/octet-stream')
  // Derive a filename from the URL last segment, stripping query params.
  const name = (url.split('/').pop() || 'image').split('?')[0] || 'image'

  try {
    const created = await req.payload.create({
      collection: 'media',
      data: { alt: input.alt ?? name, externalUrl: url, folder: (input.folder ?? null) as number | null, tenant: input.tenant },
      file: { data: buffer, name, mimetype: mimeType, size: buffer.length },
      context: { tenantId: input.tenantId },
      ...(mode === 'user' ? { req, overrideAccess: false } : { overrideAccess: true }),
    })
    return { id: created.id, url: created.url, alt: created.alt, filename: created.filename }
  } catch (err) {
    // Access denials (user mode) keep their status. Otherwise log the real cause; only Payload
    // field-validation messages are user-actionable — R2/DB/credential errors must not leak.
    if (err instanceof APIError && err.status < 500 && err.name !== 'ValidationError') {
      throw new MediaImportError(err.status, err.message)
    }
    req.payload.logger?.error?.(`[import-media-from-url] payload.create failed: ${err instanceof Error ? err.message : String(err)}`)
    const isValidationError = err instanceof Error && err.name === 'ValidationError'
    throw new MediaImportError(isValidationError ? 400 : 500, 'Tạo media thất bại', isValidationError ? err.message : undefined)
  }
}
