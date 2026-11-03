import type { Where } from 'payload'

/**
 * Unauthenticated read predicate for content collections (Phase 5 — scheduled publishing).
 *
 * Gating rules:
 *   1. status MUST equal 'published' (drafts are never public).
 *   2. publishedAt is EITHER missing/empty (backward-compat with old docs) OR <= now.
 *
 * The `new Date()` is evaluated on every request (the function is invoked per call),
 * not hoisted at module load — otherwise scheduled posts would never go live.
 *
 * Date object (not ISO string) is intentional: Payload's Postgres adapter coerces JS
 * Date objects correctly when comparing to TIMESTAMPTZ columns. ISO strings may produce
 * lexicographic compare errors on certain drivers.
 *
 * `exists: false` covers legacy posts with publishedAt: NULL — must remain readable
 * to keep backward compatibility (Red Team C13).
 *
 * [RT-4] (SP1a-2) Every collection using this predicate has `trash: true`, and Payload's
 * `trash=false` is only a DEFAULT: a caller passing `?trash=true` gets the unfiltered query.
 * The `deletedAt` clause makes "never trashed" part of the access boundary itself.
 */
export const publishedAndLive = (): Where => {
  const now = new Date()
  return {
    and: [
      { deletedAt: { exists: false } },
      { status: { equals: 'published' } },
      {
        or: [
          { publishedAt: { exists: false } },
          { publishedAt: { less_than_equal: now } },
        ],
      },
    ],
  }
}
