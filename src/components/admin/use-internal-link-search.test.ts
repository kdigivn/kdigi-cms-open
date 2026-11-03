import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildLinkSearchUrl,
  isLiveDoc,
  rankLinkResults,
  toSlugQuery,
  type LinkSearchResult,
} from './use-internal-link-search'

const NOW = new Date('2026-09-26T10:00:00.000Z')

function params(url: string): URLSearchParams {
  return new URL(url, 'http://cms.local').searchParams
}

test('[RT-14] default search asks for live docs only (published, publishedAt missing or past)', () => {
  const query = params(buildLinkSearchUrl('posts', { query: 'lịch', tenantId: 55, includeNonLive: false, now: NOW }))
  assert.equal(query.get('where[and][0][tenant][equals]'), '55')
  assert.equal(query.get('where[and][2][status][equals]'), 'published')
  assert.equal(query.get('where[and][3][or][0][publishedAt][exists]'), 'false')
  assert.equal(query.get('where[and][3][or][1][publishedAt][less_than_equal]'), NOW.toISOString())
})

test('opting in to drafts/scheduled drops ONLY the live filter, never the tenant filter', () => {
  const query = params(buildLinkSearchUrl('pages', { query: 'x', tenantId: 7, includeNonLive: true, now: NOW }))
  assert.equal(query.get('where[and][0][tenant][equals]'), '7')
  assert.equal(query.get('where[and][2][status][equals]'), null)
  assert.equal(query.get('where[and][3][or][1][publishedAt][less_than_equal]'), null)
})

test('matches the title as typed OR the slug form, so a query without diacritics still finds "Lịch hẹn"', () => {
  const query = params(buildLinkSearchUrl('products', { query: 'Lịch hẹn', tenantId: 1, includeNonLive: false, now: NOW }))
  assert.equal(query.get('where[and][1][or][0][title][like]'), 'Lịch hẹn')
  assert.equal(query.get('where[and][1][or][1][slug][like]'), 'lich-hen')
  assert.equal(toSlugQuery('  Đi Đà Nẵng! '), 'di-da-nang')
})

test('isLiveDoc mirrors publishedAndLive: draft and future-dated docs are not live', () => {
  assert.equal(isLiveDoc({ status: 'published', publishedAt: null }, NOW), true)
  assert.equal(isLiveDoc({ status: 'published', publishedAt: '2026-01-01T00:00:00.000Z' }, NOW), true)
  assert.equal(isLiveDoc({ status: 'published', publishedAt: '2026-12-01T00:00:00.000Z' }, NOW), false)
  assert.equal(isLiveDoc({ status: 'draft', publishedAt: null }, NOW), false)
})

function result(title: string, slug: string): LinkSearchResult {
  return { id: slug, collection: 'posts', title, slug, href: `/${slug}`, live: true }
}

test('ranking is diacritic-insensitive and puts title-prefix matches first', () => {
  const ranked = rankLinkResults(
    [
      result('Bảng giá lịch hẹn', 'bang-gia-lich-hen'),
      result('Lịch hẹn Đà Nẵng', 'lich-hen-da-nang'),
      result('Khách sạn', 'khach-san'),
    ],
    'lich hen',
  )
  assert.deepEqual(
    ranked.map((entry) => entry.slug),
    ['lich-hen-da-nang', 'bang-gia-lich-hen'],
  )
})
