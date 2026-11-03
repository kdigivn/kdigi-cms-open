/**
 * wp-archive-common.ts — shared helpers for the WordPress archivers
 * (`wp-archive-rest.ts`, `wp-archive-rest-content.ts`, `wp-archive-graphql.ts`).
 * Not a CLI.
 *
 * Common environment:
 *   WP_URL            origin of the WordPress site incl. scheme, e.g. https://wp.example.com (required)
 *   OUT               raw archive directory, e.g. wp-archive/<site>/raw (required)
 *   WP_AUTH_USER      optional WordPress user for Basic auth (application password)
 *   WP_AUTH_PASSWORD  optional application password
 *   WP_USER_AGENT     optional override when a WAF rejects `kdigi-archiver/1.0`
 *
 * Raw layout:  $OUT/rest/*  verbatim REST mirror · $OUT/content/*  unified snapshot
 *              (src/importers/wp-migration/raw-wp-types.ts) · $OUT/media/files/<path-on-source>
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { setTimeout as sleep } from 'timers/promises'
import type { RawSeo } from '../importers/wp-migration/raw-wp-types'

export const ARCHIVER_USER_AGENT = process.env.WP_USER_AGENT?.trim() || 'kdigi-archiver/1.0'

export interface ArchiveEnv {
  /** Origin (+ optional sub-path install) without trailing slash. */
  wpUrl: string
  /** Absolute raw archive dir. */
  out: string
  restDir: string
  contentDir: string
  filesDir: string
  /** WPGraphQL endpoint (WP_GRAPHQL_URL or `${WP_URL}/graphql`). */
  graphqlUrl: string
  /** `Basic …` header value when WP_AUTH_USER + WP_AUTH_PASSWORD are set. */
  authHeader?: string
}

export function fail(message: string): never {
  console.error(`✖ ${message}`)
  process.exit(2)
}

export function readArchiveEnv(): ArchiveEnv {
  const rawUrl = process.env.WP_URL?.trim()
  if (!rawUrl) fail('WP_URL is required (origin incl. scheme, e.g. https://wp.example.com)')
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return fail(`WP_URL is not a valid URL: ${rawUrl}`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') fail('WP_URL must start with http:// or https://')
  const wpUrl = `${url.origin}${url.pathname.replace(/\/+$/, '')}`

  const outRaw = process.env.OUT?.trim()
  if (!outRaw) fail('OUT is required (raw archive dir, e.g. wp-archive/<site>/raw)')
  const out = resolve(process.cwd(), outRaw)

  const user = process.env.WP_AUTH_USER?.trim()
  const pass = process.env.WP_AUTH_PASSWORD?.trim()
  const authHeader =
    user && pass ? `Basic ${Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')}` : undefined

  return {
    wpUrl,
    out,
    restDir: join(out, 'rest'),
    contentDir: join(out, 'content'),
    filesDir: join(out, 'media', 'files'),
    graphqlUrl: process.env.WP_GRAPHQL_URL?.trim() || `${wpUrl}/graphql`,
    authHeader,
  }
}

export function log(message: string): void {
  console.log(`[${new Date().toTimeString().slice(0, 8)}] ${message}`)
}

/**
 * Parse a JSON body that may be prefixed by a PHP notice/warning (HTML printed
 * before the JSON by `WP_DEBUG` or a plugin). Tries the whole text first, then
 * every `{` / `[` position until one parses.
 */
export function parseJsonLoose<T = unknown>(raw: string): T {
  const text = raw.replace(/^\uFEFF/, '')
  try {
    return JSON.parse(text) as T
  } catch {
    // fall through to notice stripping
  }
  const re = /[{[]/g
  let match: RegExpExecArray | null
  let tries = 0
  while ((match = re.exec(text)) && tries < 200) {
    tries++
    try {
      return JSON.parse(text.slice(match.index)) as T
    } catch {
      // keep scanning
    }
  }
  throw new Error('No JSON object/array found in response')
}

/** Same-origin check so credentials are never sent to a CDN / third party. */
export function isSameOrigin(env: Pick<ArchiveEnv, 'wpUrl'>, url: string): boolean {
  try {
    return new URL(url).origin === new URL(env.wpUrl).origin
  } catch {
    return false
  }
}

export interface FetchRetryOptions {
  headers?: Record<string, string>
  method?: string
  body?: string
  timeoutMs?: number
  /** Retries after the first attempt (network errors, 429, 5xx). */
  retries?: number
  /** Attach Basic auth when configured and the URL is same-origin (default true). */
  auth?: boolean
}

/**
 * fetch with User-Agent, optional Basic auth, timeout and exponential backoff.
 * Returns the last response even if it is a 4xx/5xx (caller decides); throws
 * only when every attempt failed at the network level.
 */
export async function fetchRetry(env: ArchiveEnv, url: string, opts: FetchRetryOptions = {}): Promise<Response> {
  const retries = opts.retries ?? 4
  const headers: Record<string, string> = { 'User-Agent': ARCHIVER_USER_AGENT, ...opts.headers }
  if (opts.auth !== false && env.authHeader && isSameOrigin(env, url)) headers.Authorization = env.authHeader

  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: opts.method ?? 'GET',
        headers,
        body: opts.body,
        redirect: 'follow',
        signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
      })
      const retryable = res.status === 429 || res.status >= 500
      if (!retryable || attempt === retries) return res
      const retryAfter = Number(res.headers.get('retry-after'))
      await res.arrayBuffer().catch(() => undefined)
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 60) * 1000 : backoff(attempt))
    } catch (err) {
      lastErr = err
      if (attempt === retries) break
      await sleep(backoff(attempt))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

function backoff(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 400)
}

/** Atomic JSON write (tmp + rename) creating parent dirs. */
export function writeJson(file: string, data: unknown): void {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  renameSync(tmp, file)
}

/** Read + parse a JSON file; `undefined` when missing or unreadable. */
export function readJson<T = unknown>(file: string): T | undefined {
  if (!existsSync(file)) return undefined
  try {
    return parseJsonLoose<T>(readFileSync(file, 'utf8'))
  } catch (err) {
    console.warn(`[warn] cannot parse ${file}: ${err instanceof Error ? err.message : String(err)}`)
    return undefined
  }
}

/** Run `fn` over `items` with at most `limit` in flight. */
export async function mapPool<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (true) {
      const i = next++
      if (i >= items.length) return
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
  return results
}

export type Json = Record<string, unknown>

export function isRecord(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
export { sleep }

// ── HTML head parsing (shared by the REST + GraphQL snapshot writers) ────────

export function decodeEntities(s: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' }
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m
    }
    return named[e.toLowerCase()] ?? m
  })
}

function attrsOf(tag: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  let m: RegExpExecArray | null
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? '')
  return out
}

/** Merge several JSON-LD blocks into one `@graph` document (a single block is returned as-is). */
export function mergeJsonLd(blocks: string[]): string | null {
  const clean = blocks.map((b) => b.trim()).filter(Boolean)
  if (clean.length === 0) return null
  if (clean.length === 1) return clean[0]
  const graph: unknown[] = []
  for (const block of clean) {
    try {
      const parsed = parseJsonLoose<unknown>(block)
      const nodes = isRecord(parsed) && Array.isArray(parsed['@graph']) ? parsed['@graph'] : [parsed]
      for (const node of nodes) {
        if (isRecord(node)) {
          const { '@context': _ctx, ...rest } = node
          graph.push(rest)
        }
      }
    } catch {
      // unparsable block: skip
    }
  }
  return graph.length > 0 ? JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }) : null
}

/** Parse SEO tags out of an HTML `<head>` fragment (RankMath getHead / Yoast yoast_head / home page). */
export function parseHead(html: string): RawSeo {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]
  const meta: Record<string, string> = {}
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const a = attrsOf(tag)
    const key = (a.name ?? a.property)?.toLowerCase()
    if (key && a.content !== undefined && meta[key] === undefined) meta[key] = a.content
  }
  let canonical: string | undefined
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const a = attrsOf(tag)
    if (a.rel?.toLowerCase() === 'canonical' && a.href) {
      canonical = a.href
      break
    }
  }
  const ld: string[] = []
  const ldRe = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = ldRe.exec(html))) ld.push(m[1])

  const robots = meta.robots
    ?.split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
  const merged = mergeJsonLd(ld)
  return {
    title: title ? decodeEntities(title.trim()) : null,
    description: meta.description ?? null,
    canonicalUrl: canonical ?? null,
    robots: robots && robots.length > 0 ? robots : null,
    fullHead: html,
    jsonLd: merged ? { raw: merged } : null,
    openGraph: {
      title: meta['og:title'] ?? null,
      description: meta['og:description'] ?? null,
      type: meta['og:type'] ?? null,
      url: meta['og:url'] ?? null,
      locale: meta['og:locale'] ?? null,
      siteName: meta['og:site_name'] ?? null,
      updatedTime: meta['article:modified_time'] ?? meta['og:updated_time'] ?? null,
      imageUrl: meta['og:image'] ?? null,
    },
  }
}

export interface HomeMeta {
  homepageJsonLd: string | null
  ga4Id: string | null
  gtmId: string | null
  language: string | undefined
}

/** One best-effort fetch of the public home page: JSON-LD graph, GA4 / GTM ids, `<html lang>`. */
export async function fetchHomeMeta(env: ArchiveEnv, homeUrl: string): Promise<HomeMeta> {
  const empty: HomeMeta = { homepageJsonLd: null, ga4Id: null, gtmId: null, language: undefined }
  try {
    const res = await fetchRetry(env, homeUrl, { retries: 2, timeoutMs: 30_000, auth: false, headers: { Accept: 'text/html' } })
    if (!res.ok) {
      console.warn(`[warn] home page fetch: HTTP ${res.status} — skipping homepage JSON-LD / GA4 / GTM`)
      return empty
    }
    const html = await res.text()
    return {
      homepageJsonLd: parseHead(html).jsonLd?.raw ?? null,
      ga4Id: /\bG-[A-Z0-9]{6,12}\b/.exec(html)?.[0] ?? null,
      gtmId: /\bGTM-[A-Z0-9]{4,10}\b/.exec(html)?.[0] ?? null,
      language: /<html[^>]*\blang=["']([^"']+)["']/i.exec(html)?.[1],
    }
  } catch (err) {
    console.warn(`[warn] home page fetch failed: ${err instanceof Error ? err.message : String(err)}`)
    return empty
  }
}

/** Public `GET /wp-json/` (best effort) — namespaces, timezone, site icon/logo ids. */
export async function fetchRestIndex(env: ArchiveEnv): Promise<Json | undefined> {
  for (const url of [`${env.wpUrl}/wp-json/`, `${env.wpUrl}/?rest_route=/`]) {
    try {
      const res = await fetchRetry(env, url, { retries: 1, timeoutMs: 20_000, headers: { Accept: 'application/json' } })
      if (!res.ok) continue
      const body = parseJsonLoose<unknown>(await res.text())
      if (isRecord(body) && (body.namespaces || body.routes)) return body
    } catch {
      // try next
    }
  }
  return undefined
}

/** Print the WP_UTC_OFFSET to use, derived from the site's `gmt_offset`. */
export function logTimezoneHint(index: Json | undefined): void {
  const offset = typeof index?.gmt_offset === 'number' ? index.gmt_offset : null
  if (offset === null) return
  const sign = offset < 0 ? '-' : '+'
  const abs = Math.abs(offset)
  const hh = String(Math.trunc(abs)).padStart(2, '0')
  const mm = String(Math.round((abs % 1) * 60)).padStart(2, '0')
  const tz = typeof index?.timezone_string === 'string' && index.timezone_string ? index.timezone_string : 'n/a'
  log(`Site timezone: ${tz} (UTC${sign}${hh}:${mm}) — import with WP_UTC_OFFSET=${sign}${hh}:${mm} so dates keep their meaning`)
}
