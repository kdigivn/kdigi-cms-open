/**
 * Unified raw SEO node (RankMath / Yoast / REST head → `RawSeo`) → the CMS
 * `seo` field group, parameterized per site.
 *
 *   - Canonical and OG urls are rewritten from the WP backend host + source
 *     public host to `cfg.domain` (source scheme is kept) so canonicals never
 *     point at the old site.
 *   - robots keeps the `max-*` directives verbatim; values outside the CMS
 *     enum (src/fields/seo-field-group.ts) are dropped.
 *   - jsonLd.raw is NOT mapped: the generate-jsonld hook regenerates it.
 *
 * NOT mapped here (normalize + media phase): openGraph.image, twitterMeta.image.
 */
import type { RawSeo } from './raw-wp-types'
import type { SiteMigrationConfig } from './wp-migration-config'
import { sourcePublicHost } from './wp-migration-config'

// Robots values the CMS `seo.robots` select accepts (src/fields/seo-field-group.ts).
const ALLOWED_ROBOTS: Record<string, true> = {
  index: true,
  follow: true,
  noindex: true,
  nofollow: true,
  'max-snippet:-1': true,
  'max-image-preview:large': true,
  'max-video-preview:-1': true,
}

/** Decode HTML entities SEO plugins emit in text fields. */
export function decodeSeoEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#8216;/g, '‘')
    .replace(/&#8217;/g, '’')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”')
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .trim()
}

/**
 * Rewrite URLs pointing at the WP backend host OR the source public host to
 * the target public domain. The scheme of the source URL is preserved.
 */
export function makeRewriteHost(cfg: Pick<SiteMigrationConfig, 'wpHost' | 'publicHost' | 'domain'>) {
  const hosts = [cfg.wpHost, sourcePublicHost(cfg)]
    .map((h) => h.replace(/\./g, '\\.'))
    .join('|')
  const re = new RegExp(`^(https?://)(?:www\\.)?(?:${hosts})(?=[/?#]|$)((?:/[^?#]*)?)`, 'i')
  return (url: string | null | undefined): string | null | undefined => {
    if (!url) return url
    return url.replace(re, `$1${cfg.domain}$2`)
  }
}

function metaAttribute(tag: string, name: string): string | undefined {
  return new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag)?.[1]
}

/** Extract a `<meta name|property="…" content="…">` value from head HTML, whatever the attribute order. */
export function extractMetaContent(head: string, key: string): string | null {
  const wanted = key.toLowerCase()
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = (metaAttribute(tag, 'name') ?? metaAttribute(tag, 'property'))?.toLowerCase()
    if (name !== wanted) continue
    const content = metaAttribute(tag, 'content')
    if (content) return decodeSeoEntities(content) || null
  }
  return null
}

/**
 * Build the CMS `seo` group from a unified raw SEO node (RankMath or Yoast).
 * Returns only populated fields — callers spread into the staged doc.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildStagedSeo(seo: RawSeo, cfg: SiteMigrationConfig): Record<string, any> {
  const rewriteHost = makeRewriteHost(cfg)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: Record<string, any> = {}

  if (seo.title) out.title = decodeSeoEntities(seo.title)
  if (seo.description) out.description = decodeSeoEntities(seo.description)
  if (seo.breadcrumbTitle) out.breadcrumbTitle = decodeSeoEntities(seo.breadcrumbTitle)
  if (seo.canonicalUrl) out.canonicalOverride = rewriteHost(seo.canonicalUrl)
  if (seo.focusKeywords?.length) out.focusKeywords = seo.focusKeywords

  const robots = (seo.robots ?? [])
    .map((r) => r.trim().toLowerCase())
    .filter((r) => Object.hasOwn(ALLOWED_ROBOTS, r))
  out.robots = robots.length > 0 ? [...new Set(robots)] : ['index', 'follow']

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const og: Record<string, any> = {}
  const rawOg = seo.openGraph ?? {}
  if (rawOg.title) og.title = decodeSeoEntities(rawOg.title)
  if (rawOg.description) og.description = decodeSeoEntities(rawOg.description)
  if (rawOg.type) og.type = rawOg.type
  if (rawOg.url) og.url = rewriteHost(rawOg.url)
  if (rawOg.updatedTime) og.updatedTime = rawOg.updatedTime

  // twitterMeta — plugins expose no structured twitter fields; parse from fullHead.
  if (seo.fullHead) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const twitter: Record<string, any> = {}
    const card = extractMetaContent(seo.fullHead, 'twitter:card')
    const title = extractMetaContent(seo.fullHead, 'twitter:title')
    const description = extractMetaContent(seo.fullHead, 'twitter:description')
    if (card) {
      const normalized = card.toLowerCase().replace(/-/g, '_')
      twitter.card =
        normalized === 'summary' || normalized === 'summary_large_image' ? normalized : 'summary_large_image'
    }
    if (title) twitter.title = title
    if (description) twitter.description = description
    if (Object.keys(twitter).length > 0) og.twitterMeta = twitter
  }

  if (Object.keys(og).length > 0) out.openGraph = og
  // NOTE: openGraph.siteName/locale + jsonLd.raw intentionally not mapped —
  // the generate-jsonld hook fills them from the Site doc.
  return out
}
