/**
 * `kcms frontend context` — the site facts an AI cannot guess, read over ANONYMOUS REST.
 *
 * Everything here is deliberately credential-free: the command must work on a fresh machine with
 * no profile and no `KCMS_API_KEY`, and the key must never appear in the output. Only public,
 * published documents are fetched (the same views a browser gets), and the `sites` document is
 * reduced to a whitelist instead of being dumped (it carries secret-adjacent settings).
 */
import { existsSync, writeFileSync } from 'node:fs'

import { CLI_VERSION } from './client.js'
import { CliError, EXIT, usageError } from './errors.js'

/** A JSON GET. Injected so tests (and callers) never need the network. */
export type JsonFetcher = (url: string) => Promise<unknown>

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

/** Anonymous JSON read: `Accept` only — no `Authorization`, no cookies, no key. */
export async function fetchAnonymousJson(url: string, fetchImpl: FetchLike = fetch): Promise<unknown> {
  let res: Response
  try {
    res = await fetchImpl(url, { headers: { Accept: 'application/json' } })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new CliError(`Cannot reach ${url}: ${message}`, EXIT.op)
  }
  if (!res.ok) {
    const err = new Error(`${url} answered ${res.status}`) as Error & { status?: number }
    err.status = res.status
    throw err
  }
  return res.json()
}

const TAXONOMY_TYPES = ['category', 'product-category', 'tag', 'custom'] as const
export type TaxonomyType = (typeof TAXONOMY_TYPES)[number]

const MENU_LOCATIONS = ['PRIMARY', 'SECONDARY_MENU', 'MOBILE_MENU', 'FOOTER_MENU', 'LOGGEDIN_ACCOUNT_MENU'] as const

export interface LocaleFacts {
  code: 'vi' | 'en'
  /** `null` when the probe query was skipped (403/404). */
  hasContent: boolean | null
  /** Documents found for this locale (only filled for `en`, where it is a translation probe). */
  documents?: number
}

export interface PageGroupFact {
  key: string
  pageSlug: string | null
}

export interface TaxonomyCounts extends Record<TaxonomyType, number | null> {
  category: number | null
  'product-category': number | null
  tag: number | null
  custom: number | null
}

export interface ContentCounts {
  pages: number | null
  posts: number | null
  products: number | null
  landings: number | null
  authors: number | null
  faqs: number | null
  /** Enabled rules only (`where[isEnabled][equals]=true`). */
  redirects: number | null
  taxonomies: TaxonomyCounts
}

export interface SampleDoc {
  /** Human label, e.g. `posts` or `taxonomies — category`. */
  label: string
  count: number
  doc: unknown
}

export interface SiteFacts {
  baseUrl: string
  siteKey: string
  tenantId: number
  domain: string
  siteName?: string
  defaultLanguage: 'vi' | 'en'
  locales: LocaleFacts[]
  menuLocations: string[]
  pageGroup: PageGroupFact[]
  counts: ContentCounts
  samples: SampleDoc[]
  generatedAt: string
  cliVersion: string
}

// ─── URL building ────────────────────────────────────────────────────────────

/** Payload bracket params, form-encoded (`where[tenant][equals]` → `where%5Btenant%5D%5Bequals%5D`). */
export function encodeParams(params: Array<[string, string]>): string {
  return new URLSearchParams(params).toString()
}

export function listUrl(baseUrl: string, collection: string, params: Array<[string, string]>): string {
  return `${baseUrl}/api/${collection}?${encodeParams(params)}`
}

// ─── Trimming ────────────────────────────────────────────────────────────────

export const TRUNCATE_AT = 400
export const ARRAY_LIMIT = 2
export const MAX_DEPTH = 5

/** Source fields the frontend must not render, plus internals that only bloat the sample. */
const DROP_KEYS = new Set(['tree', 'jsonLd'])
/** Legacy Lexical JSON is superseded by the rendered `content`/`body`/`notice` HTML string. */
const RICH_TEXT_KEYS = new Set(['content', 'body', 'notice'])

/**
 * Sample-shaped copy of a document: markdown sources dropped, long strings truncated with `…`,
 * arrays capped (with a `… N more` marker), nesting capped. Deterministic and non-mutating.
 */
export function trimForSample(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return value.length > TRUNCATE_AT ? `${value.slice(0, TRUNCATE_AT)}…` : value
  if (value === null || typeof value !== 'object') return value
  if (depth >= MAX_DEPTH) return '…'
  if (Array.isArray(value)) {
    const kept = value.slice(0, ARRAY_LIMIT).map((item) => trimForSample(item, depth + 1))
    return value.length > ARRAY_LIMIT ? [...kept, `… ${value.length - ARRAY_LIMIT} more`] : kept
  }
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key.endsWith('Md') || DROP_KEYS.has(key)) continue
    if (RICH_TEXT_KEYS.has(key) && item !== null && typeof item === 'object') continue
    // depth=1 populates the whole Sites doc into `tenant`; the site facts are already listed above.
    if (key === 'tenant' && item !== null && typeof item === 'object' && 'id' in item) {
      out[key] = item.id
      continue
    }
    out[key] = trimForSample(item, depth + 1)
  }
  return out
}

// ─── Collection reads ────────────────────────────────────────────────────────

interface ListResult {
  total: number
  docs: unknown[]
  first: unknown | null
}

function statusOf(err: unknown): number | undefined {
  return typeof err === 'object' && err !== null && 'status' in err && typeof err.status === 'number' ? err.status : undefined
}

function toListResult(raw: unknown): ListResult {
  const body = raw as { docs?: unknown; totalDocs?: unknown } | null
  const docs = Array.isArray(body?.docs) ? body.docs : []
  const total = typeof body?.totalDocs === 'number' ? body.totalDocs : docs.length
  return { total, docs, first: docs[0] ?? null }
}

/** A collection that is disabled or not readable anonymously (403/404) yields `null` — skip it. */
async function tolerantList(fetchJson: JsonFetcher, url: string, skipped: readonly number[] = [403, 404]): Promise<ListResult | null> {
  try {
    return toListResult(await fetchJson(url))
  } catch (err) {
    const status = statusOf(err)
    if (status !== undefined && skipped.includes(status)) return null
    throw err
  }
}

const totalOf = (result: ListResult | null): number | null => (result ? result.total : null)

function menuLocationsOf(result: ListResult | null): string[] {
  if (!result) return []
  const present = new Set(
    result.docs.flatMap((doc) => {
      const location = (doc as { location?: unknown } | null)?.location
      return typeof location === 'string' ? [location] : []
    }),
  )
  return MENU_LOCATIONS.filter((location) => present.has(location))
}

// ─── Collect ─────────────────────────────────────────────────────────────────

export interface CollectOptions {
  cliVersion?: string
  now?: Date
}

export async function collectSiteFacts(
  fetchJson: JsonFetcher,
  baseUrl: string,
  siteKey: string,
  options: CollectOptions = {},
): Promise<SiteFacts> {
  const notFound = () => usageError(`Site "${siteKey}" not found at ${baseUrl}`)
  const sitesUrl = listUrl(baseUrl, 'sites', [
    ['where[siteKey][equals]', siteKey],
    ['depth', '0'],
    ['limit', '1'],
  ])

  let siteRaw: unknown
  try {
    siteRaw = await fetchJson(sitesUrl)
  } catch (err) {
    const status = statusOf(err)
    if (status === 403 || status === 404) throw notFound()
    throw err
  }
  const site = toListResult(siteRaw).first as Record<string, unknown> | null
  const tenantId = typeof site?.id === 'number' ? site.id : Number(site?.id)
  if (!site || !Number.isFinite(tenantId)) throw notFound()

  // Whitelist only — never echo the sites document (secrets and unrelated settings live there).
  const knowledgeGraph = site.knowledgeGraph as { name?: unknown } | null | undefined
  const manifest = site.manifest as { name?: unknown } | null | undefined
  const nameCandidates = [knowledgeGraph?.name, manifest?.name].filter((name): name is string => typeof name === 'string' && name.trim() !== '')
  const pageGroup = (Array.isArray(site.pageGroup) ? site.pageGroup : []).flatMap((entry) => {
    const { key, pageSlug } = (entry ?? {}) as { key?: unknown; pageSlug?: unknown }
    return typeof key === 'string' ? [{ key, pageSlug: typeof pageSlug === 'string' ? pageSlug : null }] : []
  })

  const tenant: [string, string] = ['where[tenant][equals]', String(tenantId)]
  const listOf = (collection: string, extra: Array<[string, string]> = []) =>
    tolerantList(fetchJson, listUrl(baseUrl, collection, [tenant, ['limit', '1'], ['depth', '1'], ...extra]))
  const translated = (collection: string) =>
    tolerantList(
      fetchJson,
      listUrl(baseUrl, collection, [
        tenant,
        ['where[title][exists]', 'true'],
        ['locale', 'en'],
        ['fallback-locale', 'none'],
        ['limit', '1'],
        ['depth', '0'],
        ['select[title]', 'true'],
      ]),
      // Optional hint only: a server that rejects the `exists` filter must not fail the command.
      [400, 403, 404],
    )

  const [pages, posts, products, landings, authors, faqs, redirects, menus, categories, productCategories, tags, customTaxonomies, enPages, enPosts] =
    await Promise.all([
      listOf('pages'),
      listOf('posts'),
      listOf('products'),
      listOf('landings', [['where[isDisabled][not_equals]', 'true']]),
      listOf('authors'),
      listOf('faqs'),
      listOf('redirects', [['where[isEnabled][equals]', 'true']]),
      tolerantList(fetchJson, listUrl(baseUrl, 'menus', [tenant, ['depth', '0'], ['limit', '20'], ['select[location]', 'true']])),
      listOf('taxonomies', [['where[type][equals]', 'category']]),
      listOf('taxonomies', [['where[type][equals]', 'product-category']]),
      listOf('taxonomies', [['where[type][equals]', 'tag']]),
      listOf('taxonomies', [['where[type][equals]', 'custom']]),
      translated('pages'),
      translated('posts'),
    ])

  const taxonomyCounts: TaxonomyCounts = {
    category: totalOf(categories),
    'product-category': totalOf(productCategories),
    tag: totalOf(tags),
    custom: totalOf(customTaxonomies),
  }

  const samples: SampleDoc[] = []
  const addSample = (label: string, result: ListResult | null) => {
    if (result && result.total > 0 && result.first !== null) {
      samples.push({ label, count: result.total, doc: trimForSample(result.first) })
    }
  }
  addSample('pages', pages)
  addSample('posts', posts)
  addSample('products', products)
  addSample('landings', landings)
  const taxonomyResults: Array<[TaxonomyType, ListResult | null]> = [
    ['category', categories],
    ['product-category', productCategories],
    ['tag', tags],
    ['custom', customTaxonomies],
  ]
  const taxonomySample = taxonomyResults.find(([, result]) => result !== null && result.total > 0)
  if (taxonomySample?.[1]) addSample(`taxonomies — ${taxonomySample[0]}`, taxonomySample[1])
  addSample('authors', authors)
  addSample('faqs', faqs)
  addSample('redirects (enabled)', redirects)

  const viHasContent =
    pages === null && posts === null ? null : (pages?.total ?? 0) + (posts?.total ?? 0) > 0
  const enDocuments = (enPages?.total ?? 0) + (enPosts?.total ?? 0)
  const enHasContent = enPages === null || enPosts === null ? null : enDocuments > 0

  return {
    baseUrl,
    siteKey: typeof site.siteKey === 'string' ? site.siteKey : siteKey,
    tenantId,
    domain: typeof site.domain === 'string' ? site.domain : '',
    ...(nameCandidates[0] ? { siteName: nameCandidates[0] } : {}),
    defaultLanguage: site.defaultLanguage === 'en' ? 'en' : 'vi',
    locales: [
      { code: 'vi', hasContent: viHasContent },
      { code: 'en', hasContent: enHasContent, documents: enDocuments },
    ],
    menuLocations: menuLocationsOf(menus),
    pageGroup,
    counts: {
      pages: totalOf(pages),
      posts: totalOf(posts),
      products: totalOf(products),
      landings: totalOf(landings),
      authors: totalOf(authors),
      faqs: totalOf(faqs),
      redirects: totalOf(redirects),
      taxonomies: taxonomyCounts,
    },
    samples,
    generatedAt: (options.now ?? new Date()).toISOString(),
    cliVersion: options.cliVersion ?? CLI_VERSION,
  }
}

// ─── Render ──────────────────────────────────────────────────────────────────

const value = (n: number | null): string => (n === null ? '—' : String(n))

function localeLine(locale: LocaleFacts, isDefault: boolean): string {
  const label = `\`${locale.code}\`${isDefault ? ' (default)' : ''}`
  if (locale.hasContent === null) return `- ${label}: unknown (query skipped)`
  if (locale.code === 'vi') return `- ${label}: ${locale.hasContent ? 'has published pages/posts' : 'no published pages/posts yet'}`
  if (!locale.hasContent) return `- ${label}: no English content yet — \`locale=en\` falls back to Vietnamese`
  const count = locale.documents ?? 0
  return `- ${label}: has English content (${count} document${count === 1 ? '' : 's'} with an English title)`
}

/** Deterministic Markdown. Section order is fixed; every list follows collection/enum order. */
export function renderKcmsMd(facts: SiteFacts): string {
  const out: string[] = []
  const webhook = facts.domain ? `https://${facts.domain}/api/cms/revalidate` : null
  const api = `${facts.baseUrl}/api`

  out.push(
    `# KCMS.md — ${facts.siteKey}`,
    '',
    'Generated by `kcms frontend context`; safe to commit (no secrets). Regenerate after site settings change.',
    '',
    `Generated at ${facts.generatedAt} · kcms ${facts.cliVersion}.`,
    '',
    '## Site',
    '',
    `- CMS base URL: \`${facts.baseUrl}\` (REST: \`${api}\`)`,
    `- siteKey: \`${facts.siteKey}\``,
    `- Tenant id: \`${facts.tenantId}\` — filter every query with \`where[tenant][equals]=${facts.tenantId}\``,
    `- Domain: \`${facts.domain || '(not set)'}\``,
    ...(facts.siteName ? [`- Site name: ${facts.siteName}`] : []),
    `- Default language: \`${facts.defaultLanguage}\``,
    `- Frontend revalidate webhook: ${webhook ? `\`POST ${webhook}\` with \`{ collection, id, slug }\`` : 'not configured (`Sites.domain` is empty)'}`,
    '- These values apply to this site only; other sites on the same CMS have different ids.',
    '',
    '## Locales',
    '',
    ...facts.locales.map((locale) => localeLine(locale, locale.code === facts.defaultLanguage)),
    '- Add `locale=en&fallback-locale=none` to a query to detect untranslated fields instead of seeing Vietnamese values.',
    '',
    '## Page group (system page keys → page slugs)',
    '',
  )

  if (facts.pageGroup.length === 0) {
    out.push('No `pageGroup` configured — system pages are not mapped for this site.', '')
  } else {
    out.push('| key | page slug |', '| --- | --- |', ...facts.pageGroup.map(({ key, pageSlug }) => `| ${key} | ${pageSlug ?? '(not set)'} |`), '')
  }

  out.push('## Menus', '')
  out.push(
    facts.menuLocations.length > 0
      ? `Menu locations with a document: ${facts.menuLocations.map((location) => `\`${location}\``).join(', ')}`
      : 'No menus defined for this site yet.',
    '',
    'Menus are one document per location; REST returns `items` (never `tree`). Request a location explicitly:',
    '',
    '```bash',
    `curl -s '${api}/menus?where[tenant][equals]=${facts.tenantId}&where[location][equals]=PRIMARY&locale=vi&limit=1'`,
    '```',
    '',
    '## Published content',
    '',
    '| collection | documents |',
    '| --- | --- |',
    `| pages | ${value(facts.counts.pages)} |`,
    `| posts | ${value(facts.counts.posts)} |`,
    `| products | ${value(facts.counts.products)} |`,
    `| landings (enabled) | ${value(facts.counts.landings)} |`,
    ...TAXONOMY_TYPES.map((type) => `| taxonomies — ${type} | ${value(facts.counts.taxonomies[type])} |`),
    `| authors | ${value(facts.counts.authors)} |`,
    `| faqs | ${value(facts.counts.faqs)} |`,
    `| redirects (enabled) | ${value(facts.counts.redirects)} |`,
    '',
    'Counts are anonymous reads: pages/posts/products/landings are published + live + not trashed; landings exclude `isDisabled`; redirects count `isEnabled` only; `—` means the collection was not readable (403/404).',
    '',
    '## Samples',
    '',
    'Trimmed anonymous REST responses (`depth=1`): Markdown source fields (`*Md`) and legacy rich-text JSON are omitted, long strings end with `…`, arrays keep 2 items.',
    '',
  )

  if (facts.samples.length === 0) {
    out.push('No published documents yet — nothing to sample.', '')
  }
  for (const sample of facts.samples) {
    out.push(`### ${sample.label} — ${sample.count} document${sample.count === 1 ? '' : 's'}`, '', '```json', JSON.stringify(sample.doc, null, 2), '```', '')
  }

  out.push(
    '## Public routes',
    '',
    'The CMS\'s single source of truth is `publicPathFor` (`src/lib/frontend-public-path.ts`):',
    '',
    '- `/{slug}` — catch-all for landings, pages and posts: resolve **landing → page → post**',
    '- `/product/{slug}` — products',
    '- System pages are reached through the `pageGroup` table above; `GET /api/sites/{siteKey}/env-page?key=FRONT_PAGE` returns the mapped page (published only for anonymous callers).',
    '- Apply the `redirects` collection (`from` → `to`, 301/302) in middleware and cap the hops.',
    '',
    'If your frontend routes differently, change `publicPathFor` in the CMS rather than diverging from it.',
    '',
    '## Query recipes',
    '',
    '```bash',
    `# site document (public fields only)`,
    `curl -s '${api}/sites?where[siteKey][equals]=${facts.siteKey}&depth=1&limit=1'`,
    '',
    `# published posts, newest first`,
    `curl -s '${api}/posts?where[tenant][equals]=${facts.tenantId}&sort=-publishedAt&limit=10&depth=1'`,
    '',
    `# one document by slug (slug is unique per site, so always pair it with the tenant)`,
    `curl -s '${api}/pages?where[tenant][equals]=${facts.tenantId}&where[slug][equals]=about&limit=1&depth=2'`,
    '',
    `# English only, no Vietnamese fallback`,
    `curl -s '${api}/posts?where[tenant][equals]=${facts.tenantId}&locale=en&fallback-locale=none&limit=10&depth=1'`,
    '',
    `# primary menu`,
    `curl -s '${api}/menus?where[tenant][equals]=${facts.tenantId}&where[location][equals]=PRIMARY&locale=vi&limit=1'`,
    '',
    `# enabled redirects`,
    `curl -s '${api}/redirects?where[tenant][equals]=${facts.tenantId}&where[isEnabled][equals]=true&limit=1000&depth=0'`,
    '```',
    '',
    '## More context',
    '',
    '- Agent skill `kcms-frontend` (bundled with the kcms CLI) teaches the full frontend contract; install it with `kcms setup <target> --write --with-skill kcms,kcms-frontend`.',
    `- Machine-readable contract: \`${facts.baseUrl}/llms.txt\` and \`${facts.baseUrl}/llms-full.txt\`.`,
    `- Regenerate this file: \`kcms frontend context --site ${facts.siteKey}\` (anonymous — no API key needed).`,
    '- Reads need no API key; writes go through the CMS admin or the `kcms` CLI/MCP.',
    '',
  )

  return out.join('\n')
}

// ─── Write ───────────────────────────────────────────────────────────────────

/** Write the file unless it exists and `--force` was not passed. */
export function writeContextFile(file: string, content: string, force = false): void {
  if (!force && existsSync(file)) throw usageError(`${file} already exists — pass --force to overwrite.`)
  writeFileSync(file, content.endsWith('\n') ? content : `${content}\n`)
}
