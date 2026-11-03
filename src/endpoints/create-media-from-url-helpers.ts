/**
 * Pure helpers for the paste-URL endpoint.
 */

export const MAX_URL_LENGTH = 500
export const FETCH_TIMEOUT_MS = 15_000
/** Cap on the downloaded response body — a slow-but-large or malicious upstream
 *  could otherwise stream multi-GB into memory within the fetch timeout. */
export const MAX_BODY_BYTES = 25 * 1024 * 1024 // 25 MB

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
