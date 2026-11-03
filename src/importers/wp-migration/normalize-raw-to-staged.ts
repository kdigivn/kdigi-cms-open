/**
 * Step 2 — normalize wp-archive/<site>/raw/ → staged/ (one JSON per doc).
 *
 * Pure local transform: reads the unified raw snapshot (`raw/content/*.json`,
 * contract in raw-wp-types.ts) plus `raw/rest/media.json` (+ media-authed,
 * users), writes staged/ (contract in staged-doc-types.ts). No network, no DB.
 * Re-running OVERWRITES staged edits — the orchestrator guards this behind
 * --regen-staged confirmation.
 *
 * Sources per collection:
 *   pages/posts/products ← content/{pages,posts,products}.json + content/<cpt>.json (see `cptMap`)
 *   taxonomies           ← content/terms.json (EVERY taxonomy, core + custom)
 *   authors              ← post/page/product author nodes (+ rest/users.json)
 *   media                ← rest/media.json (+ rest/media-authed.json superset)
 *   menus                ← content/menus.json (flat items → tree of any depth)
 *   site                 ← content/site.json (+ homepage JSON-LD)
 *   comments             ← content/comments.json
 *   faqs                 ← not derived from WP content; the directory is created empty for editors
 */
import fs from 'fs'
import path from 'path'
import sanitizeHtml from 'sanitize-html'
import { wpHtmlToGfm } from '../wp-html-to-gfm'
import { parseKkStarRating } from './kk-star-rating'
import { deniedMediaReason, loadMediaDenylist, type MediaDenyRule } from './release-content-policy'
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
  RawTermRef,
  RawTermsFile,
} from './raw-wp-types'
import { buildStagedSeo, decodeSeoEntities, extractMetaContent } from './seo-to-staged'
import type {
  StagedAuthor,
  StagedComment,
  StagedCustomTermRef,
  StagedMedia,
  StagedMediaRef,
  StagedMenu,
  StagedMenuLocation,
  StagedMenuNode,
  StagedPage,
  StagedPost,
  StagedProduct,
  StagedSiteConfig,
  StagedTaxonomy,
  StagedTermRef,
} from './staged-doc-types'
import {
  cmsTaxonomyType,
  mapWpStatus,
  normalizeWpDate,
  rawDir,
  sourcePublicHost,
  stagedDir,
  type SiteMigrationConfig,
} from './wp-migration-config'

/** Staged collection a custom post type can be mapped to. */
export type CptTarget = 'posts' | 'pages' | 'products'

export interface NormalizeOptions {
  /** `{ portfolio: 'posts' }` — WP custom post type (`content/<cpt>.json`) → staged collection. Unlisted CPT files default to `posts`. */
  cptMap?: Record<string, CptTarget>
}

interface NormalizeCounts {
  [collection: string]: number
}

/** Files in raw/content/ that are not custom post types. */
const RESERVED_CONTENT_FILES: Record<string, true> = {
  posts: true,
  pages: true,
  products: true,
  terms: true,
  menus: true,
  site: true,
  comments: true,
}

const CPT_TARGETS: Record<CptTarget, true> = { posts: true, pages: true, products: true }

// ── Raw loaders ───────────────────────────────────────────────────────────────

function loadJson<T>(cfg: SiteMigrationConfig, relPath: string, optional: true): T | null
function loadJson<T>(cfg: SiteMigrationConfig, relPath: string, optional?: false): T
function loadJson<T>(cfg: SiteMigrationConfig, relPath: string, optional = false): T | null {
  const p = path.join(rawDir(cfg), relPath)
  if (!fs.existsSync(p)) {
    if (optional) return null
    throw new Error(`raw archive file missing: ${p} — run the archive step first`)
  }
  // Boundary: the raw snapshot is validated by shape contract (raw-wp-types.ts), not at runtime.
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as T
}

function loadArray<T>(cfg: SiteMigrationConfig, relPath: string): T[] {
  const data = loadJson<unknown>(cfg, relPath, true)
  if (data == null) return []
  if (!Array.isArray(data)) {
    // REST mirrors are best-effort: an error object saved instead of a list is ignored.
    if (relPath.startsWith('rest/')) {
      console.warn(`[normalize] ${relPath} is not a JSON array — ignored`)
      return []
    }
    throw new Error(`${relPath} must be a JSON array`)
  }
  return data as T[]
}

function safeFileStem(value: string): string {
  return value.replace(/[^\p{L}\p{N}._%~-]+/gu, '_').replace(/^\.+/, '_').slice(0, 120) || '_'
}

interface SkippedTranslation {
  collection: string
  slug: string
  wpId: number
  lang: string
}

interface ContentSource {
  /** Basename of the raw file without `.json` (`posts`, `portfolio`…). */
  name: string
  target: CptTarget
}

interface Ctx {
  cfg: SiteMigrationConfig
  counts: NormalizeCounts
  denylist: readonly MediaDenyRule[]
  mediaRefs: ReadonlyMap<string, StagedMediaRef>
  sources: ContentSource[]
  usedFiles: Map<string, Set<string>>
  skipped: SkippedTranslation[]
  nodeCache: Map<string, RawPostBase[]>
}

/** `lang` of a node is kept when it equals the site language (`vi`, `vi-VN`, `vi_VN` all match `vi`). */
export function langMatches(nodeLang: string | null | undefined, siteLang: string): boolean {
  if (!nodeLang) return true
  const normalized = nodeLang.toLowerCase().replace(/_/g, '-')
  return normalized === siteLang || normalized.startsWith(`${siteLang}-`)
}

function writeStagedDoc(ctx: Ctx, collection: string, file: string, doc: unknown, wpId?: number): void {
  const used = ctx.usedFiles.get(collection) ?? new Set<string>()
  ctx.usedFiles.set(collection, used)
  let stem = safeFileStem(file)
  if (used.has(stem)) {
    const unique = `${stem}--${wpId ?? used.size}`
    console.warn(`[normalize] ${collection}/${stem}.json already written this run — using ${unique}.json`)
    stem = unique
  }
  used.add(stem)
  const dir = path.join(stagedDir(ctx.cfg), collection)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${stem}.json`), JSON.stringify(doc, null, 2) + '\n', 'utf-8')
  ctx.counts[collection] = (ctx.counts[collection] ?? 0) + 1
}

// ── Body + link helpers ───────────────────────────────────────────────────────

/**
 * Rewrite body links that point at the SOURCE public site to relative paths so
 * they follow the content to the new domain. Uploads/theme assets (`/wp-content/`,
 * `/wp-includes/`) stay absolute — binaries relink in the media phase.
 */
function relativizeSourceLinks(md: string, cfg: SiteMigrationConfig): string {
  const pub = sourcePublicHost(cfg).replace(/\./g, '\\.')
  return md.replace(
    new RegExp(`\\]\\(https?://(?:www\\.)?${pub}(/[^)]*)?\\)`, 'gi'),
    (match: string, p: string | undefined) => {
      if (p && /^\/wp-(?:content|includes)\//i.test(p)) return match
      return `](${p || '/'})`
    },
  )
}

export function toContentMd(html: string | null | undefined, cfg: SiteMigrationConfig): string {
  if (!html) return ''
  return relativizeSourceLinks(wpHtmlToGfm(html), cfg)
}

export function toExcerpt(html: string | null | undefined): string | undefined {
  if (!html) return undefined
  const spaced = html.replace(/<\/(?:p|div|li|h[1-6])>|<br\s*\/?>/gi, ' ')
  const text = decodeSeoEntities(sanitizeHtml(spaced, { allowedTags: [], allowedAttributes: {} }))
    .replace(/\s+/g, ' ')
    .trim()
  return text || undefined
}

/** WP's auto-generated excerpt is cut mid-sentence and ends with "[…]" / "[&hellip;]". */
const TRUNCATED_EXCERPT_RE = /(?:\[…\]|\[&hellip;\])\s*$/
const INVISIBLE_CHARS_RE = /[\u200B-\u200D\uFEFF]/g

/**
 * Excerpt for a post/product. A hand-written WP excerpt is kept as is. WP's
 * auto-truncated one is never a usable summary, so it is replaced by the SEO
 * meta description; with none, it is left unset so the autoFillExcerpt hook
 * derives one from the content.
 */
export function resolveExcerpt(
  excerptHtml: string | null | undefined,
  seoDescription: string | null | undefined,
): string | undefined {
  const excerpt = toExcerpt(excerptHtml)
  if (!excerpt || !TRUNCATED_EXCERPT_RE.test(excerpt)) return excerpt
  const description = (seoDescription ?? '').replace(INVISIBLE_CHARS_RE, '').replace(/\s+/g, ' ').trim()
  return description || undefined
}

export function mediaRef(node: Partial<RawImage> | null | undefined): StagedMediaRef | undefined {
  if (!node?.sourceUrl) return undefined
  return {
    wpId: node.databaseId ?? null,
    sourceUrl: node.sourceUrl,
    ...(node.altText ? { alt: node.altText } : {}),
  }
}

// ── Terms ─────────────────────────────────────────────────────────────────────

const CATEGORY_TAXONOMIES = ['category', 'product_cat']
const TAG_TAXONOMIES = ['post_tag', 'product_tag']

function refsOf(conn: RawConnection<RawTermRef> | undefined): StagedTermRef[] {
  return (conn?.nodes ?? []).map((n) => ({
    slug: n.slug,
    name: decodeSeoEntities(n.name ?? n.slug),
    wpId: n.databaseId,
  }))
}

/**
 * Split a node's `terms` (keyed by WP taxonomy slug) into the staged
 * categories / tags (core + WooCommerce taxonomies) and customTerms (every other taxonomy).
 */
export function splitTermRefs(terms: RawPostBase['terms']): {
  categories: StagedTermRef[]
  tags: StagedTermRef[]
  customTerms: StagedCustomTermRef[]
} {
  const categories: StagedTermRef[] = []
  const tags: StagedTermRef[] = []
  const customTerms: StagedCustomTermRef[] = []
  for (const [taxonomy, conn] of Object.entries(terms ?? {})) {
    const refs = refsOf(conn)
    if (CATEGORY_TAXONOMIES.includes(taxonomy)) categories.push(...refs)
    else if (TAG_TAXONOMIES.includes(taxonomy)) tags.push(...refs)
    else customTerms.push(...refs.map((r) => ({ ...r, taxonomy })))
  }
  return { categories, tags, customTerms }
}

// ── SEO helpers ───────────────────────────────────────────────────────────────

/** Extract the actual og:image URL of a SEO plugin `<head>` blob. */
export function extractOpenGraphImageUrl(fullHead: unknown): string | undefined {
  if (typeof fullHead !== 'string') return undefined
  return extractMetaContent(fullHead, 'og:image') ?? undefined
}

function sourceMediaRefsByUrl(cfg: SiteMigrationConfig): Map<string, StagedMediaRef> {
  const refs = new Map<string, StagedMediaRef>()
  // media-authed is a superset when present; process public first so the
  // authenticated record supplies the same attachment's richer metadata.
  for (const relPath of ['rest/media.json', 'rest/media-authed.json']) {
    for (const item of loadArray<RestMedia>(cfg, relPath)) {
      const ref = mediaRef({ databaseId: item.id, sourceUrl: item.source_url, altText: item.alt_text })
      if (ref) refs.set(ref.sourceUrl, ref)
    }
  }
  return refs
}

export function sourceOpenGraphImage(
  fullHead: unknown,
  refsByUrl: ReadonlyMap<string, StagedMediaRef>,
): StagedMediaRef | undefined {
  const sourceUrl = extractOpenGraphImageUrl(fullHead)
  if (!sourceUrl) return undefined
  return refsByUrl.get(sourceUrl) ?? { wpId: null, sourceUrl }
}

/** og:image from the full head, falling back to the plugin's structured `openGraph.imageUrl`. */
export function seoOpenGraphImage(
  seo: RawSeo | null | undefined,
  refsByUrl: ReadonlyMap<string, StagedMediaRef>,
): StagedMediaRef | undefined {
  if (!seo) return undefined
  const fromHead = sourceOpenGraphImage(seo.fullHead, refsByUrl)
  if (fromHead) return fromHead
  const url = seo.openGraph?.imageUrl
  return url ? (refsByUrl.get(url) ?? { wpId: null, sourceUrl: url }) : undefined
}

// ── Content (pages / posts / products / custom post types) ────────────────────

interface RestMedia {
  id: number
  source_url?: string
  alt_text?: string
  mime_type?: string
  caption?: { rendered?: string }
}

interface RestUser {
  id: number
  slug?: string
  name?: string
  description?: string
}

function discoverSources(cfg: SiteMigrationConfig, options: NormalizeOptions): ContentSource[] {
  const cptMap = options.cptMap ?? {}
  for (const [cpt, target] of Object.entries(cptMap)) {
    if (!Object.hasOwn(CPT_TARGETS, target)) {
      throw new Error(`--cpt ${cpt}=${target}: target must be posts, pages or products`)
    }
    if (Object.hasOwn(RESERVED_CONTENT_FILES, cpt)) {
      throw new Error(`--cpt ${cpt}: "${cpt}" is a built-in content type, not a custom post type`)
    }
  }
  const dir = path.join(rawDir(cfg), 'content')
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('.')) : []
  const names = new Set(files.map((f) => f.replace(/\.json$/, '')))
  const sources: ContentSource[] = [
    { name: 'pages', target: 'pages' },
    { name: 'posts', target: 'posts' },
    { name: 'products', target: 'products' },
  ]
  for (const name of [...names].sort()) {
    if (Object.hasOwn(RESERVED_CONTENT_FILES, name)) continue
    sources.push({ name, target: cptMap[name] ?? 'posts' })
  }
  for (const cpt of Object.keys(cptMap)) {
    if (!names.has(cpt)) console.warn(`[normalize] --cpt ${cpt}: raw/content/${cpt}.json not found — nothing to map`)
  }
  return sources
}

/** Nodes of a content file that survive the language filter (skipped translations are recorded once). */
function keptNodes(ctx: Ctx, source: ContentSource): RawPostBase[] {
  const cached = ctx.nodeCache.get(source.name)
  if (cached) return cached
  const kept: RawPostBase[] = []
  for (const node of loadArray<RawPostBase>(ctx.cfg, `content/${source.name}.json`)) {
    if (!node.slug) continue
    if (!langMatches(node.lang, ctx.cfg.language)) {
      ctx.skipped.push({
        collection: source.target,
        slug: node.slug,
        wpId: node.databaseId,
        lang: node.lang ?? '',
      })
      continue
    }
    kept.push(node)
  }
  ctx.nodeCache.set(source.name, kept)
  return kept
}

/** Site-relative permalink (`/2024/05/my-post/`, or `/?p=12` for plain permalinks). */
export function sourcePathOf(link: string | null | undefined): string | undefined {
  if (!link) return undefined
  try {
    const url = new URL(link, 'https://source.invalid')
    return url.pathname + url.search
  } catch {
    return undefined
  }
}

function parsePrice(value: string | number | null | undefined): number | undefined {
  if (value == null || value === '') return undefined
  const n = typeof value === 'number' ? value : Number(value.trim())
  return Number.isFinite(n) ? n : undefined
}

function stagedBase(ctx: Ctx, n: RawPostBase) {
  const cfg = ctx.cfg
  const seo = n.seo ? buildStagedSeo(n.seo, cfg) : {}
  const featuredImage = mediaRef(n.featuredImage?.node)
  const og = seoOpenGraphImage(n.seo, ctx.mediaRefs)
  const rating = parseKkStarRating('kkStarRating' in n ? n.kkStarRating : undefined)
  const sourcePath = sourcePathOf(n.link)
  return {
    seo,
    featuredImage,
    base: {
      wpStatus: n.status ?? 'publish',
      status: mapWpStatus(n.status),
      date: normalizeWpDate(n.date),
      modified: normalizeWpDate(n.modified),
      ...(og && og.sourceUrl !== featuredImage?.sourceUrl ? { openGraphImage: og } : {}),
      ...(n.lang ? { lang: n.lang } : {}),
      ...(sourcePath ? { sourcePath } : {}),
      wp: { databaseId: n.databaseId },
    },
    rating: rating ?? undefined,
  }
}

function normalizeContent(ctx: Ctx, runs: (collection: string) => boolean): void {
  for (const source of ctx.sources) {
    if (!runs(source.target)) continue
    for (const n of keptNodes(ctx, source)) {
      const { seo, featuredImage, base, rating } = stagedBase(ctx, n)
      const title = decodeSeoEntities(n.title ?? '')
      const contentMd = toContentMd(n.content, ctx.cfg)
      if (source.target === 'pages') {
        const doc: StagedPage = {
          collection: 'pages',
          title,
          slug: n.slug,
          contentMd,
          featuredImage,
          seo,
          ...base,
        }
        writeStagedDoc(ctx, 'pages', n.slug, doc, n.databaseId)
      } else if (source.target === 'posts') {
        const { categories, tags, customTerms } = splitTermRefs(n.terms)
        const doc: StagedPost = {
          collection: 'posts',
          title,
          slug: n.slug,
          excerpt: resolveExcerpt(n.excerpt, seo.description),
          contentMd,
          authorSlug: n.author?.node?.slug ?? undefined,
          categories,
          tags,
          ...(customTerms.length ? { customTerms } : {}),
          featuredImage,
          ...(rating ? { kkStarRating: rating } : {}),
          seo,
          ...base,
        }
        writeStagedDoc(ctx, 'posts', n.slug, doc, n.databaseId)
      } else {
        const product = n as RawProduct
        const { categories, tags, customTerms } = splitTermRefs(n.terms)
        const regular = parsePrice(product.price?.regular)
        const sale = parsePrice(product.price?.sale)
        const currency = product.price?.currency || undefined
        const doc: StagedProduct = {
          collection: 'products',
          title,
          slug: n.slug,
          excerpt: resolveExcerpt(n.excerpt, seo.description),
          contentMd,
          menuOrder: n.menuOrder ?? null,
          ...(regular !== undefined || sale !== undefined
            ? {
                price: {
                  ...(regular !== undefined ? { regular } : {}),
                  ...(sale !== undefined ? { sale } : {}),
                  ...(currency ? { currency } : {}),
                },
              }
            : {}),
          ...(product.sku ? { sku: product.sku } : {}),
          gallery: (product.gallery ?? []).map((img) => mediaRef(img)).filter((x): x is StagedMediaRef => !!x),
          categories,
          tags,
          ...(customTerms.length ? { customTerms } : {}),
          featuredImage,
          ...(rating ? { kkStarRating: rating } : {}),
          seo,
          ...base,
        }
        writeStagedDoc(ctx, 'products', n.slug, doc, n.databaseId)
      }
    }
  }
}

// ── Taxonomies ────────────────────────────────────────────────────────────────

function normalizeTaxonomies(ctx: Ctx): void {
  const file = loadJson<RawTermsFile>(ctx.cfg, 'content/terms.json', true)
  if (!file) {
    console.warn('[normalize] raw/content/terms.json missing — no taxonomies staged')
    return
  }
  for (const [wpTaxonomy, taxonomy] of Object.entries(file.taxonomies ?? {})) {
    const type = cmsTaxonomyType(wpTaxonomy)
    for (const t of taxonomy.terms ?? []) {
      if (!t.slug) continue
      if (!langMatches(t.lang, ctx.cfg.language)) {
        ctx.skipped.push({ collection: 'taxonomies', slug: t.slug, wpId: t.databaseId, lang: t.lang ?? '' })
        continue
      }
      const doc: StagedTaxonomy = {
        collection: 'taxonomies',
        type,
        name: decodeSeoEntities(t.name ?? t.slug),
        slug: t.slug,
        description: toExcerpt(t.description),
        contentMd: toContentMd(t.description, ctx.cfg) || undefined,
        openGraphImage: seoOpenGraphImage(t.seo, ctx.mediaRefs),
        parentWpId: t.parentDatabaseId || null,
        seo: t.seo ? buildStagedSeo(t.seo, ctx.cfg) : {},
        wp: { databaseId: t.databaseId, taxonomy: wpTaxonomy },
      }
      // wpTaxonomy in the filename keeps e.g. `post_tag` / `product_tag` and custom taxonomies from colliding.
      writeStagedDoc(ctx, 'taxonomies', `${type}--${wpTaxonomy}--${t.slug}`, doc, t.databaseId)
    }
  }
}

// ── Authors ───────────────────────────────────────────────────────────────────

function normalizeAuthors(ctx: Ctx): void {
  const authors = new Map<string, StagedAuthor>()
  for (const source of ctx.sources) {
    for (const n of keptNodes(ctx, source)) {
      const node = n.author?.node
      if (node?.slug && !authors.has(node.slug)) {
        authors.set(node.slug, {
          collection: 'authors',
          name: decodeSeoEntities(node.name ?? node.slug),
          slug: node.slug,
          wp: { databaseId: node.databaseId },
        })
      }
    }
  }
  // REST users.json exists when the source allows enumeration; otherwise the
  // content author nodes are the only source.
  for (const u of loadArray<RestUser>(ctx.cfg, 'rest/users.json')) {
    if (!u?.slug) continue
    const bio = toExcerpt(u.description)
    const existing = authors.get(u.slug)
    if (existing) {
      if (bio) existing.bio = bio
    } else {
      authors.set(u.slug, {
        collection: 'authors',
        name: decodeSeoEntities(u.name ?? u.slug),
        slug: u.slug,
        wp: { databaseId: u.id },
        ...(bio ? { bio } : {}),
      })
    }
  }
  for (const author of authors.values()) writeStagedDoc(ctx, 'authors', author.slug, author, author.wp.databaseId)
}

// ── Media ─────────────────────────────────────────────────────────────────────

/** Filename → human-readable alt text fallback: `my-photo.webp` → "My photo". */
function filenameToAlt(base: string): string {
  const words = base.replace(/[-_]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function normalizeMedia(ctx: Ctx): void {
  const { cfg } = ctx
  // authed capture is a superset (private/unattached included) — prefer it
  const byId = new Map<number, RestMedia>()
  for (const m of loadArray<RestMedia>(cfg, 'rest/media.json')) byId.set(m.id, m)
  for (const m of loadArray<RestMedia>(cfg, 'rest/media-authed.json')) byId.set(m.id, m)

  // Docs whose alt was empty and got a filename-derived fallback — surfaced
  // in a report for the gate reviewer, since it's a guess, not real alt text.
  const altFallbacks: string[] = []

  for (const m of byId.values()) {
    const sourceUrl = m.source_url ?? ''
    if (!sourceUrl) continue
    const denyReason = deniedMediaReason(ctx.denylist, { wpId: m.id, sourceUrl })
    if (denyReason) {
      console.warn(`[normalize] skipped ${denyReason}`)
      continue
    }
    const relPath = sourceUrl.replace(/^https?:\/\/[^/]+\//, '')
    const base = path.basename(relPath).replace(/\.[a-z0-9]+$/i, '')
    const rawAlt = typeof m.alt_text === 'string' ? m.alt_text.trim() : ''
    const alt = rawAlt || filenameToAlt(base)
    if (!rawAlt) altFallbacks.push(`${relPath} → "${alt}"`)
    const doc: StagedMedia = {
      collection: 'media',
      sourceUrl,
      alt,
      caption: toExcerpt(m.caption?.rendered),
      mimeType: m.mime_type ?? undefined,
      localPath: relPath || null,
      wp: { databaseId: m.id },
    }
    writeStagedDoc(ctx, 'media', `${m.id}-${base}`, doc, m.id)
  }

  if (altFallbacks.length) {
    const report =
      `# Media alt-text fallbacks (${altFallbacks.length})\n\n` +
      'These media docs had no alt_text from WP — alt was derived from the filename. Review at gate.\n\n' +
      altFallbacks.map((l) => `- ${l}`).join('\n') +
      '\n'
    fs.mkdirSync(stagedDir(cfg), { recursive: true })
    fs.writeFileSync(path.join(stagedDir(cfg), 'media-alt-fallback-report.md'), report, 'utf-8')
  }
}

// ── Menus ─────────────────────────────────────────────────────────────────────

export function normalizeMenuUrl(
  pathValue: string | null | undefined,
  urlValue: string | null | undefined,
  hostRe: RegExp,
): string {
  const source = urlValue || pathValue
  if (!source || source === '#') return '#'
  const rel = source.replace(hostRe, '')
  return rel || '/'
}

/** Flat WP menu items (`parentDatabaseId`) → a tree of ANY depth. Orphans and parent cycles become top-level items. */
export function buildMenuTree(
  items: RawMenuItem[],
  normUrl: (path?: string | null, url?: string | null) => string,
): StagedMenuNode[] {
  const sorted = [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const nodes = new Map<number, StagedMenuNode>()
  for (const item of sorted) {
    nodes.set(item.databaseId, {
      label: decodeSeoEntities(item.label ?? ''),
      url: normUrl(item.path, item.url),
      children: [],
    })
  }
  const roots: StagedMenuNode[] = []
  const parentOf = new Map<number, number>()
  for (const item of sorted) {
    const node = nodes.get(item.databaseId)
    if (!node) continue
    const parentId = item.parentDatabaseId || undefined
    const parent = parentId !== undefined ? nodes.get(parentId) : undefined
    if (parentId !== undefined && !parent) {
      console.warn(`[normalize] menu item ${item.databaseId} has unknown parent ${parentId} — promoted to top level`)
    }
    let cyclic = parentId === item.databaseId
    for (let at = parentId, hops = 0; at !== undefined && !cyclic && hops <= items.length; hops++) {
      if (at === item.databaseId) cyclic = true
      at = parentOf.get(at)
    }
    if (parent && parentId !== undefined && !cyclic) {
      parentOf.set(item.databaseId, parentId)
      parent.children.push(node)
    } else {
      if (cyclic) console.warn(`[normalize] menu item ${item.databaseId} is part of a parent cycle — promoted to top level`)
      roots.push(node)
    }
  }
  return roots
}

/** Theme location slug / menu name → CMS menu location (heuristic; PRIMARY when nothing matches). */
export function menuLocationFor(label: string): StagedMenuLocation {
  const lower = label.toLowerCase()
  const tokens = new Set(lower.split(/[^a-z]+/).filter(Boolean))
  if (lower.includes('footer')) return 'FOOTER_MENU'
  if (lower.includes('mobile')) return 'MOBILE_MENU'
  if (tokens.has('secondary') || tokens.has('top') || tokens.has('topbar')) return 'SECONDARY_MENU'
  if (lower.includes('account') || lower.includes('logged')) return 'LOGGEDIN_ACCOUNT_MENU'
  return 'PRIMARY'
}

function normalizeMenus(ctx: Ctx): void {
  const { cfg } = ctx
  const menus = loadJson<RawMenu[]>(cfg, 'content/menus.json', true)
  if (!menus) {
    console.warn('[normalize] raw/content/menus.json missing — no menus staged')
    return
  }
  const hosts = [cfg.wpHost, sourcePublicHost(cfg), cfg.domain].map((h) => h.replace(/\./g, '\\.')).join('|')
  // lookahead: `example.com.evil.net` must not be mistaken for an internal link
  const hostRe = new RegExp(`^https?://(?:www\\.)?(?:${hosts})(?=[/?#]|$)`, 'i')
  const normUrl = (p?: string | null, url?: string | null): string => normalizeMenuUrl(p, url, hostRe)

  // Menus bound to a theme location claim their slot first; unassigned menus
  // are placed by name afterwards. Within each group the first menu wins.
  const assigned = menus.filter((m) => (m.locations ?? []).length > 0)
  const unassigned = menus.filter((m) => (m.locations ?? []).length === 0)
  const taken = new Set<StagedMenuLocation>()
  const unmappedStems = new Set<string>()

  for (const menu of [...assigned, ...unassigned]) {
    const tree = buildMenuTree(menu.items ?? [], normUrl)
    const candidates = new Map<StagedMenuLocation, string | undefined>()
    for (const loc of menu.locations ?? []) {
      const target = menuLocationFor(loc)
      if (!candidates.has(target)) candidates.set(target, loc)
    }
    if (candidates.size === 0) candidates.set(menuLocationFor(menu.name ?? ''), undefined)

    let placed = false
    for (const [location, themeLocation] of candidates) {
      if (taken.has(location)) continue
      taken.add(location)
      placed = true
      const doc: StagedMenu = {
        collection: 'menus',
        location,
        tree,
        wp: { databaseId: menu.databaseId, name: menu.name, ...(themeLocation ? { location: themeLocation } : {}) },
      }
      writeStagedDoc(ctx, 'menus', location, doc, menu.databaseId)
    }
    if (!placed) {
      const [location] = candidates.keys()
      let stem = `.unmapped-${safeFileStem(menu.name || String(menu.databaseId)).replace(/^_+/, '')}`
      if (unmappedStems.has(stem)) stem = `${stem}-${menu.databaseId}`
      unmappedStems.add(stem)
      const doc: StagedMenu = {
        collection: 'menus',
        location,
        tree,
        wp: { databaseId: menu.databaseId, name: menu.name },
      }
      const dir = path.join(stagedDir(cfg), 'menus')
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, `${stem}.json`), JSON.stringify(doc, null, 2) + '\n', 'utf-8')
      console.warn(
        `[normalize] menu "${menu.name}" maps to ${location}, already taken by an earlier menu — written to menus/${stem}.json`,
      )
    }
  }
}

// ── Site config (WP settings + homepage JSON-LD) ──────────────────────────────

type KnowledgeGraph = NonNullable<StagedSiteConfig['knowledgeGraph']>
type BusinessType = KnowledgeGraph['businessType']
type SocialPlatform = StagedSiteConfig['socialProfiles'][number]['platform']
type DayCode = 'Mo' | 'Tu' | 'We' | 'Th' | 'Fr' | 'Sa' | 'Su'

interface JsonLdNode {
  '@type'?: string | string[]
  '@id'?: string
  name?: string
  legalName?: string
  description?: string
  email?: string
  telephone?: string
  priceRange?: string
  address?: {
    streetAddress?: string
    addressLocality?: string
    addressRegion?: string
    postalCode?: string
    addressCountry?: string
  }
  location?: { '@id'?: string }
  geo?: { latitude?: unknown; longitude?: unknown }
  logo?: string | { '@id'?: string; url?: string; contentUrl?: string }
  url?: string
  openingHours?: unknown[]
  foundingDate?: string
  sameAs?: unknown[]
  potentialAction?: unknown
  '@graph'?: unknown
  contentUrl?: string
  /** SearchAction.target — string or `{ urlTemplate }`. */
  target?: unknown
  urlTemplate?: unknown
}

function isJsonLdNode(value: unknown): value is JsonLdNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function typesOf(node: JsonLdNode | undefined): string[] {
  const raw = node?.['@type']
  return (Array.isArray(raw) ? raw : [raw]).filter((t): t is string => typeof t === 'string')
}

const DAY_CODE_BY_NAME: Record<string, DayCode> = {
  monday: 'Mo',
  tuesday: 'Tu',
  wednesday: 'We',
  thursday: 'Th',
  friday: 'Fr',
  saturday: 'Sa',
  sunday: 'Su',
  mo: 'Mo',
  tu: 'Tu',
  we: 'We',
  th: 'Th',
  fr: 'Fr',
  sa: 'Sa',
  su: 'Su',
}

const VALID_BUSINESS_TYPES: Record<BusinessType, true> = {
  LocalBusiness: true,
  Organization: true,
  ProfessionalService: true,
  Store: true,
  Restaurant: true,
}

/** Other schema.org LocalBusiness subtypes the CMS has no dedicated option for → generic LocalBusiness. */
const LOCAL_BUSINESS_ALIASES: Record<string, true> = {
  TravelAgency: true,
  TouristInformationCenter: true,
  AutomotiveBusiness: true,
  FoodEstablishment: true,
  HealthAndBeautyBusiness: true,
  LodgingBusiness: true,
  Hotel: true,
  EntertainmentBusiness: true,
  FinancialService: true,
  HomeAndConstructionBusiness: true,
  MedicalBusiness: true,
  SportsActivityLocation: true,
}

function finiteNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function rewriteSiteUrl(value: string, cfg: SiteMigrationConfig): string {
  return value
    .replace(new RegExp(`https?://${cfg.wpHost.replace(/\./g, '\\.')}`, 'gi'), `https://${cfg.domain}`)
    .replace(
      new RegExp(`https?://(?:www\\.)?${sourcePublicHost(cfg).replace(/\./g, '\\.')}`, 'gi'),
      `https://${cfg.domain}`,
    )
}

/** Parse the homepage JSON-LD blob (raw JSON or one/more `<script type="application/ld+json">` blocks) into graph nodes. */
export function parseHomepageGraph(raw: string | null | undefined): JsonLdNode[] {
  if (typeof raw !== 'string' || !raw.trim()) return []
  const scripts = [...raw.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1])
  const chunks = scripts.length ? scripts : [raw]
  const nodes: JsonLdNode[] = []
  for (const chunk of chunks) {
    try {
      const parsed: unknown = JSON.parse(chunk)
      if (Array.isArray(parsed)) nodes.push(...parsed.filter(isJsonLdNode))
      else if (isJsonLdNode(parsed)) {
        const graph = parsed['@graph']
        if (Array.isArray(graph)) nodes.push(...graph.filter(isJsonLdNode))
        else nodes.push(parsed)
      }
    } catch {
      console.warn('[normalize] homepage JSON-LD block is invalid JSON — skipped')
    }
  }
  return nodes
}

function normalizeOpeningHours(values: unknown[]): Array<{ dayOfWeek: DayCode[]; opens: string; closes: string }> {
  return values.flatMap((value) => {
    if (typeof value !== 'string') return []
    const match = value.trim().match(/^(.+?)\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/)
    if (!match) return []
    const dayOfWeek = match[1]
      .split(',')
      .map((day) => DAY_CODE_BY_NAME[day.trim().toLowerCase()])
      .filter((day): day is DayCode => Boolean(day))
    return dayOfWeek.length ? [{ dayOfWeek, opens: match[2], closes: match[3] }] : []
  })
}

function normalizeFoundingDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  const dmy = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : undefined
}

function socialPlatform(url: string): SocialPlatform {
  const lower = url.toLowerCase()
  if (lower.includes('facebook.com')) return 'Facebook'
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'YouTube'
  if (lower.includes('zalo.me')) return 'Zalo'
  if (lower.includes('twitter.com') || /(^|[/.])x\.com/.test(lower)) return 'X'
  if (lower.includes('instagram.com')) return 'Instagram'
  if (lower.includes('tiktok.com')) return 'TikTok'
  if (lower.includes('linkedin.com')) return 'LinkedIn'
  return 'Other'
}

/** Logo URL of a JSON-LD entity: inline ImageObject, plain string, or an `@id` reference into the graph (Yoast). */
function logoUrlOf(node: JsonLdNode | undefined, graph: JsonLdNode[]): string | undefined {
  const logo = node?.logo
  if (typeof logo === 'string') return logo || undefined
  if (!logo) return undefined
  const direct = logo.url ?? logo.contentUrl
  if (direct) return direct
  const ref = logo['@id'] ? graph.find((g) => g['@id'] === logo['@id']) : undefined
  return ref?.url ?? ref?.contentUrl
}

/** WebSite → SearchAction target (string, `{ urlTemplate }`, or an array of actions). */
function searchActionTarget(website: JsonLdNode | undefined): string | undefined {
  const actions = website?.potentialAction
  for (const action of Array.isArray(actions) ? actions : [actions]) {
    if (!isJsonLdNode(action)) continue
    const target = action.target
    if (typeof target === 'string') return target
    if (isJsonLdNode(target)) {
      const template = target.urlTemplate
      if (typeof template === 'string') return template
    }
  }
  return undefined
}

function buildKnowledgeGraph(cfg: SiteMigrationConfig, graph: JsonLdNode[]): { kg?: KnowledgeGraph; sameAs: string[] } {
  const orgLike = graph.find((node) => {
    const types = typesOf(node)
    return (
      types.includes('Organization') ||
      types.includes('LocalBusiness') ||
      types.some((t) => Object.hasOwn(VALID_BUSINESS_TYPES, t) || Object.hasOwn(LOCAL_BUSINESS_ALIASES, t))
    )
  })
  const person = orgLike ? undefined : graph.find((node) => typesOf(node).includes('Person'))
  const entity = orgLike ?? person
  if (!entity) return { sameAs: [] }

  const types = typesOf(entity)
  const placeId = entity.location?.['@id']
  const place = graph.find((node) => typesOf(node).includes('Place') && (!placeId || node['@id'] === placeId))
  const website = graph.find((node) => typesOf(node).includes('WebSite'))
  const subtype = types.find((t): t is BusinessType => t !== 'Organization' && Object.hasOwn(VALID_BUSINESS_TYPES, t))
  const businessType: BusinessType =
    subtype ??
    (types.includes('LocalBusiness') || types.some((t) => Object.hasOwn(LOCAL_BUSINESS_ALIASES, t))
      ? 'LocalBusiness'
      : 'Organization')
  const address = entity.address ?? place?.address
  const geo = entity.geo ?? place?.geo
  const logoUrl = logoUrlOf(entity, graph)
  const sameAs = Array.isArray(entity.sameAs)
    ? entity.sameAs.filter((url): url is string => typeof url === 'string' && Boolean(url))
    : []
  const searchUrl = searchActionTarget(website)

  const kg: KnowledgeGraph = {
    type: types.includes('Person') ? 'Person' : 'Organization',
    businessType,
    name: entity.name ? decodeSeoEntities(entity.name) : undefined,
    legalName: entity.legalName || undefined,
    description: entity.description || undefined,
    logo: logoUrl ? { wpId: null, sourceUrl: logoUrl, alt: entity.name || undefined } : undefined,
    email: entity.email || undefined,
    telephone: entity.telephone || undefined,
    priceRange: entity.priceRange || undefined,
    address: address
      ? {
          streetAddress: address.streetAddress || undefined,
          addressLocality: address.addressLocality || undefined,
          addressRegion: address.addressRegion || undefined,
          postalCode: address.postalCode || undefined,
          addressCountry: address.addressCountry || undefined,
        }
      : undefined,
    geo: geo
      ? { latitude: finiteNumber(geo.latitude) ?? undefined, longitude: finiteNumber(geo.longitude) ?? undefined }
      : undefined,
    openingHours: normalizeOpeningHours(entity.openingHours ?? []),
    foundingDate: normalizeFoundingDate(entity.foundingDate),
    searchActionUrl: searchUrl ? rewriteSiteUrl(searchUrl, cfg) : undefined,
  }
  return { kg, sameAs }
}

export function buildStagedSiteConfig(cfg: SiteMigrationConfig, site: RawSite | null): StagedSiteConfig {
  const { kg, sameAs } = buildKnowledgeGraph(cfg, parseHomepageGraph(site?.homepageJsonLd))
  const name = site?.name ? decodeSeoEntities(site.name) : undefined
  const description = site?.description ? decodeSeoEntities(site.description) : undefined
  return {
    collection: 'site',
    siteKey: cfg.site,
    domain: cfg.domain,
    defaultLanguage: cfg.language,
    name,
    description,
    branding: {
      logo: mediaRef(site?.logo),
      favicon: mediaRef(site?.favicon),
    },
    integration: {
      ga4Id: site?.ga4Id || undefined,
      gtmId: site?.gtmId || undefined,
    },
    knowledgeGraph: kg,
    socialProfiles: [...new Set(sameAs)].map((url) => ({ platform: socialPlatform(url), url })),
  }
}

function normalizeSite(ctx: Ctx): void {
  const site = loadJson<RawSite>(ctx.cfg, 'content/site.json', true)
  if (!site) console.warn('[normalize] raw/content/site.json missing — site config staged from CLI values only')
  writeStagedDoc(ctx, 'site', 'site-config', buildStagedSiteConfig(ctx.cfg, site))
}

// ── Comments ──────────────────────────────────────────────────────────────────

function cleanCommentContent(html: string): string {
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
  return decodeSeoEntities(text).trim()
}

/** WP comment status → staged status; `undefined` = drop (trash). */
export function mapCommentStatus(status: string | null | undefined): StagedComment['status'] | undefined {
  switch ((status ?? '').toLowerCase()) {
    case 'approved':
    case 'approve':
    case '1':
      return 'approved'
    case 'spam':
      return 'spam'
    case 'trash':
      return undefined
    default:
      return 'pending' // hold / unapproved / pending
  }
}

function normalizeComments(ctx: Ctx): void {
  const rawComments = loadArray<RawComment>(ctx.cfg, 'content/comments.json')
  if (!rawComments.length) return

  const targets = new Map<number, { type: 'post' | 'product'; slug: string }>()
  for (const source of ctx.sources) {
    if (source.target === 'pages') continue
    for (const n of keptNodes(ctx, source)) {
      targets.set(n.databaseId, { type: source.target === 'products' ? 'product' : 'post', slug: n.slug })
    }
  }

  let unknownTarget = 0
  for (const c of rawComments) {
    const target = targets.get(c.postDatabaseId)
    if (!target) {
      unknownTarget++
      continue
    }
    const status = mapCommentStatus(c.status)
    if (!status) continue
    const content = cleanCommentContent(c.content ?? '')
    if (!content) continue
    const doc: StagedComment = {
      collection: 'comments',
      authorName: decodeSeoEntities(c.authorName || 'Anonymous').trim() || 'Anonymous',
      authorEmail: c.authorEmail || null,
      content,
      status,
      createdAt: normalizeWpDate(c.date) ?? new Date().toISOString(),
      wp: { databaseId: c.databaseId },
      target: { type: target.type, slug: target.slug, wpId: c.postDatabaseId },
    }
    writeStagedDoc(ctx, 'comments', String(c.databaseId), doc, c.databaseId)
  }
  if (unknownTarget) {
    console.warn(
      `[normalize] ${unknownTarget} comment(s) skipped — their target is a page, a skipped translation, or not in the archive`,
    )
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

/** Fail loudly when the site language filter would drop every language-tagged node (usually a wrong --lang). */
function assertLanguageFilterKeepsSomething(ctx: Ctx): void {
  const tagged: string[] = []
  const collect = (lang: string | null | undefined) => {
    if (lang) tagged.push(lang)
  }
  for (const source of ctx.sources) {
    for (const n of loadArray<RawPostBase>(ctx.cfg, `content/${source.name}.json`)) collect(n.lang)
  }
  const terms = loadJson<RawTermsFile>(ctx.cfg, 'content/terms.json', true)
  for (const taxonomy of Object.values(terms?.taxonomies ?? {})) for (const t of taxonomy.terms ?? []) collect(t.lang)
  if (tagged.length > 0 && !tagged.some((lang) => langMatches(lang, ctx.cfg.language))) {
    const seen = [...new Set(tagged)].sort().join(', ')
    throw new Error(
      `every language-tagged node in the archive is "${seen}" but the site language is "${ctx.cfg.language}" — ` +
        'pass --lang with the right language so content is not skipped',
    )
  }
}

function writeSkippedTranslations(ctx: Ctx, ran: ReadonlySet<string>): void {
  const file = path.join(stagedDir(ctx.cfg), '_skipped-translations.json')
  let previous: SkippedTranslation[] = []
  if (fs.existsSync(file)) {
    try {
      previous = JSON.parse(fs.readFileSync(file, 'utf-8')) as SkippedTranslation[]
    } catch {
      previous = []
    }
  }
  const merged = [...previous.filter((e) => !ran.has(e.collection)), ...ctx.skipped.filter((e) => ran.has(e.collection))]
  if (merged.length === 0) {
    fs.rmSync(file, { force: true })
    return
  }
  fs.mkdirSync(stagedDir(ctx.cfg), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(merged, null, 2) + '\n', 'utf-8')
  console.warn(
    `[normalize] ${ctx.skipped.length} translation(s) outside language "${ctx.cfg.language}" skipped — see staged/_skipped-translations.json`,
  )
}

/**
 * `only` restricts normalization to a subset of staged collections
 * (pages, posts, products, taxonomies, authors, media, menus, site, comments, faqs).
 * Omit it to normalize everything the raw snapshot contains.
 * `options.cptMap` maps custom post types (`content/<cpt>.json`) to a staged collection.
 */
export function normalizeRawToStaged(
  cfg: SiteMigrationConfig,
  only?: ReadonlySet<string>,
  options: NormalizeOptions = {},
): NormalizeCounts {
  const runs = (collection: string): boolean => !only || only.has(collection)
  const ctx: Ctx = {
    cfg,
    counts: {},
    denylist: loadMediaDenylist(cfg),
    mediaRefs: sourceMediaRefsByUrl(cfg),
    sources: discoverSources(cfg, options),
    usedFiles: new Map(),
    skipped: [],
    nodeCache: new Map(),
  }
  assertLanguageFilterKeepsSomething(ctx)

  normalizeContent(ctx, runs)
  if (runs('taxonomies')) normalizeTaxonomies(ctx)
  if (runs('authors')) normalizeAuthors(ctx)
  if (runs('media')) normalizeMedia(ctx)
  if (runs('menus')) normalizeMenus(ctx)
  if (runs('site')) normalizeSite(ctx)
  if (runs('comments')) normalizeComments(ctx)
  if (runs('faqs')) fs.mkdirSync(path.join(stagedDir(cfg), 'faqs'), { recursive: true })

  const ran = new Set(['pages', 'posts', 'products', 'taxonomies'].filter(runs))
  writeSkippedTranslations(ctx, ran)
  return ctx.counts
}
