/**
 * GET /api/seo/internal-link-suggest
 *
 * Suggests internal links for a doc being edited by matching its focus
 * keyword / title tokens against other docs' titles and slugs within the
 * same tenant. Returns top-N results sorted by relevance score (token hits).
 *
 * Tenant resolution order (B3 fix — always concrete, never unscoped; SP0-R2 / RT-7):
 *   1. `payload-tenant` cookie — only for a super-admin or a member of that tenant
 *   2. First entry in req.user.tenants[]
 *   → If none resolves → 400
 *
 * Note: this endpoint has no super-admin tenantId override because the
 * suggester is always used in the context of editing a specific tenant doc.
 *
 * Query params:
 *   docId        current doc id (excluded from results)
 *   collection   collection the current doc belongs to
 *   keyword?     focus keyword to match (highest priority)
 *   title?       current doc title (fallback token source)
 *   limit?       max suggestions (default 5, max 10)
 *
 * Response 200:
 *   {
 *     suggestions: Array<{
 *       id: string, collection: string, title: string,
 *       slug: string, score: number, adminUrl: string, frontendSlug: string
 *     }>
 *   }
 *
 * Error responses:
 *   400 — missing docId / collection, or no tenant resolved
 *   401 — not authenticated
 *   500 — unexpected query error
 */
import type { Endpoint } from 'payload'
import { publicPathFor } from '../lib/frontend-public-path'
import { stripDiacritics } from '../lib/vietnamese-text'
import { resolveTenantId } from '../lib/resolve-tenant-from-request'
import type { TenantUser } from '../lib/admin-selected-tenant'

/** Collections searched for internal link candidates. */
const LINK_COLLECTIONS = ['posts', 'pages', 'products', 'landings'] as const
type LinkCollection = (typeof LINK_COLLECTIONS)[number]

/** Maximum suggestions returned. */
const MAX_SUGGESTIONS = 10

/** Docs per collection to scan (bounded to prevent unbounded scans). */
const SCAN_LIMIT = 100

export interface LinkSuggestion {
  id: string
  collection: LinkCollection
  title: string
  slug: string
  /** Relevance score: higher = better match. */
  score: number
  adminUrl: string
  /** Root-relative public path (`publicPathFor`); `/{collection}/{id}` only for a slug-less doc. */
  frontendSlug: string
}

/**
 * Tokenize a string into normalized lowercase tokens (3+ chars).
 * Strips diacritics so Vietnamese keyword "phú quốc" matches "phu quoc".
 */
export function tokenize(text: string): string[] {
  const normalized = stripDiacritics(text.toLowerCase())
  return normalized
    .split(/[\s\-_/]+/)
    .map(t => t.replace(/[^a-z0-9]/g, ''))
    .filter(t => t.length >= 3)
}

/**
 * Score a candidate doc against query tokens.
 * Title token matches score 2 pts each; slug token matches score 1 pt each.
 * Higher is better. Returns 0 when no match.
 */
export function scoreCandidate(
  candidate: { title: string; slug: string },
  queryTokens: string[],
): number {
  if (queryTokens.length === 0) return 0
  const titleTokens = tokenize(candidate.title)
  const slugTokens = tokenize(candidate.slug)
  let score = 0
  for (const qt of queryTokens) {
    if (titleTokens.some(t => t.includes(qt) || qt.includes(t))) score += 2
    if (slugTokens.some(t => t.includes(qt) || qt.includes(t))) score += 1
  }
  return score
}

export const internalLinkSuggestEndpoint: Endpoint = {
  method: 'get',
  path: '/seo/internal-link-suggest',
  handler: async (req) => {
    // 1. Auth guard
    const user = req.user as TenantUser | null
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
      const url = new URL(req.url ?? '', 'http://localhost')
      const docId = url.searchParams.get('docId')
      const collection = url.searchParams.get('collection')
      const keyword = url.searchParams.get('keyword') ?? ''
      const title = url.searchParams.get('title') ?? ''
      const limitParam = parseInt(url.searchParams.get('limit') ?? '5', 10)
      const limit = Math.min(Math.max(limitParam, 1), MAX_SUGGESTIONS)

      // 2. Validate required params
      if (!docId) {
        return Response.json({ error: 'docId is required' }, { status: 400 })
      }
      if (!collection) {
        return Response.json({ error: 'collection is required' }, { status: 400 })
      }

      // 3. Resolve tenant — B3: always concrete, no unscoped queries
      // No super-admin query-param override here: suggestions are always in context
      // of the doc being edited, which belongs to one tenant.
      const cookieHeader = req.headers?.get?.('cookie') ?? null
      const tenantId = resolveTenantId(user, cookieHeader, null)
      if (!tenantId) {
        return Response.json(
          { error: 'No tenant resolved. Assign this user to a tenant before requesting link suggestions.' },
          { status: 400 },
        )
      }

      // tenantWhere is ALWAYS set — never undefined (B3 fix)
      const tenantWhere = { tenant: { equals: tenantId } }

      // 4. Build query tokens from keyword (preferred) then title fallback
      const queryTokens = tokenize(keyword || title)

      // 5. Fetch candidates from all link collections in parallel
      const collectionResults = await Promise.all(
        LINK_COLLECTIONS.map(async (col) => {
          const found = await req.payload.find({
            collection: col,
            where: tenantWhere,
            limit: SCAN_LIMIT,
            depth: 0,
            sort: '-updatedAt',
            select: { id: true, title: true, slug: true } as Record<string, true>,
            // SP0-R2 / RT-7: the resolved tenant is membership-validated, and the
            // query additionally runs through the caller's own read access
            // (tenantScopedRead) instead of bypassing it.
            overrideAccess: false,
            req,
          })
          return { col, docs: found.docs }
        }),
      )

      // 6. Score candidates; exclude the current doc being edited
      const scored: LinkSuggestion[] = []
      for (const { col, docs } of collectionResults) {
        for (const doc of docs) {
          const d = doc as unknown as { id: string; title?: string; slug?: string }
          // Exclude self
          if (String(d.id) === String(docId) && col === collection) continue

          const candidateTitle = d.title ?? ''
          const candidateSlug = d.slug ?? ''
          const s = scoreCandidate({ title: candidateTitle, slug: candidateSlug }, queryTokens)
          if (s === 0) continue

          scored.push({
            id: String(d.id),
            collection: col,
            title: candidateTitle,
            slug: candidateSlug,
            score: s,
            adminUrl: `/admin/collections/${col}/${d.id}`,
            frontendSlug: publicPathFor(col, candidateSlug) ?? `/${col}/${d.id}`,
          })
        }
      }

      // 7. Sort by score desc, take top-N
      scored.sort((a, b) => b.score - a.score)
      const suggestions = scored.slice(0, limit)

      return Response.json({ suggestions }, { status: 200 })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return Response.json({ error: `Link suggest failed: ${message}` }, { status: 500 })
    }
  },
}
