/**
 * beforeChange hook — RankMath placeholder model: store EMPTY, resolve at RENDER.
 *
 * This hook no longer persists seo.title / seo.description / OG / twitter cascade
 * into the database. Those fields remain empty in storage when the editor hasn't
 * typed a value. Resolution happens at render time (frontend) using the
 * exported `resolveSeoFields` helper and the site's per-post-type templates.
 *
 * What this hook STILL does:
 *   - Auto-generates seo.breadcrumbs (Home → doc trail) when blank.
 *   - Keeps the `%currentyear%` / `%price%` variable infrastructure and the
 *     `buildSeoVarCtx` / `resolveSeoFields` pure exports for the frontend resolver.
 *
 * Manual entries always win: a non-empty seo.title/description is never overwritten.
 * (The frontend resolver also respects this: storedValue || resolvedValue.)
 *
 * Template location: Sites doc → seoTitles group → per-docType subgroup.
 * Pages flagged isFrontPage use the `homepage` template.
 * Taxonomy terms: `%term%` resolves to the taxonomy `name` field (localized).
 *
 * Usage: makeApplySeoTemplatesHook('post' | 'page' | 'product' | 'landing' | 'taxonomy')
 */
import type { CollectionBeforeChangeHook, Payload, PayloadRequest } from 'payload'
import { resolveSeoTemplate, type SeoVarContext } from '../lib/seo/resolve-variables'
import { segmentForTaxonomyType, type SlugLocale } from '../fields/slug-url-prefix-map'

export type DocType = 'post' | 'page' | 'product' | 'landing' | 'taxonomy'

/** Post-type singular/plural labels for %pt_single% / %pt_plural% (Vietnamese). */
const PT_LABELS: Record<DocType, { single: string; plural: string }> = {
  post: { single: 'Bài viết', plural: 'Bài viết' },
  page: { single: 'Trang', plural: 'Trang' },
  product: { single: 'Sản phẩm', plural: 'Sản phẩm' },
  landing: { single: 'Trang đích', plural: 'Trang đích' },
  taxonomy: { single: 'Phân loại', plural: 'Phân loại' },
}

/** docType → seoTitles subgroup key (post→posts, page→pages, …). */
const SUBGROUP_KEY: Record<DocType, string> = {
  post: 'posts',
  page: 'pages',
  product: 'products',
  landing: 'landings',
  taxonomy: 'taxonomies',
}

/** Read the value for a locale from a string (single-locale) or record (locale="all"). */
function pickLocale(value: unknown, locale: string): string | undefined {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const v = (value as Record<string, unknown>)[locale]
    return typeof v === 'string' ? v : undefined
  }
  return undefined
}

/** Strip HTML tags + collapse whitespace (excerpt is stored as <p>-wrapped HTML). */
function plainText(v: string | undefined): string {
  return v ? v.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : ''
}

/** Resolve a (possibly localized) field for a locale, falling back to the default locale. */
function localized(field: unknown, locale: string, defaultLocale: string): string {
  return pickLocale(field, locale) ?? pickLocale(field, defaultLocale) ?? ''
}

/** True when a localized field holds a non-empty value in any locale. */
function hasContent(field: unknown): boolean {
  if (typeof field === 'string') return field.trim().length > 0
  if (field && typeof field === 'object' && !Array.isArray(field)) {
    return Object.values(field as Record<string, unknown>).some(
      (v) => typeof v === 'string' && v.trim().length > 0,
    )
  }
  return false
}

/** First category title if the relationship is populated; '' when only IDs present. */
function firstCategoryTitle(cats: unknown, locale: string): string {
  if (!Array.isArray(cats) || cats.length === 0) return ''
  const first = cats[0]
  if (first && typeof first === 'object' && 'title' in (first as Record<string, unknown>)) {
    return pickLocale((first as Record<string, unknown>).title, locale) ?? ''
  }
  return ''
}

/**
 * Resolves the primary-taxonomy breadcrumb crumb(s) for a product/post doc: the
 * first tagged term (in tag order) whose `type` matches the site's configured
 * primary taxonomy, plus its parent chain (root → term). RankMath "Phân loại
 * chính" parity — mirrors Sites.breadcrumbs.primaryTaxonomy{Product,Post}.
 * Empty when no matching term is tagged or primaryTaxonomyType is 'none'/unset.
 */
async function resolvePrimaryTaxonomyCrumbs(
  payload: Payload,
  req: PayloadRequest | undefined,
  siteUrl: string,
  categoryIds: Array<string | number>,
  primaryTaxonomyType: string | undefined,
  locale: string,
): Promise<Array<{ url: string; text: string }>> {
  if (!primaryTaxonomyType || primaryTaxonomyType === 'none' || categoryIds.length === 0) return []

  const termsResult = await payload
    .find({
      collection: 'taxonomies',
      where: { id: { in: categoryIds } },
      depth: 0,
      limit: categoryIds.length,
      locale: locale as 'vi' | 'en',
      req,
    })
    .catch(() => null)
  const termsById = new Map(
    (termsResult?.docs ?? []).map((t) => {
      const rec = t as unknown as Record<string, unknown>
      return [rec.id, rec] as const
    }),
  )
  const term = categoryIds
    .map((id) => termsById.get(id))
    .find((t): t is Record<string, unknown> => !!t && t.type === primaryTaxonomyType)
  if (!term) return []

  // Walk the parent chain (term → root), then reverse to root → term for display order.
  const chain: Array<{ url: string; text: string }> = []
  const seen = new Set<unknown>()
  let current: Record<string, unknown> | null = term
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    const termSlug = current.slug as string | undefined
    if (!termSlug) break
    const termSeo = (current.seo ?? {}) as Record<string, unknown>
    // Prefer an editor-set canonical (e.g. a taxonomy type served under a URL
    // prefix like /product-category/{slug}/); otherwise this site's flat
    // top-level term URL shape (matches the taxonomy doc's own breadcrumb leaf).
    const termUrl = (termSeo.canonicalOverride as string | undefined) || `${siteUrl}/${termSlug}/`
    const termName = localized(current.name, locale, locale) || termSlug
    chain.unshift({ url: termUrl, text: termName })
    const parentId = current.parent as unknown
    current = parentId
      ? ((await payload
          .findByID({
            collection: 'taxonomies',
            id: parentId as string | number,
            depth: 0,
            locale: locale as 'vi' | 'en',
            req,
          })
          .catch(() => null)) as unknown as Record<string, unknown> | null)
      : null
  }
  return chain
}

/** ISO timestamp → YYYY-MM-DD (no dynamic clock var; sourced from doc data). */
function isoDate(v: unknown): string {
  return typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : ''
}

/**
 * Normalizes foundingDate to ISO 8601 (YYYY-MM-DD).
 * Handles DD/MM/YYYY format commonly used in Vietnam.
 * Returns the value unchanged if already ISO or unparseable.
 */
export function formatFoundingDate(value: string): string {
  if (!value || typeof value !== 'string') return value
  const trimmed = value.trim()
  // Already ISO-8601 (YYYY-MM-DD) — return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  // DD/MM/YYYY → convert to YYYY-MM-DD
  const parts = trimmed.split('/')
  if (parts.length === 3) {
    const [day, month, year] = parts
    if (/^\d{2}$/.test(day) && /^\d{2}$/.test(month) && /^\d{4}$/.test(year)) {
      return `${year}-${month}-${day}`
    }
  }
  // Return as-is if already ISO or can't parse
  return value
}

/**
 * Shared SEO template context — same structure understood by both kdigi-cms hook
 * and frontend resolver.
 */
export interface SeoTemplateGroup {
  titleTemplate?: string | Record<string, string>
  descriptionTemplate?: string | Record<string, string>
}

export interface SeoTitlesConfig {
  separator?: string
  posts?: SeoTemplateGroup
  pages?: SeoTemplateGroup
  products?: SeoTemplateGroup
  landings?: SeoTemplateGroup
  taxonomies?: SeoTemplateGroup
  homepage?: SeoTemplateGroup
}

/**
 * Resolved SEO values for a document at render time.
 * title / description are EFFECTIVE values (stored || resolved from template || fallback).
 * ogTitle / ogDescription are the OG cascade (storedOG || effective).
 * twitterTitle / twitterDescription mirror OG.
 */
export interface ResolvedSeoFields {
  title: string
  description: string
  ogTitle: string
  ogDescription: string
  twitterTitle: string
  twitterDescription: string
}

/**
 * Resolve effective SEO title + description (and OG/twitter cascade) for a document
 * at render time. This is the pure shared resolver — call it from the frontend when
 * `seo.title` / `seo.description` are empty (stored-blank placeholder model).
 *
 * Resolution spec (mirrors RankMath behaviour):
 *   effectiveTitle     = storedSeoTitle || resolveTemplate(titleTemplate, vars) || docTitle
 *   effectiveDesc      = storedSeoDesc  || resolveTemplate(descTemplate, vars)  || excerpt
 *   ogTitle            = storedOGTitle  || effectiveTitle
 *   ogDescription      = storedOGDesc   || effectiveDesc
 *   twitterTitle       = storedTwTitle  || ogTitle
 *   twitterDescription = storedTwDesc   || ogDescription
 *
 * @param seoTitles   Site-level seoTitles config (from getSiteDoc / REST)
 * @param docType     Post type key used to select the template subgroup
 * @param isFrontPage True for pages with isFrontPage=true (uses homepage template)
 * @param vars        Context variables for template substitution
 * @param stored      Current stored SEO values (may be empty strings — placeholder model)
 */
export function resolveSeoFields(
  seoTitles: SeoTitlesConfig,
  docType: DocType,
  isFrontPage: boolean,
  vars: SeoVarContext,
  stored: {
    title?: string
    description?: string
    ogTitle?: string
    ogDescription?: string
    twitterTitle?: string
    twitterDescription?: string
    useFacebookData?: boolean
  },
): ResolvedSeoFields {
  const separator = seoTitles.separator ?? '|'
  const subgroupKey = docType === 'page' && isFrontPage ? 'homepage' : SUBGROUP_KEY[docType]
  const subgroup = (seoTitles as Record<string, unknown>)[subgroupKey] as SeoTemplateGroup | undefined

  // Resolve templates using a scalar locale context (frontend is single-locale at render)
  const locale = (vars.title || '') // used for locale picking on localized templates below
  void locale // not used directly — `vars` is already locale-resolved by the caller

  const titleTpl =
    typeof subgroup?.titleTemplate === 'string'
      ? subgroup.titleTemplate
      : typeof subgroup?.titleTemplate === 'object' && subgroup.titleTemplate !== null
        ? (Object.values(subgroup.titleTemplate)[0] ?? '')
        : ''
  const descTpl =
    typeof subgroup?.descriptionTemplate === 'string'
      ? subgroup.descriptionTemplate
      : typeof subgroup?.descriptionTemplate === 'object' && subgroup.descriptionTemplate !== null
        ? (Object.values(subgroup.descriptionTemplate)[0] ?? '')
        : ''

  const resolvedTitle = titleTpl ? resolveSeoTemplate(titleTpl, { ...vars, sep: separator }) : ''
  const resolvedDesc = descTpl ? resolveSeoTemplate(descTpl, { ...vars, sep: separator }) : ''

  const effectiveTitle = stored.title || resolvedTitle || vars.title || ''
  const effectiveDesc = stored.description || resolvedDesc || vars.excerpt || ''
  const ogTitle = stored.ogTitle || effectiveTitle
  const ogDescription = stored.ogDescription || effectiveDesc
  const useFb = stored.useFacebookData !== false
  const twitterTitle = stored.twitterTitle || (useFb ? ogTitle : '')
  const twitterDescription = stored.twitterDescription || (useFb ? ogDescription : '')

  return { title: effectiveTitle, description: effectiveDesc, ogTitle, ogDescription, twitterTitle, twitterDescription }
}

export function makeApplySeoTemplatesHook(docType: DocType): CollectionBeforeChangeHook {
  return async ({ data, req, originalDoc }) => {
    if (!data) return data
    // Skip the JSON-LD hook's internal re-save (seo already resolved there).
    if ((req.context as Record<string, unknown>)?.__generatingJsonLd) return data

    // Resolve tenant (Sites doc id) from the incoming data, else the existing doc.
    const tenantRel = (data.tenant ?? originalDoc?.tenant) as unknown
    const tenantId =
      tenantRel && typeof tenantRel === 'object'
        ? ((tenantRel as { id?: string | number }).id ?? null)
        : (tenantRel as string | number | null)
    if (!tenantId) return data

    // locale='all' so localized template + name fields arrive as per-locale records.
    const site = (await req.payload
      .findByID({ collection: 'sites', id: tenantId, overrideAccess: true, depth: 0, locale: 'all' })
      .catch(() => null)) as Record<string, unknown> | null
    if (!site) return data

    const seoTitles = (site.seoTitles as Record<string, unknown>) ?? {}
    const separator = (seoTitles.separator as string) || '|'

    // Pages flagged as front page use the homepage template.
    const subgroupKey =
      docType === 'page' && (data.isFrontPage ?? originalDoc?.isFrontPage)
        ? 'homepage'
        : SUBGROUP_KEY[docType]
    const subgroup = (seoTitles[subgroupKey] as Record<string, unknown>) ?? {}
    const titleTemplate = subgroup.titleTemplate
    const descriptionTemplate = subgroup.descriptionTemplate
    if (!hasContent(titleTemplate) && !hasContent(descriptionTemplate)) {
      // No templates configured — still run breadcrumb auto-gen below.
      // Fall through to breadcrumb section with the current seo object.
    }

    const seo = (data.seo && typeof data.seo === 'object' ? { ...(data.seo as object) } : {}) as Record<
      string,
      unknown
    >

    // ── RankMath placeholder model: do NOT persist resolved title/description ──
    // seo.title and seo.description are left as-is (empty when not typed by editor).
    // Resolution happens at render time in frontend using resolveSeoFields().
    // The OG/twitter cascade is also left empty — frontend applies it via the
    // same resolution chain in setSeoData().

    // ── Breadcrumb auto-gen: generate a homepage→doc trail when breadcrumbs is blank ──
    // Only fires when seo.breadcrumbs is absent or an empty array (blank-only guard).
    // The slug must be non-empty; front-page docs are skipped (they ARE the homepage).
    // isHidden=false is set on all auto-generated breadcrumbs (visible by default).

    const defaultLocale = (req.locale as string) || (site.defaultLanguage as string) || 'vi'

    const kgName = (site.knowledgeGraph as Record<string, unknown>)?.name
    const manifestName = (site.manifest as Record<string, unknown>)?.name
    const siteNameFor = (locale: string): string =>
      localized(kgName, locale, defaultLocale) ||
      localized(manifestName, locale, defaultLocale) ||
      (site.domain as string) ||
      ''

    // A partial update (API clients; only the admin form re-posts every field) that omits
    // seo.breadcrumbs means "unchanged": judge blankness on the stored trail, otherwise a hand-set
    // or imported trail (incl. isHidden flags) would be regenerated over.
    const existingBreadcrumbs =
      seo.breadcrumbs !== undefined
        ? seo.breadcrumbs
        : (originalDoc?.seo as { breadcrumbs?: unknown } | undefined)?.breadcrumbs
    const docSlug = (data.slug ?? originalDoc?.slug) as string | undefined
    const frontPageGroup = Array.isArray(site.pageGroup)
      ? (site.pageGroup as Array<{ key?: unknown; pageSlug?: unknown }>).find(
          (pg) => pg.key === 'FRONT_PAGE' && typeof pg.pageSlug === 'string',
        )
      : undefined
    const isFront =
      Boolean(data.isFrontPage ?? originalDoc?.isFrontPage) ||
      (docType === 'page' && Boolean(docSlug) && frontPageGroup?.pageSlug === docSlug)
    const hasBreadcrumbs =
      Array.isArray(existingBreadcrumbs) && existingBreadcrumbs.length > 0

    if (!hasBreadcrumbs && docSlug && !isFront) {
      const siteUrl = `https://${(site.domain as string) || 'yoursite.com'}`
      // Doc title/name for the leaf crumb text.
      const leafText = localized(
        docType === 'taxonomy' ? (data.name ?? originalDoc?.name) : (data.title ?? originalDoc?.title),
        defaultLocale,
        defaultLocale,
      ) || docSlug
      // Per-doctype route prefix — matches the frontend's [...slug] routing convention:
      //   products: /product/{slug}/   (params.slug[0] === "product")
      //   taxonomy: /{segment}/{slug}/ via segmentForTaxonomyType (or canonicalOverride)
      //   posts/pages/landings: /{slug}/  (no prefix)
      // Use the same URL shape the frontend kdigi-cms provider maps each collection to.
      const ROUTE_PREFIX: Record<DocType, string> = {
        product: 'product',
        post: '',
        page: '',
        landing: '',
        taxonomy: '',
      }
      const siteLang: SlugLocale = (site.defaultLanguage as string) === 'en' ? 'en' : 'vi'
      const taxonomyType =
        docType === 'taxonomy'
          ? ((data.type ?? originalDoc?.type) as string | undefined)
          : undefined
      const prefix =
        docType === 'taxonomy'
          ? (taxonomyType ? segmentForTaxonomyType(taxonomyType, siteLang) ?? '' : '')
          : ROUTE_PREFIX[docType]
      const canonicalOverride =
        typeof seo.canonicalOverride === 'string' ? seo.canonicalOverride.trim() : ''
      const leafUrl =
        canonicalOverride ||
        (prefix ? `${siteUrl}/${prefix}/${docSlug}/` : `${siteUrl}/${docSlug}/`)

      // Middle crumb: doc's primary-taxonomy term (+ parent chain), per Sites
      // breadcrumbs.primaryTaxonomy{Product,Post} config. Only product/post
      // docTypes carry this config and a `categories` relationship — pages,
      // landings, and taxonomy terms stay a flat Home→Leaf trail.
      const primaryTaxonomyType =
        docType === 'product'
          ? ((site.breadcrumbs as Record<string, unknown> | undefined)?.primaryTaxonomyProduct as
              | string
              | undefined)
          : docType === 'post'
            ? ((site.breadcrumbs as Record<string, unknown> | undefined)?.primaryTaxonomyPost as
                | string
                | undefined)
            : undefined
      const rawCategories = (data.categories ?? originalDoc?.categories) as unknown
      const categoryIds = Array.isArray(rawCategories)
        ? rawCategories
            .map((c) => (typeof c === 'object' && c !== null ? (c as { id?: unknown }).id : c))
            .filter((id): id is string | number => typeof id === 'string' || typeof id === 'number')
        : []
      const taxonomyCrumbs = await resolvePrimaryTaxonomyCrumbs(
        req.payload,
        req,
        siteUrl,
        categoryIds,
        primaryTaxonomyType,
        defaultLocale,
      )

      seo.breadcrumbs = [
        { url: siteUrl, text: siteNameFor(defaultLocale) || 'Trang chủ', isHidden: false },
        ...taxonomyCrumbs.map((c) => ({ ...c, isHidden: false })),
        { url: leafUrl, text: leafText, isHidden: false },
      ]
    }

    return { ...data, seo }
  }
}

// Re-export resolveSeoTemplate and SeoVarContext so the frontend can import from a
// single shared path if ever co-located. The frontend mirrors this logic independently
// (see src/lib/utils/resolve-seo-template.ts) since it cannot import from kdigi-cms directly.
export { resolveSeoTemplate, type SeoVarContext }

// Expose pickLocale / hasContent as package-internal helpers for tests
export {
  pickLocale,
  hasContent,
  localized,
  plainText,
  isoDate,
  firstCategoryTitle,
  resolvePrimaryTaxonomyCrumbs,
  PT_LABELS,
  SUBGROUP_KEY,
}
