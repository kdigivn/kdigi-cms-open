#!/usr/bin/env node
/**
 * Regenerates seo.jsonLd.raw for every post, page, product and taxonomy term of
 * one site by calling the graph assembler directly (bypasses the afterChange
 * hook to avoid double-save overhead) and writing only the JSON-LD column.
 *
 * Run it after changing site-level data that is embedded in the @graph
 * (organization name, logo, knowledge graph, footer/contact details) or after a
 * bulk import that skipped the hook.
 *
 * Idempotent: safe to re-run. Only touches seo.jsonLd.raw.
 *
 * Usage:
 *   node --env-file=.env --import tsx src/importers/regen-jsonld.ts --site <siteKey> \
 *     [--dry-run] [--collection posts|pages|products|taxonomies]
 *
 *   --site <siteKey>   : REQUIRED. Sites.siteKey of the site to regenerate
 *   --dry-run          : print output node types without updating the DB
 *   --collection <c>   : only regen one collection (default: all four)
 */
import { getPayload, type Payload } from 'payload'
import { fileURLToPath } from 'url'
import config from '../payload.config'
import { loadSiteJsonLdConfig, type SiteJsonLdConfig } from '../lib/jsonld/site-config-loader'
import { serializeJsonLdScript } from '../lib/jsonld/serialize'
import { buildJsonLdColumnsUpdate } from '../hooks/persist-jsonld-raw'
import { jsonLdSlugForDocument, resolveOgImageUrl } from '../hooks/generate-jsonld'
import { segmentForTaxonomyType, type SlugLocale } from '../fields/slug-url-prefix-map'
import {
  assemblePostGraph,
  assemblePageGraph,
  assembleProductGraph,
  assembleTaxonomyGraph,
} from '../lib/jsonld/graph-assembler'

export const JSONLD_COLLECTIONS = ['posts', 'pages', 'products', 'taxonomies'] as const
export type JsonLdRegenCollection = (typeof JSONLD_COLLECTIONS)[number]

const DRY_RUN = process.argv.includes('--dry-run')

/** Read `--name value` or `--name=value` from argv. */
function argValue(name: string): string | undefined {
  const argv = process.argv
  const eq = argv.find((a) => a.startsWith(`${name}=`))
  if (eq) return eq.slice(name.length + 1) || undefined
  const i = argv.indexOf(name)
  if (i === -1) return undefined
  const next = argv[i + 1]
  return next && !next.startsWith('--') ? next : undefined
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function visibleBreadcrumbs(raw: unknown): Array<{ url: string; text: string }> {
  if (!Array.isArray(raw)) return []
  return (raw as Array<Record<string, unknown>>)
    .filter((b) => !b.isHidden)
    .map((b) => ({ url: (b.url as string) ?? '', text: (b.text as string) ?? '' }))
    .filter((b) => b.url && b.text)
}

/**
 * Flatten FAQ relationship docs into question/answer pairs — MUST match
 * resolveFaqItems in src/hooks/generate-jsonld.ts (single source of truth for the
 * @graph). `doc.faqs` is a hasMany relationship to FAQ *groups* whose Q&A pairs
 * live in a nested `items[]` array; resolve IDs when only bare IDs are present.
 */
async function resolveFaqItems(
  payload: Payload,
  raw: unknown,
): Promise<Array<{ question?: string; answer?: string }>> {
  if (!Array.isArray(raw) || raw.length === 0) return []

  const flatten = (
    groups: Array<Record<string, unknown>>,
  ): Array<{ question?: string; answer?: string }> =>
    groups.flatMap((g) =>
      Array.isArray(g.items)
        ? (g.items as Array<Record<string, unknown>>).map((i) => ({
            question: i.question as string | undefined,
            answer: i.answer as string | undefined,
          }))
        : [],
    )

  const populated = raw.filter(
    (f): f is Record<string, unknown> => typeof f === 'object' && f !== null && 'items' in f,
  )
  if (populated.length === raw.length) return flatten(populated)

  const ids = raw
    .map((f) => (typeof f === 'object' && f !== null ? (f as { id?: unknown }).id : f))
    .filter((id): id is string | number => typeof id === 'string' || typeof id === 'number')
  if (ids.length === 0) return []
  const result = await payload.find({
    collection: 'faqs',
    where: { id: { in: ids } },
    depth: 0,
    limit: ids.length,
    pagination: false,
    overrideAccess: true,
  })
  return flatten(result.docs as unknown as Array<Record<string, unknown>>)
}

// ── Per-collection regen ──────────────────────────────────────────────────────

type DocStub = {
  id: string | number
  slug: string
  title?: string
  excerpt?: string
  seo?: Record<string, unknown>
  author?: unknown
  featuredImage?: unknown
  kkStarRating?: { avg?: number; count?: number }
  /** hasMany relationship to FAQ groups (resolved via resolveFaqItems). */
  faqs?: unknown
  modified?: string
  prices?: Array<{ currentPrice?: number; originalPrice?: number; validUntil?: string }>
  aggregateRatingOverride?: boolean
  commentCount?: number
  /** taxonomy term name (localized) — used as the title for taxonomy graphs. */
  name?: string
  /** taxonomy type (category | tag | …) — selects the URL segment prefix. */
  type?: string
  /** taxonomy description fallback when seo.description is absent. */
  description?: string
}

export async function regenCollection(
  payload: Payload,
  collection: JsonLdRegenCollection,
  tenantId: number | string,
  siteConfig: SiteJsonLdConfig,
): Promise<{ updated: number; failed: number }> {
  const stats = { updated: 0, failed: 0 }
  let page = 1
  const limit = 50

  while (true) {
    const result = await payload.find({
      collection,
      where: { tenant: { equals: tenantId } },
      limit,
      page,
      overrideAccess: true,
      depth: 1, // depth=1 to resolve author + featuredImage + seo.openGraph.image
    })

    for (const raw of result.docs as unknown as DocStub[]) {
      try {
        const seo = raw.seo ?? {}
        // Same og:image cascade as the afterChange hook: OG image → featuredImage → site default.
        const imageUrl = await resolveOgImageUrl(
          payload,
          (seo.openGraph as Record<string, unknown> | undefined)?.image,
          raw.featuredImage,
          siteConfig.defaultOgImageUrl,
        )
        const breadcrumbs = visibleBreadcrumbs(seo.breadcrumbs)
        const articleMeta = (seo.articleMeta as Record<string, unknown>) ?? {}
        const publishedTime = articleMeta.publishedTime as string | undefined
        // Match generate-jsonld.ts: doc.modified wins, then articleMeta, then updatedTime.
        const modifiedTime =
          raw.modified ??
          (articleMeta.modifiedTime as string | undefined) ??
          (seo.updatedTime as string | undefined)
        const canonicalOverride = (seo.canonicalOverride as string | undefined) || undefined
        const faqs = await resolveFaqItems(payload, raw.faqs)
        const authorName =
          typeof raw.author === 'object' && raw.author !== null
            ? ((raw.author as Record<string, unknown>).name as string | undefined)
            : undefined

        let graph: Record<string, unknown>

        if (collection === 'posts') {
          graph = assemblePostGraph({
            slug: raw.slug,
            title: raw.title ?? '',
            excerpt: raw.excerpt,
            keywords: Array.isArray(seo.focusKeywords)
              ? (seo.focusKeywords as string[]).join(', ')
              : undefined,
            publishedTime,
            modifiedTime,
            imageUrl,
            imageCaption: raw.title,
            authorName,
            faqs,
            breadcrumbs,
            canonicalOverride,
            site: siteConfig,
          })
        } else if (collection === 'pages') {
          graph = assemblePageGraph({
            slug: raw.slug,
            title: raw.title ?? '',
            description: raw.excerpt,
            publishedTime,
            modifiedTime,
            imageUrl,
            imageCaption: raw.title,
            breadcrumbs,
            faqs,
            canonicalOverride,
            site: siteConfig,
          })
        } else if (collection === 'products') {
          // Match generate-jsonld.ts: price from prices[0].currentPrice (>0 guard),
          // seller/returnPolicy/aggregate gate threaded so the Offer node survives regen.
          const rawPrice = raw.prices?.[0]?.currentPrice
          const validPrice = rawPrice !== undefined && rawPrice > 0 ? rawPrice : undefined
          if (validPrice === undefined) {
            console.warn(
              `[warn] product ${raw.slug} has no valid prices[0].currentPrice — Offer will be absent`,
            )
          }
          graph = assembleProductGraph({
            slug: jsonLdSlugForDocument('product', raw.slug),
            title: raw.title ?? '',
            description: raw.excerpt,
            imageUrl,
            imageCaption: raw.title,
            ratingAvg: raw.kkStarRating?.avg,
            ratingCount: raw.kkStarRating?.count,
            publishedTime,
            modifiedTime,
            authorName,
            faqs,
            breadcrumbs,
            price: validPrice,
            priceValidUntil: raw.prices?.[0]?.validUntil ?? undefined,
            seller: `${siteConfig.siteUrl}/#organization`,
            returnPolicyUrl: siteConfig.returnPolicyUrl,
            minReviewsForAggregate: siteConfig.minReviewsForAggregate ?? 10,
            aggregateRatingOverride: raw.aggregateRatingOverride,
            commentCount: raw.commentCount,
            canonicalOverride,
            site: siteConfig,
          })
        } else {
          // taxonomies — mirror the generate-jsonld.ts taxonomy branch: localized
          // `name` is the title; the URL slug carries the type's segment prefix.
          const termName = raw.name || raw.slug
          const siteLang: SlugLocale = siteConfig.lang === 'en' ? 'en' : 'vi'
          const prefix =
            typeof raw.type === 'string' ? segmentForTaxonomyType(raw.type, siteLang) : null
          graph = assembleTaxonomyGraph({
            slug: prefix ? `${prefix}/${raw.slug}` : raw.slug,
            title: termName,
            description: (seo.description as string | undefined) ?? raw.description,
            imageUrl,
            imageCaption: termName || undefined,
            breadcrumbs,
            canonicalOverride,
            site: siteConfig,
          })
        }

        const jsonLdRaw = serializeJsonLdScript(graph)

        if (DRY_RUN) {
          console.log(`[dry-run] ${collection}/${raw.slug}`)
          const types = (graph as { '@graph': Array<{ '@type': unknown }> })['@graph'].map(
            (n) => n['@type'],
          )
          console.log(`  types: ${JSON.stringify(types)}`)
        } else {
          // Snapshot-only write: update JUST the seo_json_ld_raw column (same statement the
          // afterChange hook uses). This bypasses collection hooks AND field validation on
          // purpose — a JSON-LD regen must not be blocked by unrelated invalid fields on the doc.
          await payload.db.drizzle.execute(
            buildJsonLdColumnsUpdate(collection, raw.id, { raw: jsonLdRaw }),
          )
          console.log(`[ok] ${collection}/${raw.slug}`)
        }

        stats.updated++
      } catch (err) {
        console.error(`[fail] ${collection}/${raw.slug}:`, err)
        stats.failed++
      }
    }

    if (!result.hasNextPage) break
    page++
  }

  return stats
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const siteKey = argValue('--site')
  if (!siteKey) {
    console.error(
      'Usage: regen-jsonld.ts --site <siteKey> [--dry-run] [--collection posts|pages|products|taxonomies]',
    )
    process.exit(1)
  }

  const collectionArg = argValue('--collection')
  if (collectionArg && !(JSONLD_COLLECTIONS as readonly string[]).includes(collectionArg)) {
    console.error(`Unknown --collection "${collectionArg}". Valid: ${JSONLD_COLLECTIONS.join(', ')}`)
    process.exit(1)
  }
  const collections = collectionArg
    ? [collectionArg as JsonLdRegenCollection]
    : [...JSONLD_COLLECTIONS]

  console.log(`\n=== JSON-LD regen [${siteKey}] ${DRY_RUN ? '[DRY RUN] ' : ''}===\n`)

  const payload = await getPayload({ config })

  const siteResult = await payload.find({
    collection: 'sites',
    where: { siteKey: { equals: siteKey } },
    limit: 1,
    overrideAccess: true,
    depth: 0,
  })

  if (!siteResult.docs.length) {
    console.error(`ERROR: no sites doc for siteKey=${siteKey}`)
    process.exit(1)
  }

  const siteDoc = siteResult.docs[0]
  const tenantId = siteDoc.id
  const tenantDomain = siteDoc.domain
  console.log(`Site: ${tenantId} / ${tenantDomain}\n`)

  // Load site JSON-LD config (org name, logo, etc.) by site id
  const siteConfig = await loadSiteJsonLdConfig(payload, tenantId)

  if (!siteConfig) {
    console.error(`ERROR: could not load site JSON-LD config for ${tenantDomain}`)
    process.exit(1)
  }

  console.log(
    `Site config loaded: orgName="${siteConfig.orgName}" logoUrl="${siteConfig.logoUrl ?? 'none'}"\n`,
  )

  const summary: Record<string, { updated: number; failed: number }> = {}

  for (const col of collections) {
    console.log(`--- ${col} ---`)
    summary[col] = await regenCollection(payload, col, tenantId, siteConfig)
    console.log()
  }

  console.log('=== Summary ===')
  let totalUpdated = 0
  let totalFailed = 0
  for (const [col, s] of Object.entries(summary)) {
    console.log(`${col}: updated=${s.updated} failed=${s.failed}`)
    totalUpdated += s.updated
    totalFailed += s.failed
  }
  console.log(`\nTotal: updated=${totalUpdated} failed=${totalFailed}`)

  process.exit(totalFailed > 0 ? 1 : 0)
}

// Only self-execute when run directly, not when regenCollection is imported as a library function.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
