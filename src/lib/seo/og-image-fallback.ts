import type { BasePayload, PayloadRequest } from 'payload'

/**
 * Shared OG-image fallback helpers.
 *
 * kdigi-cms mirrors RankMath's server-side og:image resolution: when a document
 * has no explicit seo.openGraph.image, the effective image cascades
 *
 *   seo.openGraph.image  →  doc.featuredImage  →  Sites.seoDefaults.ogImage
 *
 * The first two live on the document; the last is the per-tenant default set by
 * editors under Sites → "Trang & SEO". These helpers back both the read-time OG
 * injection (resolve-og-image-fallback afterRead hook) and the write-time
 * JSON-LD generation (generate-jsonld) so the two surfaces never disagree about
 * which image a page advertises.
 */

export type MediaLike = Record<string, unknown>

const SITE_DEFAULT_OG_CACHE = '__siteDefaultOgImage'

/** A media relationship is "populated" when it carries a usable URL (not a bare id). */
export function isPopulatedMedia(value: unknown): value is MediaLike {
  if (!value || typeof value !== 'object') return false
  const m = value as MediaLike
  return typeof m.url === 'string' || typeof m.externalUrl === 'string'
}

/** URL of a populated media object — externalUrl (CDN) preferred, else url. */
export function mediaUrlOf(value: unknown): string | undefined {
  if (!isPopulatedMedia(value)) return undefined
  return ((value.externalUrl as string) || (value.url as string)) || undefined
}

/** Normalize a tenant relationship (object | id | null) to a bare id. */
export function extractTenantId(tenantRel: unknown): string | number | null {
  if (tenantRel && typeof tenantRel === 'object') {
    return (tenantRel as { id?: string | number }).id ?? null
  }
  return (tenantRel as string | number | null) ?? null
}

/**
 * Resolve a media relationship (populated object OR bare id) to a URL.
 *
 * `req` MUST be threaded from the calling hook so the nested findByID joins the
 * current transaction. Omitting it makes Payload check out a SECOND pool
 * connection while the caller's transaction still holds the first — under
 * concurrency that circular wait deadlocks the pool until Postgres kills the
 * idle-in-transaction sessions.
 */
export async function resolveMediaUrl(
  payload: BasePayload,
  value: unknown,
  req?: PayloadRequest,
): Promise<string | undefined> {
  if (isPopulatedMedia(value)) return mediaUrlOf(value)
  if (typeof value === 'string' || typeof value === 'number') {
    const media = await payload
      .findByID({ collection: 'media', id: value, depth: 0, overrideAccess: true, req })
      .catch(() => null)
    return mediaUrlOf(media)
  }
  return undefined
}

/**
 * Resolve a media relationship (populated object OR bare id) to the full
 * populated media doc — unlike resolveMediaUrl, which only needs a URL string,
 * callers that must inject a value back into an upload field (e.g. the
 * og-image-fallback afterRead hook) need the whole object. Returns null for a
 * genuinely empty/unresolvable value.
 */
export async function resolvePopulatedMedia(
  payload: BasePayload,
  value: unknown,
  req?: PayloadRequest,
): Promise<MediaLike | null> {
  if (isPopulatedMedia(value)) return value
  if (typeof value === 'string' || typeof value === 'number') {
    const media = await payload
      .findByID({ collection: 'media', id: value, depth: 0, overrideAccess: true, req })
      .catch(() => null)
    return isPopulatedMedia(media) ? media : null
  }
  return null
}

/**
 * Load a tenant's default OG image (Sites.seoDefaults.ogImage) as a populated
 * media object, memoized on the request context so a list read loads the Site at
 * most once regardless of how many docs it returns. Returns null when the tenant
 * has no default set.
 *
 * Memoizes the in-flight PROMISE (not just the resolved value) so concurrent
 * callers for the same tenant within one request — e.g. a product's own
 * afterRead hook running alongside its populated `categories` taxonomy docs'
 * afterRead hooks, all needing this same tenant's default — await the same
 * read instead of racing duplicate queries. This is also what makes the read
 * safe without any request-context re-entry flag: every caller for a given
 * tenant, however deeply nested, resolves from the exact same depth:0 read.
 */
export async function loadSiteDefaultOgImageMedia(
  payload: BasePayload,
  tenantId: string | number | null,
  context: Record<string, unknown>,
  req?: PayloadRequest,
): Promise<MediaLike | null> {
  if (!tenantId) return null

  const cache = (context[SITE_DEFAULT_OG_CACHE] ??= {}) as Record<string, Promise<MediaLike | null>>
  const key = String(tenantId)
  if (key in cache) return cache[key]

  const promise = (async (): Promise<MediaLike | null> => {
    // depth:0 is LOAD-BEARING. A Sites doc relates to content via featuredPosts /
    // featuredProducts, and posts/products carry the og-fallback afterRead hook. Reading
    // the site at depth>=1 populates those relationships, re-firing the hook on each doc,
    // which reads the site again → infinite site↔content recursion that leaks a pooled
    // connection per level and hangs the request (the login-treo bug). At depth:0 the
    // relationships stay as ids and are never populated, so the read is cycle-free —
    // structurally, not just by convention, so no caller can ever recurse through it.
    // req reuses the caller's transaction/connection.
    const site = (await payload
      .findByID({ collection: 'sites', id: tenantId, depth: 0, overrideAccess: true, req })
      .catch(() => null)) as Record<string, unknown> | null

    const seoDefaults = (site?.seoDefaults as Record<string, unknown>) ?? {}
    const ogRef = seoDefaults.ogImage

    // ogImage is an id at depth:0 — resolve it to a populated media doc in a second,
    // cycle-free read (media's afterRead is self-contained, no site re-entry).
    if (isPopulatedMedia(ogRef)) return ogRef as MediaLike
    if (typeof ogRef === 'string' || typeof ogRef === 'number') {
      const media = await payload
        .findByID({ collection: 'media', id: ogRef, depth: 0, overrideAccess: true, req })
        .catch(() => null)
      return isPopulatedMedia(media) ? (media as MediaLike) : null
    }
    return null
  })()

  cache[key] = promise
  return promise
}
