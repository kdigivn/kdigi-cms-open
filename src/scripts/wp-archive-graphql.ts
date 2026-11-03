/**
 * wp-archive-graphql.ts — generic WPGraphQL archiver (any WordPress with WPGraphQL).
 *
 * Writes the unified raw snapshot $OUT/content/ (shape: src/importers/wp-migration/raw-wp-types.ts),
 * identical to what `wp-archive-rest-content.ts` produces from the REST mirror:
 *   posts.json, pages.json, products.json (WooGraphQL, `[]` when absent), <cpt>.json for every
 *   other public content type, terms.json (every taxonomy exposed by WPGraphQL), menus.json (flat),
 *   site.json, comments.json.
 *
 * Everything is driven by schema introspection, so nothing here is site-specific:
 *   - SEO fields come from whichever plugin the schema exposes (WPGraphQL RankMath `seo { title
 *     description canonicalUrl focusKeywords robots fullHead openGraph jsonLd … }` or
 *     wp-graphql-yoast-seo `seo { title metaDesc canonical metaRobots* opengraph* schema fullHead focuskw … }`)
 *     and are mapped to one `RawSeo`; no plugin → `{ source: 'none' }`.
 *   - taxonomies / custom post types / Polylang-WPML `language` fields are queried only when present.
 *   - authors come from post `author` nodes — the `users` root is never queried (user-enumeration
 *     lockouts on hardened sites).
 * Tolerance: PHP notices before the JSON body are stripped, a 403 on POST falls back to GET (WAF),
 * GraphQL `errors` next to partial `data` are logged and the partial data is kept, and a page that
 * fails is retried with a smaller page size.
 *
 * Usage:
 *   WP_URL=https://wp.example.com OUT=wp-archive/<site>/raw \
 *     [WP_GRAPHQL_URL=https://wp.example.com/graphql] [WP_AUTH_USER=… WP_AUTH_PASSWORD=…] \
 *     node --import tsx src/scripts/wp-archive-graphql.ts [--probe] [--content] [--terms] [--menus] [--site] [--comments]
 *
 * Flags (no flag = everything):
 *   --probe      exit 0 if the endpoint answers `{ __typename }`, exit 3 otherwise; writes nothing
 *   --content    posts / pages / products / custom post types
 *   --terms      terms.json    --menus  menus.json    --site  site.json    --comments  comments.json
 *   Exit codes: 0 ok · 1 failure · 2 bad configuration · 3 no usable GraphQL endpoint (fall back to the REST pair)
 */
import { join } from 'path'
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
  fetchRestIndex,
  fetchRetry,
  isRecord,
  log,
  logTimezoneHint,
  parseJsonLoose,
  readArchiveEnv,
  writeJson,
  type Json,
} from './wp-archive-common'

const env = readArchiveEnv()
const argv = process.argv.slice(2)
const PROBE = argv.includes('--probe')
const SECTIONS = ['content', 'terms', 'menus', 'site', 'comments'].filter((s) => argv.includes(`--${s}`))
const want = (section: string): boolean => SECTIONS.length === 0 || SECTIONS.includes(section)
const PAGE_SIZE = 50

// ── transport ────────────────────────────────────────────────────────────────

const warned = new Set<string>()
function warnOnce(message: string): void {
  if (warned.has(message)) return
  warned.add(message)
  console.warn(`[gql-warn] ${message}`)
}

async function gql(query: string, variables: Record<string, unknown> = {}): Promise<Json> {
  let res = await fetchRetry(env, env.graphqlUrl, {
    method: 'POST',
    retries: 2,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  // WAF / LiteSpeed rules sometimes reject POST with 403 — GraphQL over GET is spec-compliant.
  if (res.status === 403 || res.status === 405 || res.status === 406) {
    await res.arrayBuffer().catch(() => undefined)
    const url = new URL(env.graphqlUrl)
    url.searchParams.set('query', query)
    if (Object.keys(variables).length > 0) url.searchParams.set('variables', JSON.stringify(variables))
    res = await fetchRetry(env, url.toString(), { headers: { Accept: 'application/json' }, retries: 2 })
  }
  const text = await res.text()
  let parsed: unknown
  try {
    parsed = parseJsonLoose(text)
  } catch {
    throw new Error(`HTTP ${res.status}: response is not JSON`)
  }
  if (!isRecord(parsed)) throw new Error(`HTTP ${res.status}: unexpected GraphQL response`)
  const errors = Array.isArray(parsed.errors) ? parsed.errors.map((e) => (isRecord(e) ? String(e.message) : String(e))) : []
  // Partial data beats total failure: log, keep going.
  for (const message of errors) warnOnce(message)
  if (!isRecord(parsed.data)) {
    throw new Error(`HTTP ${res.status}: GraphQL returned no data${errors.length ? `: ${errors.join('; ')}` : ''}`)
  }
  return parsed.data
}

async function probe(): Promise<boolean> {
  try {
    const data = await gql('{ __typename }')
    return typeof data.__typename === 'string'
  } catch (err) {
    console.error(`[probe] ${env.graphqlUrl}: ${err instanceof Error ? err.message : String(err)}`)
    return false
  }
}

// ── schema introspection + selection builder ─────────────────────────────────

interface TypeInfo {
  kind: string
  fields: Map<string, string>
  possible: string[]
}
interface Schema {
  types: Map<string, TypeInfo>
  queryType: string
}
let schema: Schema | null = null

/** Fields assumed to exist when introspection is disabled (core WPGraphQL contract). */
const CORE_FIELDS = new Set([
  'databaseId', 'title', 'slug', 'content', 'excerpt', 'date', 'modified', 'status', 'link', 'parentDatabaseId',
  'featuredImage', 'author', 'categories', 'tags', 'nodes', 'sourceUrl', 'altText', 'name', 'description', 'count',
])

const TYPE_REF = 'name kind ofType { name kind ofType { name kind ofType { name kind ofType { name kind } } } }'
type TypeRef = { name?: string | null; ofType?: TypeRef | null }

function namedType(ref: TypeRef | null | undefined): string {
  let cur = ref
  while (cur) {
    if (cur.name) return cur.name
    cur = cur.ofType
  }
  return ''
}

async function introspect(): Promise<void> {
  try {
    const data = await gql(
      `{ __schema { queryType { name } types { name kind fields { name type { ${TYPE_REF} } } possibleTypes { name } } } }`,
    )
    const raw = data.__schema
    if (!isRecord(raw) || !Array.isArray(raw.types)) throw new Error('empty introspection result')
    const types = new Map<string, TypeInfo>()
    for (const t of raw.types) {
      if (!isRecord(t) || typeof t.name !== 'string') continue
      const fields = new Map<string, string>()
      for (const f of Array.isArray(t.fields) ? t.fields : []) {
        if (isRecord(f) && typeof f.name === 'string') fields.set(f.name, namedType(f.type as TypeRef))
      }
      const possible = (Array.isArray(t.possibleTypes) ? t.possibleTypes : []).flatMap((p) =>
        isRecord(p) && typeof p.name === 'string' ? [p.name] : [],
      )
      types.set(t.name, { kind: String(t.kind), fields, possible })
    }
    const queryType = isRecord(raw.queryType) && typeof raw.queryType.name === 'string' ? raw.queryType.name : 'RootQuery'
    schema = { types, queryType }
    log(`Introspection: ${types.size} types`)
  } catch (err) {
    schema = null
    console.warn(
      `[warn] introspection unavailable (${err instanceof Error ? err.message : String(err)}) — archiving core fields only ` +
        '(no SEO, custom taxonomies, products). Enable introspection or use wp-archive-rest.ts + wp-archive-rest-content.ts for the full set.',
    )
  }
}

function hasField(typeName: string | undefined, field: string): boolean {
  if (!schema) return CORE_FIELDS.has(field)
  return typeName ? (schema.types.get(typeName)?.fields.has(field) ?? false) : false
}

function fieldType(typeName: string | undefined, field: string): string | undefined {
  return schema && typeName ? schema.types.get(typeName)?.fields.get(field) : undefined
}

function rootHas(field: string): boolean {
  return schema ? hasField(schema.queryType, field) : false
}

/** Node type of a root connection (`posts` → `Post`). */
function rootNodeType(rootField: string): string | undefined {
  if (!schema) return undefined
  return fieldType(fieldType(schema.queryType, rootField), 'nodes')
}

type Spec =
  | string
  | { field: string; args?: string; alias?: string; sub?: Spec[] }
  | { on: string; sub: Spec[] }

/** Build a selection set containing only the fields the schema actually has. */
function select(typeName: string | undefined, spec: Spec[]): string {
  const parts: string[] = []
  for (const item of spec) {
    if (typeof item === 'string') {
      if (hasField(typeName, item)) parts.push(item)
      continue
    }
    if ('on' in item) {
      if (!schema?.types.has(item.on)) continue
      const inner = select(item.on, item.sub)
      if (inner) parts.push(`... on ${item.on} { ${inner} }`)
      continue
    }
    if (!hasField(typeName, item.field)) continue
    const head = `${item.alias ? `${item.alias}: ` : ''}${item.field}${item.args ?? ''}`
    if (!item.sub) {
      parts.push(head)
      continue
    }
    const inner = select(fieldType(typeName, item.field), item.sub)
    if (inner) parts.push(`${head} { ${inner} }`)
  }
  return parts.join(' ')
}

const IMAGE: Spec[] = ['databaseId', 'sourceUrl', 'altText', 'title']
const nodes = (sub: Spec[], args = ''): Spec => ({ field: 'nodes', args, sub })

/** Union of RankMath + Yoast SEO leaves; `select` drops whatever the plugin lacks. */
const SEO_SPEC: Spec[] = [
  'title', 'description', 'breadcrumbTitle', 'canonicalUrl', 'focusKeywords', 'robots', 'isPillarContent', 'fullHead',
  { field: 'openGraph', sub: ['title', 'description', 'type', 'url', 'locale', 'siteName', 'updatedTime'] },
  { field: 'jsonLd', sub: ['raw'] },
  'metaDesc', 'canonical', 'metaRobotsNoindex', 'metaRobotsNofollow', 'focuskw',
  'opengraphTitle', 'opengraphDescription', 'opengraphType', 'opengraphUrl', 'opengraphSiteName', 'opengraphModifiedTime',
  { field: 'opengraphImage', sub: ['sourceUrl'] },
  { field: 'schema', sub: ['raw'] },
  { field: 'breadcrumbs', sub: ['text'] },
]

const LANGUAGE_SPEC: Spec[] = [
  { field: 'language', sub: ['code'] },
  { field: 'translations', sub: ['databaseId', 'slug', { field: 'language', sub: ['code'] }] },
]

function mapSeo(raw: unknown): RawSeo {
  if (!isRecord(raw)) return { source: 'none' }
  const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
  if ('metaDesc' in raw || 'metaRobotsNoindex' in raw || 'opengraphTitle' in raw) {
    const crumbs = Array.isArray(raw.breadcrumbs) ? raw.breadcrumbs.filter(isRecord) : []
    const focus = str(raw.focuskw)
    return {
      source: 'yoast',
      title: str(raw.title),
      description: str(raw.metaDesc),
      breadcrumbTitle: crumbs.length > 0 ? str(crumbs[crumbs.length - 1].text) : null,
      canonicalUrl: str(raw.canonical),
      focusKeywords: focus ? [focus] : null,
      robots: [str(raw.metaRobotsNoindex) ?? 'index', str(raw.metaRobotsNofollow) ?? 'follow'].map((d) => d.toLowerCase()),
      fullHead: str(raw.fullHead),
      jsonLd: isRecord(raw.schema) ? { raw: str(raw.schema.raw) } : null,
      openGraph: {
        title: str(raw.opengraphTitle),
        description: str(raw.opengraphDescription),
        type: str(raw.opengraphType),
        url: str(raw.opengraphUrl),
        siteName: str(raw.opengraphSiteName),
        updatedTime: str(raw.opengraphModifiedTime),
        imageUrl: isRecord(raw.opengraphImage) ? str(raw.opengraphImage.sourceUrl) : null,
      },
    }
  }
  if ('canonicalUrl' in raw || 'focusKeywords' in raw || 'openGraph' in raw || 'breadcrumbTitle' in raw) {
    const og = isRecord(raw.openGraph) ? raw.openGraph : null
    return {
      source: 'rankmath',
      title: str(raw.title),
      description: str(raw.description),
      breadcrumbTitle: str(raw.breadcrumbTitle),
      canonicalUrl: str(raw.canonicalUrl),
      focusKeywords: Array.isArray(raw.focusKeywords) ? raw.focusKeywords.filter((k): k is string => typeof k === 'string' && k !== '') : null,
      robots: Array.isArray(raw.robots) ? raw.robots.map((d) => String(d).toLowerCase()) : null,
      isPillarContent: typeof raw.isPillarContent === 'boolean' ? raw.isPillarContent : null,
      fullHead: str(raw.fullHead),
      jsonLd: isRecord(raw.jsonLd) ? { raw: str(raw.jsonLd.raw) } : null,
      openGraph: og
        ? {
            title: str(og.title),
            description: str(og.description),
            type: str(og.type),
            url: str(og.url),
            locale: str(og.locale),
            siteName: str(og.siteName),
            updatedTime: str(og.updatedTime),
          }
        : null,
    }
  }
  return { source: 'none' }
}

// ── pagination ───────────────────────────────────────────────────────────────

/** Page through a connection, halving the page size when a page fails (heavy content / low memory hosts). */
async function paginate(
  label: string,
  query: string,
  pick: (data: Json) => Json | undefined,
  extraVars: Record<string, unknown> = {},
): Promise<Json[]> {
  const out: Json[] = []
  let size = PAGE_SIZE
  let cursor: string | null = null
  let failures = 0
  let page = 1
  while (true) {
    try {
      const data = await gql(query, { ...extraVars, first: size, after: cursor })
      const conn = pick(data)
      if (!conn || !Array.isArray(conn.nodes)) {
        warnOnce(`[${label}] connection missing in response`)
        break
      }
      out.push(...conn.nodes.filter(isRecord))
      log(`[${label}] page ${page}: ${conn.nodes.length} nodes (total ${out.length})`)
      const info = isRecord(conn.pageInfo) ? conn.pageInfo : {}
      const next = typeof info.endCursor === 'string' ? info.endCursor : null
      if (info.hasNextPage !== true || !next || next === cursor) break
      cursor = next
      page++
      failures = 0
    } catch (err) {
      if (size > 5 && failures < 4) {
        size = Math.max(5, Math.floor(size / 2))
        failures++
        console.warn(`[warn] [${label}] page failed (${err instanceof Error ? err.message : String(err)}) — retrying with first=${size}`)
        continue
      }
      throw err
    }
  }
  return out
}

function connectionQuery(root: string, nodeSelection: string, args = ''): string {
  return `query($first: Int!, $after: String) { ${root}(first: $first, after: $after${args}) { pageInfo { hasNextPage endCursor } nodes { ${nodeSelection} } } }`
}

// ── taxonomies + content types ───────────────────────────────────────────────

interface TaxonomyDef {
  name: string
  single: string
  plural: string
  label: string
  hierarchical: boolean
  postTypes: string[]
}
interface ContentTypeDef {
  name: string
  plural: string
  kind: 'post' | 'page' | 'product' | 'custom'
}

const DEFAULT_TAXONOMIES: TaxonomyDef[] = [
  { name: 'category', single: 'category', plural: 'categories', label: 'Categories', hierarchical: true, postTypes: ['post'] },
  { name: 'post_tag', single: 'tag', plural: 'tags', label: 'Tags', hierarchical: false, postTypes: ['post'] },
  { name: 'product_cat', single: 'productCategory', plural: 'productCategories', label: 'Product categories', hierarchical: true, postTypes: ['product'] },
  { name: 'product_tag', single: 'productTag', plural: 'productTags', label: 'Product tags', hierarchical: false, postTypes: ['product'] },
]

async function discoverTaxonomies(): Promise<TaxonomyDef[]> {
  let defs: TaxonomyDef[] = []
  if (rootHas('taxonomies')) {
    try {
      const sel = select(rootNodeType('taxonomies'), [
        'name', 'label', 'graphqlSingleName', 'graphqlPluralName', 'hierarchical', 'showInGraphql',
        { field: 'connectedContentTypes', args: '(first: 100)', sub: [nodes(['name'])] },
      ])
      const data = await gql(`{ taxonomies(first: 100) { nodes { ${sel} } } }`)
      const list = isRecord(data.taxonomies) && Array.isArray(data.taxonomies.nodes) ? data.taxonomies.nodes.filter(isRecord) : []
      for (const t of list) {
        if (t.showInGraphql === false || typeof t.name !== 'string' || typeof t.graphqlPluralName !== 'string') continue
        const connected = isRecord(t.connectedContentTypes) && Array.isArray(t.connectedContentTypes.nodes) ? t.connectedContentTypes.nodes : []
        defs.push({
          name: t.name,
          single: typeof t.graphqlSingleName === 'string' ? t.graphqlSingleName : t.name,
          plural: t.graphqlPluralName,
          label: typeof t.label === 'string' ? t.label : t.name,
          hierarchical: t.hierarchical === true,
          postTypes: connected.flatMap((c) => (isRecord(c) && typeof c.name === 'string' ? [c.name] : [])),
        })
      }
    } catch (err) {
      console.warn(`[warn] taxonomies root failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  if (defs.length === 0) defs = DEFAULT_TAXONOMIES
  // only taxonomies whose terms connection exists as a root field
  return schema ? defs.filter((d) => rootHas(d.plural)) : defs.filter((d) => d.name === 'category' || d.name === 'post_tag')
}

async function discoverContentTypes(): Promise<ContentTypeDef[]> {
  const found: ContentTypeDef[] = []
  const kindOf = (name: string): ContentTypeDef['kind'] => (name === 'post' ? 'post' : name === 'page' ? 'page' : name === 'product' ? 'product' : 'custom')
  if (rootHas('contentTypes')) {
    try {
      const sel = select(rootNodeType('contentTypes'), ['name', 'graphqlPluralName', 'showInGraphql'])
      const data = await gql(`{ contentTypes(first: 100) { nodes { ${sel} } } }`)
      const list = isRecord(data.contentTypes) && Array.isArray(data.contentTypes.nodes) ? data.contentTypes.nodes.filter(isRecord) : []
      for (const t of list) {
        if (t.showInGraphql === false || typeof t.name !== 'string' || typeof t.graphqlPluralName !== 'string') continue
        if (t.name === 'attachment' || t.name === 'nav_menu_item' || t.graphqlPluralName === 'mediaItems') continue
        found.push({ name: t.name, plural: t.graphqlPluralName, kind: kindOf(t.name) })
      }
    } catch (err) {
      console.warn(`[warn] contentTypes root failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  if (found.length === 0) {
    found.push({ name: 'post', plural: 'posts', kind: 'post' }, { name: 'page', plural: 'pages', kind: 'page' })
    if (rootHas('products')) found.push({ name: 'product', plural: 'products', kind: 'product' })
  }
  return schema ? found.filter((c) => rootHas(c.plural)) : found.filter((c) => c.kind === 'post' || c.kind === 'page')
}

/** Selection for one content type (posts, pages, products, custom post types). */
function contentSpec(ct: ContentTypeDef, taxonomies: TaxonomyDef[]): Spec[] {
  const spec: Spec[] = [
    'databaseId', 'title', 'name', 'slug', 'content', 'description', 'excerpt', 'shortDescription',
    'date', 'modified', 'status', 'link', 'parentDatabaseId', 'menuOrder',
    { field: 'featuredImage', sub: [{ field: 'node', sub: IMAGE }] },
    { field: 'author', sub: [{ field: 'node', sub: ['databaseId', 'name', 'slug'] }] },
    ...LANGUAGE_SPEC,
    { field: 'seo', sub: SEO_SPEC },
  ]
  for (const tx of taxonomies) {
    if (!tx.postTypes.includes(ct.name)) continue
    spec.push({ field: tx.plural, alias: `tx_${tx.name.replace(/\W/g, '_')}`, args: '(first: 100)', sub: [nodes(['databaseId', 'name', 'slug'])] })
  }
  if (ct.kind === 'product') {
    spec.push(
      { field: 'image', sub: IMAGE },
      { field: 'galleryImages', args: '(first: 50)', sub: [nodes(IMAGE)] },
      'sku',
    )
    const concrete = schema?.types.get(rootNodeType(ct.plural) ?? '')?.possible ?? []
    for (const typeName of concrete) {
      spec.push({
        on: typeName,
        sub: ['sku', { field: 'price', args: '(format: RAW)' }, { field: 'regularPrice', args: '(format: RAW)' }, { field: 'salePrice', args: '(format: RAW)' }],
      })
    }
  }
  return spec
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function imageOf(v: unknown): RawImage | null {
  if (!isRecord(v) || typeof v.sourceUrl !== 'string' || !v.sourceUrl) return null
  return { databaseId: num(v.databaseId), sourceUrl: v.sourceUrl, altText: str(v.altText), title: str(v.title) }
}

function refsOf(v: unknown): RawTermRef[] {
  const list = isRecord(v) && Array.isArray(v.nodes) ? v.nodes : []
  return list.flatMap((t) => (isRecord(t) && num(t.databaseId) !== null ? [{ databaseId: t.databaseId as number, name: str(t.name) ?? '', slug: str(t.slug) ?? '' }] : []))
}

function mapContent(n: Json, ct: ContentTypeDef, taxonomies: TaxonomyDef[], currency: string | null): RawPostBase | null {
  const databaseId = num(n.databaseId)
  if (databaseId === null) return null
  const isProduct = ct.kind === 'product'
  const terms: Record<string, RawConnection<RawTermRef>> = {}
  for (const tx of taxonomies) {
    const nodesOf = refsOf(n[`tx_${tx.name.replace(/\W/g, '_')}`])
    if (nodesOf.length > 0) terms[tx.name] = { nodes: nodesOf }
  }
  const author = isRecord(n.author) && isRecord(n.author.node) && num(n.author.node.databaseId) !== null ? n.author.node : null
  const featured = isRecord(n.featuredImage) ? imageOf(n.featuredImage.node) : null
  const gallery = isRecord(n.galleryImages) && Array.isArray(n.galleryImages.nodes) ? n.galleryImages.nodes.flatMap((g) => imageOf(g) ?? []) : []
  const image = featured ?? imageOf(n.image) ?? gallery[0] ?? null
  const translations = Array.isArray(n.translations)
    ? n.translations.flatMap((t) =>
        isRecord(t) && num(t.databaseId) !== null && isRecord(t.language) && typeof t.language.code === 'string'
          ? [{ databaseId: t.databaseId as number, lang: t.language.code, slug: str(t.slug) ?? undefined }]
          : [],
      )
    : []
  const parent = num(n.parentDatabaseId)
  const base: RawPostBase = {
    databaseId,
    title: (isProduct ? (str(n.name) ?? str(n.title)) : (str(n.title) ?? str(n.name))) ?? '',
    slug: str(n.slug) ?? '',
    content: (isProduct ? (str(n.description) ?? str(n.content)) : str(n.content)) ?? '',
    excerpt: (isProduct ? (str(n.shortDescription) ?? str(n.excerpt)) : str(n.excerpt)) ?? null,
    date: str(n.date),
    modified: str(n.modified),
    status: str(n.status),
    link: str(n.link),
    featuredImage: { node: image },
    author: author
      ? { node: { databaseId: author.databaseId as number, name: str(author.name) ?? '', slug: str(author.slug) ?? '' } }
      : { node: null },
    ...(Object.keys(terms).length > 0 ? { terms } : {}),
    seo: mapSeo(n.seo),
    lang: isRecord(n.language) ? str(n.language.code) : null,
    parentDatabaseId: parent && parent > 0 ? parent : null,
    menuOrder: num(n.menuOrder),
    translations: translations.length > 0 ? translations : undefined,
  }
  if (!isProduct) return base
  const product: RawProduct = { ...base }
  const regular = str(n.regularPrice) ?? str(n.price)
  const sale = str(n.salePrice)
  if (regular || sale) product.price = { regular, sale, currency }
  const sku = str(n.sku)
  if (sku) product.sku = sku
  if (gallery.length > 0) product.gallery = gallery
  return product
}

/** WooCommerce currency via the public Store API (WooGraphQL does not expose it). */
async function storeCurrency(): Promise<string | null> {
  try {
    const res = await fetchRetry(env, `${env.wpUrl}/wp-json/wc/store/v1/products?per_page=1`, { retries: 1, timeoutMs: 20_000 })
    if (!res.ok) return null
    const body = parseJsonLoose<unknown>(await res.text())
    const first = Array.isArray(body) ? body[0] : null
    return isRecord(first) && isRecord(first.prices) ? str(first.prices.currency_code) : null
  } catch {
    return null
  }
}

async function archiveContent(taxonomies: TaxonomyDef[]): Promise<RawSite['seoPlugin']> {
  const types = await discoverContentTypes()
  log(`Content types: ${types.map((t) => t.name).join(', ') || '(none)'}`)
  let seoPlugin: RawSite['seoPlugin'] = 'none'
  const noteSeo = (items: RawPostBase[]) => {
    const source = items.map((i) => i.seo?.source).find((s) => s && s !== 'none')
    if (source && seoPlugin === 'none') seoPlugin = source
  }
  let wroteProducts = false
  let currency: string | null | undefined
  for (const ct of types) {
    const typeName = rootNodeType(ct.plural)
    const sel = select(typeName, contentSpec(ct, taxonomies))
    const raw = await paginate(ct.plural, connectionQuery(ct.plural, sel), (d) => (isRecord(d[ct.plural]) ? d[ct.plural] : undefined) as Json | undefined)
    if (ct.kind === 'product' && currency === undefined) currency = await storeCurrency()
    const items = raw.flatMap((n) => mapContent(n, ct, taxonomies, currency ?? null) ?? [])
    noteSeo(items)
    const file = ct.kind === 'post' ? 'posts' : ct.kind === 'page' ? 'pages' : ct.kind === 'product' ? 'products' : ct.name.replace(/[^a-z0-9_-]/gi, '-')
    if (['terms', 'menus', 'site', 'comments'].includes(file)) {
      console.warn(`[warn] custom post type "${ct.name}" collides with a reserved snapshot file name — skipped`)
      continue
    }
    writeJson(join(env.contentDir, `${file}.json`), items)
    if (ct.kind === 'product') wroteProducts = true
    log(`${file}.json: ${items.length}`)
  }
  if (!wroteProducts) {
    writeJson(join(env.contentDir, 'products.json'), [])
    log('products.json: 0 (WooGraphQL not present)')
  }
  return seoPlugin
}

// ── terms ────────────────────────────────────────────────────────────────────

async function archiveTerms(taxonomies: TaxonomyDef[]): Promise<void> {
  const file: RawTermsFile = { taxonomies: {} }
  for (const tx of taxonomies) {
    const sel = select(rootNodeType(tx.plural), [
      'databaseId', 'name', 'slug', 'description', 'parentDatabaseId', 'count',
      { field: 'language', sub: ['code'] },
      { field: 'seo', sub: SEO_SPEC },
    ])
    let raw: Json[] = []
    try {
      raw = await paginate(`terms:${tx.name}`, connectionQuery(tx.plural, sel), (d) => (isRecord(d[tx.plural]) ? d[tx.plural] : undefined) as Json | undefined)
    } catch (err) {
      console.warn(`[warn] taxonomy ${tx.name}: ${err instanceof Error ? err.message : String(err)} — skipped`)
      continue
    }
    const terms: RawTerm[] = raw.flatMap((t) => {
      const databaseId = num(t.databaseId)
      if (databaseId === null) return []
      const parent = num(t.parentDatabaseId)
      return [
        {
          databaseId,
          name: str(t.name) ?? '',
          slug: str(t.slug) ?? '',
          description: str(t.description),
          parentDatabaseId: parent && parent > 0 ? parent : null,
          count: num(t.count),
          seo: mapSeo(t.seo),
          lang: isRecord(t.language) ? str(t.language.code) : null,
        },
      ]
    })
    const entry: RawTaxonomy = { label: tx.label, postTypes: tx.postTypes, hierarchical: tx.hierarchical, terms }
    file.taxonomies[tx.name] = entry
  }
  writeJson(join(env.contentDir, 'terms.json'), file)
  const total = Object.values(file.taxonomies).reduce((n, t) => n + t.terms.length, 0)
  log(`terms.json: ${Object.keys(file.taxonomies).length} taxonomies, ${total} terms`)
}

// ── menus ────────────────────────────────────────────────────────────────────

async function archiveMenus(): Promise<void> {
  const menus: RawMenu[] = []
  if (rootHas('menus')) {
    const listSel = select(rootNodeType('menus'), ['databaseId', 'name', 'slug', 'locations'])
    const data = await gql(`{ menus(first: 100) { nodes { ${listSel} } } }`)
    const list = isRecord(data.menus) && Array.isArray(data.menus.nodes) ? data.menus.nodes.filter(isRecord) : []
    const itemType = fieldType(fieldType(rootNodeType('menus'), 'menuItems'), 'nodes')
    const itemSel = select(itemType, ['databaseId', 'parentDatabaseId', 'label', 'path', 'url', 'order'])
    for (const m of list) {
      const id = num(m.databaseId)
      if (id === null) continue
      const rawItems = await paginate(
        `menu:${id}`,
        `query($id: ID!, $first: Int!, $after: String) { menu(id: $id, idType: DATABASE_ID) { menuItems(first: $first, after: $after) { pageInfo { hasNextPage endCursor } nodes { ${itemSel} } } } }`,
        (d) => (isRecord(d.menu) && isRecord(d.menu.menuItems) ? d.menu.menuItems : undefined),
        { id: String(id) },
      )
      const items: RawMenuItem[] = rawItems.flatMap((it) => {
        const itemId = num(it.databaseId)
        if (itemId === null) return []
        return [
          {
            databaseId: itemId,
            parentDatabaseId: num(it.parentDatabaseId) || null,
            label: str(it.label) ?? '',
            path: str(it.path),
            url: str(it.url),
            order: num(it.order),
          },
        ]
      })
      const locations = Array.isArray(m.locations) ? m.locations.map((l) => String(l).toLowerCase()) : []
      menus.push({ databaseId: id, name: str(m.name) ?? str(m.slug) ?? `menu-${id}`, locations, items })
    }
  } else {
    console.warn('[warn] WPGraphQL schema has no `menus` root (WPGraphQL menus need a registered nav menu).')
  }
  if (menus.length === 0) {
    console.warn(
      '[warn] no menus archived. WPGraphQL only exposes menus assigned to a theme location to anonymous clients — ' +
        'set WP_AUTH_USER/WP_AUTH_PASSWORD, archive via REST (wp-archive-rest.ts with auth), or recreate menus manually.',
    )
  }
  writeJson(join(env.contentDir, 'menus.json'), menus)
  log(`menus.json: ${menus.length} menus`)
}

// ── comments ─────────────────────────────────────────────────────────────────

const COMMENT_STATUS: Record<string, string> = { APPROVE: 'approved', HOLD: 'hold', SPAM: 'spam', TRASH: 'trash' }

async function archiveComments(): Promise<void> {
  if (!rootHas('comments')) {
    console.warn('[warn] WPGraphQL schema has no `comments` root — comments.json not written (REST mirror covers comments).')
    return
  }
  const sel = select(rootNodeType('comments'), [
    'databaseId', 'parentDatabaseId', 'content', 'date', 'status',
    { field: 'author', sub: [{ field: 'node', sub: ['name'] }] },
    { field: 'commentedOn', sub: [{ field: 'node', sub: ['databaseId', { field: 'contentType', sub: [{ field: 'node', sub: ['name'] }] }] }] },
  ])
  const raw = await paginate('comments', connectionQuery('comments', sel), (d) => (isRecord(d.comments) ? d.comments : undefined))
  const comments: RawComment[] = raw.flatMap((c) => {
    const databaseId = num(c.databaseId)
    const on = isRecord(c.commentedOn) && isRecord(c.commentedOn.node) ? c.commentedOn.node : null
    const postDatabaseId = on ? num(on.databaseId) : null
    if (databaseId === null || postDatabaseId === null) return []
    const type = on && isRecord(on.contentType) && isRecord(on.contentType.node) ? str(on.contentType.node.name) : null
    const status = typeof c.status === 'string' ? (COMMENT_STATUS[c.status] ?? c.status.toLowerCase()) : 'approved'
    return [
      {
        databaseId,
        postDatabaseId,
        postType: type,
        parentDatabaseId: num(c.parentDatabaseId) || null,
        authorName: isRecord(c.author) && isRecord(c.author.node) ? (str(c.author.node.name) ?? '') : '',
        content: str(c.content) ?? '',
        date: str(c.date),
        status,
      },
    ]
  })
  writeJson(join(env.contentDir, 'comments.json'), comments)
  log(`comments.json: ${comments.length}`)
}

// ── site ─────────────────────────────────────────────────────────────────────

async function mediaItem(id: number): Promise<RawImage | null> {
  if (!rootHas('mediaItem')) return null
  try {
    const sel = select(fieldType(schema?.queryType, 'mediaItem'), IMAGE)
    const data = await gql(`query($id: ID!) { mediaItem(id: $id, idType: DATABASE_ID) { ${sel} } }`, { id: String(id) })
    return imageOf(data.mediaItem)
  } catch {
    return null
  }
}

async function archiveSite(seoPlugin: RawSite['seoPlugin']): Promise<void> {
  let general: Json = {}
  if (rootHas('generalSettings')) {
    const sel = select(fieldType(schema?.queryType, 'generalSettings'), ['title', 'description', 'url', 'language'])
    try {
      const data = await gql(`{ generalSettings { ${sel} } }`)
      if (isRecord(data.generalSettings)) general = data.generalSettings
    } catch (err) {
      console.warn(`[warn] generalSettings: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  const index = await fetchRestIndex(env)
  const namespaces = Array.isArray(index?.namespaces) ? index.namespaces.filter((n): n is string => typeof n === 'string') : []
  const home = str(general.url) ?? str(index?.home) ?? str(index?.url) ?? env.wpUrl
  const homeMeta = await fetchHomeMeta(env, home)
  const logoId = typeof index?.site_logo === 'number' ? index.site_logo : null
  const iconId = typeof index?.site_icon === 'number' ? index.site_icon : null
  const iconUrl = str(index?.site_icon_url)
  const seoType = fieldType('Post', 'seo')
  const detected: RawSite['seoPlugin'] =
    schema && seoType
      ? hasField(seoType, 'metaDesc')
        ? 'yoast'
        : hasField(seoType, 'canonicalUrl') || hasField(seoType, 'focusKeywords')
          ? 'rankmath'
          : (seoPlugin ?? 'none')
      : (seoPlugin ?? 'none')
  const site: RawSite = {
    name: str(general.title) ?? str(index?.name),
    description: str(general.description) ?? str(index?.description),
    url: home,
    language: (str(general.language) ?? homeMeta.language ?? null)?.replace('_', '-') ?? null,
    logo: logoId ? await mediaItem(logoId) : null,
    favicon: iconId ? ((await mediaItem(iconId)) ?? (iconUrl ? { sourceUrl: iconUrl } : null)) : iconUrl ? { sourceUrl: iconUrl } : null,
    homepageJsonLd: homeMeta.homepageJsonLd,
    seoPlugin: detected,
    multilingual: namespaces.includes('pll/v1') ? 'polylang' : namespaces.some((n) => n.startsWith('wpml')) ? 'wpml' : 'none',
    namespaces,
    ga4Id: homeMeta.ga4Id,
    gtmId: homeMeta.gtmId,
  }
  logTimezoneHint(index)
  writeJson(join(env.contentDir, 'site.json'), site)
  log(`site.json: ${site.name ?? '(unnamed)'} · ${site.url}`)
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!(await probe())) {
    console.error(`✖ No usable WPGraphQL endpoint at ${env.graphqlUrl} (plugin missing/disabled or blocked).`)
    console.error('  Use the REST pair instead: wp-archive-rest.ts then wp-archive-rest-content.ts, or set WP_GRAPHQL_URL.')
    process.exit(3)
  }
  if (PROBE) {
    log(`GraphQL endpoint OK: ${env.graphqlUrl}`)
    return
  }
  log(`=== GraphQL archive of ${env.graphqlUrl} -> ${env.contentDir} ===`)
  await introspect()

  const needTaxonomies = want('content') || want('terms')
  const taxonomies = needTaxonomies ? await discoverTaxonomies() : []
  if (needTaxonomies) log(`Taxonomies: ${taxonomies.map((t) => t.name).join(', ') || '(none)'}`)

  let seoPlugin: RawSite['seoPlugin'] = 'none'
  if (want('content')) seoPlugin = await archiveContent(taxonomies)
  if (want('terms')) await archiveTerms(taxonomies)
  if (want('menus')) await archiveMenus()
  if (want('comments')) await archiveComments()
  if (want('site')) await archiveSite(seoPlugin)
  log('=== GraphQL archive complete ===')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
