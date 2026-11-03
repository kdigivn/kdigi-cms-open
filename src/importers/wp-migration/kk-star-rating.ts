/**
 * Aggregate star rating carried through the WP migration (kk Star Ratings).
 * Optional plugin data: it only flows when a raw post node carries a
 * `kkStarRating` field; nothing here runs otherwise.
 * Shape is locked by the frontend (`kkStarRating.avg/.count/.ratings`);
 * `ratings` is the cumulative sum of submitted stars, so avg = ratings / count.
 */
export interface KkStarRating {
  avg: number
  count: number
  ratings: number
}

/** Validate an untrusted value (staged JSON, markdown frontmatter) into a rating, or null. */
export function parseKkStarRating(value: unknown): KkStarRating | null {
  if (!value || typeof value !== 'object') return null
  const { avg, count, ratings } = value as Record<string, unknown>
  if (typeof avg !== 'number' || typeof count !== 'number' || typeof ratings !== 'number') return null
  if (![avg, count, ratings].every(Number.isFinite)) return null
  if (count < 0 || ratings < 0 || avg < 0 || avg > 5) return null
  if (!Number.isInteger(count)) return null
  return { avg, count, ratings }
}

/** Reasons a rating is not plausible; empty when valid. Used by the staged gate. */
export function kkStarRatingProblems(value: unknown): string[] {
  const rating = parseKkStarRating(value)
  if (!rating) return ['kkStarRating must be { avg: 0-5, count: integer >= 0, ratings: number >= 0 }']
  const problems: string[] = []
  if (rating.ratings > rating.count * 5) problems.push('kkStarRating.ratings exceeds count × 5')
  if (rating.count > 0 && Math.abs(rating.ratings / rating.count - rating.avg) > 0.06) {
    problems.push('kkStarRating.avg disagrees with ratings / count')
  }
  return problems
}

/**
 * Value to write for a staged rating over an existing doc, or undefined to leave
 * the live value alone. Visitors keep voting on the CMS after cutover
 * (`/api/ratings/submit` increments count), so a re-import must never lower
 * what the live doc has accumulated: the staged snapshot only fills in when it
 * is strictly ahead of the live count.
 */
export function ratingToWrite(staged: unknown, live: unknown): KkStarRating | undefined {
  const next = parseKkStarRating(staged)
  if (!next || next.count <= 0) return undefined
  const liveCount = Number((live as { count?: unknown } | null | undefined)?.count ?? 0)
  return liveCount >= next.count ? undefined : next
}
