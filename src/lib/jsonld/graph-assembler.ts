/**
 * Assembles the full Rank-Math-equivalent JSON-LD @graph for each doc type.
 *
 * Output shape: { "@context": "https://schema.org", "@graph": [...nodes] }
 *
 * Node inclusion rules per doc type:
 *   post      → BlogPosting, Person(author), WebPage, ImageObject, BreadcrumbList, WebSite, Organization/TravelAgency
 *   page      → WebPage, ImageObject?, BreadcrumbList?, WebSite, Organization/TravelAgency
 *   product   → Product, ItemPage(WebPage), ImageObject?, BreadcrumbList?, FAQPage(subjectOf), WebSite, Organization/TravelAgency
 *   landing   → same as product (legacy landings collection uses Product builder)
 *   taxonomy  → CollectionPage, BreadcrumbList?, WebSite, Organization/TravelAgency
 *
 * ProfessionalService, CreativeWorkSeries, AggregateRating are emitted by the
 * FRONTEND layout already — excluded here to avoid duplication. OpeningHoursSpecification
 * IS emitted here (on the Organization node) from the site's structured CMS hours,
 * because kdigi-cms tenants render this @graph as their only source of org schema.
 */

import { buildBlogPosting } from './article'
import { buildBreadcrumbList } from './breadcrumb-list'
import { buildFaqPage } from './faq-page'
import { buildImageObject } from './image-object'
import { buildLocalBusiness, buildOrganization } from './organization'
import { buildPerson } from './person'
import { buildProduct } from './product'
import { buildPlace } from './place'
import { buildWebPage, pageTypeForSlug } from './webpage'
import { buildWebSite } from './website'
import type { AdditionalOffice, SiteJsonLdConfig } from './site-config-loader'

/** Wraps a list of nodes in the single @context/@graph envelope. */
function wrapGraph(nodes: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@graph': nodes,
  }
}

// ─── Shared site-level node builders ────────────────────────────────────────

function orgAndSiteNodes(
  cfg: SiteJsonLdConfig,
): { orgId: string; nodes: Array<Record<string, unknown>> } {
  const orgId = `${cfg.siteUrl}/#organization`
  const websiteId = `${cfg.siteUrl}/#website`

  const org = buildOrganization({
    name: cfg.orgName,
    siteUrl: cfg.siteUrl,
    logoUrl: cfg.logoUrl ?? undefined,
    logoWidth: cfg.logoWidth ?? undefined,
    logoHeight: cfg.logoHeight ?? undefined,
    sameAs: cfg.sameAs,
    telephone: cfg.telephone ?? undefined,
    address: cfg.address ?? undefined,
    email: cfg.email,
    legalName: cfg.legalName,
    description: cfg.description,
    priceRange: cfg.priceRange,
    geo: cfg.geo,
    openingHoursSpecification: cfg.openingHoursSpecification,
    additionalTypes: cfg.additionalTypes,
    lang: cfg.lang,
    foundingDate: cfg.foundingDate,
    founders: cfg.founders,
    areaServed: cfg.areaServed,
    knowsLanguage: cfg.knowsLanguage,
    contactPoint: cfg.contactPoint,
  })

  const website = buildWebSite({
    name: cfg.orgName,
    url: cfg.siteUrl,
    organizationId: orgId,
    lang: cfg.lang,
    searchActionUrl: cfg.searchActionUrl,
  })

  const place = buildPlace({ siteUrl: cfg.siteUrl, address: cfg.address ?? undefined, geo: cfg.geo })
  return { orgId, nodes: place ? [org, place, website] : [org, website] }
}

// ─── Post @graph ─────────────────────────────────────────────────────────────

export interface PostGraphInput {
  slug: string
  title: string
  excerpt?: string
  keywords?: string
  publishedTime?: string
  modifiedTime?: string
  imageUrl?: string
  imageCaption?: string
  authorName?: string
  faqs?: Array<{ question?: string; answer?: string }>
  breadcrumbs?: Array<{ url: string; text: string }>
  site: SiteJsonLdConfig
  /** seo.canonicalOverride — when set, becomes the page's canonical URL so the
   *  @graph WebPage/@id reflects the canonical instead of the slug-derived URL. */
  canonicalOverride?: string
}

export function assemblePostGraph(input: PostGraphInput): Record<string, unknown> {
  const pageUrl = input.canonicalOverride?.trim() || `${input.site.siteUrl}/${input.slug}/`
  const orgId = `${input.site.siteUrl}/#organization`
  const websiteId = `${input.site.siteUrl}/#website`
  const breadcrumbId = `${pageUrl}#breadcrumb`
  const lang = input.site.lang

  const nodes: Array<Record<string, unknown>> = []

  // ImageObject (standalone node so WebPage + BlogPosting can cross-ref it)
  let imageId: string | undefined
  if (input.imageUrl) {
    imageId = input.imageUrl
    nodes.push(
      buildImageObject({
        url: input.imageUrl,
        caption: input.imageCaption ?? input.title,
      }, lang),
    )
  }

  // Person (author)
  let authorId: string | undefined
  if (input.authorName) {
    authorId = `${pageUrl}#author`
    nodes.push(buildPerson({ name: input.authorName, pageUrl, organizationId: orgId, lang }))
  }

  // FAQPage — inlined into BlogPosting as subjectOf (WP Rank Math convention)
  let faqNode: Record<string, unknown> | undefined
  if (input.faqs?.length) {
    const built = buildFaqPage(input.faqs)
    if (built) faqNode = built
  }

  // BlogPosting (primary content node)
  nodes.push(
    buildBlogPosting({
      pageUrl,
      title: input.title,
      description: input.excerpt,
      keywords: input.keywords,
      publishedTime: input.publishedTime,
      modifiedTime: input.modifiedTime,
      imageId,
      authorId,
      organizationId: orgId,
      lang,
      faqNode,
    }),
  )

  // BreadcrumbList
  const hasBreadcrumbs = input.breadcrumbs && input.breadcrumbs.length > 0
  if (hasBreadcrumbs) {
    const bc = buildBreadcrumbList(input.breadcrumbs!, input.site.siteUrl, pageUrl)
    if (bc) nodes.push(bc)
  }

  // WebPage (cross-refs image + breadcrumb)
  nodes.push(
    buildWebPage({
      pageUrl,
      name: input.title,
      description: input.excerpt,
      publishedTime: input.publishedTime,
      modifiedTime: input.modifiedTime,
      websiteId,
      imageId,
      breadcrumbId: hasBreadcrumbs ? breadcrumbId : undefined,
      lang,
    }),
  )

  // Site-level: Organization/TravelAgency + WebSite
  const siteResult = orgAndSiteNodes(input.site)
  nodes.push(...siteResult.nodes)

  return wrapGraph(nodes)
}

// ─── Page @graph ─────────────────────────────────────────────────────────────

export interface PageGraphInput {
  slug: string
  title: string
  description?: string
  publishedTime?: string
  modifiedTime?: string
  imageUrl?: string
  imageCaption?: string
  breadcrumbs?: Array<{ url: string; text: string }>
  /** FAQ items to emit as a standalone FAQPage node (used for /faq/ pages). */
  faqs?: Array<{ question?: string; answer?: string }>
  site: SiteJsonLdConfig
  /** seo.canonicalOverride — see PostGraphInput. */
  canonicalOverride?: string
}

export function assemblePageGraph(input: PageGraphInput): Record<string, unknown> {
  const pageUrl =
    input.canonicalOverride?.trim() ||
    (input.slug === '/' || input.slug === ''
      ? `${input.site.siteUrl}/`
      : `${input.site.siteUrl}/${input.slug}/`)
  const websiteId = `${input.site.siteUrl}/#website`
  const breadcrumbId = `${pageUrl}#breadcrumb`
  const lang = input.site.lang

  const nodes: Array<Record<string, unknown>> = []

  // ImageObject
  let imageId: string | undefined
  if (input.imageUrl) {
    imageId = input.imageUrl
    nodes.push(
      buildImageObject({
        url: input.imageUrl,
        caption: input.imageCaption ?? input.title,
      }, lang),
    )
  }

  // BreadcrumbList
  const hasBreadcrumbs = input.breadcrumbs && input.breadcrumbs.length > 0
  if (hasBreadcrumbs) {
    const bc = buildBreadcrumbList(input.breadcrumbs!, input.site.siteUrl, pageUrl)
    if (bc) nodes.push(bc)
  }

  // WebPage
  nodes.push(
    buildWebPage({
      pageUrl,
      name: input.title,
      description: input.description,
      publishedTime: input.publishedTime,
      modifiedTime: input.modifiedTime,
      websiteId,
      imageId,
      breadcrumbId: hasBreadcrumbs ? breadcrumbId : undefined,
      lang,
      pageType: pageTypeForSlug(input.slug),
    }),
  )

  // FAQPage — standalone node (not nested as subjectOf) for /faq/ pages
  if (input.faqs?.length) {
    const faqNode = buildFaqPage(input.faqs)
    if (faqNode) nodes.push(faqNode)
  }

  // Site-level: Organization/TravelAgency + WebSite
  const siteResult = orgAndSiteNodes(input.site)
  nodes.push(...siteResult.nodes)

  // Additional offices → LocalBusiness nodes on page-level graphs.
  // Useful for /lien-he pages that list all branch offices.
  const offices = input.site.additionalOffices
  if (offices?.length) {
    for (const office of offices) {
      nodes.push(buildLocalBusiness(office, input.site.siteUrl, siteResult.orgId))
    }
  }

  return wrapGraph(nodes)
}

// ─── Product @graph ───────────────────────────────────────────────────────────

export interface ProductGraphInput {
  slug: string
  title: string
  description?: string
  imageUrl?: string
  imageCaption?: string
  ratingAvg?: number
  ratingCount?: number
  publishedTime?: string
  modifiedTime?: string
  authorName?: string
  faqs?: Array<{ question?: string; answer?: string }>
  breadcrumbs?: Array<{ url: string; text: string }>
  site: SiteJsonLdConfig
  /** Current price from prices[0].currentPrice (always required for real products) */
  price?: number
  /** ISO 4217 code from prices[0].currency */
  priceCurrency?: string
  /** ISO 8601 date when this price expires. Threaded from prices[0].validUntil. */
  priceValidUntil?: string
  /** @id of the seller Organization. */
  seller?: string
  /** Visible policy URL; retained for future structured policy support. */
  returnPolicyUrl?: string
  /** seo.canonicalOverride — see PostGraphInput. */
  canonicalOverride?: string
  /** Minimum review count for aggregateRating gate; threaded from site.minReviewsForAggregate. */
  minReviewsForAggregate?: number
  /** Admin override: emit aggregateRating regardless of threshold. From product doc (Phase 4.4). */
  aggregateRatingOverride?: boolean
  /** Count of real approved local reviews (doc.commentCount); required to emit aggregateRating/review. */
  commentCount?: number
}

// ─── Taxonomy @graph ─────────────────────────────────────────────────────────

export interface TaxonomyGraphInput {
  slug: string
  title: string
  description?: string
  imageUrl?: string
  imageCaption?: string
  breadcrumbs?: Array<{ url: string; text: string }>
  site: SiteJsonLdConfig
  /** seo.canonicalOverride — see PostGraphInput. */
  canonicalOverride?: string
}

/**
 * Assembles a JSON-LD @graph for a taxonomy term page.
 *
 * Schema type: CollectionPage — the safe default for archive/term pages
 * (represents a page listing a collection of items related to the term).
 * Nodes: CollectionPage + BreadcrumbList? + WebSite + Organization/TravelAgency.
 */
export function assembleTaxonomyGraph(input: TaxonomyGraphInput): Record<string, unknown> {
  const pageUrl = input.canonicalOverride?.trim() || `${input.site.siteUrl}/${input.slug}/`
  const websiteId = `${input.site.siteUrl}/#website`
  const breadcrumbId = `${pageUrl}#breadcrumb`
  const lang = input.site.lang

  const nodes: Array<Record<string, unknown>> = []

  // ImageObject (standalone for WebPage cross-ref)
  let imageId: string | undefined
  if (input.imageUrl) {
    imageId = input.imageUrl
    nodes.push(
      buildImageObject(
        { url: input.imageUrl, caption: input.imageCaption ?? input.title },
        lang,
      ),
    )
  }

  // BreadcrumbList
  const hasBreadcrumbs = input.breadcrumbs && input.breadcrumbs.length > 0
  if (hasBreadcrumbs) {
    const bc = buildBreadcrumbList(input.breadcrumbs!, input.site.siteUrl, pageUrl)
    if (bc) nodes.push(bc)
  }

  // CollectionPage (primary node for taxonomy term pages)
  nodes.push(
    buildWebPage({
      pageUrl,
      name: input.title,
      description: input.description,
      websiteId,
      imageId,
      breadcrumbId: hasBreadcrumbs ? breadcrumbId : undefined,
      lang,
      pageType: 'CollectionPage',
    }),
  )

  // Site-level: Organization/TravelAgency + WebSite
  const siteResult = orgAndSiteNodes(input.site)
  nodes.push(...siteResult.nodes)

  return wrapGraph(nodes)
}

export function assembleProductGraph(input: ProductGraphInput): Record<string, unknown> {
  const pageUrl = input.canonicalOverride?.trim() || `${input.site.siteUrl}/${input.slug}/`
  const websiteId = `${input.site.siteUrl}/#website`
  const webpageId = `${pageUrl}#webpage`
  const breadcrumbId = `${pageUrl}#breadcrumb`
  const lang = input.site.lang

  const nodes: Array<Record<string, unknown>> = []

  // Product (primary node) — includes offers when price is provided.
  // Price is threaded from generate-jsonld.ts via doc.prices[0].currentPrice.
  nodes.push(
    buildProduct({
      pageUrl,
      name: input.title,
      description: input.description,
      imageUrl: input.imageUrl,
      ratingAvg: input.ratingAvg,
      ratingCount: input.ratingCount,
      publishedTime: input.publishedTime,
      modifiedTime: input.modifiedTime,
      authorName: input.authorName,
      webpageId,
      price: input.price,
      priceCurrency: input.priceCurrency,
      priceValidUntil: input.priceValidUntil,
      seller: input.seller,
      returnPolicyUrl: input.returnPolicyUrl,
      minReviewsForAggregate: input.minReviewsForAggregate,
      aggregateRatingOverride: input.aggregateRatingOverride,
      commentCount: input.commentCount,
    }),
  )

  // ImageObject (standalone for WebPage cross-ref)
  let imageId: string | undefined
  if (input.imageUrl) {
    imageId = input.imageUrl
    nodes.push(
      buildImageObject({
        url: input.imageUrl,
        caption: input.imageCaption ?? input.title,
      }, lang),
    )
  }

  // BreadcrumbList
  const hasBreadcrumbs = input.breadcrumbs && input.breadcrumbs.length > 0
  if (hasBreadcrumbs) {
    const bc = buildBreadcrumbList(input.breadcrumbs!, input.site.siteUrl, pageUrl)
    if (bc) nodes.push(bc)
  }

  // FAQPage (standalone node for product — separate from Product, unlike post)
  if (input.faqs?.length) {
    const faqNode = buildFaqPage(input.faqs)
    if (faqNode) nodes.push(faqNode)
  }

  // ItemPage (WebPage subtype for product detail pages)
  nodes.push(
    buildWebPage({
      pageUrl,
      name: input.title,
      description: input.description,
      publishedTime: input.publishedTime,
      modifiedTime: input.modifiedTime,
      websiteId,
      imageId,
      breadcrumbId: hasBreadcrumbs ? breadcrumbId : undefined,
      lang,
      pageType: 'ItemPage',
    }),
  )

  // Site-level
  nodes.push(...orgAndSiteNodes(input.site).nodes)

  return wrapGraph(nodes)
}
