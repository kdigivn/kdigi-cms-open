/**
 * Shared configuration + path helpers for the generic WordPress → KDIGI CMS
 * migration pipeline (docs/wordpress-migration/).
 *
 * Data layout per site:
 *   wp-archive/<site>/raw/      — immutable mirror (rest/, content/, media/)
 *   wp-archive/<site>/staged/   — normalized, co-editable JSON (1 file/doc)
 */
import path from 'path'

export interface SiteMigrationConfig {
  /** Sites.siteKey (lower-case slug) — also the archive folder name. */
  site: string
  /** Origin of the WordPress backend serving REST/GraphQL, no trailing slash (https://wp.example.com). */
  wpUrl: string
  /** Hostname of `wpUrl`. */
  wpHost: string
  /** Hostname of the public frontend of the source site (links in body content). Defaults to `wpHost`. */
  publicHost: string
  /** Target public domain for canonical/OG rewrites and Sites.domain (e.g. example.com). */
  domain: string
  /** Sites.defaultLanguage and the language kept when the source is multilingual. */
  language: SiteLanguage
}

/** Site language (Sites.defaultLanguage → JSON-LD inLanguage, SEO templates). */
export type SiteLanguage = 'vi' | 'en'

const SITE_KEY_RE = /^[a-z0-9][a-z0-9-]*$/

function hostOf(url: string, label: string): string {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    throw new Error(`${label} is not a valid absolute URL: ${url}`)
  }
}

/** Build + validate a config from CLI/env values. Throws on invalid input. */
export function buildSiteConfig(input: {
  site: string
  wpUrl: string
  publicUrl?: string
  domain: string
  language?: string
}): SiteMigrationConfig {
  if (!SITE_KEY_RE.test(input.site)) throw new Error(`invalid site key (use a-z, 0-9, "-"): ${input.site}`)
  const wpUrl = input.wpUrl.replace(/\/+$/, '')
  const wpHost = hostOf(wpUrl, '--wp-url')
  const publicHost = input.publicUrl ? hostOf(input.publicUrl, '--public-url') : wpHost
  const language = input.language ?? 'vi'
  if (language !== 'vi' && language !== 'en') throw new Error(`--lang must be vi or en (got ${language})`)
  return {
    site: input.site,
    wpUrl,
    wpHost,
    publicHost: publicHost.replace(/^www\./, ''),
    domain: input.domain.replace(/^https?:\/\//, '').replace(/\/+$/, ''),
    language,
  }
}

export function archiveRoot(cfg: Pick<SiteMigrationConfig, 'site'>): string {
  return path.resolve(process.cwd(), 'wp-archive', cfg.site)
}

/** Immutable raw mirror (rest/, content/, media/). */
export function rawDir(cfg: Pick<SiteMigrationConfig, 'site'>): string {
  return path.join(archiveRoot(cfg), 'raw')
}

/** Co-editable normalized docs — one JSON file per doc. */
export function stagedDir(cfg: Pick<SiteMigrationConfig, 'site'>): string {
  return path.join(archiveRoot(cfg), 'staged')
}

export function gateLockPath(cfg: Pick<SiteMigrationConfig, 'site'>): string {
  return path.join(stagedDir(cfg), '.gate-lock')
}

/** Public host of the SOURCE WP site (frontend links inside body content). */
export function sourcePublicHost(cfg: Pick<SiteMigrationConfig, 'publicHost'>): string {
  return cfg.publicHost
}

/** KDIGI CMS taxonomies.type values the importer writes. */
export type CmsTaxonomyType = 'category' | 'tag' | 'product-category' | 'custom'

/** WP taxonomy slug → CMS taxonomies.type. Anything else is a custom taxonomy (kept via `wp.taxonomy`). */
export function cmsTaxonomyType(wpTaxonomy: string): CmsTaxonomyType {
  switch (wpTaxonomy) {
    case 'category':
      return 'category'
    case 'post_tag':
    case 'product_tag':
      return 'tag'
    case 'product_cat':
      return 'product-category'
    default:
      return 'custom'
  }
}

/** Import phases in execution order (docs/wordpress-migration/README.md). */
export const IMPORT_PHASES = [
  'schema',
  'seed',
  'taxonomy',
  'content',
  'media',
  'seo',
  'nav',
  'comments',
  'redirects',
] as const
export type ImportPhase = (typeof IMPORT_PHASES)[number]

/** Staged collections (subdirectories of staged/). */
export const STAGED_COLLECTIONS = [
  'pages',
  'posts',
  'products',
  'taxonomies',
  'authors',
  'media',
  'menus',
  'faqs',
  'comments',
  'redirects',
  'site',
] as const
export type StagedCollection = (typeof STAGED_COLLECTIONS)[number]

/**
 * WP post status → CMS status select. The raw WP value is preserved in
 * staged as `wpStatus`; only publish maps to published — everything else
 * (draft, pending, private, future) imports as draft.
 */
export function mapWpStatus(wpStatus: string | null | undefined): 'published' | 'draft' {
  return wpStatus === 'publish' ? 'published' : 'draft'
}

/**
 * WP REST/GraphQL date strings are site-local (no offset) — normalize to the
 * offset given by `WP_UTC_OFFSET` (default `+00:00`, i.e. treat as UTC).
 * Set `WP_UTC_OFFSET=+07:00` for a site whose WordPress timezone is ICT.
 */
export function normalizeWpDate(wpDate: string | null | undefined): string | null {
  if (!wpDate) return null
  if (wpDate.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(wpDate)) return wpDate
  const offset = process.env.WP_UTC_OFFSET ?? '+00:00'
  if (!/^[+-]\d{2}:\d{2}$/.test(offset)) throw new Error(`WP_UTC_OFFSET must look like +07:00 (got ${offset})`)
  return `${wpDate}${offset}`
}

/** Currencies the `products.prices[].currency` select accepts (keep in sync with src/collections/products.ts). */
export const SUPPORTED_CURRENCIES: readonly string[] = ['VND', 'USD', 'EUR', 'GBP', 'JPY']
