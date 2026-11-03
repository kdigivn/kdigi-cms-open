/**
 * Unit tests for slug-url-prefix-map.ts
 * Runner: node --import tsx --test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  segmentForTaxonomyType,
  segmentForCollection,
  buildSlugUrlPrefix,
} from './slug-url-prefix-map'

test('segmentForTaxonomyType: known vi segments', () => {
  assert.equal(segmentForTaxonomyType('product-category', 'vi'), 'product-category')
})

test('segmentForTaxonomyType: known en segments', () => {
  assert.equal(segmentForTaxonomyType('product-category', 'en'), 'product-category')
  assert.equal(segmentForTaxonomyType('category', 'en'), null)
})

test('segmentForTaxonomyType: documented gaps resolve to null', () => {
  // category / tag / posts segments unconfirmed — must NOT emit a guessed path
  assert.equal(segmentForTaxonomyType('category', 'vi'), null)
  assert.equal(segmentForTaxonomyType('tag', 'vi'), null)
  assert.equal(segmentForTaxonomyType('unknown-type', 'vi'), null)
})

test('segmentForCollection: products has a segment; root collections do not', () => {
  assert.equal(segmentForCollection('products', 'vi'), 'product')
  assert.equal(segmentForCollection('pages', 'vi'), null)
  assert.equal(segmentForCollection('landings', 'vi'), null)
  assert.equal(segmentForCollection('posts', 'vi'), null)
})

test('unknown locale falls back to vi segments', () => {
  assert.equal(segmentForTaxonomyType('product-category', 'fr' as never), 'product-category')
  assert.equal(segmentForCollection('products', 'fr' as never), 'product')
})

test('buildSlugUrlPrefix: domain + segment', () => {
  assert.equal(
    buildSlugUrlPrefix({ domain: 'example.com', segment: 'product', locale: 'vi' }),
    'https://example.com/product/',
  )
})

test('buildSlugUrlPrefix: domain, no segment → root', () => {
  assert.equal(
    buildSlugUrlPrefix({ domain: 'example.com', segment: null, locale: 'vi' }),
    'https://example.com/',
  )
})

test('buildSlugUrlPrefix: no domain, segment → path-only fallback', () => {
  assert.equal(
    buildSlugUrlPrefix({ domain: null, segment: 'product', locale: 'vi' }),
    '/product/',
  )
})

test('buildSlugUrlPrefix: no domain, no segment → root path', () => {
  assert.equal(buildSlugUrlPrefix({ domain: null, segment: null, locale: 'vi' }), '/')
})

test('buildSlugUrlPrefix: normalizes a domain that already has protocol/trailing slash', () => {
  assert.equal(
    buildSlugUrlPrefix({ domain: 'https://example.com/', segment: 'product', locale: 'vi' }),
    'https://example.com/product/',
  )
  assert.equal(
    buildSlugUrlPrefix({ domain: 'http://x.com', segment: null, locale: 'vi' }),
    'https://x.com/',
  )
})

test('buildSlugUrlPrefix: blank/whitespace domain treated as absent', () => {
  assert.equal(buildSlugUrlPrefix({ domain: '   ', segment: 'product', locale: 'vi' }), '/product/')
})
