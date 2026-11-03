/**
 * One HTTP GET pinned to IPs that `assertUrlSafe` vetted, with a hard body cap.
 *
 * Node's global fetch re-resolves the hostname at connect time, so a TTL-0 record could rebind
 * from a public IP (passes the SSRF guard) to a private one (gets fetched). Pinning the connect
 * lookup to the vetted address closes that window; TLS still verifies against the hostname.
 * Redirects are NOT followed — the caller validates `location` and calls again.
 */
import net from 'node:net'

import { Agent, fetch as undiciFetch } from 'undici'

import { assertUrlSafe } from './ssrf-guard'

type LookupCallback = (err: Error | null, address: string | Array<{ address: string; family: number }>, family?: number) => void

export interface PinnedResponse {
  /** The vetted, normalized URL that was requested. */
  url: string
  status: number
  headers: Headers
  /** Body bytes; `null` when it exceeded `maxBytes`; empty for redirects. */
  body: Buffer | null
}

export async function pinnedFetch(
  rawUrl: string,
  init: { headers?: Record<string, string>; timeoutMs: number; maxBytes: number },
): Promise<PinnedResponse> {
  const { url, addresses } = await assertUrlSafe(rawUrl)
  // Every address was vetted; offering all of them keeps A/AAAA fallback (dual-stack hosts).
  const vetted = addresses.map((address) => ({ address, family: net.isIP(address) }))
  const dispatcher = new Agent({
    connect: {
      lookup: (_hostname: string, options: { all?: boolean }, callback: LookupCallback) => {
        if (options?.all) callback(null, vetted)
        else callback(null, vetted[0].address, vetted[0].family)
      },
    },
  })
  try {
    const response = await undiciFetch(url, {
      dispatcher,
      redirect: 'manual',
      headers: init.headers,
      signal: AbortSignal.timeout(init.timeoutMs),
    })
    const headers = new Headers([...response.headers.entries()])
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => undefined)
      return { url, status: response.status, headers, body: Buffer.alloc(0) }
    }
    const declared = Number(headers.get('content-length') ?? NaN)
    if (Number.isFinite(declared) && declared > init.maxBytes) {
      await response.body?.cancel().catch(() => undefined)
      return { url, status: response.status, headers, body: null }
    }
    const chunks: Buffer[] = []
    let total = 0
    for await (const chunk of response.body ?? []) {
      total += chunk.byteLength
      if (total > init.maxBytes) return { url, status: response.status, headers, body: null }
      chunks.push(Buffer.from(chunk))
    }
    return { url, status: response.status, headers, body: Buffer.concat(chunks) }
  } finally {
    await dispatcher.destroy().catch(() => undefined)
  }
}
