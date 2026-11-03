/**
 * Local file → `media` via REST multipart (MCP has no binary channel). Payload 3 reads form
 * fields only from the `_payload` JSON part, so `alt` and `tenant` go there.
 */
import { readFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'

import type { Connection } from './config.js'
import { CliError, EXIT, usageError } from './errors.js'

/** Same raster allow-list as the server's agent import (`src/lib/import-media-from-url.ts`). */
const IMAGE_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
}

export interface UploadedMedia {
  id: number
  url?: string | null
  alt?: string | null
  filename?: string | null
}

export async function uploadMedia(conn: Connection, filePath: string, opts: { siteId: number; alt?: string }): Promise<UploadedMedia> {
  const type = IMAGE_TYPES[extname(filePath).toLowerCase()]
  if (!type) throw usageError(`Only images can be uploaded (${Object.keys(IMAGE_TYPES).join(', ')}): ${filePath}`)
  const bytes = await readFile(filePath).catch(() => {
    throw usageError(`Cannot read ${filePath}`)
  })
  const name = basename(filePath)
  const form = new FormData()
  form.append('file', new Blob([bytes], { type }), name)
  form.append('_payload', JSON.stringify({ alt: opts.alt ?? name.replace(/\.[^.]+$/, ''), tenant: opts.siteId }))

  const res = await fetch(`${conn.url}/api/media`, {
    method: 'POST',
    headers: { Authorization: `users API-Key ${conn.apiKey}` },
    body: form,
  })
  const json = (await res.json().catch(() => ({}))) as { doc?: UploadedMedia; errors?: Array<{ message?: string }> }
  if (!res.ok || !json.doc) {
    const message = json.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`
    throw new CliError(`Upload failed: ${message}`, res.status === 401 ? EXIT.auth : EXIT.op)
  }
  const { id, url, alt, filename } = json.doc
  return { id, url, alt, filename }
}
