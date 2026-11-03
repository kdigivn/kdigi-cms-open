/**
 * Staged document shapes — the co-editable JSON contract between normalize
 * (step 2), the editor review gate (step 3), and the import phases (step 4).
 * One file per doc: wp-archive/<site>/staged/<collection>/<file>.json
 */
import type { CmsTaxonomyType } from './wp-migration-config'

/** Reference to a WP media attachment, resolved to a media doc at import. */
export interface StagedMediaRef {
  wpId: number | null
  sourceUrl: string
  alt?: string
}

export interface StagedTermRef {
  slug: string
  name: string
  wpId: number
}

/** A term of a non-core WP taxonomy attached to a post/product (resolved by type `custom` + slug at import). */
export interface StagedCustomTermRef extends StagedTermRef {
  /** WP taxonomy slug, e.g. `genre`. */
  taxonomy: string
}

interface StagedBase {
  /** Raw WP status (publish/draft/pending/private/future) — kept verbatim. */
  wpStatus: string
  /** CMS status the importer writes (editor decides final value at the gate). */
  status: 'published' | 'draft'
  /** WP publish date with offset normalized (see normalizeWpDate). */
  date: string | null
  /** WP modified date. */
  modified: string | null
  /** A source social image can differ from featuredImage or the site fallback. */
  openGraphImage?: StagedMediaRef
  /** Polylang/WPML language code when the source is multilingual. */
  lang?: string
  /** Source permalink path (e.g. `/2024/05/my-post/`) — drives the redirects phase. */
  sourcePath?: string
  wp: { databaseId: number }
}

export interface StagedPage extends StagedBase {
  collection: 'pages'
  title: string
  slug: string
  contentMd: string
  /** FAQ group names whose Q&A items should be attached as the FAQPage relationship. */
  faqs?: string[]
  featuredImage?: StagedMediaRef
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  seo: Record<string, any>
}

export interface StagedPost extends StagedBase {
  collection: 'posts'
  title: string
  slug: string
  excerpt?: string
  contentMd: string
  authorSlug?: string
  categories: StagedTermRef[]
  tags: StagedTermRef[]
  /** Terms of custom WP taxonomies (anything except category/post_tag). */
  customTerms?: StagedCustomTermRef[]
  /** FAQ group names whose Q&A items should be attached as the FAQPage relationship. */
  faqs?: string[]
  featuredImage?: StagedMediaRef
  /** Optional kk Star Ratings snapshot; seeds the CMS only while it is ahead of the live count (see kk-star-rating.ts). */
  kkStarRating?: { avg: number; count: number; ratings: number }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  seo: Record<string, any>
}

/** Generic product / service page (WooCommerce `product` or a mapped custom post type). */
export interface StagedProduct extends StagedBase {
  collection: 'products'
  title: string
  slug: string
  excerpt?: string
  contentMd: string
  menuOrder: number | null
  /** Optional WooCommerce price data, numbers parsed from the source strings. */
  price?: { regular?: number; sale?: number; currency?: string }
  sku?: string
  /** Gallery images (hero slider). */
  gallery: StagedMediaRef[]
  /** Product categories (`product_cat`) + tags (`product_tag`) + custom taxonomies. */
  categories: StagedTermRef[]
  tags: StagedTermRef[]
  customTerms?: StagedCustomTermRef[]
  /** FAQ group names whose Q&A items should be attached as the FAQPage relationship. */
  faqs?: string[]
  featuredImage?: StagedMediaRef
  kkStarRating?: { avg: number; count: number; ratings: number }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  seo: Record<string, any>
}

export interface StagedTaxonomy {
  collection: 'taxonomies'
  type: CmsTaxonomyType
  name: string
  slug: string
  description?: string
  /** Long-form Markdown body rendered on the taxonomy archive page. */
  contentMd?: string
  openGraphImage?: StagedMediaRef
  /** WP parent term databaseId — resolved to a taxonomy relation at import. */
  parentWpId: number | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  seo: Record<string, any>
  /** `taxonomy` = WP taxonomy slug (`category`, `post_tag`, `product_cat`, `genre`…). */
  wp: { databaseId: number; taxonomy: string }
}

export interface StagedAuthor {
  collection: 'authors'
  name: string
  slug: string
  wp: { databaseId: number }
  /** Public profile bio (plain text). */
  bio?: string
}

export interface StagedMedia {
  collection: 'media'
  sourceUrl: string
  /** Required by the CMS — gate flags empties for co-edit. */
  alt: string
  caption?: string
  mimeType?: string
  /** Path of the mirrored binary relative to raw/media/files/. */
  localPath: string | null
  wp: { databaseId: number }
}

export interface StagedMenuNode {
  label: string
  url: string
  children: StagedMenuNode[]
}

export type StagedMenuLocation = 'PRIMARY' | 'SECONDARY_MENU' | 'MOBILE_MENU' | 'FOOTER_MENU' | 'LOGGEDIN_ACCOUNT_MENU'

export interface StagedMenu {
  collection: 'menus'
  location: StagedMenuLocation
  tree: StagedMenuNode[]
  wp: { databaseId: number; name: string; location?: string }
}

export interface StagedFaq {
  collection: 'faqs'
  group: string
  items: Array<{ question: string; answer: string }>
}

/**
 * One URL redirect to write into the `redirects` collection.
 * `from` is the request path with leading slash (e.g. `/2024/05/old-post/`),
 * `to` is the absolute or site-relative destination, `statusCode` is the HTTP
 * status (301/302 only — 404/410 are reached by unpublishing the target doc).
 */
export interface StagedRedirect {
  collection: 'redirects'
  from: string
  to: string
  statusCode: 301 | 302
  note?: string
}

export interface StagedComment {
  collection: 'comments'
  authorName: string
  authorEmail?: string | null
  content: string
  status: 'approved' | 'pending' | 'spam'
  createdAt: string
  wp: { databaseId: number }
  target: {
    type: 'post' | 'product'
    slug: string
    wpId: number
  }
}

/** Site-level config sourced from WP settings + homepage JSON-LD (seed/nav phase). */
export interface StagedSiteConfig {
  collection: 'site'
  siteKey: string
  domain: string
  defaultLanguage: string
  name?: string
  description?: string
  branding: {
    logo?: StagedMediaRef
    favicon?: StagedMediaRef
  }
  integration: { ga4Id?: string; gtmId?: string }
  knowledgeGraph?: {
    type: 'Organization' | 'Person'
    businessType: 'Organization' | 'LocalBusiness' | 'ProfessionalService' | 'Store' | 'Restaurant'
    name?: string
    legalName?: string
    description?: string
    logo?: StagedMediaRef
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
    geo?: { latitude?: number; longitude?: number }
    openingHours?: Array<{
      dayOfWeek: Array<'Mo' | 'Tu' | 'We' | 'Th' | 'Fr' | 'Sa' | 'Su'>
      opens: string
      closes: string
    }>
    foundingDate?: string
    searchActionUrl?: string
  }
  socialProfiles: Array<{
    platform: 'Facebook' | 'YouTube' | 'Zalo' | 'X' | 'Instagram' | 'TikTok' | 'LinkedIn' | 'Other'
    url: string
  }>
}

export type StagedDoc =
  | StagedPage
  | StagedPost
  | StagedProduct
  | StagedTaxonomy
  | StagedAuthor
  | StagedMedia
  | StagedMenu
  | StagedFaq
  | StagedComment
  | StagedRedirect
  | StagedSiteConfig
