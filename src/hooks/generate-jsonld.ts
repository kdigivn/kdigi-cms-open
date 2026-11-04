/**
 * afterChange hook that builds and persists a Rank-Math-equivalent JSON-LD @graph
 * for Pages, Posts, Landings, and Products.
 *
 * Output shape: { "@context": "https://schema.org", "@graph": [...nodes] }
 * Stored in seo.jsonLd.raw as a complete `<script type="application/ld+json">` element
 * (`serializeJsonLdScript`) — the frontend injects it verbatim, without wrapping.
 *
 * Non-blocking: errors are logged but never thrown to avoid breaking saves.
 * Persistence is a scalar-only column write (`persistJsonLdRaw`, SP1a-1 [RT-3]) — no nested
 * `payload.update()`, so no extra version row and no afterChange re-entry. The
 * `__generatingJsonLd` context flag is still honoured: importers set it to skip this hook.
 *
 * Usage: makeGenerateJsonLdHook('page' | 'post' | 'landing' | 'product')
 */
import type { CollectionAfterChangeHook, CollectionSlug, Payload, PayloadRequest } from 'payload'
import { loadSiteJsonLdConfig } from '../lib/jsonld/site-config-loader'
import { resolveMediaUrl } from '../lib/seo/og-image-fallback'
import { serializeJsonLdScript } from '../lib/jsonld/serialize'
import { persistJsonLdRaw } from './persist-jsonld-raw'
import { PRESERVE_SOURCE_PUBLISHED_AT } from '../fields/sidebar-meta-fields'
import { segmentForTaxonomyType, type SlugLocale } from '../fields/slug-url-prefix-map'
import {
  assemblePostGraph,
  assemblePageGraph,
  assembleProductGraph,
  assembleTaxonomyGraph,
} from '../lib/jsonld/graph-assembler'

const COLLECTION_SLUG: Record<string, CollectionSlug> = {
  page: 'pages',
  post: 'posts',
  landing: 'landings',
  product: 'products',
  taxonomy: 'taxonomies',
}

/** Resolve the OG image URL from a seo.openGraph.image field (may be object or string). */
function resolveImageUrl(
  img: unknown,
): { url: string | undefined; width?: number; height?: number } {
  if (!img) return { url: undefined }
  if (typeof img === 'string') return { url: img || undefined }
  if (typeof img === 'object' && img !== null) {
    const o = img as Record<string, unknown>
    const url =
      (o.externalUrl as string) ?? (o.url as string) ?? undefined
    return {
      url: url || undefined,
      width: (o.width as number) ?? undefined,
      height: (o.height as number) ?? undefined,
    }
  }
  return { url: undefined }
}

/**
 * og:image cascade for JSON-LD: explicit OG image → doc.featuredImage → site
 * default. A stored OG image that just equals the site default is treated as
 * unset when the doc has its own featuredImage — mirrors the read-time logic
 * in resolve-og-image-fallback.ts so both surfaces agree.
 */
export async function resolveOgImageUrl(
  payload: Payload,
  openGraphImage: unknown,
  featuredImage: unknown,
  defaultOgImageUrl: string | null | undefined,
  req?: PayloadRequest,
): Promise<string | undefined> {
  let imageUrl = resolveImageUrl(openGraphImage).url
  const isStaleDefaultOg = !!imageUrl && !!defaultOgImageUrl && imageUrl === defaultOgImageUrl
  if (!imageUrl || isStaleDefaultOg) {
    const featuredImageUrl = await resolveMediaUrl(payload, featuredImage, req)
    if (featuredImageUrl) imageUrl = featuredImageUrl
  }
  if (!imageUrl) imageUrl = defaultOgImageUrl ?? undefined
  return imageUrl
}

export async function resolveAuthorName(
  payload: Payload,
  raw: unknown,
  req?: PayloadRequest,
): Promise<string | undefined> {
  if (!raw) return undefined

  if (typeof raw === 'object') {
    const author = raw as Record<string, unknown>
    if (typeof author.name === 'string' && author.name.trim()) {
      return author.name.trim()
    }
    raw = author.id
  }

  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined

  const author = await payload.findByID({
    collection: 'authors',
    id: raw,
    depth: 0,
    req,
  })
  return typeof author.name === 'string' && author.name.trim()
    ? author.name.trim()
    : undefined
}

export function jsonLdSlugForDocument(
  docType: 'page' | 'post' | 'landing' | 'product' | 'taxonomy',
  slug: string,
): string {
  return docType === 'product' ? `product/${slug}` : slug
}

/**
 * Flatten FAQ relationship docs into question/answer pairs for FAQPage JSON-LD.
 *
 * `doc.faqs` is a hasMany relationship to the `faqs` collection; each related doc is a
 * FAQ *group* whose Q&A pairs live in a nested `items[]` array (NOT top-level
 * question/answer). The relationship may arrive populated (depth>=1) or as bare IDs
 * (depth 0, e.g. importer saves) — fetch the group docs when only IDs are present so
 * the FAQ schema is never silently emitted empty.
 */
async function resolveFaqItems(
  payload: Payload,
  raw: unknown,
  req?: PayloadRequest,
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

  // Populated (depth>=1): every element is the embedded group doc.
  const populated = raw.filter(
    (f): f is Record<string, unknown> => typeof f === 'object' && f !== null,
  )
  if (populated.length === raw.length) return flatten(populated)

  // Depth 0: elements are relationship IDs → fetch the group docs.
  const ids = raw
    .map((f) =>
      typeof f === 'object' && f !== null ? (f as { id?: unknown }).id : f,
    )
    .filter(
      (id): id is string | number =>
        typeof id === 'string' || typeof id === 'number',
    )
  if (ids.length === 0) return []
  const result = await payload.find({
    collection: 'faqs',
    where: { id: { in: ids } },
    depth: 0,
    limit: ids.length,
    pagination: false,
    req,
  })
  return flatten(result.docs as unknown as Array<Record<string, unknown>>)
}

/** Extract visible breadcrumbs (isHidden=false) from seo.breadcrumbs. */
function visibleBreadcrumbs(
  raw: unknown,
): Array<{ url: string; text: string }> {
  if (!Array.isArray(raw)) return []
  return (raw as Array<Record<string, unknown>>)
    .filter((b) => !b.isHidden)
    .map((b) => ({
      url: (b.url as string) ?? '',
      text: (b.text as string) ?? '',
    }))
    .filter((b) => b.url && b.text)
}

export function makeGenerateJsonLdHook(
  docType: 'page' | 'post' | 'landing' | 'product' | 'taxonomy',
): CollectionAfterChangeHook {
  return async ({ doc, req }) => {
    // Callers that manage JSON-LD themselves (importers) opt out with this flag.
    if ((req.context as Record<string, unknown>)?.__generatingJsonLd) return doc

    // Resolve the tenant's Sites doc (sites = tenant root) by doc.tenant — NOT the
    // server URL — so multi-tenant saves always load the correct site's Organization/
    // WebSite data instead of an arbitrary first match.
    const tenantRel = doc.tenant as unknown
    const tenantId =
      tenantRel && typeof tenantRel === 'object'
        ? ((tenantRel as { id?: string | number }).id ?? null)
        : (tenantRel as string | number | null)

    try {
      // Load site config (Organization, WebSite fields) — non-fatal if missing
      const authorNamePromise = resolveAuthorName(req.payload, doc.author, req).catch((err) => {
        req.payload.logger.warn(
          { err },
          `generate-jsonld omitted unresolved author for ${docType} id=${doc.id}`,
        )
        return undefined
      })
      const [site, faqs, authorName] = await Promise.all([
        tenantId ? loadSiteJsonLdConfig(req.payload, tenantId, req) : Promise.resolve(null),
        resolveFaqItems(req.payload, doc.faqs, req),
        authorNamePromise,
      ])

      let graph: Record<string, unknown> | null = null

      const seo = (doc.seo ?? {}) as Record<string, unknown>

      // Import phases carry source dates; ordinary editor saves refresh modifiedTime.
      const preserveSourceDates = Boolean(req.context?.[PRESERVE_SOURCE_PUBLISHED_AT])
      if (doc.publishedAt) {
        const prevMeta = seo.articleMeta as Record<string, unknown> | undefined
        seo.articleMeta = {
          publishedTime: prevMeta?.publishedTime ?? doc.publishedAt,
          modifiedTime: preserveSourceDates ? prevMeta?.modifiedTime ?? doc.updatedAt : doc.updatedAt,
        }
      }
      if (doc.updatedAt) {
        const sourceModified = (seo.articleMeta as Record<string, unknown> | undefined)?.modifiedTime
        seo.updatedTime = preserveSourceDates ? sourceModified ?? doc.updatedAt : doc.updatedAt
      }

      // og:image cascade — keeps JSON-LD's image in sync with the og:image
      // injected at read-time by the resolve-og-image-fallback hook.
      const imageUrl = await resolveOgImageUrl(
        req.payload,
        (seo.openGraph as Record<string, unknown>)?.image,
        doc.featuredImage,
        site?.defaultOgImageUrl,
        req,
      )
      const breadcrumbs = visibleBreadcrumbs(seo.breadcrumbs)
      // seo.canonicalOverride — when an editor sets a custom canonical, the @graph
      // WebPage url/@id must reflect it so JSON-LD agrees with the <link rel=canonical>.
      const canonicalOverride = (seo.canonicalOverride as string | undefined) || undefined

      if (docType === 'post') {
        graph = site
          ? assemblePostGraph({
              slug: doc.slug as string,
              title: doc.title as string,
              excerpt: doc.excerpt as string | undefined,
              keywords: Array.isArray(seo.focusKeywords)
                ? (seo.focusKeywords as string[]).join(', ')
                : undefined,
              publishedTime:
                (seo.articleMeta as Record<string, unknown>)?.publishedTime as
                  | string
                  | undefined,
              modifiedTime:
                (doc.modified as string | undefined) ||
                ((seo.articleMeta as Record<string, unknown>)?.modifiedTime as
                  | string
                  | undefined),
              imageUrl,
              imageCaption: doc.title as string | undefined,
              authorName,
              faqs,
              breadcrumbs,
              canonicalOverride,
              site,
            })
          : null

      } else if (docType === 'page') {
        graph = site
          ? assemblePageGraph({
              slug: doc.slug as string,
              title: doc.title as string,
              description: doc.excerpt as string | undefined,
              publishedTime:
                (seo.articleMeta as Record<string, unknown>)?.publishedTime as
                  | string
                  | undefined,
              modifiedTime:
                (seo.updatedTime as string | undefined) ??
                ((seo.articleMeta as Record<string, unknown>)?.modifiedTime as
                  | string
                  | undefined),
              imageUrl,
              imageCaption: doc.title as string | undefined,
              breadcrumbs,
              faqs,
              canonicalOverride,
              site,
            })
          : null

      } else if (docType === 'landing' || docType === 'product') {
        const rating = doc.kkStarRating as
          | { avg?: number; count?: number }
          | null
          | undefined
        // Read price from prices[0].currentPrice — products are always priced.
        // Treat missing or non-positive values as a data integrity gap: warn and
        // pass price:undefined so no offers node is emitted rather than emitting
        // a "free ticket" (price:0). Landing pages share this code path but are
        // never priced, so a missing price warning is suppressed for landings.
        const prices = doc.prices as
          | Array<{ currentPrice?: number; originalPrice?: number; validUntil?: string; currency?: string }>
          | null
          | undefined
        const rawPrice = prices?.[0]?.currentPrice
        const validPrice = rawPrice !== undefined && rawPrice > 0 ? rawPrice : undefined
        const priceValidUntil = prices?.[0]?.validUntil ?? undefined
        if (docType === 'product' && validPrice === undefined) {
          req.payload.logger.warn(
            `generate-jsonld: product id=${doc.id} has no valid prices[0].currentPrice (got ${rawPrice}) — offers will be absent from @graph`,
          )
        }

        graph = site
          ? assembleProductGraph({
              slug: jsonLdSlugForDocument(docType, doc.slug as string),
              title: doc.title as string,
              description: doc.excerpt as string | undefined,
              imageUrl,
              imageCaption: doc.title as string | undefined,
              ratingAvg: rating?.avg,
              ratingCount: rating?.count,
              publishedTime:
                (seo.articleMeta as Record<string, unknown>)?.publishedTime as
                  | string
                  | undefined,
              modifiedTime:
                (doc.modified as string | undefined) ||
                ((seo.articleMeta as Record<string, unknown>)?.modifiedTime as
                  | string
                  | undefined),
              authorName,
              faqs,
              breadcrumbs,
              price: validPrice,
              priceCurrency: prices?.[0]?.currency ?? undefined,
              priceValidUntil,
              seller: `${site.siteUrl}/#organization`,
              returnPolicyUrl: site.returnPolicyUrl,
              canonicalOverride,
              site,
              // Thread minReviewsForAggregate from site config (default 10 if unset)
              minReviewsForAggregate: site.minReviewsForAggregate ?? 10,
              // aggregateRatingOverride from product doc (Phase 4.4 field — undefined if not present)
              aggregateRatingOverride: doc.aggregateRatingOverride as boolean | undefined,
              // Real approved-review count — gates aggregateRating/review against fake imported ratings.
              commentCount: doc.commentCount as number | undefined,
            })
          : null

      } else if (docType === 'taxonomy') {
        // Taxonomy terms use the `name` field (localized) as the page title.
        // The slug is stored flat on the doc; the URL prefix (type-based) is managed
        // by the frontend router. We pass slug as-is and let the frontend handle
        // the full URL construction — consistent with how posts/pages work here.
        const termName = (doc.name as string) || (doc.slug as string) || ''
        const siteLang: SlugLocale = site?.lang === 'en' ? 'en' : 'vi'
        const taxPrefix =
          typeof doc.type === 'string' ? segmentForTaxonomyType(doc.type, siteLang) : null
        const taxSlug = taxPrefix
          ? `${taxPrefix}/${doc.slug as string}`
          : (doc.slug as string)

        graph = site
          ? assembleTaxonomyGraph({
              slug: taxSlug,
              title: termName,
              description: (seo.description as string | undefined) ?? (doc.description as string | undefined),
              imageUrl,
              imageCaption: termName || undefined,
              breadcrumbs,
              canonicalOverride,
              site,
            })
          : null
      }

      if (!graph) {
        // site config unavailable — skip persisting to avoid wiping existing data
        return doc
      }

      const jsonLdRaw = serializeJsonLdScript(graph)
      const articleMeta = doc.publishedAt
        ? (seo.articleMeta as { publishedTime?: string | null; modifiedTime?: string | null })
        : undefined
      const updatedTime = doc.updatedAt ? (seo.updatedTime as string) : undefined

      await persistJsonLdRaw(req, COLLECTION_SLUG[docType], doc.id, {
        raw: jsonLdRaw,
        updatedTime,
        articleMeta,
      })

      // The response carries what was just stored (`updatedAt` is untouched by the column write).
      return { ...doc, seo: { ...seo, jsonLd: { ...((seo.jsonLd as object | undefined) ?? {}), raw: jsonLdRaw } } }
    } catch (err) {
      req.payload.logger.error(
        { err },
        `generate-jsonld hook failed for ${docType} id=${doc.id}`,
      )
    }

    return doc
  }
}
