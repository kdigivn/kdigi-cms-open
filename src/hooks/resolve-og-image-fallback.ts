import type { CollectionAfterReadHook } from 'payload'

import {
  extractTenantId,
  isPopulatedMedia,
  loadSiteDefaultOgImageMedia,
  mediaUrlOf,
  resolvePopulatedMedia,
} from '../lib/seo/og-image-fallback'

/**
 * afterRead hook — RankMath-style og:image fallback, applied virtually (never
 * persisted). When a document has no explicit seo.openGraph.image, inject the
 * first available of:
 *
 *   doc.featuredImage  →  the tenant's Sites.seoDefaults.ogImage
 *
 * (seo.openGraph.image itself is the highest-priority source and is left as-is
 * when set — UNLESS the stored value is just a stale copy of the site default,
 * e.g. from an old backfill script that persisted the fallback instead of
 * leaving it blank; in that case a doc with its own featuredImage prefers that
 * over the generic site thumbnail.) Kept virtual at read-time so the value
 * always reflects the current featured image / site default without a re-save,
 * matching kdigi-cms's existing "store empty, resolve at render" SEO model. The
 * same cascade is applied at write-time in generate-jsonld so JSON-LD
 * advertises the same image.
 *
 * REST-only, same as markdownHtmlField's afterRead (src/fields/markdown-html-field.ts).
 * This is load-bearing, not just an optimization: generate-jsonld's afterChange
 * hook spreads `...seo` from the very `doc` this hook mutates and re-persists it
 * (to save `jsonLd.raw`) — and ANY create/update operation's internal read-back
 * (Local API, incl. the admin's own Document view and this repo's import/backfill
 * scripts) runs this hook too. Without the REST-only guard, a virtual read-time
 * computation gets silently baked into permanent storage on every single save,
 * defeating the entire "store empty, resolve at render" model and any script
 * that intentionally clears this field. Only a genuine public REST GET should
 * ever see (and only ever see, never persist) the resolved fallback.
 *
 * `hasFeaturedImage` is false for taxonomies (no featuredImage field) → the
 * cascade there is site-default only.
 *
 * No request-context re-entry flag is needed here: loadSiteDefaultOgImageMedia's
 * Sites read is always depth:0 (structurally cannot populate featuredPosts/
 * featuredProducts, so it cannot re-fire this hook), and it promise-memoizes per
 * tenant — safe under the concurrent afterRead calls a single find/list request
 * fires for sibling docs (e.g. a product's own hook running alongside its
 * populated `categories` taxonomy docs' hooks).
 *
 * depth:0 defense-in-depth: even for genuine REST reads, a bare relationship ID
 * (not yet populated) is a REAL stored value, not an empty field — treating "not
 * populated" as "empty" would overwrite a valid image with the site default.
 * Only a genuinely absent value (null/undefined/'') triggers the fallback
 * cascade; a present-but-unpopulated ID resolves via resolvePopulatedMedia
 * rather than being mistaken for "no value" on either side of the cascade.
 */
export function makeResolveOgImageFallbackHook(
  hasFeaturedImage: boolean,
): CollectionAfterReadHook {
  return async ({ doc, req }) => {
    // Only genuine public REST reads should see the resolved fallback — see the
    // load-bearing REST-only note above. Local API reads (incl. the internal
    // read-back every create/update performs, and the admin's own Document view)
    // must see the true stored value, unmutated.
    if (req?.payloadAPI !== 'REST') return doc

    const seo = doc?.seo as Record<string, unknown> | undefined
    if (!seo) return doc

    const openGraph = (seo.openGraph ?? {}) as Record<string, unknown>
    const ogImage = openGraph.image
    const ogImageIsEmpty = ogImage === null || ogImage === undefined || ogImage === ''
    const ogImageIsPopulated = isPopulatedMedia(ogImage)
    // Present but unpopulated (a depth:0 raw ID) — too little information to touch
    // safely; leave the doc exactly as read.
    if (!ogImageIsEmpty && !ogImageIsPopulated) return doc

    const featuredImageRaw = hasFeaturedImage ? doc.featuredImage : undefined
    const tenantId = extractTenantId(doc.tenant)
    const loadSiteDefault = () =>
      loadSiteDefaultOgImageMedia(req.payload, tenantId, (req.context ??= {}) as Record<string, unknown>, req)
    const resolveFeaturedImage = () => resolvePopulatedMedia(req.payload, featuredImageRaw, req)

    if (ogImageIsPopulated) {
      const featuredImage = await resolveFeaturedImage()
      if (!featuredImage) return doc // no usable featuredImage to prefer — editor-set value wins as-is
      const siteDefault = await loadSiteDefault()
      // Stored value isn't the site default (or there's no default to compare) — genuinely editor-set.
      if (!siteDefault || mediaUrlOf(siteDefault) !== mediaUrlOf(ogImage)) return doc
      doc.seo = { ...seo, openGraph: { ...openGraph, image: featuredImage } }
      return doc
    }

    // ogImageIsEmpty === true here.
    let fallback = await resolveFeaturedImage()
    if (!fallback) fallback = await loadSiteDefault()

    if (isPopulatedMedia(fallback)) {
      doc.seo = { ...seo, openGraph: { ...openGraph, image: fallback } }
    }
    return doc
  }
}
