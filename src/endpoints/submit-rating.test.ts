/**
 * Unit tests for submit-rating endpoint.
 * Runner: node --import tsx --test (no live DB — payload is faked).
 *
 * Coverage:
 *   1. No reCAPTCHA token required — endpoint proceeds without one
 *   2. Same (IP, contentId) submitted twice → second is idempotent (no increment, no new event)
 *   3. Same IP, different contentId → both count independently
 *   4. Missing IP headers → fail-open, still increments
 *   5. Tenant mismatch → 403
 *   6. Invalid rating value → 400
 *   7. Unknown collection → 400
 *   8. X-Client-IP is preferred over X-Forwarded-For for dedup
 *   9. X-Forwarded-For rightmost entry is used (not leftmost) when X-Client-IP absent
 *  10. find() throws → returns 500, does NOT increment
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { submitRatingEndpoint } from './submit-rating.js'

// ─── Fakes ───────────────────────────────────────────────────────────────────

const noopLogger = {
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
}

interface FakeDoc {
  id: number
  tenant?: { siteKey: string }
  kkStarRating?: { avg: number; count: number; ratings: number }
}

interface RatingEventDoc {
  collection: string
  contentId: string
  ipHash: string
}

/**
 * Build a fake PayloadRequest that matches what submit-rating.ts reads.
 *
 * @param opts.body          - JSON body
 * @param opts.headers       - Map of header name → value
 * @param opts.doc           - Document returned by findByID
 * @param opts.ratingEvents  - Pre-populated dedup records for find() calls
 * @param opts.createdEvents - Accumulator: events written by create()
 * @param opts.incrementCount - Accumulator: incremented by the raw SQL mock
 * @param opts.findThrows    - When true, find('rating-events') throws a DB error
 */
function makeReq(opts: {
  body?: unknown
  headers?: Record<string, string>
  doc?: FakeDoc | null
  ratingEvents?: RatingEventDoc[]
  createdEvents?: RatingEventDoc[]
  incrementCount?: { value: number }
  findThrows?: boolean
}) {
  const {
    body = {},
    headers = {},
    doc = null,
    ratingEvents = [],
    createdEvents = [],
    incrementCount = { value: 0 },
    findThrows = false,
  } = opts

  const headerMap = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))

  return {
    json: async () => body,
    headers: {
      get: (name: string) => headerMap.get(name.toLowerCase()) ?? null,
    },
    payload: {
      logger: noopLogger,
      findByID: async ({ id }: { id: string; collection: string }) => {
        if (!doc) throw new Error('not found')
        return doc
      },
      find: async ({ collection, where }: { collection: string; where: Record<string, unknown> }) => {
        if (collection === 'rating-events') {
          // Simulate a DB timeout / connection error
          if (findThrows) throw new Error('Connection timeout')

          // Extract the ipHash clause from the nested and[] filter
          const andClauses = (where.and as Array<Record<string, { equals?: string }>>) ?? []
          const ipHashClause = andClauses.find((c) => 'ipHash' in c)
          const contentIdClause = andClauses.find((c) => 'contentId' in c)
          const collectionClause = andClauses.find((c) => 'collection' in c)

          const matchedHash = ipHashClause?.ipHash?.equals
          const matchedContentId = contentIdClause?.contentId?.equals
          const matchedCollection = collectionClause?.collection?.equals

          const docs = ratingEvents.filter(
            (e) =>
              e.ipHash === matchedHash &&
              e.contentId === matchedContentId &&
              e.collection === matchedCollection,
          )
          return { docs }
        }
        return { docs: [] }
      },
      create: async ({ data }: { collection: string; data: RatingEventDoc }) => {
        createdEvents.push(data)
        // Also add to ratingEvents so subsequent find() calls see it
        ratingEvents.push(data)
        return { id: ratingEvents.length, ...data }
      },
      db: {
        drizzle: {
          execute: async () => {
            incrementCount.value += 1
            return {
              rows: [
                {
                  kk_star_rating_avg: (doc?.kkStarRating?.avg ?? 0) + 1,
                  kk_star_rating_count: (doc?.kkStarRating?.count ?? 0) + 1,
                  kk_star_rating_ratings: (doc?.kkStarRating?.ratings ?? 0) + 1,
                },
              ],
            }
          },
        },
      },
    },
  } as unknown as Parameters<typeof submitRatingEndpoint.handler>[0]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VALID_DOC: FakeDoc = {
  id: 42,
  tenant: { siteKey: 'demo-test' },
  kkStarRating: { avg: 4, count: 2, ratings: 8 },
}

const VALID_BODY = {
  collection: 'posts',
  id: '42',
  rating: 4,
  tenantSiteKey: 'demo-test',
}

// ─── Test 1: No reCAPTCHA token required ─────────────────────────────────────

describe('submit-rating — no reCAPTCHA', () => {
  it('succeeds without recaptchaToken in body', async () => {
    const incrementCount = { value: 0 }
    const req = makeReq({
      body: VALID_BODY, // no recaptchaToken field
      headers: { 'x-forwarded-for': '1.2.3.4' },
      doc: VALID_DOC,
      incrementCount,
    })
    const res = await submitRatingEndpoint.handler(req)
    assert.equal(res.status, 201)
    const json = (await res.json()) as { success: boolean; kkStarRating: { avg: number; count: number } }
    assert.equal(json.success, true)
    assert.equal(typeof json.kkStarRating.avg, 'number')
    assert.equal(incrementCount.value, 1)
  })
})

// ─── Test 2: Same IP + contentId → idempotent on second submit ───────────────

describe('submit-rating — IP dedup', () => {
  it('second submit with same IP+content returns 200 without incrementing', async () => {
    const ratingEvents: RatingEventDoc[] = []
    const createdEvents: RatingEventDoc[] = []
    const incrementCount = { value: 0 }

    const req1 = makeReq({
      body: VALID_BODY,
      headers: { 'x-forwarded-for': '10.0.0.1' },
      doc: VALID_DOC,
      ratingEvents,
      createdEvents,
      incrementCount,
    })
    const res1 = await submitRatingEndpoint.handler(req1)
    assert.equal(res1.status, 201, 'first submit should be 201')
    assert.equal(incrementCount.value, 1)
    assert.equal(createdEvents.length, 1)

    // Second submit — same body, same IP, shares ratingEvents array so find() returns the record
    const req2 = makeReq({
      body: VALID_BODY,
      headers: { 'x-forwarded-for': '10.0.0.1' },
      doc: VALID_DOC,
      ratingEvents, // same array — now contains the event from req1
      createdEvents,
      incrementCount,
    })
    const res2 = await submitRatingEndpoint.handler(req2)
    assert.equal(res2.status, 200, 'second submit should be idempotent 200')
    // Increment must NOT have fired again
    assert.equal(incrementCount.value, 1, 'aggregate must not increment on dedup')
    // No new event created
    assert.equal(createdEvents.length, 1, 'no new rating event should be written')
  })
})

// ─── Test 3: Same IP, different contentId → both count ───────────────────────

describe('submit-rating — different content from same IP', () => {
  it('same IP for different content IDs each increment independently', async () => {
    const ratingEvents: RatingEventDoc[] = []
    const incrementCount = { value: 0 }

    const req1 = makeReq({
      body: { ...VALID_BODY, id: '10' },
      headers: { 'x-forwarded-for': '10.0.0.2' },
      doc: VALID_DOC,
      ratingEvents,
      incrementCount,
    })
    const res1 = await submitRatingEndpoint.handler(req1)
    assert.equal(res1.status, 201)
    assert.equal(incrementCount.value, 1)

    const req2 = makeReq({
      body: { ...VALID_BODY, id: '20' },
      headers: { 'x-forwarded-for': '10.0.0.2' },
      doc: VALID_DOC,
      ratingEvents,
      incrementCount,
    })
    const res2 = await submitRatingEndpoint.handler(req2)
    assert.equal(res2.status, 201)
    assert.equal(incrementCount.value, 2, 'both content items should be independently incremented')
    assert.equal(ratingEvents.length, 2, 'two separate rating events should exist')
  })
})

// ─── Test 4: Missing IP headers → fail-open, still counts ────────────────────

describe('submit-rating — missing IP headers', () => {
  it('proceeds without x-forwarded-for or x-real-ip (fail-open)', async () => {
    const incrementCount = { value: 0 }
    const req = makeReq({
      body: VALID_BODY,
      headers: {}, // no IP headers
      doc: VALID_DOC,
      incrementCount,
    })
    const res = await submitRatingEndpoint.handler(req)
    // Must succeed — fail-open means we skip dedup but still count
    assert.equal(res.status, 201)
    assert.equal(incrementCount.value, 1)
  })
})

// ─── Test 5: Tenant mismatch → 403 ───────────────────────────────────────────

describe('submit-rating — tenant guard', () => {
  it('returns 403 when tenantSiteKey does not match doc tenant', async () => {
    const req = makeReq({
      body: { ...VALID_BODY, tenantSiteKey: 'wrong-key' },
      headers: { 'x-forwarded-for': '1.2.3.4' },
      doc: VALID_DOC, // doc.tenant.siteKey = 'demo-test'
    })
    const res = await submitRatingEndpoint.handler(req)
    assert.equal(res.status, 403)
  })
})

// ─── Test 6: Invalid rating value → 400 ──────────────────────────────────────

describe('submit-rating — rating validation', () => {
  it('returns 400 for out-of-range rating', async () => {
    const req = makeReq({
      body: { ...VALID_BODY, rating: 6 },
      headers: { 'x-forwarded-for': '1.2.3.4' },
      doc: VALID_DOC,
    })
    const res = await submitRatingEndpoint.handler(req)
    assert.equal(res.status, 400)
  })

  it('returns 400 for non-integer rating', async () => {
    const req = makeReq({
      body: { ...VALID_BODY, rating: 3.5 },
      headers: { 'x-forwarded-for': '1.2.3.4' },
      doc: VALID_DOC,
    })
    const res = await submitRatingEndpoint.handler(req)
    assert.equal(res.status, 400)
  })
})

// ─── Test 7: Unknown collection → 400 ────────────────────────────────────────

describe('submit-rating — collection whitelist', () => {
  it('returns 400 for unlisted collection', async () => {
    const req = makeReq({
      body: { ...VALID_BODY, collection: 'users' },
      headers: { 'x-forwarded-for': '1.2.3.4' },
      doc: VALID_DOC,
    })
    const res = await submitRatingEndpoint.handler(req)
    assert.equal(res.status, 400)
  })
})

// ─── Test 8: X-Client-IP preferred over X-Forwarded-For ──────────────────────

describe('submit-rating — X-Client-IP header', () => {
  it('uses X-Client-IP for dedup when present (trusted frontend header)', async () => {
    const ratingEvents: RatingEventDoc[] = []
    const createdEvents: RatingEventDoc[] = []
    const incrementCount = { value: 0 }

    // First submit with X-Client-IP
    const req1 = makeReq({
      body: VALID_BODY,
      // X-Client-IP is present alongside an XFF that has a different leftmost IP.
      // The dedup key must be derived from X-Client-IP (192.168.1.1), not from
      // the leftmost XFF entry (spoofed-ip) or the rightmost XFF entry (proxy).
      headers: { 'x-client-ip': '192.168.1.1', 'x-forwarded-for': 'spoofed-ip, proxy-ip' },
      doc: VALID_DOC,
      ratingEvents,
      createdEvents,
      incrementCount,
    })
    const res1 = await submitRatingEndpoint.handler(req1)
    assert.equal(res1.status, 201, 'first submit should be 201')
    assert.equal(incrementCount.value, 1)
    assert.equal(createdEvents.length, 1, 'one rating event should be created')

    // Second submit with same X-Client-IP — must be detected as duplicate
    const req2 = makeReq({
      body: VALID_BODY,
      headers: { 'x-client-ip': '192.168.1.1', 'x-forwarded-for': 'spoofed-ip, proxy-ip' },
      doc: VALID_DOC,
      ratingEvents, // shares events from first submit
      createdEvents,
      incrementCount,
    })
    const res2 = await submitRatingEndpoint.handler(req2)
    assert.equal(res2.status, 200, 'second submit with same X-Client-IP must be deduped')
    assert.equal(incrementCount.value, 1, 'increment must not fire on dedup')

    // Submit with a DIFFERENT X-Client-IP — must not be deduped
    const req3 = makeReq({
      body: VALID_BODY,
      headers: { 'x-client-ip': '192.168.1.99', 'x-forwarded-for': 'spoofed-ip, proxy-ip' },
      doc: VALID_DOC,
      ratingEvents,
      createdEvents,
      incrementCount,
    })
    const res3 = await submitRatingEndpoint.handler(req3)
    assert.equal(res3.status, 201, 'different X-Client-IP must not be deduped')
    assert.equal(incrementCount.value, 2, 'new unique IP must increment')
  })
})

// ─── Test 9: Rightmost XFF entry used (not leftmost) ─────────────────────────

describe('submit-rating — rightmost X-Forwarded-For', () => {
  it('deduplicates using the rightmost XFF entry, not the leftmost (spoofable) one', async () => {
    const ratingEvents: RatingEventDoc[] = []
    const incrementCount = { value: 0 }

    // First submit: rightmost IP is 10.0.0.1
    const req1 = makeReq({
      body: VALID_BODY,
      headers: { 'x-forwarded-for': 'client-spoofed, 10.0.0.1' },
      doc: VALID_DOC,
      ratingEvents,
      incrementCount,
    })
    const res1 = await submitRatingEndpoint.handler(req1)
    assert.equal(res1.status, 201, 'first submit should be 201')
    assert.equal(incrementCount.value, 1)

    // Second submit: different leftmost (attacker tries different spoof) but same rightmost
    // This SHOULD be deduped because the real IP (rightmost) is the same.
    const req2 = makeReq({
      body: VALID_BODY,
      headers: { 'x-forwarded-for': 'different-spoof, 10.0.0.1' },
      doc: VALID_DOC,
      ratingEvents,
      incrementCount,
    })
    const res2 = await submitRatingEndpoint.handler(req2)
    assert.equal(res2.status, 200, 'same rightmost XFF must be deduped regardless of leftmost spoof')
    assert.equal(incrementCount.value, 1, 'increment must not fire when rightmost XFF matches')

    // Third submit: different rightmost — NOT deduped
    const req3 = makeReq({
      body: VALID_BODY,
      headers: { 'x-forwarded-for': 'client-spoofed, 10.0.0.99' },
      doc: VALID_DOC,
      ratingEvents,
      incrementCount,
    })
    const res3 = await submitRatingEndpoint.handler(req3)
    assert.equal(res3.status, 201, 'different rightmost XFF must not be deduped')
    assert.equal(incrementCount.value, 2, 'new rightmost IP must increment independently')
  })
})

// ─── Test 10: find() throws → 500, no increment ──────────────────────────────

describe('submit-rating — find() DB failure', () => {
  it('returns 500 and does NOT increment when find() throws a DB error', async () => {
    const incrementCount = { value: 0 }
    const req = makeReq({
      body: VALID_BODY,
      headers: { 'x-client-ip': '10.0.0.5' },
      doc: VALID_DOC,
      incrementCount,
      findThrows: true, // simulates DB timeout / connection failure in find()
    })
    const res = await submitRatingEndpoint.handler(req)
    assert.equal(res.status, 500, 'DB failure in find() must return 500')
    assert.equal(incrementCount.value, 0, 'increment must NOT fire when find() throws')
  })
})
