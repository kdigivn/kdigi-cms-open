import assert from 'node:assert/strict'
import test from 'node:test'

import { publicPathFor } from './frontend-public-path'

test('products live under /product/{slug}', () => {
  assert.equal(publicPathFor('products', 've-tau-phu-quoc'), '/product/ve-tau-phu-quoc')
})

test('posts, pages and landings live at the root /{slug}', () => {
  assert.equal(publicPathFor('posts', 'lich-tau-con-dao'), '/lich-tau-con-dao')
  assert.equal(publicPathFor('pages', 'lien-he'), '/lien-he')
  assert.equal(publicPathFor('landings', 've-tau-cao-toc'), '/ve-tau-cao-toc')
})

test('unknown collections and empty slugs have no public path', () => {
  assert.equal(publicPathFor('media', 'x'), null)
  assert.equal(publicPathFor('shortcodes', 'bang-gia'), null)
  assert.equal(publicPathFor('posts', ''), null)
  assert.equal(publicPathFor('posts', null), null)
})

test('slugs are used verbatim (already normalized by the slug field, never re-encoded)', () => {
  assert.equal(publicPathFor('posts', 'đi-côn-đảo'), '/đi-côn-đảo')
})
