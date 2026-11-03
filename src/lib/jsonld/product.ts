/**
 * Builds a Schema.org Product JSON-LD node for product / service pages.
 *
 * Includes AggregateRating when kkStarRating data is present.
 * Includes Offer when a positive price is supplied. Missing or zero price
 * is a data gap handled upstream (generate-jsonld.ts warns and omits the
 * price argument) — the builder never throws.
 * Cross-references WebPage by @id via mainEntityOfPage.
 */
export const MIN_REVIEWS_FOR_AGGREGATE = 10

export interface ProductInput {
  pageUrl: string         // canonical URL of the product page
  name: string
  description?: string
  imageUrl?: string
  ratingAvg?: number
  ratingCount?: number
  publishedTime?: string
  modifiedTime?: string
  authorName?: string
  webpageId: string       // @id of the WebPage (ItemPage) node
  /** Current price from prices[0].currentPrice (must be > 0 for offers to emit) */
  price?: number
  /** ISO 4217 code from prices[0].currency. Defaults to 'VND' (the field's default). */
  priceCurrency?: string
  /**
   * ISO 8601 date string when this price expires. Threaded from prices[0].validUntil.
   * Omit when no expiry is set.
   */
  priceValidUntil?: string
  /**
   * @id of the seller Organization. When set, Offer.seller emits { '@id': seller }.
   */
  seller?: string
  /**
   * Absolute URL of the visible return/exchange policy page.
   * A URL alone is not enough to infer a Schema.org return category, so the
   * builder intentionally omits hasMerchantReturnPolicy until structured,
   * fact-checked policy fields are available.
   */
  returnPolicyUrl?: string
  /**
   * Minimum review count required for aggregateRating to emit.
   * Defaults to MIN_REVIEWS_FOR_AGGREGATE (10) when omitted.
   * Threaded from Sites.knowledgeGraph.minReviewsForAggregate via SiteJsonLdConfig.
   */
  minReviewsForAggregate?: number
  /**
   * When true, emits aggregateRating regardless of review count threshold.
   * Admin override for products with verified aggregate rating from third-party sources.
   * Phase 4.4 added this field to the products collection.
   */
  aggregateRatingOverride?: boolean
  /**
   * Count of real, locally-submitted approved reviews (Comments collection).
   * Required to back aggregateRating/review emission unless aggregateRatingOverride
   * is set — kkStarRating avg/count alone can be stale data imported from a
   * source site with no genuine reviews behind it, which Google's structured
   * data policy treats as fake/unverifiable review markup.
   */
  commentCount?: number
}

export function buildProduct(input: ProductInput): Record<string, unknown> {
  const node: Record<string, unknown> = {
    '@type': 'Product',
    name: input.name,
    url: input.pageUrl,
    mainEntityOfPage: { '@id': input.webpageId },
  }

  if (input.description) node.description = input.description

  if (input.imageUrl) {
    // Reference the standalone ImageObject node (@id = imageUrl) the assembler emits,
    // instead of inlining a second, disconnected ImageObject.
    node.image = {
      '@id': input.imageUrl,
    }
  }

  // Offer — emitted only when price is a positive number. Zero / missing price
  // is not a "free ticket" — it means incomplete data. The upstream hook warns
  // and passes undefined so this branch is not reached in that case.
  // url = pageUrl (canonical) so Google can deep-link to the purchase page.
  // Single Offer object (per Red Team C3) — no per-fare array.
  if (input.price !== undefined && input.price > 0) {
    node.offers = {
      '@type': 'Offer',
      url: input.pageUrl,
      price: input.price,
      priceCurrency: input.priceCurrency || 'VND',
      availability: 'https://schema.org/InStock',
      ...(input.priceValidUntil ? { priceValidUntil: input.priceValidUntil } : {}),
      ...(input.seller ? { seller: { '@id': input.seller } } : {}),
    }
  }

  // AggregateRating gate: emit only when:
  // 1. aggregateRatingOverride is true (admin opt-in — verified third-party rating), OR
  // 2. ratingCount >= minReviewsForAggregate (default 10) AND ratingValue < 5 (perfect
  //    scores are suspicious) AND at least one real local review backs it (commentCount > 0).
  // The commentCount check exists because kkStarRating.avg/count can be stale data
  // imported from a source site with zero genuine reviews behind it — emitting that as
  // AggregateRating is fake/unverifiable review markup per Google's structured data policy.
  const threshold = input.minReviewsForAggregate ?? MIN_REVIEWS_FOR_AGGREGATE
  const hasRealReviews = (input.commentCount ?? 0) > 0
  const shouldEmitAggregate =
    // Override: skip count/real-review gate, keep quality gate (ratingAvg < 5)
    (input.aggregateRatingOverride
      ? (!!input.ratingAvg && input.ratingAvg < 5)
      : (!!input.ratingAvg && !!input.ratingCount && input.ratingCount >= threshold &&
         input.ratingAvg < 5 && hasRealReviews))

  if (shouldEmitAggregate) {
    node.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: input.ratingAvg,
      reviewCount: input.ratingCount,
      bestRating: 5,
      worstRating: 1,
    }
  }

  return node
}
