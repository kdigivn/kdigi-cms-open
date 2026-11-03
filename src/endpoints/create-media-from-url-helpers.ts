/**
 * Pure helpers for the paste-URL endpoint.
 */

export const MAX_URL_LENGTH = 500
export const FETCH_TIMEOUT_MS = 15_000
/** Cap on the downloaded response body — a slow-but-large or malicious upstream
 *  could otherwise stream multi-GB into memory within the fetch timeout. */
export const MAX_BODY_BYTES = 25 * 1024 * 1024 // 25 MB

/**
 * Read a fetch Response body into a Buffer, enforcing a hard byte cap.
 * Returns null when the body exceeds `maxBytes` (caller maps to 422).
 */
export async function readBodyCapped(resp: Response, maxBytes: number): Promise<Buffer | null> {
  // Fast reject on an honest Content-Length before reading anything.
  const declared = Number(resp.headers.get('content-length') ?? NaN)
  if (Number.isFinite(declared) && declared > maxBytes) return null

  const reader = resp.body?.getReader()
  if (!reader) return Buffer.alloc(0)
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined)
        return null
      }
      chunks.push(value)
    }
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)))
}

export function validateUrl(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new Error('url is required')
  }
  if (raw.length > MAX_URL_LENGTH) {
    throw new Error(`url is too long (max ${MAX_URL_LENGTH} characters)`)
  }
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('url is not a valid URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('url must be http or https')
  }
  return parsed.toString()
}
