'use client'

/**
 * Search for the `@` link picker (phase 8, SP2-5).
 *
 * Queries the REST API with the admin's own session, so collection access predicates are the
 * security boundary [RT-7]; the explicit `tenant` condition only narrows to the document's own
 * tenant (links must stay same-site).
 *
 * [RT-14] Embargo safety: by default only LIVE docs are requested — `status = published` and
 * `publishedAt` missing or in the past, the same rule as `src/access/published-and-live.ts`.
 * Drafts/scheduled docs come back only when the caller opts in (the menu then requires a
 * confirm before inserting, because the link reveals the title + slug once THIS page is live).
 *
 * Diacritic-insensitive: the server matches `title` (as typed) OR `slug` (the query folded to
 * slug form — slugs carry no diacritics), so `@lich tau` finds "Lịch tàu…". Results are then
 * ranked client-side on folded titles.
 */

import { useEffect, useState } from 'react'

import {
  PUBLIC_PATH_COLLECTIONS,
  publicPathFor,
  type PublicPathCollection,
} from '@/lib/frontend-public-path'
import { stripDiacritics } from '@/lib/vietnamese-text'

export const LINK_SEARCH_DEBOUNCE_MS = 150
export const LINK_SEARCH_LIMIT = 8

export interface LinkSearchResult {
  id: string
  collection: PublicPathCollection
  title: string
  slug: string
  href: string
  /** Publicly visible right now (published and not scheduled). */
  live: boolean
}

export function foldForLinkSearch(value: string): string {
  return stripDiacritics(value).toLowerCase().trim()
}

/** The query in slug form: `Lịch tàu` → `lich-tau`. */
export function toSlugQuery(query: string): string {
  return foldForLinkSearch(query)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Same rule as `publishedAndLive()`, evaluated on a fetched doc. */
export function isLiveDoc(doc: { status?: unknown; publishedAt?: unknown }, now: Date): boolean {
  if (doc.status !== 'published') return false
  if (doc.publishedAt === null || doc.publishedAt === undefined || doc.publishedAt === '') return true
  const at = new Date(String(doc.publishedAt))
  return !Number.isNaN(at.getTime()) && at.getTime() <= now.getTime()
}

export interface LinkSearchParams {
  query: string
  tenantId: string | number
  includeNonLive: boolean
  now: Date
}

/** REST URL for one collection. Exported for tests: this string IS the tenant/embargo contract. */
export function buildLinkSearchUrl(collection: PublicPathCollection, params: LinkSearchParams): string {
  const search = new URLSearchParams()
  search.set('where[and][0][tenant][equals]', String(params.tenantId))
  search.set('where[and][1][or][0][title][like]', params.query.trim())
  const slugQuery = toSlugQuery(params.query)
  if (slugQuery) search.set('where[and][1][or][1][slug][like]', slugQuery)
  if (!params.includeNonLive) {
    search.set('where[and][2][status][equals]', 'published')
    search.set('where[and][3][or][0][publishedAt][exists]', 'false')
    search.set('where[and][3][or][1][publishedAt][less_than_equal]', params.now.toISOString())
  }
  search.set('limit', String(LINK_SEARCH_LIMIT))
  search.set('depth', '0')
  search.set('sort', '-updatedAt')
  for (const field of ['title', 'slug', 'status', 'publishedAt']) search.set(`select[${field}]`, 'true')
  return `/api/${collection}?${search.toString()}`
}

/** Title-prefix matches first, then other matches; stable within each band. */
export function rankLinkResults(results: LinkSearchResult[], query: string): LinkSearchResult[] {
  const needle = foldForLinkSearch(query)
  const slugNeedle = toSlugQuery(query)
  const matches = results.filter((result) => {
    const title = foldForLinkSearch(result.title)
    return title.includes(needle) || (slugNeedle !== '' && result.slug.includes(slugNeedle))
  })
  const band = (result: LinkSearchResult): number =>
    foldForLinkSearch(result.title).startsWith(needle) ? 0 : 1
  return matches
    .map((result, index) => ({ result, index }))
    .sort((a, b) => band(a.result) - band(b.result) || a.index - b.index)
    .map(({ result }) => result)
    .slice(0, LINK_SEARCH_LIMIT)
}

type FetchedDoc = { id: string | number; title?: unknown; slug?: unknown; status?: unknown; publishedAt?: unknown }

async function searchCollection(
  collection: PublicPathCollection,
  params: LinkSearchParams,
  signal: AbortSignal,
): Promise<LinkSearchResult[]> {
  const response = await fetch(buildLinkSearchUrl(collection, params), { credentials: 'include', signal })
  if (!response.ok) return []
  const body = (await response.json()) as { docs?: FetchedDoc[] }
  return (body.docs ?? []).flatMap((doc) => {
    const slug = typeof doc.slug === 'string' ? doc.slug : ''
    const href = publicPathFor(collection, slug)
    const title = typeof doc.title === 'string' ? doc.title : ''
    if (!href || !title) return []
    return [{ id: String(doc.id), collection, title, slug, href, live: isLiveDoc(doc, params.now) }]
  })
}

export interface InternalLinkSearchState {
  results: LinkSearchResult[]
  loading: boolean
}

/**
 * Debounced (150ms) search across posts, pages, products and landings; every new query aborts
 * the requests still in flight, so a slow response can never overwrite a newer one. Results are
 * keyed by the request that produced them: a list is only shown for the query it answers.
 */
export function useInternalLinkSearch(options: {
  query: string
  tenantId: string | number | null | undefined
  includeNonLive: boolean
  enabled: boolean
}): InternalLinkSearchState {
  const { query, tenantId, includeNonLive, enabled } = options
  const trimmed = query.trim()
  const active = enabled && tenantId !== null && tenantId !== undefined && trimmed.length > 0
  const requestKey = `${String(tenantId)}|${String(includeNonLive)}|${trimmed}`
  const [answered, setAnswered] = useState<{ key: string; results: LinkSearchResult[] } | null>(null)

  useEffect(() => {
    if (!active || tenantId === null || tenantId === undefined) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      const params: LinkSearchParams = { query: trimmed, tenantId, includeNonLive, now: new Date() }
      Promise.all(PUBLIC_PATH_COLLECTIONS.map((collection) => searchCollection(collection, params, controller.signal)))
        .then((perCollection) => {
          if (!controller.signal.aborted) {
            setAnswered({ key: requestKey, results: rankLinkResults(perCollection.flat(), trimmed) })
          }
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          console.error('[milkdown] link search failed:', error)
          setAnswered({ key: requestKey, results: [] })
        })
    }, LINK_SEARCH_DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [active, includeNonLive, requestKey, tenantId, trimmed])

  // Stable empties: consumers key effects on `results`, and a fresh `[]` per render re-fires them
  // on every render (measured: the menu's layout effect looped to "Maximum update depth").
  if (!active) return IDLE
  if (answered?.key !== requestKey) return LOADING
  return { results: answered.results, loading: false }
}

const NO_RESULTS: LinkSearchResult[] = []
const IDLE: InternalLinkSearchState = { results: NO_RESULTS, loading: false }
const LOADING: InternalLinkSearchState = { results: NO_RESULTS, loading: true }
