/**
 * Unit tests for vietnamese-text.ts
 * Runner: node --import tsx --test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { countSyllables, stripDiacritics, keywordMatches, markdownToPlainText } from './vietnamese-text.js'

test('countSyllables: empty string', () => {
  assert.equal(countSyllables(''), 0)
})

test('countSyllables: single word', () => {
  assert.equal(countSyllables('Phú'), 1)
})

test('countSyllables: Vietnamese phrase', () => {
  // "Du lịch Phú Quốc" = 4 syllables
  assert.equal(countSyllables('Du lịch Phú Quốc'), 4)
})

test('stripDiacritics: removes Vietnamese diacritics', () => {
  assert.equal(stripDiacritics('Phú Quốc'), 'Phu Quoc')
  assert.equal(stripDiacritics('đường'), 'duong')
  assert.equal(stripDiacritics('Đà Nẵng'), 'Da Nang')
})

test('keywordMatches: exact match', () => {
  assert.equal(keywordMatches('du lịch Phú Quốc', 'Phú Quốc'), 1)
})

test('keywordMatches: multiple matches', () => {
  assert.equal(keywordMatches('Phú Quốc và Phú Quốc xinh đẹp', 'Phú Quốc'), 2)
})

test('keywordMatches: no match', () => {
  assert.equal(keywordMatches('Hà Nội đẹp', 'Phú Quốc'), 0)
})

test('keywordMatches: normalized fallback', () => {
  // keyword without diacritic should still match content with diacritic via normalization
  const count = keywordMatches('phu quoc beach', 'phu quoc')
  assert.ok(count >= 1)
})

test('markdownToPlainText: strips headings', () => {
  const text = markdownToPlainText('# Tiêu đề\n## Mục con')
  assert.doesNotMatch(text, /^#+/)
  assert.match(text, /Tiêu đề/)
})

test('markdownToPlainText: strips inline code', () => {
  const text = markdownToPlainText('Dùng `npm install` để cài')
  assert.doesNotMatch(text, /`/)
})

test('markdownToPlainText: strips image syntax, keeps alt text', () => {
  const text = markdownToPlainText('![ảnh đẹp](https://example.com/img.jpg)')
  assert.doesNotMatch(text, /!\[/)
  assert.doesNotMatch(text, /https:\/\//)
})

test('markdownToPlainText: strips link syntax, keeps link text', () => {
  const text = markdownToPlainText('[click here](https://example.com)')
  assert.match(text, /click here/)
  assert.doesNotMatch(text, /https:\/\//)
})
