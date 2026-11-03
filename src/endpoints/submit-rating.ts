/**
 * Public rating submission endpoint — accepts a star rating for a post or product.
 *
 * Security measures:
 *   1. Collection whitelist: only 'posts' and 'products' accepted
 *   2. Rating range validated: integer 1–5 only
 *   3. Cross-tenant guard: submitted tenantSiteKey must match the document's tenant.siteKey
 *   4. IP-based dedup: one rating per IP per content item (SHA-256 hash stored, never raw IP)
 *      Fail-open when IP cannot be resolved (no header present) — legit users behind
 *      certain proxies must not be silently blocked.
 *   5. kkStarRating update uses overrideAccess:true — never exposes credentials
 *
 * reCAPTCHA is intentionally NOT required for rating (removed 2026-06-23).
 * Ratings are low-risk (aggregate counts only) and reCAPTCHA was blocking legit
 * mobile users. IP dedup replaces it as the spam defence for ratings.
 * Comment submission retains reCAPTCHA (higher spam risk — user-generated text).
 *
 * Concurrency:
 *   The kkStarRating increment is performed via raw SQL (atomic UPDATE … RETURNING)
 *   to prevent lost updates when multiple clients submit ratings to the same
 *   document simultaneously. The previous read-modify-write pattern lost votes
 *   under concurrent load. Raw SQL bypasses Payload's afterChange hooks, but
 *   rating-only writes do not need them (no JSON-LD regen, no revalidate tag). After the SQL we re-read the document via findByID
 *   to return authoritative values.
 *
 * kkStarRating shape (locked by frontend types/kk-start-rating.ts):
 *   { avg: number, count: number, ratings: number }
 * Here `ratings` stores the cumulative sum of all submitted star values, allowing
 * avg to be recomputed as: avg = ratings / count (matching the existing WP shape).
 */
import { createHash } from 'node:crypto'
import type { CollectionSlug, Endpoint } from 'payload'
import { sql } from '@payloadcms/db-postgres'

const ALLOWED_COLLECTIONS = ['posts', 'products'] as const
// RatableCollection is narrowed from the whitelist — cast to CollectionSlug where payload API
// requires it because payload-types.ts may be stale (products added but types not yet regenerated).
type RatableCollection = (typeof ALLOWED_COLLECTIONS)[number]

/**
 * Resolve the client IP from the request headers.
 *
 * Priority order:
 *   1. X-Client-IP — set by the trusted frontend server (server-to-server call).
 *      This is the real browser IP forwarded by Next.js before the authenticated CMS call.
 *   2. X-Forwarded-For rightmost entry — the last hop added by the trusted reverse proxy.
 *      Rightmost is used (NOT leftmost) because the leftmost entry is client-controlled
 *      and trivially spoofable; the rightmost entry is written by the nearest trusted proxy.
 *   3. X-Real-IP fallback for non-XFF proxy setups.
 *
 * Returns null when no resolvable IP is present. Callers must treat null as "IP unknown"
 * and fail-open (skip dedup rather than blocking the request).
 */
function resolveClientIp(req: Parameters<Endpoint['handler']>[0]): string | null {
  // 1. Prefer X-Client-IP set by the trusted frontend server
  const xClientIp = req.headers?.get?.('x-client-ip') ?? null
  if (xClientIp) {
    const trimmed = xClientIp.trim()
    if (trimmed) return trimmed
  }

  // 2. X-Forwarded-For: take the RIGHTMOST entry (last hop = nearest trusted proxy).
  //    The leftmost entry is client-supplied and spoofable; never trust it for dedup.
  const xff = req.headers?.get?.('x-forwarded-for') ?? null
  if (xff) {
    const parts = xff.split(',')
    const last = parts[parts.length - 1]?.trim()
    if (last) return last
  }

  // 3. X-Real-IP for setups that don't use XFF
  const xri = req.headers?.get?.('x-real-ip') ?? null
  if (xri) {
    const trimmed = xri.trim()
    if (trimmed) return trimmed
  }

  return null
}

/** SHA-256 of the raw IP string. Stored instead of the IP for privacy. */
function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex')
}

export const submitRatingEndpoint: Endpoint = {
  method: 'post',
  path: '/ratings/submit',
  handler: async (req) => {
    // 1. Parse request body
    let body: Record<string, unknown> = {}
    try {
      body = (await req.json?.()) ?? {}
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { collection, id, rating, tenantSiteKey } = body as {
      collection?: string
      id?: string
      rating?: unknown
      tenantSiteKey?: string
    }

    // 2. Validate collection whitelist
    if (!collection || !(ALLOWED_COLLECTIONS as readonly string[]).includes(collection)) {
      return Response.json(
        { error: `Invalid collection. Must be one of: ${ALLOWED_COLLECTIONS.join(', ')}` },
        { status: 400 },
      )
    }

    // 3. Validate id — Postgres primary keys are integers; reject early instead
    // of letting a cast error surface as a misleading 404.
    if (!id || typeof id !== 'string' || !Number.isInteger(Number(id))) {
      return Response.json({ error: 'Missing or invalid id' }, { status: 400 })
    }

    // 4. Validate rating: must be an integer in 1–5
    const ratingNum = Number(rating)
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return Response.json({ error: 'rating must be an integer between 1 and 5' }, { status: 400 })
    }

    // 5. Validate tenantSiteKey
    if (!tenantSiteKey || typeof tenantSiteKey !== 'string') {
      return Response.json({ error: 'Missing required field: tenantSiteKey' }, { status: 400 })
    }

    // 6. Fetch the target document.
    // Double-cast via unknown because payload-types.ts may be stale (products not yet
    // in generated CollectionSlug union) — the runtime whitelist check above is the safety net.
    let doc: Record<string, unknown>
    try {
      doc = (await req.payload.findByID({
        collection: collection as unknown as CollectionSlug,
        id,
        overrideAccess: true,
        depth: 1,
      })) as unknown as Record<string, unknown>
    } catch {
      return Response.json({ error: 'Document not found' }, { status: 404 })
    }

    if (!doc) {
      return Response.json({ error: 'Document not found' }, { status: 404 })
    }

    // 7. Cross-tenant guard — document must belong to the submitted tenantSiteKey
    const docTenant = doc.tenant as Record<string, unknown> | string | null | undefined
    const docTenantSiteKey =
      docTenant && typeof docTenant === 'object'
        ? (docTenant.siteKey as string | undefined)
        : null

    // Fail-closed: if tenant cannot be resolved, reject rather than silently bypass
    if (!docTenantSiteKey || docTenantSiteKey !== tenantSiteKey) {
      return Response.json({ error: 'Tenant mismatch' }, { status: 403 })
    }

    // 8. IP-based dedup: resolve client IP and check for an existing rating event.
    //    Fail-open when IP is unknown — do not block legit users behind unusual proxies.
    //
    //    IMPORTANT: find() and create() are kept in separate try/catch blocks so that
    //    a find() failure (e.g. DB timeout) does NOT fall through to the rating increment.
    //    Only a unique-constraint violation from create() is treated as a dedup hit.
    //    All other errors from either operation return an error response (no increment).
    const clientIp = resolveClientIp(req)
    if (clientIp !== null) {
      const ipHash = hashIp(clientIp)

      // 8a. Check for existing rating event. If find() throws, return error — never increment.
      let existingCount = 0
      try {
        const existing = await req.payload.find({
          collection: 'rating-events' as unknown as CollectionSlug,
          where: {
            and: [
              { collection: { equals: collection } },
              { contentId: { equals: id } },
              { ipHash: { equals: ipHash } },
            ],
          },
          limit: 1,
          overrideAccess: true,
        })
        existingCount = existing.docs.length
      } catch (err) {
        // find() failed (e.g. DB timeout) — do NOT proceed to increment.
        // Returning an error is safer than allowing unlimited increments on transient failures.
        req.payload.logger.error({ err }, 'Rating dedup find() failed — aborting to prevent unguarded increment')
        return Response.json({ error: 'Failed to submit rating' }, { status: 500 })
      }

      if (existingCount > 0) {
        // Duplicate — return current aggregate without incrementing
        req.payload.logger.info(
          { collection, id, ipHash },
          'Rating dedup hit — returning current aggregate without incrementing',
        )
        const current = (await req.payload.findByID({
          collection: collection as unknown as CollectionSlug,
          id,
          overrideAccess: true,
          depth: 0,
        })) as unknown as Record<string, unknown>
        const kkStarRating = current.kkStarRating as Record<string, number> | null | undefined
        return Response.json(
          {
            success: true,
            kkStarRating: { avg: Number(kkStarRating?.avg ?? 0), count: Number(kkStarRating?.count ?? 0) },
          },
          { status: 200 },
        )
      }

      // 8b. Record the new rating event before incrementing so a concurrent duplicate
      //     write hits a unique constraint rather than double-counting.
      try {
        await req.payload.create({
          collection: 'rating-events' as unknown as CollectionSlug,
          data: {
            collection,
            contentId: id,
            ipHash,
          },
          overrideAccess: true,
        })
      } catch (err) {
        // Check for PG unique violation (code 23505) or message-based detection.
        // Only unique-constraint errors are treated as dedup; all other errors abort.
        const pgCode = (err as { code?: string }).code
        const errMsg = err instanceof Error ? err.message : String(err)
        const isUniqueViolation =
          pgCode === '23505' ||
          errMsg.toLowerCase().includes('unique') ||
          errMsg.toLowerCase().includes('duplicate')

        if (isUniqueViolation) {
          req.payload.logger.info(
            { collection, id },
            'Rating dedup hit via unique constraint race — returning current aggregate',
          )
          const current = (await req.payload.findByID({
            collection: collection as unknown as CollectionSlug,
            id,
            overrideAccess: true,
            depth: 0,
          })) as unknown as Record<string, unknown>
          const kkStarRating = current.kkStarRating as Record<string, number> | null | undefined
          return Response.json(
            {
              success: true,
              kkStarRating: { avg: Number(kkStarRating?.avg ?? 0), count: Number(kkStarRating?.count ?? 0) },
            },
            { status: 200 },
          )
        }

        // Non-unique-constraint error from create() — abort, do not increment.
        req.payload.logger.error({ err }, 'Failed to write rating event — aborting to prevent unguarded increment')
        return Response.json({ error: 'Failed to submit rating' }, { status: 500 })
      }
    } else {
      req.payload.logger.info(
        { collection, id },
        'Rating submitted with no resolvable client IP — skipping dedup (fail-open)',
      )
    }

    // 9. Atomic kkStarRating update via raw SQL.
    //    Branch the table name (posts | products) but the column set is identical.
    //    COUNT + RATINGS + AVG computed server-side in one statement — concurrent
    //    submissions cannot lose votes. RETURNING gives the post-update values
    //    so we don't need a second read for the response body.
    try {
      const result = await req.payload.db.drizzle.execute(sql`
        UPDATE ${sql.raw(collection)} SET
          kk_star_rating_count = kk_star_rating_count + 1,
          kk_star_rating_ratings = kk_star_rating_ratings + ${ratingNum},
          kk_star_rating_avg = ROUND(
            (kk_star_rating_ratings + ${ratingNum})::numeric
            / (kk_star_rating_count + 1),
            1
          )
        WHERE id = ${Number(id)}
        RETURNING
          kk_star_rating_avg,
          kk_star_rating_count,
          kk_star_rating_ratings
      `)

      // Re-read the document to confirm the write landed and to return
      // authoritative values (handles rounding / type normalization).
      const verified = (await req.payload.findByID({
        collection: collection as unknown as CollectionSlug,
        id,
        overrideAccess: true,
        depth: 0,
      })) as unknown as Record<string, unknown>

      // Prefer RETURNING row when present (postgres-js returns { rows, ... }).
      // Fall back to verified.kkStarRating — either way we expose only the
      // public aggregate (avg + count); the cumulative sum stays internal.
      const returned = (result as { rows?: Array<Record<string, unknown>> }).rows?.[0]
      const newAvg =
        returned && typeof returned.kk_star_rating_avg !== 'undefined'
          ? Number(returned.kk_star_rating_avg)
          : Number(
              (verified.kkStarRating as Record<string, number> | null | undefined)?.avg ?? 0,
            )
      const newCount =
        returned && typeof returned.kk_star_rating_count !== 'undefined'
          ? Number(returned.kk_star_rating_count)
          : Number(
              (verified.kkStarRating as Record<string, number> | null | undefined)?.count ?? 0,
            )

      return Response.json(
        {
          success: true,
          kkStarRating: { avg: newAvg, count: newCount },
        },
        { status: 201 },
      )
    } catch (err) {
      req.payload.logger.error({ err }, `Failed to update kkStarRating for ${collection} id=${id}`)
      return Response.json({ error: 'Failed to submit rating' }, { status: 500 })
    }
  },
}
