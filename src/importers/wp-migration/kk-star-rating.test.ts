import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { kkStarRatingProblems, parseKkStarRating, ratingToWrite } from './kk-star-rating'

const R = { avg: 4.8889, count: 36, ratings: 176 }

describe('parseKkStarRating', () => {
  it('accepts a well-formed rating and rejects malformed ones', () => {
    assert.deepEqual(parseKkStarRating(R), R)
    assert.equal(parseKkStarRating(null), null)
    assert.equal(parseKkStarRating({ avg: '5', count: 1, ratings: 5 }), null)
    assert.equal(parseKkStarRating({ avg: 6, count: 1, ratings: 6 }), null)
    assert.equal(parseKkStarRating({ avg: 5, count: 1.5, ratings: 5 }), null)
    assert.equal(parseKkStarRating({ avg: 5, count: -1, ratings: 5 }), null)
  })
})

describe('kkStarRatingProblems', () => {
  it('flags ratings that cannot add up', () => {
    assert.deepEqual(kkStarRatingProblems(R), [])
    assert.deepEqual(kkStarRatingProblems({ avg: 0, count: 0, ratings: 0 }), [])
    assert.equal(kkStarRatingProblems({ avg: 5, count: 1, ratings: 9 }).length > 0, true)
    assert.equal(kkStarRatingProblems({ avg: 3, count: 10, ratings: 48 }).length > 0, true)
  })
})

describe('ratingToWrite', () => {
  it('writes the staged rating when the live doc has no votes yet', () => {
    assert.deepEqual(ratingToWrite(R, { avg: 0, count: 0, ratings: 0 }), R)
    assert.deepEqual(ratingToWrite(R, undefined), R)
  })

  it('never lowers a live rating that has accumulated votes since import', () => {
    assert.equal(ratingToWrite(R, { avg: 4.9, count: 40, ratings: 196 }), undefined)
    assert.equal(ratingToWrite(R, { avg: 4.9, count: 36, ratings: 176 }), undefined)
  })

  it('writes when the staged snapshot is strictly ahead of live', () => {
    assert.deepEqual(ratingToWrite(R, { avg: 5, count: 2, ratings: 10 }), R)
  })

  it('ignores empty or invalid staged ratings', () => {
    assert.equal(ratingToWrite({ avg: 0, count: 0, ratings: 0 }, undefined), undefined)
    assert.equal(ratingToWrite(undefined, undefined), undefined)
  })
})
