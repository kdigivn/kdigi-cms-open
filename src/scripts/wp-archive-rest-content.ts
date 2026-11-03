/**
 * wp-archive-rest-content.ts — turn the raw REST mirror into the unified raw snapshot.
 *
 * Reads $OUT/rest/*.json (written by `wp-archive-rest.ts`) and writes
 * $OUT/content/{posts,pages,products,terms,menus,site,comments}.json plus
 * content/<cpt>.json for every custom post type, in the shape documented in
 * src/importers/wp-migration/raw-wp-types.ts — the same shape `wp-archive-graphql.ts`
 * produces, so the normalizer never needs to know the transport.
 *
 * Network is only used (best effort, skippable) for
 *   - RankMath sites: GET /wp-json/rankmath/v1/getHead?url=<permalink> per item
 *     (throttled, cached in rest/rankmath-head.json, auto-disabled when the route is absent)
 *   - one fetch of the public home page for JSON-LD + GA4/GTM ids.
 *
 * Usage:
 *   WP_URL=https://wp.example.com OUT=wp-archive/<site>/raw \
 *     node --import tsx src/scripts/wp-archive-rest-content.ts [--no-network]
 *
 * Environment:  WP_URL, OUT (both required, see wp-archive-common.ts); WP_POST_TYPES (extra CPT REST bases).
 * Flags:        --no-network   skip getHead + home-page fetch (SEO then comes only from the REST fields)
 *
 * SEO mapping: Yoast `yoast_head_json` / `yoast_head` → source 'yoast'; RankMath `rank_math_*`
 * fields and/or `getHead` HTML → source 'rankmath'; neither → `{ source: 'none' }`.
 * Dates are kept exactly as WordPress returns them (site-local, no offset); the normalizer
 * applies WP_UTC_OFFSET.
 */
import { join } from 'path'
import { setTimeout as sleep } from 'timers/promises'
import type {
  RawComment,
  RawConnection,
  RawImage,
  RawMenu,
  RawMenuItem,
  RawPostBase,
  RawProduct,
  RawSeo,
  RawSite,
  RawTaxonomy,
  RawTerm,
  RawTermRef,
  RawTermsFile,
} from '../importers/wp-migration/raw-wp-types'
import {
  fetchHomeMeta,
  fetchRetry,
  isRecord,
  log,
  logTimezoneHint,
  mapPool,
  parseHead,
  parseJsonLoose,
  readArchiveEnv,
  readJson,
  writeJson,
  type Json,
} from './wp-archive-common'

const env = readArchiveEnv()
const NO_NETWORK = process.argv.includes('--no-network')

/** Taxonomies that carry no content meaning. */
const SKIP_TAXONOMIES = new Set(['nav_menu', 'link_category', 'wp_pattern_category', 'post_format'])
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
const RESERVED_CONTENT_FILES = new Set(['posts', 'pages', 'products', 'terms', 'menus', 'site', 'comments'])

// ── tiny value helpers ───────────────────────────────────────────────────────

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && /^\d+$/.test(v)) return Number(v)
  return null
}

function rendered(v: unknown): string {
  if (typeof v === 'string') return v
  return isRecord(v) && typeof v.rendered === 'string' ? v.rendered : ''
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

function recordsOf(v: unknown): Json[] {
  return arr(v).filter(isRecord)
}

function restFile<T = unknown>(name: string): T | undefined {
  return readJson<T>(join(env.restDir, `${name}.json`))
}

// ── SEO ──────────────────────────────────────────────────────────────────────

function seoFromYoast(j: Json, yoastHead: string | undefined): RawSeo {
  const robots = isRecord(j.robots)
    ? Object.values(j.robots)
        .map((v) => String(v).trim().toLowerCase())
        .filter(Boolean)
    : null
  const og0 = recordsOf(j.og_image)[0]
  return {
    source: 'yoast',
    title: str(j.title) ?? null,
    description: str(j.description) ?? null,
    canonicalUrl: str(j.canonical) ?? null,
    robots: robots && robots.length > 0 ? robots : null,
    fullHead: yoastHead ?? null,
    jsonLd: j.schema !== undefined ? { raw: JSON.stringify(j.schema) } : null,
    openGraph: {
      title: str(j.og_title) ?? null,
      description: str(j.og_description) ?? null,
      type: str(j.og_type) ?? null,
      url: str(j.og_url) ?? null,
      locale: str(j.og_locale) ?? null,
      siteName: str(j.og_site_name) ?? null,
      updatedTime: str(j.article_modified_time) ?? null,
      imageUrl: og0 ? (str(og0.url) ?? null) : null,
    },
  }
}

/** `rank_math_*` fields, top level or inside `meta`, when a plugin/snippet exposes them via REST. */
function rankMathFields(item: Json): Json | null {
  const found: Json = {}
  for (const source of [item, isRecord(item.meta) ? item.meta : {}]) {
    for (const [k, v] of Object.entries(source)) {
      if (k.startsWith('rank_math_') && v !== '' && v !== null && v !== undefined) found[k] = v
    }
  }
  return Object.keys(found).length > 0 ? found : null
}

function seoFromRankMath(fields: Json | null, head: string | null | undefined): RawSeo {
  const parsed = head ? parseHead(head) : {}
  const field = (k: string): string | undefined => {
    const v = fields?.[k]
    return typeof v === 'string' && v !== '' ? v : undefined
  }
  // Field values hold raw templates (`%title% %sep% %sitename%`) — only usable when variable-free.
  const literal = (k: string): string | undefined => {
    const v = field(k)
    return v && !v.includes('%') ? v : undefined
  }
  const robotsField = fields?.rank_math_robots
  const robotsFromField = (Array.isArray(robotsField) ? robotsField : typeof robotsField === 'string' ? robotsField.split(',') : [])
    .map((d) => String(d).trim().toLowerCase())
    .filter(Boolean)
  const focus = field('rank_math_focus_keyword')
    ?.split(',')
    .map((k) => k.trim())
    .filter(Boolean)
  return {
    ...parsed,
    source: 'rankmath',
    title: parsed.title ?? literal('rank_math_title') ?? null,
    description: parsed.description ?? literal('rank_math_description') ?? null,
    canonicalUrl: parsed.canonicalUrl ?? field('rank_math_canonical_url') ?? null,
    robots: parsed.robots ?? (robotsFromField.length > 0 ? robotsFromField : null),
    focusKeywords: focus && focus.length > 0 ? focus : null,
    breadcrumbTitle: field('rank_math_breadcrumb_title') ?? null,
    isPillarContent: fields?.rank_math_pillar_content !== undefined ? fields.rank_math_pillar_content === 'on' || fields.rank_math_pillar_content === true : null,
  }
}

// RankMath getHead (network, throttled, cached)
const headCachePath = join(env.restDir, 'rankmath-head.json')
const headCache: Record<string, string | null> = readJson<Record<string, string | null>>(headCachePath) ?? {}
let headDisabled = false
let nextHeadSlot = 0

async function throttle(ms: number): Promise<void> {
  const now = Date.now()
  const wait = Math.max(0, nextHeadSlot - now)
  nextHeadSlot = Math.max(now, nextHeadSlot) + ms
  if (wait > 0) await sleep(wait)
}

async function prefetchRankMathHeads(urls: string[]): Promise<void> {
  const todo = [...new Set(urls)].filter((u) => headCache[u] === undefined)
  if (todo.length === 0) return
  log(`RankMath getHead: ${todo.length} URLs (throttled)`)
  let misses = 0
  let done = 0
  await mapPool(todo, 3, async (url) => {
    if (headDisabled) return
    await throttle(120)
    try {
      const res = await fetchRetry(env, `${env.wpUrl}/wp-json/rankmath/v1/getHead?url=${encodeURIComponent(url)}`, {
        retries: 2,
        timeoutMs: 30_000,
        headers: { Accept: 'application/json' },
      })
      const text = await res.text()
      let body: unknown = null
      try {
        body = parseJsonLoose(text)
      } catch {
        // non-JSON error page
      }
      if (res.ok && isRecord(body) && typeof body.head === 'string' && body.head) {
        headCache[url] = body.head
        misses = 0
      } else if (isRecord(body) && body.code === 'rest_no_route') {
        headDisabled = true
        console.warn('[warn] RankMath getHead route not available — skipping head fetch')
      } else {
        headCache[url] = null
        if (res.status === 401 || res.status === 403 || res.status === 404) misses++
        if (misses >= 8) {
          headDisabled = true
          console.warn(`[warn] RankMath getHead keeps failing (HTTP ${res.status}) — skipping the rest`)
        }
      }
    } catch (err) {
      console.warn(`[warn] getHead ${url}: ${err instanceof Error ? err.message : String(err)}`)
    }
    if (++done % 100 === 0) writeJson(headCachePath, headCache)
  })
  writeJson(headCachePath, headCache)
}

function seoOf(item: Json, link: string | undefined): RawSeo {
  if (isRecord(item.yoast_head_json)) return seoFromYoast(item.yoast_head_json, str(item.yoast_head))
  const yoastHead = str(item.yoast_head)
  if (yoastHead) return { ...parseHead(yoastHead), source: 'yoast' }
  const fields = rankMathFields(item)
  const head = link ? headCache[link] : undefined
  if (fields || head) return seoFromRankMath(fields, head)
  return { source: 'none' }
}

// ── images / terms / authors ─────────────────────────────────────────────────

const mediaById = new Map<number, Json>()

function imageFromMedia(m: Json): RawImage | null {
  const sourceUrl = str(m.source_url)
  if (!sourceUrl) return null
  return {
    databaseId: num(m.id),
    sourceUrl,
    altText: str(m.alt_text) ?? null,
    title: rendered(m.title) || null,
  }
}

interface TaxonomyInfo {
  slug: string
  restBase: string
  label: string
  postTypes: string[]
  hierarchical: boolean
}
const taxonomies: TaxonomyInfo[] = []
/** taxonomy slug → term id → term */
const termIndex = new Map<string, Map<number, RawTerm>>()

function termRef(t: RawTerm): RawTermRef {
  return { databaseId: t.databaseId, name: t.name, slug: t.slug }
}

function termsOf(item: Json): Record<string, RawConnection<RawTermRef>> {
  const out: Record<string, RawConnection<RawTermRef>> = {}
  const add = (taxonomy: string, ref: RawTermRef) => {
    const conn = (out[taxonomy] ??= { nodes: [] })
    if (!conn.nodes.some((n) => n.databaseId === ref.databaseId)) conn.nodes.push(ref)
  }
  const embedded = isRecord(item._embedded) ? arr(item._embedded['wp:term']) : []
  for (const group of embedded) {
    for (const t of recordsOf(group)) {
      const taxonomy = str(t.taxonomy)
      const id = num(t.id)
      if (taxonomy && id !== null) add(taxonomy, { databaseId: id, name: str(t.name) ?? '', slug: str(t.slug) ?? '' })
    }
  }
  for (const tx of taxonomies) {
    for (const idRaw of arr(item[tx.restBase])) {
      const id = num(idRaw)
      const term = id !== null ? termIndex.get(tx.slug)?.get(id) : undefined
      if (term) add(tx.slug, termRef(term))
    }
  }
  return out
}

function authorOf(item: Json, users: Map<number, Json>): RawPostBase['author'] {
  const embedded = isRecord(item._embedded) ? recordsOf(item._embedded.author)[0] : undefined
  const id = num(item.author)
  const a = embedded && num(embedded.id) !== null ? embedded : id !== null ? users.get(id) : undefined
  if (!a || num(a.id) === null) return { node: null }
  return { node: { databaseId: num(a.id) as number, name: str(a.name) ?? '', slug: str(a.slug) ?? '' } }
}

function featuredOf(item: Json): RawImage | null {
  const embedded = isRecord(item._embedded) ? recordsOf(item._embedded['wp:featuredmedia'])[0] : undefined
  if (embedded && str(embedded.source_url)) return imageFromMedia(embedded)
  const id = num(item.featured_media)
  const m = id ? mediaById.get(id) : undefined
  return m ? imageFromMedia(m) : null
}

function translationsOf(item: Json): RawPostBase['translations'] | undefined {
  const out: NonNullable<RawPostBase['translations']> = []
  // Polylang: { en: 12, vi: 13 }
  if (isRecord(item.translations)) {
    for (const [lang, id] of Object.entries(item.translations)) {
      const databaseId = num(id)
      if (databaseId !== null) out.push({ databaseId, lang })
    }
  }
  // WPML REST plugin: [{ id, locale, slug, … }]
  for (const t of recordsOf(item.wpml_translations)) {
    const databaseId = num(t.id)
    const lang = str(t.locale) ?? str(t.language_code)
    if (databaseId !== null && lang) out.push({ databaseId, lang, slug: str(t.slug) })
  }
  return out.length > 0 ? out : undefined
}

function mapPost(item: Json, users: Map<number, Json>): RawPostBase | null {
  const databaseId = num(item.id)
  if (databaseId === null) return null
  const link = str(item.link)
  const terms = termsOf(item)
  const parent = num(item.parent)
  return {
    databaseId,
    title: rendered(item.title),
    slug: str(item.slug) ?? '',
    content: rendered(item.content),
    excerpt: rendered(item.excerpt) || null,
    date: str(item.date) ?? null,
    modified: str(item.modified) ?? null,
    status: str(item.status) ?? null,
    link: link ?? null,
    featuredImage: { node: featuredOf(item) },
    author: authorOf(item, users),
    ...(Object.keys(terms).length > 0 ? { terms } : {}),
    seo: seoOf(item, link),
    lang: str(item.lang) ?? str(item.wpml_current_locale) ?? null,
    parentDatabaseId: parent && parent > 0 ? parent : null,
    menuOrder: num(item.menu_order),
    translations: translationsOf(item),
  }
}

// ── WooCommerce ──────────────────────────────────────────────────────────────

/** Store API prices are integer strings in minor units ("1999", unit 2 → "19.99"). */
function minorToDecimal(value: unknown, unit: number): string | null {
  const s = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : ''
  if (!/^-?\d+$/.test(s)) return null
  if (unit <= 0) return s
  const neg = s.startsWith('-')
  const digits = (neg ? s.slice(1) : s).padStart(unit + 1, '0')
  return `${neg ? '-' : ''}${digits.slice(0, -unit)}.${digits.slice(-unit)}`
}

function decimalString(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

function priceOf(store: Json | undefined, rest: Json | undefined): RawProduct['price'] {
  const prices = store && isRecord(store.prices) ? store.prices : rest && isRecord(rest.prices) ? rest.prices : undefined
  if (prices) {
    const unit = num(prices.currency_minor_unit) ?? 2
    const regular = minorToDecimal(prices.regular_price ?? prices.price, unit)
    const onSale = store?.on_sale === true || (rest?.on_sale === true)
    const sale = onSale ? minorToDecimal(prices.sale_price, unit) : null
    return { regular, sale, currency: str(prices.currency_code) ?? null }
  }
  if (rest) {
    const regular = decimalString(rest.regular_price) ?? decimalString(rest.price)
    const sale = decimalString(rest.sale_price)
    if (regular || sale) return { regular, sale, currency: str(rest.currency) ?? str(rest.currency_code) ?? null }
  }
  return null
}

function mapProduct(rest: Json | undefined, store: Json | undefined, users: Map<number, Json>): RawProduct | null {
  const base = rest ? mapPost(rest, users) : undefined
  const storeId = store ? num(store.id) : null
  const gallery: RawImage[] = []
  for (const img of recordsOf(store?.images)) {
    const sourceUrl = str(img.src)
    if (sourceUrl) gallery.push({ databaseId: num(img.id), sourceUrl, altText: str(img.alt) ?? null, title: str(img.name) ?? null })
  }
  let product: RawProduct
  if (base) {
    product = { ...base }
    if (!product.featuredImage?.node && gallery[0]) product.featuredImage = { node: gallery[0] }
  } else if (store && storeId !== null) {
    const terms: Record<string, RawConnection<RawTermRef>> = {}
    for (const [key, taxonomy] of [
      ['categories', 'product_cat'],
      ['tags', 'product_tag'],
    ] as const) {
      const nodes = recordsOf(store[key])
        .map((t) => ({ databaseId: num(t.id), name: str(t.name) ?? '', slug: str(t.slug) ?? '' }))
        .filter((t): t is RawTermRef => t.databaseId !== null)
      if (nodes.length > 0) terms[taxonomy] = { nodes }
    }
    product = {
      databaseId: storeId,
      title: str(store.name) ?? '',
      slug: str(store.slug) ?? '',
      content: str(store.description) ?? '',
      excerpt: str(store.short_description) ?? null,
      status: 'publish', // the Store API only lists published products
      link: str(store.permalink) ?? null,
      featuredImage: { node: gallery[0] ?? null },
      author: { node: null },
      ...(Object.keys(terms).length > 0 ? { terms } : {}),
      seo: { source: 'none' },
    }
  } else {
    return null
  }
  const price = priceOf(store, rest)
  if (price) product.price = price
  const sku = str(store?.sku) ?? str(rest?.sku)
  if (sku) product.sku = sku
  if (gallery.length > 0) product.gallery = gallery
  return product
}

// ── menus ────────────────────────────────────────────────────────────────────

function pathOf(url: string | null | undefined, hosts: Set<string>): string | null {
  if (!url) return null
  if (url.startsWith('/')) return url
  try {
    const u = new URL(url)
    return hosts.has(u.host) ? `${u.pathname}${u.search}${u.hash}` : null
  } catch {
    return null
  }
}

function buildMenus(hosts: Set<string>): RawMenu[] {
  const coreMenus = restFile<unknown[]>('menus')
  const coreItems = restFile<unknown[]>('menu-items')
  if (coreMenus && coreItems && coreMenus.length > 0) {
    const locations = restFile<unknown>('menu-locations')
    const locByMenu = new Map<number, string[]>()
    if (isRecord(locations)) {
      for (const [slug, loc] of Object.entries(locations)) {
        const menuId = isRecord(loc) ? num(loc.menu) : null
        if (menuId) locByMenu.set(menuId, [...(locByMenu.get(menuId) ?? []), slug])
      }
    }
    const menus: RawMenu[] = []
    for (const m of recordsOf(coreMenus)) {
      const id = num(m.id)
      if (id === null) continue
      const items: RawMenuItem[] = []
      for (const it of recordsOf(coreItems)) {
        const menuRef = Array.isArray(it.menus) ? num(it.menus[0]) : num(it.menus)
        const itemId = num(it.id)
        if (menuRef !== id || itemId === null) continue
        const url = str(it.url)
        items.push({
          databaseId: itemId,
          parentDatabaseId: num(it.parent) || null,
          label: rendered(it.title),
          url: url ?? null,
          path: pathOf(url, hosts),
          order: num(it.menu_order),
        })
      }
      const locs = new Set<string>([...arr(m.locations).filter((l): l is string => typeof l === 'string'), ...(locByMenu.get(id) ?? [])])
      menus.push({ databaseId: id, name: str(m.name) ?? str(m.slug) ?? `menu-${id}`, locations: [...locs], items })
    }
    return menus
  }

  const plugin = restFile<unknown[]>('wp-api-menus')
  if (plugin && plugin.length > 0) {
    const locations = restFile<unknown>('wp-api-menus-locations')
    const locByMenu = new Map<number, string[]>()
    if (isRecord(locations)) {
      for (const [slug, loc] of Object.entries(locations)) {
        const menuId = isRecord(loc) ? (num(loc.ID) ?? num(loc.term_id) ?? num(loc.id)) : null
        if (menuId) locByMenu.set(menuId, [...(locByMenu.get(menuId) ?? []), slug])
      }
    }
    const menus: RawMenu[] = []
    for (const m of recordsOf(plugin)) {
      const id = num(m.term_id) ?? num(m.ID) ?? num(m.id)
      if (id === null) continue
      const detail = isRecord(m.detail) ? m.detail : {}
      const seen = new Set<number>()
      const items: RawMenuItem[] = []
      const walk = (list: unknown) => {
        for (const it of recordsOf(list)) {
          const itemId = num(it.id) ?? num(it.ID)
          if (itemId !== null && !seen.has(itemId)) {
            seen.add(itemId)
            const url = str(it.url)
            items.push({
              databaseId: itemId,
              parentDatabaseId: num(it.parent) || null,
              label: str(it.title) ?? '',
              url: url ?? null,
              path: pathOf(url, hosts),
              order: num(it.order) ?? num(it.menu_order),
            })
          }
          walk(it.children)
        }
      }
      walk(detail.items)
      menus.push({ databaseId: id, name: str(m.name) ?? str(detail.name) ?? `menu-${id}`, locations: locByMenu.get(id) ?? [], items })
    }
    return menus
  }

  console.warn(
    '[warn] no menus in the REST mirror (core /wp/v2/menus needs auth; no WP-REST-API V2 Menus plugin). ' +
      'Re-run wp-archive-rest.ts with WP_AUTH_USER/WP_AUTH_PASSWORD, archive via GraphQL (wp-archive-graphql.ts), or recreate menus manually.',
  )
  return []
}

// ── site ─────────────────────────────────────────────────────────────────────

async function buildSite(
  index: Json | undefined,
  detectedSeo: NonNullable<RawSite['seoPlugin']>,
  multilingual: NonNullable<RawSite['multilingual']>,
  sampleLocale: string | undefined,
): Promise<RawSite> {
  const settings = restFile<unknown>('settings')
  const namespaces = arr(index?.namespaces).filter((n): n is string => typeof n === 'string')
  const home = str(index?.home) ?? str(index?.url) ?? env.wpUrl

  const logoId = num(isRecord(settings) ? settings.site_logo : undefined) ?? num(index?.site_logo)
  const iconId = num(isRecord(settings) ? settings.site_icon : undefined) ?? num(index?.site_icon)
  const logoMedia = logoId ? mediaById.get(logoId) : undefined
  const iconMedia = iconId ? mediaById.get(iconId) : undefined
  const iconUrl = str(index?.site_icon_url)

  const homeMeta = NO_NETWORK ? undefined : await fetchHomeMeta(env, home)
  const language = (isRecord(settings) ? str(settings.language) : undefined) ?? sampleLocale ?? homeMeta?.language
  const homepageJsonLd = homeMeta?.homepageJsonLd ?? null
  const ga4Id = homeMeta?.ga4Id ?? null
  const gtmId = homeMeta?.gtmId ?? null
  logTimezoneHint(index)

  return {
    name: str(index?.name) ?? null,
    description: str(index?.description) ?? null,
    url: home,
    language: language?.replace('_', '-') ?? null,
    logo: logoMedia ? imageFromMedia(logoMedia) : null,
    favicon: iconMedia ? imageFromMedia(iconMedia) : iconUrl ? { sourceUrl: iconUrl } : null,
    homepageJsonLd,
    seoPlugin: detectedSeo,
    multilingual,
    namespaces,
    ga4Id,
    gtmId,
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

function mapTerm(t: Json): RawTerm | null {
  const databaseId = num(t.id)
  if (databaseId === null) return null
  const link = str(t.link)
  return {
    databaseId,
    name: str(t.name) ?? '',
    slug: str(t.slug) ?? '',
    description: str(t.description) ?? null,
    parentDatabaseId: num(t.parent) || null,
    count: num(t.count),
    seo: seoOf(t, link),
    lang: str(t.lang) ?? null,
  }
}

async function main(): Promise<void> {
  log(`=== REST content snapshot: ${env.restDir} -> ${env.contentDir} ===`)
  const index = restFile<unknown>('index')
  const indexRec = isRecord(index) ? index : undefined
  const namespaces = arr(indexRec?.namespaces).filter((n): n is string => typeof n === 'string')
  if (!indexRec) console.warn('[warn] rest/index.json missing — run wp-archive-rest.ts first; site detection will be limited')

  // media index (authed capture is a superset: it wins)
  for (const file of ['media', 'media-authed']) {
    for (const m of recordsOf(restFile<unknown[]>(file))) {
      const id = num(m.id)
      if (id !== null) mediaById.set(id, m)
    }
  }
  const users = new Map<number, Json>()
  for (const u of recordsOf(restFile<unknown[]>('users'))) {
    const id = num(u.id)
    if (id !== null) users.set(id, u)
  }

  // taxonomies
  const taxonomiesObj = restFile<unknown>('taxonomies')
  if (isRecord(taxonomiesObj)) {
    for (const [slug, tx] of Object.entries(taxonomiesObj)) {
      if (SKIP_TAXONOMIES.has(slug) || !isRecord(tx)) continue
      taxonomies.push({
        slug,
        restBase: str(tx.rest_base) ?? slug,
        label: str(tx.name) ?? slug,
        postTypes: arr(tx.types).filter((t): t is string => typeof t === 'string'),
        hierarchical: tx.hierarchical === true,
      })
    }
  } else {
    // /wp/v2/taxonomies unavailable: fall back to the files we know about
    for (const [slug, restBase, label] of [
      ['category', 'categories', 'Categories'],
      ['post_tag', 'tags', 'Tags'],
      ['product_cat', 'product_cat', 'Product categories'],
      ['product_tag', 'product_tag', 'Product tags'],
    ] as const) {
      if (restFile(restBase)) taxonomies.push({ slug, restBase, label, postTypes: [], hierarchical: slug.endsWith('_cat') || slug === 'category' })
    }
  }

  // post types (custom)
  const typesObj = restFile<unknown>('types')
  const customTypes = new Map<string, string>() // content file slug → rest base
  if (isRecord(typesObj)) {
    for (const [slug, ty] of Object.entries(typesObj)) {
      if (CORE_POST_TYPES.has(slug) || slug === 'product' || !isRecord(ty)) continue
      customTypes.set(slug, str(ty.rest_base) ?? slug)
    }
  }
  for (const base of (process.env.WP_POST_TYPES ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    if (base !== 'product' && ![...customTypes.values()].includes(base)) customTypes.set(base, base)
  }
  const productBase = isRecord(typesObj) && isRecord(typesObj.product) ? (str(typesObj.product.rest_base) ?? 'product') : 'product'

  // load raw items
  const rawPosts = restFile<unknown[]>('posts')
  const rawPages = restFile<unknown[]>('pages')
  const rawProducts = restFile<unknown[]>(productBase)
  const rawStore = restFile<unknown[]>('wc-store-products')
  const rawCpts = new Map<string, Json[]>()
  for (const [slug, base] of customTypes) {
    if (RESERVED_CONTENT_FILES.has(slug)) {
      console.warn(`[warn] custom post type "${slug}" collides with a reserved snapshot file name — skipped`)
      continue
    }
    const list = restFile<unknown[]>(base)
    if (list) rawCpts.set(slug, recordsOf(list))
  }

  // terms
  const termFiles = new Map<string, Json[]>()
  for (const tx of taxonomies) {
    const list = restFile<unknown[]>(tx.restBase)
    if (list) termFiles.set(tx.slug, recordsOf(list))
  }

  // SEO plugin detection (data first, namespaces second)
  const sample = [...recordsOf(rawPosts), ...recordsOf(rawPages), ...recordsOf(rawProducts)]
  const hasYoastData = sample.some((i) => isRecord(i.yoast_head_json) || typeof i.yoast_head === 'string')
  const hasRankMathData = sample.some((i) => rankMathFields(i) !== null)
  const seoPlugin: NonNullable<RawSite['seoPlugin']> = hasYoastData
    ? 'yoast'
    : hasRankMathData || namespaces.includes('rankmath/v1')
      ? 'rankmath'
      : namespaces.includes('yoast/v1')
        ? 'yoast'
        : 'none'
  const multilingual: NonNullable<RawSite['multilingual']> =
    namespaces.includes('pll/v1') || sample.some((i) => typeof i.lang === 'string')
      ? 'polylang'
      : namespaces.some((n) => n.startsWith('wpml')) || sample.some((i) => typeof i.wpml_current_locale === 'string')
        ? 'wpml'
        : 'none'
  log(`Detected: seo=${seoPlugin} multilingual=${multilingual}`)

  // RankMath: fetch rendered heads before mapping
  if (seoPlugin === 'rankmath' && !NO_NETWORK && namespaces.includes('rankmath/v1')) {
    const urls: string[] = []
    const collect = (list: Json[] | undefined) => {
      for (const i of list ?? []) {
        const link = str(i.link)
        if (link && !isRecord(i.yoast_head_json)) urls.push(link)
      }
    }
    collect(recordsOf(rawPosts))
    collect(recordsOf(rawPages))
    collect(recordsOf(rawProducts))
    for (const list of rawCpts.values()) collect(list)
    for (const list of termFiles.values()) collect(list)
    await prefetchRankMathHeads(urls)
  }

  // terms.json (also fills termIndex for post term lookup)
  const termsFile: RawTermsFile = { taxonomies: {} }
  for (const tx of taxonomies) {
    const list = termFiles.get(tx.slug)
    if (!list) continue
    const index = new Map<number, RawTerm>()
    const terms: RawTerm[] = []
    for (const raw of list) {
      const term = mapTerm(raw)
      if (term) {
        terms.push(term)
        index.set(term.databaseId, term)
      }
    }
    termIndex.set(tx.slug, index)
    const entry: RawTaxonomy = { label: tx.label, postTypes: tx.postTypes, hierarchical: tx.hierarchical, terms }
    termsFile.taxonomies[tx.slug] = entry
  }

  const mapAll = (list: unknown[] | undefined): RawPostBase[] =>
    recordsOf(list)
      .map((i) => mapPost(i, users))
      .filter((p): p is RawPostBase => p !== null)

  const idType = new Map<number, string>()
  const noteTypes = (list: unknown[] | undefined) => {
    for (const i of recordsOf(list)) {
      const id = num(i.id)
      if (id !== null) idType.set(id, str(i.type) ?? 'post')
    }
  }
  for (const list of [rawPosts, rawPages, rawProducts]) noteTypes(list)
  for (const list of rawCpts.values()) noteTypes(list)

  // write
  writeJson(join(env.contentDir, 'terms.json'), termsFile)
  const termCount = Object.values(termsFile.taxonomies).reduce((n, t) => n + t.terms.length, 0)
  log(`terms.json: ${Object.keys(termsFile.taxonomies).length} taxonomies, ${termCount} terms`)

  if (rawPosts) {
    const posts = mapAll(rawPosts)
    writeJson(join(env.contentDir, 'posts.json'), posts)
    log(`posts.json: ${posts.length}`)
  } else console.warn('[warn] rest/posts.json missing — posts.json not written')
  if (rawPages) {
    const pages = mapAll(rawPages)
    writeJson(join(env.contentDir, 'pages.json'), pages)
    log(`pages.json: ${pages.length}`)
  } else console.warn('[warn] rest/pages.json missing — pages.json not written')

  const products: RawProduct[] = []
  const storeById = new Map<number, Json>()
  for (const s of recordsOf(rawStore)) {
    const id = num(s.id)
    if (id !== null) storeById.set(id, s)
  }
  const usedStore = new Set<number>()
  for (const r of recordsOf(rawProducts)) {
    const id = num(r.id)
    const store = id !== null ? storeById.get(id) : undefined
    if (id !== null && store) usedStore.add(id)
    const p = mapProduct(r, store, users)
    if (p) products.push(p)
  }
  for (const [id, store] of storeById) {
    if (usedStore.has(id)) continue
    const p = mapProduct(undefined, store, users)
    if (p) {
      products.push(p)
      idType.set(id, 'product')
    }
  }
  writeJson(join(env.contentDir, 'products.json'), products)
  log(`products.json: ${products.length}${rawProducts || rawStore ? '' : ' (no WooCommerce data in the mirror)'}`)

  for (const [slug, list] of rawCpts) {
    const items = mapAll(list)
    writeJson(join(env.contentDir, `${slug}.json`), items)
    log(`${slug}.json: ${items.length}`)
  }

  const rawComments = restFile<unknown[]>('comments')
  if (rawComments) {
    const comments: RawComment[] = []
    for (const c of recordsOf(rawComments)) {
      const databaseId = num(c.id)
      const postDatabaseId = num(c.post)
      if (databaseId === null || postDatabaseId === null) continue
      if (str(c.type) && c.type !== 'comment') continue // pingbacks / trackbacks
      comments.push({
        databaseId,
        postDatabaseId,
        postType: idType.get(postDatabaseId) ?? null,
        parentDatabaseId: num(c.parent) || null,
        authorName: str(c.author_name) ?? '',
        authorEmail: str(c.author_email) ?? null,
        content: rendered(c.content),
        date: str(c.date) ?? null,
        status: str(c.status) ?? 'approved',
      })
    }
    writeJson(join(env.contentDir, 'comments.json'), comments)
    log(`comments.json: ${comments.length}`)
  }

  const hosts = new Set<string>([new URL(env.wpUrl).host])
  const homeUrl = str(indexRec?.home) ?? str(indexRec?.url)
  if (homeUrl) hosts.add(new URL(homeUrl).host)
  const menus = buildMenus(hosts)
  writeJson(join(env.contentDir, 'menus.json'), menus)
  log(`menus.json: ${menus.length} menus`)

  const sampleLocale = sample.map((i) => (isRecord(i.yoast_head_json) ? str(i.yoast_head_json.og_locale) : undefined)).find(Boolean)
  const site = await buildSite(indexRec, seoPlugin, multilingual, sampleLocale)
  writeJson(join(env.contentDir, 'site.json'), site)
  log(`site.json: ${site.name ?? '(unnamed)'} · ${site.url}`)
  log('=== REST content snapshot complete ===')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
