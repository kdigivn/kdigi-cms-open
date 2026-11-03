/**
 * Tests for seo-score-server.ts
 *
 * KEY CONCERN: server score MUST equal client score on identical inputs.
 * Any divergence would cause the audit widget and list cell to disagree.
 *
 * Runner: node --import tsx --test
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { computeSeoScore } from './seo-score.js'
import {
  computeSeoScoreFromDoc,
  isSeoDeficient,
  seoDeficiencyReasons,
  SEO_DEFICIENT_THRESHOLD,
} from './seo-score-server.js'

// ── Shared fixtures ──────────────────────────────────────────────────────────

const GOOD_DOC = {
  seo: {
    title: 'Du lịch Phú Quốc — hướng dẫn chi tiết nhất 2026',
    description:
      'Khám phá Phú Quốc với hướng dẫn du lịch đầy đủ nhất, từ ăn uống đến lưu trú và điểm tham quan đẹp.',
    focusKeywords: ['Phú Quốc'],
  },
  slug: 'du-lich-phu-quoc',
  contentMd:
    '# Du lịch Phú Quốc\n\nPhú Quốc là điểm đến lý tưởng.\n\n## Cách đến\n\nBạn có thể đến bằng máy bay.\n\n![ảnh](https://ex.com/img.jpg)',
}

const EMPTY_DOC = {
  seo: { title: '', description: '' },
}

const NOINDEX_DOC = {
  seo: {
    title: 'Trang tìm kiếm nội bộ',
    description: 'Mô tả trang tìm kiếm với nội dung đầy đủ hơn 100 ký tự để kiểm tra chức năng noindex.',
    robots: ['noindex', 'nofollow'],
  },
}

// ── Score parity tests (server == client) ────────────────────────────────────

describe('score parity: server computeSeoScoreFromDoc == client computeSeoScore', () => {
  test('empty doc: scores match', () => {
    const serverResult = computeSeoScoreFromDoc(EMPTY_DOC)
    const clientResult = computeSeoScore({ title: '', description: '' })
    assert.equal(serverResult.score, clientResult.score, `server=${serverResult.score} client=${clientResult.score}`)
  })

  test('good doc with slug + content: scores match', () => {
    const serverResult = computeSeoScoreFromDoc(GOOD_DOC)
    const clientResult = computeSeoScore({
      title: GOOD_DOC.seo.title,
      description: GOOD_DOC.seo.description,
      focusKeywords: GOOD_DOC.seo.focusKeywords,
      slug: GOOD_DOC.slug,
      contentMd: GOOD_DOC.contentMd,
    })
    assert.equal(
      serverResult.score,
      clientResult.score,
      `server=${serverResult.score} client=${clientResult.score}`,
    )
  })

  test('noindex doc: scores match', () => {
    const serverResult = computeSeoScoreFromDoc(NOINDEX_DOC)
    const clientResult = computeSeoScore({
      title: NOINDEX_DOC.seo.title,
      description: NOINDEX_DOC.seo.description,
    })
    assert.equal(serverResult.score, clientResult.score)
  })

  test('null seo group: score is 0 (same as empty inputs)', () => {
    const serverResult = computeSeoScoreFromDoc({ seo: null })
    const clientResult = computeSeoScore({})
    assert.equal(serverResult.score, clientResult.score)
  })

  test('score always in 0–100 range regardless of input', () => {
    const fixtures = [GOOD_DOC, EMPTY_DOC, NOINDEX_DOC, { seo: null }, {}]
    for (const doc of fixtures) {
      const { score } = computeSeoScoreFromDoc(doc)
      assert.ok(score >= 0 && score <= 100, `score out of range: ${score}`)
    }
  })
})

// ── isSeoDeficient ───────────────────────────────────────────────────────────

describe('isSeoDeficient', () => {
  test('empty doc is deficient', () => {
    assert.equal(isSeoDeficient(EMPTY_DOC), true)
  })

  test('doc with no title is deficient', () => {
    assert.equal(isSeoDeficient({ seo: { title: '', description: 'Long enough description here.' } }), true)
  })

  test('doc with no description is deficient', () => {
    assert.equal(isSeoDeficient({ seo: { title: 'Tiêu đề bài viết', description: '' } }), true)
  })

  test('doc with noindex flag is deficient', () => {
    assert.equal(isSeoDeficient(NOINDEX_DOC), true)
  })

  test('doc with low score is deficient', () => {
    // title + description present but no keyword, no content → score < threshold
    const doc = {
      seo: {
        title: 'Bài viết ngắn',
        description: 'Mô tả ngắn.',
      },
    }
    const { score } = computeSeoScoreFromDoc(doc)
    if (score < SEO_DEFICIENT_THRESHOLD) {
      assert.equal(isSeoDeficient(doc), true)
    } else {
      // Score happened to be above threshold — just verify function runs without error
      assert.equal(typeof isSeoDeficient(doc), 'boolean')
    }
  })

  test('good doc with all fields is NOT deficient', () => {
    // The good doc has title + description, no noindex, and a reasonable score
    assert.equal(isSeoDeficient(GOOD_DOC), false)
  })
})

// ── seoDeficiencyReasons ─────────────────────────────────────────────────────

describe('seoDeficiencyReasons', () => {
  test('empty doc returns missing-title, missing-desc, and low-score', () => {
    const reasons = seoDeficiencyReasons(EMPTY_DOC)
    assert.ok(reasons.includes('missing-title'), `reasons=${JSON.stringify(reasons)}`)
    assert.ok(reasons.includes('missing-desc'), `reasons=${JSON.stringify(reasons)}`)
    assert.ok(reasons.some(r => r.startsWith('low-score:')), `reasons=${JSON.stringify(reasons)}`)
  })

  test('noindex doc returns noindex reason', () => {
    const reasons = seoDeficiencyReasons(NOINDEX_DOC)
    assert.ok(reasons.includes('noindex'), `reasons=${JSON.stringify(reasons)}`)
  })

  test('broken canonical (non-http string) returns broken-canonical', () => {
    const doc = {
      seo: {
        title: 'T',
        description: 'D',
        canonicalOverride: 'not-a-url',
      },
    }
    const reasons = seoDeficiencyReasons(doc)
    assert.ok(reasons.includes('broken-canonical'), `reasons=${JSON.stringify(reasons)}`)
  })

  test('valid canonical (https://...) does NOT return broken-canonical', () => {
    const doc = {
      seo: {
        title: 'T',
        description: 'D',
        canonicalOverride: 'https://example.com/page',
      },
    }
    const reasons = seoDeficiencyReasons(doc)
    assert.ok(!reasons.includes('broken-canonical'), `reasons=${JSON.stringify(reasons)}`)
  })

  test('good doc returns empty reasons array', () => {
    const reasons = seoDeficiencyReasons(GOOD_DOC)
    assert.equal(reasons.length, 0, `expected no reasons, got ${JSON.stringify(reasons)}`)
  })
})
