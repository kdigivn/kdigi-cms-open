/**
 * Field validation tests for Sites.knowledgeGraph new SEO fields.
 *
 * Tests the validation logic for:
 *   - foundingDate: ISO 8601 date string (YYYY-MM-DD)
 *   - returnPolicyUrl / searchActionUrl: absolute URL strings
 *   - wikidataId: Wikidata Q-id format (^Q[0-9]+$)
 *   - minReviewsForAggregate: integer >= 0
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// ── Validators (mirror Payload field-level validation logic) ──────────────────

const isISODate = (v: unknown): boolean => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const [y, m, d] = v.split('-').map(Number)
  if (m < 1 || m > 12) return false
  if (d < 1 || d > 31) return false
  // Reject invalid calendar dates (e.g. Feb 30) via Date check
  const parsed = new Date(`${v}T00:00:00Z`)
  return !isNaN(parsed.getTime()) && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d
}

const isAbsoluteUrl = (v: unknown): boolean =>
  typeof v === 'string' &&
  /^https?:\/\/.+/.test(v) &&
  !v.includes(' ') &&
  v.length >= 10

const isWikidataId = (v: unknown): boolean =>
  typeof v === 'string' && /^Q[0-9]+$/.test(v)

const isNonNegativeInteger = (v: unknown): boolean =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('Sites.knowledgeGraph field validators', () => {
  describe('foundingDate — ISO 8601', () => {
    it('accepts valid YYYY-MM-DD', () => {
      assert.equal(isISODate('2020-01-15'), true)
      assert.equal(isISODate('1999-12-31'), true)
      assert.equal(isISODate('1980-06-01'), true)
    })
    it('rejects invalid formats', () => {
      assert.equal(isISODate('2020-1-5'), false)
      assert.equal(isISODate('01-15-2020'), false)
      assert.equal(isISODate('2020/01/15'), false)
      assert.equal(isISODate(''), false)
      assert.equal(isISODate(null), false)
      assert.equal(isISODate(undefined), false)
    })
    it('rejects non-date strings', () => {
      assert.equal(isISODate('not-a-date'), false)
      assert.equal(isISODate('2020-13-01'), false) // invalid month
      assert.equal(isISODate('2020-02-30'), false) // invalid day
    })
  })

  describe('returnPolicyUrl / searchActionUrl — absolute URL', () => {
    const field = 'returnPolicyUrl'
    it('accepts https URL', () => {
      assert.equal(isAbsoluteUrl('https://example.com/return-policy'), true)
      assert.equal(isAbsoluteUrl('https://example.com/policy'), true)
    })
    it('accepts http URL', () => {
      assert.equal(isAbsoluteUrl('http://example.com/policy'), true)
    })
    it('rejects relative path', () => {
      assert.equal(isAbsoluteUrl('/return-policy'), false)
      assert.equal(isAbsoluteUrl('policy'), false)
    })
    it('rejects URL with spaces', () => {
      assert.equal(isAbsoluteUrl('https://example.com/return policy'), false)
    })
    it('rejects invalid values', () => {
      assert.equal(isAbsoluteUrl(''), false)
      assert.equal(isAbsoluteUrl(null), false)
      assert.equal(isAbsoluteUrl(undefined), false)
      assert.equal(isAbsoluteUrl('ftp://example.com'), false)
    })
  })

  describe('wikidataId — Q-id format', () => {
    it('accepts valid Q-ids', () => {
      assert.equal(isWikidataId('Q12345'), true)
      assert.equal(isWikidataId('Q1'), true)
      assert.equal(isWikidataId('Q999999999'), true)
    })
    it('rejects invalid formats', () => {
      assert.equal(isWikidataId('q12345'), false)   // lowercase
      assert.equal(isWikidataId('Q'), false)          // no number
      assert.equal(isWikidataId('Q12abc'), false)     // letters after number
      assert.equal(isWikidataId('P12345'), false)     // wrong prefix
      assert.equal(isWikidataId(''), false)
      assert.equal(isWikidataId(null), false)
      assert.equal(isWikidataId(undefined), false)
    })
  })

  describe('minReviewsForAggregate — non-negative integer', () => {
    it('accepts valid values', () => {
      assert.equal(isNonNegativeInteger(0), true)
      assert.equal(isNonNegativeInteger(10), true)
      assert.equal(isNonNegativeInteger(1), true)
      assert.equal(isNonNegativeInteger(999), true)
    })
    it('rejects negative integers', () => {
      assert.equal(isNonNegativeInteger(-1), false)
      assert.equal(isNonNegativeInteger(-10), false)
    })
    it('rejects non-integers', () => {
      assert.equal(isNonNegativeInteger(1.5), false)
      assert.equal(isNonNegativeInteger(NaN), false)
    })
    it('rejects non-numbers', () => {
      assert.equal(isNonNegativeInteger('10'), false)
      assert.equal(isNonNegativeInteger(null), false)
      assert.equal(isNonNegativeInteger(undefined), false)
    })
  })
})
