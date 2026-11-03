/**
 * Slug URL-prefix map — pure, framework-free.
 *
 * Maps a locale + (taxonomy `type` | collection slug) to the public URL segment a slug lives
 * under, and composes the display-only prefix shown beside admin slug inputs.
 *
 * SOURCE OF TRUTH for segments: the frontend owns routing. The segments below follow the
 * conventional layout (products under /product/, product categories under /product-category/).
 * This map is DISPLAY-ONLY: a stale segment makes the admin hint inaccurate but never breaks a
 * real link. Edit the tables below when your frontend uses different routes.
 *
 * Intentional gaps: `category`/`tag`/`custom` taxonomy types and the `posts` collection have no
 * default segment, so they resolve to `null` → the UI shows a domain-only prefix rather than a
 * guessed (possibly wrong) path. English (`en`) segments fall back to `vi` per key when absent.
 */

export type SlugLocale = 'vi' | 'en'

type SegmentTables = {
  taxonomy: Record<string, string>
  collection: Record<string, string>
}

const SEGMENTS: Record<SlugLocale, SegmentTables> = {
  vi: {
    taxonomy: {
      'product-category': 'product-category',
      // category, tag, custom → intentionally absent
    },
    collection: {
      products: 'product',
      // pages, landings, posts → intentionally absent → root
    },
  },
  en: {
    taxonomy: {
      'product-category': 'product-category',
    },
    collection: {
      products: 'product',
    },
  },
}

const DEFAULT_LOCALE: SlugLocale = 'vi'

/**
 * Resolve a locale's segment tables. Unknown codes use the default locale's tables; a known but
 * empty locale (e.g. `en` until its segments are confirmed) returns its own empty tables — the
 * per-key fallback to the default locale happens in the `segmentFor*` lookups below.
 */
function tablesFor(locale: SlugLocale): SegmentTables {
  return SEGMENTS[locale] ?? SEGMENTS[DEFAULT_LOCALE]
}

/**
 * Segment for a taxonomy `type` value (product-category/...). Returns `null` for types with
 * no confirmed segment so the caller can degrade to a domain-only prefix.
 */
export function segmentForTaxonomyType(type: string, locale: SlugLocale): string | null {
  const table = tablesFor(locale).taxonomy
  const fallback = SEGMENTS[DEFAULT_LOCALE].taxonomy
  return table[type] ?? fallback[type] ?? null
}

/**
 * Segment for a collection slug (products/posts/pages/landings). Returns `null` for collections
 * served at site root (pages/landings/posts).
 */
export function segmentForCollection(collectionSlug: string, locale: SlugLocale): string | null {
  const table = tablesFor(locale).collection
  const fallback = SEGMENTS[DEFAULT_LOCALE].collection
  return table[collectionSlug] ?? fallback[collectionSlug] ?? null
}

/** Strip protocol and surrounding slashes/whitespace from a domain; `''` if effectively empty. */
function normalizeDomain(domain: string | null | undefined): string {
  if (!domain) return ''
  return domain
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .trim()
}

/**
 * Compose the display-only prefix string (always ends with `/`).
 *
 * - domain + segment → `https://{domain}/{segment}/`
 * - domain, no segment → `https://{domain}/`
 * - no domain, segment → `/{segment}/`  (path-only fallback, e.g. new/unsaved doc)
 * - no domain, no segment → `/`
 */
export function buildSlugUrlPrefix(args: {
  domain: string | null | undefined
  segment: string | null | undefined
  locale: SlugLocale
}): string {
  const domain = normalizeDomain(args.domain)
  const segment = args.segment ? args.segment.replace(/^\/+|\/+$/g, '') : ''
  const path = segment ? `${segment}/` : ''

  if (domain) return `https://${domain}/${path}`
  return `/${path}`
}
