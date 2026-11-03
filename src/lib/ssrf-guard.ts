/**
 * SSRF guard for the paste-URL endpoint.
 *
 * The endpoint fetches a user-supplied URL server-side. Without guards, a
 * logged-in admin could probe the backend's private network by
 * pasting a URL like `http://169.254.169.254/latest/meta-data/` (cloud
 * metadata) or `http://10.0.0.5/admin` (internal admin panel).
 *
 * Threat model (per the red-team pass, P0-3):
 *   1. Direct hit on a private/loopback address — block by checking the
 *      resolved IP against a block-list BEFORE issuing fetch().
 *   2. Redirect to a private address — `redirect: 'manual'` so we never
 *      blindly follow, then re-validate the redirect target.
 *   3. DNS rebinding — the hostname resolves to a public IP at validation
 *      time but a private IP at connect time. Mitigated by resolving
 *      once, passing the IP via undici's `lookup` option (Node 18+).
 *   4. Non-http(s) schemes — blocked at the parse step.
 *
 * Implemented as a single `assertUrlSafe(url)` function that:
 *   - parses + validates the URL
 *   - resolves the hostname (async, with a timeout)
 *   - checks the resolved IP against the block-list
 *   - returns the resolved IP so the caller can pin it for the fetch
 */
import dns from 'node:dns/promises'
import net from 'node:net'

/**
 * IPv4 ranges to block.
 *   10.0.0.0/8        — RFC 1918 private
 *   172.16.0.0/12     — RFC 1918 private
 *   192.168.0.0/16    — RFC 1918 private
 *   127.0.0.0/8       — loopback
 *   169.254.0.0/16    — link-local (AWS / GCP / Azure metadata)
 *   0.0.0.0/8         — "this network" / unspecified
 *   100.64.0.0/10     — CGN (shared address space)
 *   224.0.0.0/4       — multicast
 *   240.0.0.0/4       — reserved / broadcast
 *   IPv6 ::1/128, fc00::/7 (ULA), fe80::/10 (link-local), :: (unspecified)
 */
const PRIVATE_IPV4_RANGES: Array<[bigint, bigint]> = [
  // [start, end] inclusive
  [0x0a000000n, 0x0affffffn],       // 10.0.0.0/8
  [0xac100000n, 0xac1fffffn],       // 172.16.0.0/12
  [0xc0a80000n, 0xc0a8ffffn],       // 192.168.0.0/16
  [0x7f000000n, 0x7fffffffn],       // 127.0.0.0/8
  [0xa9fe0000n, 0xa9feffffn],       // 169.254.0.0/16
  [0x00000000n, 0x00ffffffn],       // 0.0.0.0/8
  [0x64400000n, 0x647fffffn],       // 100.64.0.0/10 (CGN: 100.64.0.0 → 100.127.255.255)
  [0xe0000000n, 0xefffffffn],       // 224.0.0.0/4 (multicast)
  [0xf0000000n, 0xffffffffn],       // 240.0.0.0/4 (reserved)
]


/** Convert an IPv4 string to a BigInt for range comparison. */
function ipv4ToBigInt(ip: string): bigint | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let acc = 0n
  for (const p of parts) {
    const n = Number(p)
    if (!Number.isInteger(n) || n < 0 || n > 255) return null
    acc = (acc << 8n) | BigInt(n)
  }
  return acc
}

/** True when an IPv4 address is in any blocked range. */
export function isPrivateIPv4(ip: string): boolean {
  const num = ipv4ToBigInt(ip)
  if (num === null) return false
  for (const [start, end] of PRIVATE_IPV4_RANGES) {
    if (num >= start && num <= end) return true
  }
  return false
}

/** True when an IPv6 address is in any blocked range. */
export function isPrivateIPv6(ip: string): boolean {
  // Strip zone identifier (e.g. fe80::1%eth0)
  const noZone = ip.split('%')[0] ?? ip
  const lower = noZone.toLowerCase()
  // Loopback (::1) and unspecified (::)
  if (lower === '::1' || lower === '::') return true
  // IPv4-mapped IPv6 (::ffff:0:0/96) and IPv4-compatible (::a.b.c.d) — the
  // embedded IPv4 address is what the host actually connects to on a
  // dual-stack box, so a mapped 169.254.169.254 / 127.0.0.1 / 10.x must be
  // blocked. net.isIP() reports family 6 for these, so without this branch
  // they slip past every IPv6 prefix check below. (SSRF: ::ffff:169.254.169.254)
  if (lower.startsWith('::ffff:') || (lower.startsWith('::') && lower.includes('.'))) {
    const embedded = lower.slice(lower.lastIndexOf(':') + 1)
    if (embedded.includes('.')) {
      // Dotted-quad form: ::ffff:127.0.0.1
      return net.isIP(embedded) === 4 ? isPrivateIPv4(embedded) : true
    }
    // Hex form: ::ffff:7f00:1 → two 16-bit groups after the mapping prefix.
    const tail = lower.slice('::ffff:'.length).split(':')
    if (tail.length === 2) {
      const hi = parseInt(tail[0], 16)
      const lo = parseInt(tail[1], 16)
      if (Number.isFinite(hi) && Number.isFinite(lo)) {
        const dotted = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`
        return isPrivateIPv4(dotted)
      }
    }
    // Unparseable mapped form — treat as untrusted.
    return true
  }
  // ULA: fc00::/7 — first byte 0xfc or 0xfd
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true
  // Link-local: fe80::/10 — first 10 bits are 1111 1110 10
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) {
    return true
  }
  // Multicast ff00::/8
  if (lower.startsWith('ff')) return true
  return false
}

/** True when an IP string is private/loopback/multicast/unspecified. */
export function isPrivateIP(ip: string): boolean {
  // net.isIP returns 4 for IPv4, 6 for IPv6, 0 for invalid
  const family = net.isIP(ip)
  if (family === 4) return isPrivateIPv4(ip)
  if (family === 6) return isPrivateIPv6(ip)
  return true // invalid = treat as untrusted
}

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SsrfBlockedError'
  }
}

/** DNS resolution timeout — keep it tight so a slow resolver doesn't
 *  hang the upload. */
const RESOLVE_TIMEOUT_MS = 5_000

/**
 * Resolve every A/AAAA record for `hostname` and assert none is a
 * private/loopback address. Returns the resolved IPs so the caller
 * can pin the connection (mitigates DNS rebinding at fetch time).
 *
 * Throws `SsrfBlockedError` if any resolved IP is private, or if
 * resolution fails / times out / returns no records.
 */
export async function assertHostnameSafe(hostname: string): Promise<string[]> {
  // Reject the literal cases the resolver would otherwise handle:
  // - IP literal (a hostname of "127.0.0.1" should never reach DNS)
  if (net.isIP(hostname) !== 0) {
    if (isPrivateIP(hostname)) {
      throw new SsrfBlockedError(`Refusing to fetch private IP literal: ${hostname}`)
    }
    return [hostname]
  }

  // Resolve with a timeout so a slow resolver doesn't hang the request.
  const resolveWithTimeout = Promise.race([
    dns.lookup(hostname, { all: true, verbatim: true }),
    new Promise<never>((_resolve, reject) =>
      setTimeout(() => reject(new SsrfBlockedError(`DNS resolve timeout for ${hostname}`)), RESOLVE_TIMEOUT_MS),
    ),
  ])
  let records: Array<{ address: string; family: number }>
  try {
    records = await resolveWithTimeout
  } catch (err) {
    if (err instanceof SsrfBlockedError) throw err
    throw new SsrfBlockedError(
      `DNS resolve failed for ${hostname}: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  if (records.length === 0) {
    throw new SsrfBlockedError(`No DNS records for ${hostname}`)
  }
  // Check every resolved address. ANY private IP blocks the request —
  // a single hostname can resolve to multiple IPs, and we can't tell
  // upfront which one fetch() will pick.
  for (const rec of records) {
    if (isPrivateIP(rec.address)) {
      throw new SsrfBlockedError(
        `Refusing to fetch ${hostname}: resolves to private IP ${rec.address}`,
      )
    }
  }
  return records.map((r) => r.address)
}

export interface SafeUrlResult {
  url: string
  /** Resolved IP addresses (vetted) — pass to fetch via undici dispatcher
   *  to pin the connection and prevent DNS rebinding at connect time. */
  addresses: string[]
}

/**
 * Validate a URL end-to-end: parse, scheme check, host safety.
 * Returns the validated URL + the resolved IP addresses. The caller
 * passes the addresses to fetch via a custom dispatcher (or, for
 * simpler deployments, can trust that the connect-time resolver will
 * pick one of these — Node's built-in fetch still has a small rebinding
 * window but the validated set narrows the surface significantly).
 *
 * Throws `SsrfBlockedError` for any safety violation. Throws a plain
 * `Error` for protocol/length violations (caller maps to 400).
 */
export async function assertUrlSafe(raw: string): Promise<SafeUrlResult> {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new Error('url is required')
  }
  if (raw.length > 500) {
    throw new Error('url is too long (max 500 characters)')
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
  // Reject the literal hostname cases up front so we never query DNS
  // for a clear-bad value (and so the error message is specific).
  const addresses = await assertHostnameSafe(parsed.hostname)
  return { url: parsed.toString(), addresses }
}
