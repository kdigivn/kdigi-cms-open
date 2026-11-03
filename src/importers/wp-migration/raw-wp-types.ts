/**
 * Raw content snapshot contract — `wp-archive/<site>/raw/content/*.json`.
 *
 * ONE shape, regardless of how it was archived:
 *   - `src/scripts/wp-archive-graphql.ts`       (WPGraphQL + WPGraphQL RankMath / Yoast)
 *   - `src/scripts/wp-archive-rest-content.ts`  (plain WP REST API, works on any WordPress)
 * The normalizer (`normalize-raw-to-staged.ts`) only reads this shape, so it never
 * needs to know which transport produced it. Field names deliberately follow
 * WPGraphQL (`databaseId`, `featuredImage.node`, `categories.nodes`) so a WPGraphQL
 * response can be stored almost verbatim.
 *
 * Files:
 *   content/posts.json     RawPost[]      (WP `post`)
 *   content/pages.json     RawPage[]      (WP `page`)
 *   content/products.json  RawProduct[]   (WooCommerce `product`; optional, may be `[]`)
 *   content/<cpt>.json     RawPost[]      (extra custom post types, e.g. `portfolio.json`; optional)
 *   content/terms.json     RawTermsFile   (every public taxonomy, incl. custom)
 *   content/menus.json     RawMenu[]      (flat items with parentDatabaseId — any depth)
 *   content/site.json      RawSite
 *   content/comments.json  RawComment[]   (optional)
 */

export interface RawImage {
  databaseId?: number | null
  sourceUrl: string
  altText?: string | null
  title?: string | null
}

export interface RawTermRef {
  databaseId: number
  name: string
  slug: string
}

export interface RawConnection<T> {
  nodes: T[]
}

/** Unified SEO node (RankMath / Yoast / REST-head → one shape). */
export interface RawSeo {
  /** Which plugin produced the data. `none` = no SEO plugin detected. */
  source?: 'rankmath' | 'yoast' | 'none'
  title?: string | null
  description?: string | null
  breadcrumbTitle?: string | null
  canonicalUrl?: string | null
  focusKeywords?: string[] | null
  /** Lower-case directives, e.g. ['index','follow','max-snippet:-1']. */
  robots?: string[] | null
  isPillarContent?: boolean | null
  /** Full `<head>` SEO HTML (og:image / twitter:* are parsed from it). */
  fullHead?: string | null
  jsonLd?: { raw?: string | null } | null
  openGraph?: {
    title?: string | null
    description?: string | null
    type?: string | null
    url?: string | null
    locale?: string | null
    siteName?: string | null
    updatedTime?: string | null
    /** Direct image URL when the plugin exposes it (otherwise parsed from fullHead). */
    imageUrl?: string | null
  } | null
}

export interface RawPostBase {
  databaseId: number
  title: string
  slug: string
  /** Rendered HTML (Classic / Gutenberg / Elementor output). */
  content: string
  excerpt?: string | null
  date?: string | null
  modified?: string | null
  /** WP status: publish | draft | pending | private | future */
  status?: string | null
  /** Public permalink on the source site (used for redirects). */
  link?: string | null
  featuredImage?: { node: RawImage | null } | null
  author?: { node: { databaseId: number; name: string; slug: string } | null } | null
  /** Core + custom taxonomies keyed by WP taxonomy slug (`category`, `post_tag`, `product_cat`, `genre`…). */
  terms?: Record<string, RawConnection<RawTermRef>>
  seo?: RawSeo | null
  /** Polylang / WPML language code when the site is multilingual. */
  lang?: string | null
  /** WordPress parent page id (hierarchical types). */
  parentDatabaseId?: number | null
  menuOrder?: number | null
  /** Other-language sibling ids (Polylang/WPML) — informational. */
  translations?: Array<{ databaseId: number; lang: string; slug?: string }>
}

export type RawPost = RawPostBase
export type RawPage = RawPostBase

export interface RawProduct extends RawPostBase {
  /** WooCommerce price strings exactly as exposed by the Store/REST API. */
  price?: { regular?: string | null; sale?: string | null; currency?: string | null } | null
  sku?: string | null
  gallery?: RawImage[]
}

export interface RawTerm {
  databaseId: number
  name: string
  slug: string
  description?: string | null
  parentDatabaseId?: number | null
  count?: number | null
  seo?: RawSeo | null
  lang?: string | null
}

export interface RawTaxonomy {
  /** Human label (`Categories`, `Genres`). */
  label?: string
  /** WP post types the taxonomy attaches to (`post`, `product`, …). */
  postTypes?: string[]
  hierarchical?: boolean
  terms: RawTerm[]
}

/** `content/terms.json` — keyed by WP taxonomy slug. */
export interface RawTermsFile {
  taxonomies: Record<string, RawTaxonomy>
}

export interface RawMenuItem {
  databaseId: number
  /** 0 / null / undefined = top level. */
  parentDatabaseId?: number | null
  label: string
  /** Site-relative path when known. */
  path?: string | null
  /** Absolute URL as stored by WP. */
  url?: string | null
  order?: number | null
}

export interface RawMenu {
  databaseId: number
  name: string
  /** Theme location slugs (`primary`, `footer`…). May be empty for unassigned menus. */
  locations: string[]
  items: RawMenuItem[]
}

export interface RawSite {
  name?: string | null
  description?: string | null
  /** Public URL of the source site. */
  url?: string | null
  /** BCP-47-ish language, e.g. `vi`, `en-US`. */
  language?: string | null
  logo?: RawImage | null
  favicon?: RawImage | null
  /** Raw JSON-LD string of the home page (Organization / WebSite graph) when available. */
  homepageJsonLd?: string | null
  /** SEO plugin detected on the source. */
  seoPlugin?: 'rankmath' | 'yoast' | 'none'
  /** Active multilingual plugin, if detectable. */
  multilingual?: 'polylang' | 'wpml' | 'none'
  /** Plugins/namespaces observed from `/wp-json` (informational, used by gate report). */
  namespaces?: string[]
  /** Extra Google tags found in the home page HTML. */
  ga4Id?: string | null
  gtmId?: string | null
}

export interface RawComment {
  databaseId: number
  /** WP post id the comment belongs to. */
  postDatabaseId: number
  postType?: string | null
  parentDatabaseId?: number | null
  authorName: string
  authorEmail?: string | null
  content: string
  date?: string | null
  /** WP comment status: approved | hold | spam | trash */
  status?: string | null
}
