/**
 * Phase `content` — upsert pages/posts/products from staged/.
 *
 * Key contracts:
 *   - body → contentMd only; the legacy Lexical `content` field stays empty
 *   - slug set verbatim from WP (do NOT let the hook derive it)
 *   - status from staged (editor-approved at the gate) — publish stays published
 *   - publishedAt = WP date, kept via the PRESERVE_SOURCE_PUBLISHED_AT context
 *     flag (the scheduled-publish hook would otherwise stamp now() on a new
 *     published doc, losing the real date in listings/ordering). The date also
 *     goes into seo.articleMeta.publishedTime/modifiedTime, which generate-jsonld
 *     preserves
 *   - hook-owned fields are never written: jsonLd.raw, breadcrumbs, excerpt
 *     (when empty), createdBy, commentCount
 *   - products.prices is maxRows:1 — a WooCommerce price becomes prices[0]
 *
 * Idempotency / relationships:
 *   - skip-if-unchanged: hash the data we own, skip update when the live
 *     doc already matches (hooks don't re-fire, no needless cache purge).
 *   - faqs relationship: resolve faqs-group names from staged into faqs doc
 *     ids via a runtime lookup so pages/posts/products can attach them.
 */
import { createHash } from 'crypto'
import { makeLogger, staged, taxonomyIdMap, findBySlugTenant, type ImportContext } from './import-context'
import { PRESERVE_SOURCE_PUBLISHED_AT } from '../../fields/sidebar-meta-fields'
import { ratingToWrite } from './kk-star-rating'
import type { StagedPage, StagedPost, StagedProduct } from './staged-doc-types'
import { SUPPORTED_CURRENCIES } from './wp-migration-config'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Data = Record<string, any>

/**
 * seo.openGraph.image is an `upload` relationship — it needs a media id, not a
 * URL — so this phase must never write a string value verbatim. The seo phase
 * resolves the source image to a real media id and re-applies the full seo
 * group right after this phase runs.
 *
 * Also drops `openGraph.updatedTime` — the schema has no such sub-field (only a
 * top-level, hook-owned `seo.updatedTime`); Payload silently drops it on write,
 * so it would otherwise show as a permanent, unfixable diff in the
 * skip-if-unchanged hash.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stripUnresolvedOgImageUrl(seo: Record<string, any>): Record<string, any> {
  if (!seo.openGraph) return seo
  const { updatedTime: _staleOgUpdatedTime, ...ogRest } = seo.openGraph
  if (typeof ogRest.image !== 'string') return { ...seo, openGraph: ogRest }
  const { image: _unresolvedImageUrl, ...ogRestNoImage } = ogRest
  return { ...seo, openGraph: ogRestNoImage }
}

function baseContentData(doc: StagedPage | StagedPost | StagedProduct, ctx: ImportContext): Data {
  const data: Data = {
    title: doc.title,
    slug: doc.slug,
    contentMd: doc.contentMd,
    status: doc.status,
    tenant: ctx.tenantId,
  }
  if (doc.date) {
    data.publishedAt = doc.date
    // Real WP dates survive the scheduled-publish hook only here (G4):
    data.seo = stripUnresolvedOgImageUrl({
      ...(doc.seo ?? {}),
      articleMeta: { publishedTime: doc.date, ...(doc.modified ? { modifiedTime: doc.modified } : {}) },
    })
  } else if (doc.seo && Object.keys(doc.seo).length) {
    data.seo = stripUnresolvedOgImageUrl(doc.seo)
  }
  return data
}

/**
 * The single price row the schema allows, from a staged WooCommerce price.
 * An unsupported currency is omitted (the field then defaults to VND); the
 * review gate warns about it so the editor fixes the price by hand.
 */
export function pickPrimaryPrice(
  price: StagedProduct['price'],
): { originalPrice: number; currentPrice: number; currency?: string } | null {
  if (!price) return null
  const regular = price.regular ?? price.sale
  if (regular == null) return null
  const current = price.sale ?? regular
  const currency = price.currency?.toUpperCase()
  return {
    originalPrice: Math.max(regular, current),
    currentPrice: current,
    ...(currency && SUPPORTED_CURRENCIES.includes(currency) ? { currency } : {}),
  }
}

/**
 * Resolve staged term refs (core + custom taxonomies) against the current
 * site's taxonomy ids. Custom taxonomies are stored as type `custom` with the
 * WP taxonomy slug in `customType`, so the lookup key is `custom:<wpTaxonomy>:<slug>`.
 */
export function taxonomyIdsForDoc(
  doc: Pick<StagedPost | StagedProduct, 'categories' | 'tags' | 'customTerms'>,
  taxonomyIds: ReadonlyMap<string, string | number>,
  categoryType: 'category' | 'product-category' = 'category',
): Array<string | number> {
  const keys = [
    ...doc.categories.map((term) => `${categoryType}:${term.slug}`),
    ...doc.tags.map((term) => `tag:${term.slug}`),
    ...(doc.customTerms ?? []).map((term) => `custom:${term.taxonomy}:${term.slug}`),
  ]
  const ids: Array<string | number> = []
  const seen = new Set<string | number>()
  for (const key of keys) {
    const id = taxonomyIds.get(key)
    if (id == null || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

/**
 * ISO 8601 datetime, offset optional — matches the `+07:00`-offset strings
 * staged/ carries for most docs, the occasional offset-LESS string staged/
 * carries for a few (WP exported these without a timezone, always meaning
 * UTC), and the `.000Z`-suffixed strings Payload's Local API returns. Same
 * instant, different string — plain string compare would treat all of these
 * as a diff and force a no-op "update" every run.
 */
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/

/**
 * `new Date(str)` parses an offset-LESS datetime string as local time in the
 * running process's timezone, not UTC — on this machine (UTC+7) that would
 * silently shift an offset-less staged/ date 7h off from what Payload
 * actually stored (Payload/Postgres treat offset-less input as UTC). Append
 * `Z` before parsing so both sides normalize to the same instant.
 */
function normalizeIsoDatetime(value: string): string {
  const hasOffset = /(Z|[+-]\d{2}:\d{2})$/.test(value)
  return new Date(hasOffset ? value : `${value}Z`).toISOString()
}

/**
 * Recursively sort object keys (arrays keep order) so two structurally-equal
 * values always serialize identically, at every nesting depth — a plain
 * `JSON.stringify(obj, Object.keys(obj).sort())` only sorts/filters the
 * TOP level; passing an array replacer to JSON.stringify actually filters
 * every level by that same top-level key list, so nested objects (e.g.
 * `seo.openGraph`) always collapsed to `{}` regardless of content. Also
 * normalizes ISO datetime strings to a single instant representation.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    const sorted: Data = {}
    for (const key of Object.keys(value as Data).sort()) sorted[key] = canonicalize((value as Data)[key])
    return sorted
  }
  if (typeof value === 'string' && ISO_DATETIME_RE.test(value)) return normalizeIsoDatetime(value)
  return value
}

/** Stable SHA256 hash of the payload the importer owns. Used to skip no-op writes. */
export function hashPayload(data: Data): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(data))).digest('hex').slice(0, 16)
}

/**
 * Narrow `live` down to exactly the shape of `shape`, recursively. Payload
 * group fields (e.g. `seo`) are stored as flat Postgres columns but always
 * come back from the Local API as the FULL group object — every sub-field
 * the schema defines, including ones owned by other phases/hooks (seo
 * phase's `robots`/`canonicalOverride`, generate-jsonld's `jsonLd`/
 * `breadcrumbs`). `data`'s own `seo` is a sparse object with only what this
 * phase writes, so comparing the two nested objects whole would always
 * differ — narrow `live` to `data`'s own keys at every depth so the
 * comparison only looks at fields this phase actually owns. Array-of-object
 * fields (e.g. `prices`) get the same per-element narrowing — Payload row
 * arrays always carry a generated `id` (and unset-field defaults like
 * `validUntil: null`) this phase never writes, which would otherwise always
 * show as a diff. A length mismatch is a real difference, so it's left
 * unprojected (comparison sees the full live array, forcing an update).
 */
export function projectLive(live: unknown, shape: unknown): unknown {
  if (Array.isArray(shape)) {
    if (!Array.isArray(live) || live.length !== shape.length) return live
    return shape.map((s, i) => projectLive(live[i], s))
  }
  if (shape && typeof shape === 'object' && live && typeof live === 'object') {
    const out: Data = {}
    for (const key of Object.keys(shape as Data)) out[key] = projectLive((live as Data)[key], (shape as Data)[key])
    return out
  }
  return live
}


/** Look up faqs doc IDs by `group` name for the current tenant. */
async function faqsIdByGroup(ctx: ImportContext): Promise<Map<string, string | number>> {
  const map = new Map<string, string | number>()
  if (ctx.dryRun) return map
  let page = 1
  for (;;) {
    const result = await ctx.payload.find({
      collection: 'faqs',
      where: { tenant: { equals: ctx.tenantId } },
      limit: 200,
      page,
      depth: 0,
      overrideAccess: true,
      select: { id: true, group: true },
    } as never)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const doc of result.docs as any[]) {
      if (doc.group) map.set(doc.group, doc.id)
    }
    if (!result.hasNextPage) break
    page += 1
  }
  return map
}

async function upsert(
  ctx: ImportContext,
  collection: 'pages' | 'posts' | 'products',
  slug: string,
  data: Data,
): Promise<'create' | 'update' | 'skipped'> {
  const existing = await findBySlugTenant(ctx, collection, slug)
  if (ctx.dryRun) return existing ? 'update' : 'create'

  if (existing) {
    // skip-if-unchanged: only write when our owned payload differs. Project
    // `live` down to exactly the keys `data` carries — comparing against a
    // fixed, shorter key list (the old approach) meant incomingHash always
    // had extra keys (tenant, categories, type, prices, ...) that never
    // existed on the live-comparison side, so the two hashes could never
    // structurally match regardless of content.
    //
    // Source publishedAt and seo.articleMeta.modifiedTime are authoritative
    // import fields. Include them in the comparison so date-only repairs are
    // written; the preserve-source context keeps the hooks from re-dating them.
    // Visitors keep voting on the CMS: never lower a live rating with the staged
    // snapshot (see ratingToWrite). Resolved before hashing so the skip check
    // compares the value we would actually write.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const live = await ctx.payload.findByID({ collection, id: existing, depth: 0, overrideAccess: true }) as any
    if (data.kkStarRating !== undefined) {
      const rating = ratingToWrite(data.kkStarRating, live.kkStarRating)
      if (rating) data = { ...data, kkStarRating: rating }
      else {
        const { kkStarRating: _kept, ...rest } = data
        data = rest
      }
    }
    const liveComparable = projectLive(live, data) as Data
    if (hashPayload(data) === hashPayload(liveComparable)) return 'skipped'
    await ctx.payload.update({
      collection,
      id: existing,
      data: data as never,
      depth: 0,
      overrideAccess: true,
      context: { [PRESERVE_SOURCE_PUBLISHED_AT]: true },
    })
    return 'update'
  }
  await ctx.payload.create({
    collection,
    data: data as never,
    overrideAccess: true,
    context: { [PRESERVE_SOURCE_PUBLISHED_AT]: true },
  })
  return 'create'
}

export async function runContentPhase(ctx: ImportContext): Promise<void> {
  const log = makeLogger('content')
  const taxonomies = await taxonomyIdMap(ctx)
  const faqsByGroup = await faqsIdByGroup(ctx)
  const counts = { created: 0, updated: 0, skipped: 0, errors: 0 }
  const tally = (r: 'create' | 'update' | 'skipped') => {
    if (r === 'create') counts.created++
    else if (r === 'update') counts.updated++
    else counts.skipped++
  }

  // authors by slug (posts)
  const authorIds = new Map<string, string | number>()
  const authorsResult = await ctx.payload.find({
    collection: 'authors',
    where: { tenant: { equals: ctx.tenantId } },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const a of authorsResult.docs as any[]) authorIds.set(a.slug, a.id)

  for (const page of staged.pages(ctx.cfg)) {
    try {
      const data = baseContentData(page, ctx)
      const faqIds = (page.faqs ?? []).map((g) => faqsByGroup.get(g)).filter(Boolean)
      if (faqIds.length) data.faqs = faqIds
      const r = await upsert(ctx, 'pages', page.slug, data)
      log(`${ctx.dryRun ? 'DRY ' : ''}${r} pages/${page.slug} [${page.status}] faqs=${faqIds.length}`)
      tally(r)
    } catch (err) {
      log(`ERROR pages/${page.slug}: ${err instanceof Error ? err.message : err}`)
      counts.errors++
    }
  }

  for (const post of staged.posts(ctx.cfg)) {
    try {
      const data = baseContentData(post, ctx)
      if (post.kkStarRating) data.kkStarRating = post.kkStarRating
      if (post.excerpt) data.excerpt = post.excerpt
      const author = post.authorSlug ? authorIds.get(post.authorSlug) : undefined
      if (author) data.author = author
      const catIds = taxonomyIdsForDoc(post, taxonomies)
      if (catIds.length) data.categories = catIds
      const faqIds = (post.faqs ?? []).map((g) => faqsByGroup.get(g)).filter(Boolean)
      if (faqIds.length) data.faqs = faqIds
      const r = await upsert(ctx, 'posts', post.slug, data)
      log(`${ctx.dryRun ? 'DRY ' : ''}${r} posts/${post.slug} [${post.status}]${author ? ` author=${post.authorSlug}` : ''} faqs=${faqIds.length}`)
      tally(r)
    } catch (err) {
      log(`ERROR posts/${post.slug}: ${err instanceof Error ? err.message : err}`)
      counts.errors++
    }
  }

  for (const product of staged.products(ctx.cfg)) {
    try {
      const data = baseContentData(product, ctx)
      if (product.excerpt) data.excerpt = product.excerpt
      if (product.kkStarRating) data.kkStarRating = product.kkStarRating
      const price = pickPrimaryPrice(product.price)
      if (price) data.prices = [price]
      const catIds = taxonomyIdsForDoc(product, taxonomies, 'product-category')
      if (catIds.length) data.categories = catIds
      const faqIds = (product.faqs ?? []).map((g) => faqsByGroup.get(g)).filter(Boolean)
      if (faqIds.length) data.faqs = faqIds
      const r = await upsert(ctx, 'products', product.slug, data)
      log(
        `${ctx.dryRun ? 'DRY ' : ''}${r} products/${product.slug} [${product.status}]` +
          ` price=${price ? price.currentPrice : '-'} cats=${catIds.length} faqs=${faqIds.length}`,
      )
      tally(r)
    } catch (err) {
      log(`ERROR products/${product.slug}: ${err instanceof Error ? err.message : err}`)
      counts.errors++
    }
  }

  log(`done — created: ${counts.created}, updated: ${counts.updated}, skipped: ${counts.skipped}, errors: ${counts.errors}`)
  if (counts.errors) throw new Error(`content phase finished with ${counts.errors} error(s)`)
}
