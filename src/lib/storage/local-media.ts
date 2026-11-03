/**
 * Local-disk media storage — the zero-config fallback used whenever a site has no
 * Cloudflare R2 config (Sites.r2.*) or `R2_OFF=true`.
 *
 * Layout on disk:   <MEDIA_DIR>/<tenantKey>/<diskName>
 *   - MEDIA_DIR defaults to `./media` (relative to the process cwd). In Docker it is
 *     `/app/media`, mounted as a named volume.
 *   - tenantKey is the owning site id, or `shared` when the upload has no site.
 *   - diskName is the Payload filename made filesystem-safe (see `toLocalDiskName`).
 *
 * Public URL:       <serverURL>/api/media/file/<filename>   (Payload's built-in media file route)
 *   Payload regenerates local URLs from the filename, so nothing tenant-specific can ride in the
 *   URL. `media.filename` is globally unique, so `r2StorageAdapter.staticHandler` resolves the
 *   owning site with one lookup by filename. Access is the Media collection's `read` access
 *   (public) — Payload runs it before any handler.
 *
 * Everything here is path-traversal safe: tenant keys and disk names are validated against
 * strict patterns and the resolved path must stay inside MEDIA_DIR.
 */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'

export const SHARED_TENANT_KEY = 'shared'

const TENANT_KEY_RE = /^[A-Za-z0-9_-]{1,64}$/
const DISK_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/

/** Absolute media root. `MEDIA_DIR` may be absolute or relative to the process cwd. */
export function getLocalMediaDir(): string {
  const configured = process.env.MEDIA_DIR?.trim()
  return path.resolve(configured || 'media')
}

/** Normalise a tenant relationship value (id | { id } | undefined) into a safe directory key. */
export function toLocalTenantKey(tenant: unknown): string {
  const raw = tenant !== null && typeof tenant === 'object' && 'id' in tenant ? tenant.id : tenant
  const str = typeof raw === 'number' || typeof raw === 'string' ? String(raw) : ''
  return TENANT_KEY_RE.test(str) ? str : SHARED_TENANT_KEY
}

/**
 * Filesystem-safe, collision-free name for a Payload filename. Names that are already plain
 * (`[A-Za-z0-9._-]`, no `..`, no leading dot) are kept verbatim; anything else has its odd
 * characters replaced by `_` and an 8-hex hash of the ORIGINAL name inserted before the
 * extension, so `A b.png` and `a_b.png` can never share a file.
 */
export function toLocalDiskName(filename: string): string {
  const base = filename.replace(/^.*[/\\]/, '')
  const safe = base.replace(/[^A-Za-z0-9._-]/g, '_').replace(/\.{2,}/g, '_').replace(/^[._-]+/, '')
  if (safe === base && safe.length > 0) return safe
  const hash = createHash('sha1').update(filename).digest('hex').slice(0, 8)
  const ext = path.extname(safe)
  const stem = (ext ? safe.slice(0, -ext.length) : safe) || 'file'
  return `${stem.slice(0, 120)}-${hash}${ext.slice(0, 20)}`
}

/** Resolve `<MEDIA_DIR>/<tenantKey>/<diskName>`; undefined when either part is not a plain token. */
export function resolveLocalMediaPath(tenantKey: string, filename: string): string | undefined {
  const diskName = toLocalDiskName(filename)
  if (!TENANT_KEY_RE.test(tenantKey) || !DISK_NAME_RE.test(diskName)) return undefined
  const root = getLocalMediaDir()
  const full = path.resolve(root, tenantKey, diskName)
  return full.startsWith(root + path.sep) ? full : undefined
}

/**
 * True when a stored `media.url` points at Payload's local file route
 * (`/api/media/file/<name>`, relative or absolute) rather than a CDN / external URL.
 */
export function isLocalMediaUrl(url: unknown): boolean {
  if (typeof url !== 'string' || !url) return false
  try {
    return /\/api\/media\/file\/[^/]+$/.test(new URL(url, 'http://local.invalid').pathname)
  } catch {
    return false
  }
}

export async function writeLocalMedia(
  tenantKey: string,
  filename: string,
  buffer: Buffer,
): Promise<void> {
  const target = resolveLocalMediaPath(tenantKey, filename)
  if (!target) throw new Error(`[local-media] refusing unsafe media path: ${tenantKey}/${filename}`)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, buffer)
}

export async function readLocalMediaStat(
  tenantKey: string,
  filename: string,
): Promise<{ path: string; size: number; mtimeMs: number } | undefined> {
  const target = resolveLocalMediaPath(tenantKey, filename)
  if (!target) return undefined
  try {
    const s = await stat(target)
    return s.isFile() ? { path: target, size: s.size, mtimeMs: s.mtimeMs } : undefined
  } catch {
    return undefined
  }
}

/** Delete a stored file; a missing file is not an error. */
export async function deleteLocalMedia(tenantKey: string, filename: string): Promise<void> {
  const target = resolveLocalMediaPath(tenantKey, filename)
  if (!target) return
  await rm(target, { force: true })
}

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json',
  '.zip': 'application/zip',
}

/**
 * Serve a locally stored file. 404 when missing, 304 on a matching ETag. Unknown
 * extensions are sent as an `attachment` octet-stream so a stray `.html` upload can
 * never execute on the CMS origin; SVG is served with a locked-down CSP.
 */
export async function serveLocalMedia(
  req: { headers?: Headers | null },
  tenantKey: string,
  filename: string,
): Promise<Response> {
  const info = await readLocalMediaStat(tenantKey, filename)
  if (!info) return new Response('File not found', { status: 404 })

  const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`
  const headers = new Headers({
    ETag: etag,
    'Cache-Control': 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  })
  if (req.headers?.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers })
  }

  const ext = path.extname(filename).toLowerCase()
  const known = CONTENT_TYPES[ext]
  headers.set('Content-Type', known ?? 'application/octet-stream')
  headers.set('Content-Length', String(info.size))
  if (!known) headers.set('Content-Disposition', `attachment; filename="${toLocalDiskName(filename)}"`)
  if (known === 'image/svg+xml') {
    headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
  }

  const body = Readable.toWeb(createReadStream(info.path)) as unknown as ReadableStream
  return new Response(body, { status: 200, headers })
}
