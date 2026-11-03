import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  tokenize,
  tokenOverlapScore,
  buildDomainCommonTokens,
  distinctiveOverlapScore,
  splitSections,
  insertInline,
  existingInlineUrls,
} from './assign-images-from-alt-text'
import type { StagedMedia } from './staged-doc-types'

function media(alt: string, sourceUrl: string): StagedMedia {
  return { collection: 'media', sourceUrl, alt, localPath: null, wp: { databaseId: 1 } }
}

describe('assign-images-from-alt-text', () => {
  describe('tokenize', () => {
    it('lowercases, drops stopwords/short tokens, and KEEPS diacritics', () => {
      const tokens = tokenize('Bãi Suối Nóng Ninh Bình, bãi biển có suối nước nóng')
      assert.ok(tokens.has('suối'))
      assert.ok(tokens.has('nóng'))
      assert.ok(tokens.has('ninh'))
      assert.ok(tokens.has('bình'))
      assert.ok(!tokens.has('có')) // stopword (checked on folded form)
      assert.ok(!tokens.has('suoi'), 'must not fold to ASCII — homographs collide')
    })

    it('drops English function words and file extensions', () => {
      const tokens = tokenize('The lake from our hotel photo.JPG')
      assert.deepEqual([...tokens].sort(), ['hotel', 'lake'])
    })

    it('does not collide tone-mark homographs (mấy≠máy, đất≠đặt)', () => {
      const doc = tokenize('Mấy hòn đảo nhỏ và mũi đất xung quanh Ninh Bình')
      const alt = tokenize('Đặt vé tàu đi Ninh Bình qua máy tính bước 1')
      assert.ok(!doc.has('máy') && alt.has('máy'))
      assert.ok(doc.has('đất') && !alt.has('đất'))
      assert.equal(
        tokenOverlapScore(doc, alt) - tokenOverlapScore(new Set(['ninh', 'bình']), alt),
        0,
        'only ninh/bình overlap',
      )
    })
  })

  describe('tokenOverlapScore', () => {
    it('counts shared tokens between two sets', () => {
      const a = new Set(['suoi', 'nong', 'ninh', 'binh'])
      const b = new Set(['suoi', 'nong', 'bai'])
      assert.equal(tokenOverlapScore(a, b), 2)
    })
    it('returns 0 for disjoint sets', () => {
      assert.equal(tokenOverlapScore(new Set(['a']), new Set(['b'])), 0)
    })
  })

  describe('domain-common token weighting', () => {
    // 10 alts, every one contains "Ninh Bình" — a single-destination site where
    // a 2-token threshold was trivially met by (ninh, bình) alone and unrelated
    // screenshots got assigned to articles.
    const corpus = [
      media('Lịch tàu Ninh Bình TP Hồ Chí Minh mới nhất', 'https://cdn.example.com/a1.webp'),
      media('Bãi Đầm Trầu Ninh Bình hoang sơ', 'https://cdn.example.com/a2.webp'),
      media('Nhà tù Ninh Bình địa ngục trần gian', 'https://cdn.example.com/a3.webp'),
      media('Kem dừa Ninh Bình hương vị đặc biệt', 'https://cdn.example.com/a4.webp'),
      media('Vườn Quốc gia Ninh Bình sinh thái', 'https://cdn.example.com/a5.webp'),
      media('Đặt vé tàu Ninh Bình qua máy tính', 'https://cdn.example.com/a6.webp'),
      media('Miếu Cậu Ninh Bình tâm linh', 'https://cdn.example.com/a7.webp'),
      media('Chợ Ninh Bình hải sản', 'https://cdn.example.com/a8.webp'),
      media('Cầu tàu 914 Ninh Bình lịch sử', 'https://cdn.example.com/a9.webp'),
      media('Bảo tàng Ninh Bình hiện vật', 'https://cdn.example.com/a10.webp'),
    ]

    it('buildDomainCommonTokens flags corpus-wide tokens as FOLDED forms', () => {
      const common = buildDomainCommonTokens(corpus)
      assert.ok(common.has('ninh'))
      assert.ok(common.has('binh'))
      assert.ok(!common.has('kem'))
      assert.ok(!common.has('bao'))
    })

    it('unaccented alt text cannot score via ascii twins of common tokens', () => {
      const common = buildDomainCommonTokens(corpus)
      // slug tokens are ascii; an unaccented alt shares "ninh binh" with them
      const query = tokenize('1 tuan o ninh binh')
      const unaccentedAlt = tokenize('Cap nhat nhanh chong lich tau ninh binh can tho')
      assert.equal(distinctiveOverlapScore(query, unaccentedAlt, common), 0)
    })

    it('distinctiveOverlapScore gives 0 to a pair that only shares domain-common tokens', () => {
      const common = buildDomainCommonTokens(corpus)
      const docTitle = tokenize('Mấy hòn đảo nhỏ và mũi đất xung quanh Ninh Bình')
      const scheduleAlt = tokenize('Lịch tàu Ninh Bình TP Hồ Chí Minh mới nhất')
      assert.ok(tokenOverlapScore(docTitle, scheduleAlt) >= 2, 'raw overlap is what caused the bug')
      assert.equal(distinctiveOverlapScore(docTitle, scheduleAlt, common), 0)
    })

    it('distinctiveOverlapScore still matches genuinely related alt text', () => {
      const common = buildDomainCommonTokens(corpus)
      const docTitle = tokenize('Tham quan Nhà tù Ninh Bình địa ngục trần gian')
      const prisonAlt = tokenize('Nhà tù Ninh Bình địa ngục trần gian')
      assert.ok(distinctiveOverlapScore(docTitle, prisonAlt, common) >= 2)
    })
  })

  describe('splitSections', () => {
    it('splits a body into heading sections with a body preview', () => {
      const body = 'Intro\n\n## Bãi Suối Nóng\n\nMô tả suối nước nóng.\n\n## Cách đi\n\nĐi từ trung tâm.'
      const sections = splitSections(body)
      assert.equal(sections.length, 2)
      assert.equal(sections[0].heading, 'Bãi Suối Nóng')
      assert.match(sections[0].bodyPreview, /suối nước nóng/)
      assert.equal(sections[1].heading, 'Cách đi')
    })
    it('returns empty when there are no headings', () => {
      assert.deepEqual(splitSections('Just a paragraph, no heading.'), [])
    })
  })

  describe('insertInline idempotency (re-run must not double-insert)', () => {
    it('caps at MAX_INLINE_PER_DOC total, counting images already present from a prior run', () => {
      const body =
        '## Bãi Suối Nóng\n\nSuối nước nóng đổ ra biển.\n\n' +
        '## Cách đi\n\nĐi từ trung tâm thị trấn.\n\n' +
        '## Thời điểm đẹp\n\nMùa khô đẹp nhất.\n\n' +
        '## Chơi gì\n\nNhiều hoạt động thú vị.\n\n' +
        '## Ăn gì\n\nHải sản tươi ngon.\n'
      const mediaList = [
        media('Bãi Suối Nóng Ninh Bình suối nước nóng', 'https://cdn.example.com/1.webp'),
        media('Cách đi Ninh Bình trung tâm thị trấn', 'https://cdn.example.com/2.webp'),
        media('Thời điểm đẹp mùa khô Ninh Bình', 'https://cdn.example.com/3.webp'),
        media('Chơi gì hoạt động thú vị Ninh Bình', 'https://cdn.example.com/4.webp'),
        media('Ăn gì hải sản tươi ngon Ninh Bình', 'https://cdn.example.com/5.webp'),
      ]

      const first = insertInline(body, mediaList, existingInlineUrls(body))
      const firstCount = existingInlineUrls(first.body).size
      assert.ok(firstCount <= 4, `first run should cap at 4, got ${firstCount}`)

      // Simulate a second run against the already-modified body (what a
      // re-run of the CLI actually does).
      const second = insertInline(first.body, mediaList, existingInlineUrls(first.body))
      const secondCount = existingInlineUrls(second.body).size
      assert.equal(secondCount, firstCount, 're-run must not add more inline images beyond the cap')
      assert.deepEqual(second.picked, [], 're-run should propose zero new insertions once at the cap')
    })
  })
})
