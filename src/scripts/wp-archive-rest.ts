/**
 * wp-archive-rest.ts — raw REST mirror of ANY WordPress site (+ media binaries).
 *
 * Reads the public WP REST API (and, when credentials are given, the authed
 * parts) and writes only to local disk. Idempotent: collections are re-fetched
 * and replaced atomically, media binaries that already exist are skipped, so an
 * interrupted run can simply be re-run.
 *
 * Usage:
 *   WP_URL=https://wp.example.com OUT=wp-archive/<site>/raw \
 *     [WP_AUTH_USER=admin WP_AUTH_PASSWORD='xxxx xxxx xxxx xxxx'] \
 *     [WP_POST_TYPES=portfolio,event] \
 *     node --import tsx src/scripts/wp-archive-rest.ts [--authed-media] [--no-media] [--concurrency=8]
 *
 * Environment:
 *   WP_URL            WordPress origin incl. scheme (required, no default)
 *   OUT               raw archive dir (required, no default); writes $OUT/rest + $OUT/media/files
 *   WP_AUTH_USER / WP_AUTH_PASSWORD
 *                     optional application-password Basic auth. Enables draft/private
 *                     content (`status=any`), menus, settings and `--authed-media`.
 *   WP_POST_TYPES     extra comma-separated custom post type REST bases to mirror
 *   WP_USER_AGENT     override the `kdigi-archiver/1.0` User-Agent (WAF workaround)
 *
 * Flags:
 *   --authed-media    also page /wp/v2/media?context=edit (private + unattached attachments)
 *                     into rest/media-authed.json (requires WP_AUTH_*) and download their binaries
 *   --no-media        skip media binary download (JSON mirror only)
 *   --concurrency=N   parallel media downloads (default 8)
 *
 * Output ($OUT/rest/, file name = REST base):
 *   index.json (GET /wp-json/), posts, pages, media, comments, users, categories, tags,
 *   taxonomies (object), types (object), <every non-core taxonomy + custom post type REST base>,
 *   product / product_cat / product_tag (WooCommerce, when present), wc-store-products
 *   (public Store API), menus, menu-items, menu-locations (WP >= 5.9, usually authed),
 *   wp-api-menus / wp-api-menus-locations (WP-REST-API V2 Menus plugin), settings (authed),
 *   media-authed (--authed-media).
 *   Binaries: $OUT/media/files/<path-on-source>   ·   failures: $OUT/media/failed.json
 *
 * Next step: `node --import tsx src/scripts/wp-archive-rest-content.ts` turns this
 * mirror into the unified $OUT/content/*.json snapshot.
 */
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'fs'
import { dirname, join, resolve, sep } from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import {
  fetchRetry,
  isRecord,
  log,
  mapPool,
  parseJsonLoose,
  readArchiveEnv,
  readJson,
  fail,
  writeJson,
  type Json,
} from './wp-archive-common'

const env = readArchiveEnv()
const argv = process.argv.slice(2)
const NO_MEDIA = argv.includes('--no-media')
const AUTHED_MEDIA = argv.includes('--authed-media')
const CONCURRENCY = Math.max(1, Number(argv.find((a) => a.startsWith('--concurrency='))?.split('=')[1]) || 8)
const PER_PAGE = 100
const MAX_PAGES = 5000

if (AUTHED_MEDIA && !env.authHeader) fail('--authed-media requires WP_AUTH_USER and WP_AUTH_PASSWORD')

/** Taxonomies already covered by dedicated collections or irrelevant to content. */
const CORE_TAXONOMIES = new Set(['category', 'post_tag', 'nav_menu', 'link_category', 'wp_pattern_category', 'post_format'])
/** Post types that are not content (attachments are mirrored as `media`). */
const CORE_POST_TYPES = new Set([
  'post',
  'page',
  'attachment',
  'nav_menu_item',
  'wp_block',
  'wp_template',
  'wp_template_part',
  'wp_navigation',
  'wp_font_family',
  'wp_font_face',
  'wp_global_styles',
  'revision',
])
/** Names of the fixed mirror files — a discovered REST base must never overwrite them. */
const RESERVED_NAMES = new Set([
  'index',
  'posts',
  'pages',
  'media',
  'media-authed',
  'comments',
  'users',
  'categories',
  'tags',
  'taxonomies',
  'types',
  'menus',
  'menu-items',
  'menu-locations',
  'settings',
  'wc-store-products',
  'wp-api-menus',
  'wp-api-menus-locations',
])

type Params = Record<string, string | number>
interface Outcome {
  name: string
  status: 'ok' | 'skipped' | 'error'
  count?: number
  detail?: string
}
const outcomes: Outcome[] = []

let restMode: 'pretty' | 'rest_route' = 'pretty'

function restUrl(route: string, params: Params = {}): string {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))
  if (restMode === 'pretty') {
    const q = qs.toString()
    return `${env.wpUrl}/wp-json/${route}${q ? `?${q}` : ''}`
  }
  const q = qs.toString()
  return `${env.wpUrl}/?rest_route=/${route}${q ? `&${q}` : ''}`
}

interface RestResponse {
  status: number
  data: unknown
  totalPages: number | null
}

async function restGet(route: string, params: Params = {}): Promise<RestResponse> {
  const res = await fetchRetry(env, restUrl(route, params), { headers: { Accept: 'application/json' } })
  const text = await res.text()
  let data: unknown = null
  try {
    data = parseJsonLoose(text)
  } catch {
    data = null
  }
  const tp = Number(res.headers.get('x-wp-totalpages'))
  return { status: res.status, data, totalPages: Number.isFinite(tp) && tp > 0 ? tp : null }
}

function record(outcome: Outcome): Outcome {
  outcomes.push(outcome)
  const tail = outcome.detail ? ` (${outcome.detail})` : ''
  const msg =
    outcome.status === 'ok'
      ? `REST ${outcome.name}: ${outcome.count} items -> rest/${outcome.name}.json`
      : `REST ${outcome.name}: ${outcome.status}${tail}`
  if (outcome.status === 'error') console.error(`[${new Date().toTimeString().slice(0, 8)}] ${msg}`)
  else log(msg)
  return outcome
}

interface CollectionOptions {
  /** Request `_embed=1` (featured media, author, terms). */
  embed?: boolean
  /** Extra query params always sent. */
  params?: Params
  /** Params tried first when authed (e.g. `status=any`); dropped when the server rejects them. */
  authedParams?: Params
  /** Mirror file name (default: last path segment of the route). */
  name?: string
}

/** Paginate a REST collection into rest/<name>.json. Never throws. */
async function dumpCollection(route: string, opts: CollectionOptions = {}): Promise<Outcome> {
  const name = opts.name ?? route.split('/').pop() ?? route
  try {
    let embed = opts.embed ?? false
    let params: Params = { ...opts.params }
    const triedAuthed = env.authHeader !== undefined && opts.authedParams !== undefined
    if (triedAuthed) params = { ...params, ...opts.authedParams }

    const items: unknown[] = []
    let page = 1
    let totalPages: number | null = null
    while (page <= MAX_PAGES) {
      const query = (): Params => ({ ...params, per_page: PER_PAGE, page, ...(embed ? { _embed: 1 } : {}) })
      let res = await restGet(route, query())
      if (page === 1 && triedAuthed && (res.status === 400 || res.status === 401 || res.status === 403)) {
        params = { ...opts.params }
        res = await restGet(route, query())
      }
      if (res.status >= 500 && embed) {
        console.warn(`[warn] ${name}: HTTP ${res.status} with _embed — retrying page ${page} without it`)
        embed = false
        res = await restGet(route, query())
      }
      if (res.status !== 200 || res.data === null) {
        if (page === 1) return record({ name, status: 'skipped', detail: `HTTP ${res.status}` })
        return record({ name, status: 'error', detail: `page ${page}: HTTP ${res.status}, previous file kept` })
      }
      const batch = Array.isArray(res.data) ? res.data : [res.data]
      items.push(...batch)
      if (page === 1) totalPages = res.totalPages
      if (totalPages !== null ? page >= totalPages : batch.length < PER_PAGE) break
      page++
    }
    writeJson(join(env.restDir, `${name}.json`), items)
    return record({ name, status: 'ok', count: items.length })
  } catch (err) {
    return record({ name, status: 'error', detail: err instanceof Error ? err.message : String(err) })
  }
}

/** Single-object endpoint (taxonomies, types, settings, menu-locations…) → rest/<name>.json. */
async function dumpObject(route: string, name: string): Promise<unknown> {
  try {
    const res = await restGet(route)
    if (res.status !== 200 || res.data === null) {
      record({ name, status: 'skipped', detail: `HTTP ${res.status}` })
      return undefined
    }
    writeJson(join(env.restDir, `${name}.json`), res.data)
    record({ name, status: 'ok', count: Array.isArray(res.data) ? res.data.length : Object.keys(res.data as object).length })
    return res.data
  } catch (err) {
    record({ name, status: 'error', detail: err instanceof Error ? err.message : String(err) })
    return undefined
  }
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined
}

// ── Discovery ────────────────────────────────────────────────────────────────

async function discoverRoot(): Promise<string[]> {
  for (const mode of ['pretty', 'rest_route'] as const) {
    restMode = mode
    try {
      const res = await restGet('')
      if (res.status === 200 && isRecord(res.data) && (res.data.namespaces || res.data.routes)) {
        writeJson(join(env.restDir, 'index.json'), res.data)
        const namespaces = Array.isArray(res.data.namespaces) ? res.data.namespaces.filter((n): n is string => typeof n === 'string') : []
        log(`REST index: ${mode === 'pretty' ? '/wp-json/' : '?rest_route=/'} · ${namespaces.length} namespaces`)
        return namespaces
      }
    } catch {
      // try next mode
    }
  }
  console.error(`✖ ${env.wpUrl} does not expose a WordPress REST API (/wp-json/ and ?rest_route=/ both failed)`)
  process.exit(1)
}

// ── Media binaries ───────────────────────────────────────────────────────────

/** `https://host/wp-content/uploads/2024/a.jpg` → `<files>/wp-content/uploads/2024/a.jpg` (null when unsafe). */
function mediaDest(sourceUrl: string): string | null {
  let pathname: string
  try {
    pathname = decodeURIComponent(new URL(sourceUrl).pathname)
  } catch {
    return null
  }
  const rel = pathname.replace(/^\/+/, '')
  if (!rel || rel.split('/').some((seg) => seg === '..')) return null
  const dest = resolve(env.filesDir, rel)
  return dest.startsWith(env.filesDir + sep) ? dest : null
}

async function downloadOne(url: string, dest: string): Promise<'new' | 'skip'> {
  if (existsSync(dest) && statSync(dest).size > 0) return 'skip'
  mkdirSync(dirname(dest), { recursive: true })
  let res = await fetchRetry(env, url, { timeoutMs: 120_000, retries: 3, auth: false })
  if ((res.status === 401 || res.status === 403) && env.authHeader) {
    await res.arrayBuffer().catch(() => undefined)
    res = await fetchRetry(env, url, { timeoutMs: 120_000, retries: 2, auth: true })
  }
  if (!res.ok || !res.body) {
    await res.arrayBuffer().catch(() => undefined)
    throw new Error(`HTTP ${res.status}`)
  }
  const contentType = res.headers.get('content-type') ?? ''
  if (contentType.includes('text/html') && !/\.html?$/i.test(dest)) {
    await res.arrayBuffer().catch(() => undefined)
    throw new Error('HTML response for a binary (soft 404 / login wall)')
  }
  const part = `${dest}.part`
  try {
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(part))
    renameSync(part, dest)
  } catch (err) {
    rmSync(part, { force: true })
    throw err
  }
  return 'new'
}

async function downloadMedia(): Promise<void> {
  const sources = new Map<string, string>() // dest → url
  for (const file of ['media', 'media-authed']) {
    const list = readJson<unknown[]>(join(env.restDir, `${file}.json`)) ?? []
    for (const item of list) {
      const url = isRecord(item) ? str(item.source_url) : undefined
      const dest = url ? mediaDest(url) : null
      if (url && dest && !sources.has(dest)) sources.set(dest, url)
    }
  }
  if (sources.size === 0) {
    log('Media binaries: no media records, nothing to download')
    return
  }
  log(`Media binaries: ${sources.size} files (concurrency ${CONCURRENCY})`)
  let fresh = 0
  let skipped = 0
  const failed: Array<{ url: string; error: string }> = []
  let done = 0
  await mapPool([...sources], CONCURRENCY, async ([dest, url]) => {
    try {
      if ((await downloadOne(url, dest)) === 'new') fresh++
      else skipped++
    } catch (err) {
      failed.push({ url, error: err instanceof Error ? err.message : String(err) })
    }
    if (++done % 100 === 0) log(`Media binaries: ${done}/${sources.size}`)
  })
  const failedFile = join(env.out, 'media', 'failed.json')
  if (failed.length > 0) {
    writeJson(failedFile, failed)
    console.error(`Media binaries: ${failed.length} failed -> ${failedFile} (re-run to retry)`)
    outcomes.push({ name: 'media-binaries', status: 'error', detail: `${failed.length} failed` })
  } else {
    rmSync(failedFile, { force: true })
  }
  log(`Media binaries: new=${fresh} existing=${skipped} failed=${failed.length}`)
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  mkdirSync(env.restDir, { recursive: true })
  log(`=== REST archive of ${env.wpUrl} -> ${env.out} (${env.authHeader ? 'authed' : 'anonymous'}) ===`)

  const namespaces = await discoverRoot()
  const hasNamespace = (ns: string) => namespaces.length === 0 || namespaces.includes(ns)
  const done = new Set<string>()
  const post = async (route: string, name?: string): Promise<void> => {
    const outcome = await dumpCollection(route, { embed: true, authedParams: { status: 'any' }, name })
    done.add(outcome.name)
  }

  await post('wp/v2/posts')
  await post('wp/v2/pages')
  for (const name of ['media', 'comments', 'categories', 'tags']) {
    done.add(name)
    await dumpCollection(`wp/v2/${name}`)
  }
  if (AUTHED_MEDIA) {
    done.add('media-authed')
    await dumpCollection('wp/v2/media', {
      name: 'media-authed',
      params: { context: 'edit' },
      authedParams: { status: 'any' },
    })
  }

  // Taxonomy / post type discovery
  const taxonomies = await dumpObject('wp/v2/taxonomies', 'taxonomies')
  const types = await dumpObject('wp/v2/types', 'types')
  done.add('taxonomies')
  done.add('types')

  const taxonomyRoutes = new Map<string, string>() // name → route
  const typeRoutes = new Map<string, string>()
  if (isRecord(taxonomies)) {
    for (const [slug, tx] of Object.entries(taxonomies)) {
      if (CORE_TAXONOMIES.has(slug) || !isRecord(tx)) continue
      const base = str(tx.rest_base) ?? slug
      taxonomyRoutes.set(base, `${str(tx.rest_namespace) ?? 'wp/v2'}/${base}`)
    }
  }
  if (isRecord(types)) {
    for (const [slug, ty] of Object.entries(types)) {
      if (CORE_POST_TYPES.has(slug) || !isRecord(ty)) continue
      const base = str(ty.rest_base) ?? slug
      typeRoutes.set(base, `${str(ty.rest_namespace) ?? 'wp/v2'}/${base}`)
    }
  }
  // WooCommerce + user-supplied extras (404 tolerated when absent)
  for (const base of ['product']) if (!typeRoutes.has(base)) typeRoutes.set(base, `wp/v2/${base}`)
  for (const base of ['product_cat', 'product_tag']) if (!taxonomyRoutes.has(base)) taxonomyRoutes.set(base, `wp/v2/${base}`)
  for (const base of (process.env.WP_POST_TYPES ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    if (!typeRoutes.has(base)) typeRoutes.set(base, `wp/v2/${base}`)
  }

  for (const [base, route] of taxonomyRoutes) {
    if (done.has(base) || RESERVED_NAMES.has(base)) continue
    done.add(base)
    await dumpCollection(route, { name: base })
  }
  for (const [base, route] of typeRoutes) {
    if (done.has(base) || RESERVED_NAMES.has(base)) continue
    await post(route, base)
  }

  // WooCommerce Store API — public prices / sku / gallery
  if (hasNamespace('wc/store/v1')) {
    done.add('wc-store-products')
    await dumpCollection('wc/store/v1/products', { name: 'wc-store-products' })
  }

  // Menus: core (WP >= 5.9, usually authed) and the WP-REST-API V2 Menus plugin
  for (const name of ['menus', 'menu-items']) {
    done.add(name)
    await dumpCollection(`wp/v2/${name}`)
  }
  done.add('menu-locations')
  await dumpObject('wp/v2/menu-locations', 'menu-locations')
  if (hasNamespace('wp-api-menus/v2')) {
    await dumpWpApiMenus()
  }

  if (env.authHeader) await dumpObject('wp/v2/settings', 'settings')
  else log('REST settings: skipped (needs WP_AUTH_USER / WP_AUTH_PASSWORD)')

  done.add('users')
  await dumpCollection('wp/v2/users') // best effort — 401/403 are normal

  if (NO_MEDIA) log('Media binaries: skipped (--no-media)')
  else await downloadMedia()

  const bad = outcomes.filter((o) => o.status === 'error')
  const okCount = outcomes.filter((o) => o.status === 'ok').length
  log(`=== REST archive finished: ${okCount} collections ok, ${outcomes.filter((o) => o.status === 'skipped').length} skipped, ${bad.length} errors ===`)
  if (bad.length > 0) {
    for (const o of bad) console.error(`  ✖ ${o.name}: ${o.detail}`)
    process.exit(1)
  }
}

/** WP-REST-API V2 Menus plugin: list + per-menu detail embedded as `detail`. */
async function dumpWpApiMenus(): Promise<void> {
  try {
    const list = await restGet('wp-api-menus/v2/menus')
    if (list.status !== 200 || !Array.isArray(list.data)) {
      record({ name: 'wp-api-menus', status: 'skipped', detail: `HTTP ${list.status}` })
      return
    }
    const menus: Json[] = []
    for (const m of list.data) {
      if (!isRecord(m)) continue
      const id = m.term_id ?? m.ID ?? m.id
      const detail = id !== undefined ? await restGet(`wp-api-menus/v2/menus/${String(id)}`) : undefined
      menus.push({ ...m, detail: detail?.status === 200 ? detail.data : null })
    }
    writeJson(join(env.restDir, 'wp-api-menus.json'), menus)
    record({ name: 'wp-api-menus', status: 'ok', count: menus.length })
    await dumpObject('wp-api-menus/v2/menu-locations', 'wp-api-menus-locations')
  } catch (err) {
    record({ name: 'wp-api-menus', status: 'error', detail: err instanceof Error ? err.message : String(err) })
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
