/**
 * Unit tests for seo-score.ts — RankMath-calibrated thresholds
 * Runner: node --import tsx --test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeSeoScore } from './seo-score.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build content with approximately N space-separated syllables. */
function makeSyllables(n: number): string {
  return Array.from({ length: n }, (_, i) => `từ${i}`).join(' ')
}

// ── Baseline ─────────────────────────────────────────────────────────────────

test('empty inputs return low score', () => {
  const { score, checks } = computeSeoScore({})
  assert.ok(score < 30, `expected score < 30, got ${score}`)
  const failChecks = checks.filter(c => c.status === 'fail')
  assert.ok(failChecks.length > 0)
})

test('no focus keyword flags kw-set as fail', () => {
  const { checks } = computeSeoScore({ title: 'Du lịch Phú Quốc', description: 'Mô tả' })
  const kwCheck = checks.find(c => c.id === 'kw-set')
  assert.equal(kwCheck?.status, 'fail')
})

test('score 0–100 range always respected', () => {
  const cases = [
    {},
    { title: 'a', description: 'b', focusKeywords: ['x'] },
    {
      title: 'Du lịch Phú Quốc — hướng dẫn chi tiết nhất 2026',
      description: 'Khám phá Phú Quốc với hướng dẫn du lịch Phú Quốc đầy đủ nhất, từ ăn uống đến lưu trú và điểm tham quan.',
      slug: 'du-lich-phu-quoc',
      focusKeywords: ['Phú Quốc'],
      contentMd: `# Du lịch Phú Quốc\n\nPhú Quốc là điểm đến lý tưởng.\n\n## Cách đến\n\nBạn có thể đến Phú Quốc bằng máy bay hoặc tàu cao tốc từ Rạch Giá.\n\n## Lưu trú\n\n![khách sạn](https://ex.com/img.jpg)\n\nCó nhiều lựa chọn lưu trú tại Phú Quốc phù hợp với mọi ngân sách.`,
    },
  ]
  for (const inputs of cases) {
    const { score } = computeSeoScore(inputs)
    assert.ok(score >= 0 && score <= 100, `score out of range: ${score}`)
  }
})

// ── Keyword checks ────────────────────────────────────────────────────────────

test('focus keyword in title gives kw-title good', () => {
  const { checks } = computeSeoScore({
    title: 'Du lịch Phú Quốc hè này',
    description: 'Mô tả về Phú Quốc',
    focusKeywords: ['Phú Quốc'],
  })
  assert.equal(checks.find(c => c.id === 'kw-title')?.status, 'good')
})

test('keyword absent from title is fail', () => {
  const { checks } = computeSeoScore({
    title: 'Hướng dẫn du lịch biển',
    focusKeywords: ['Phú Quốc'],
  })
  assert.equal(checks.find(c => c.id === 'kw-title')?.status, 'fail')
})

// ── Title length — new upper bound 60 (was 65) ───────────────────────────────

test('title 40–60 chars is good', () => {
  // 48 chars — inside [40, 60]
  const title = 'Du lịch Phú Quốc 2026 — hướng dẫn chi tiết'
  assert.ok(title.length >= 40 && title.length <= 60, `title.length=${title.length}`)
  const { checks } = computeSeoScore({ title })
  assert.equal(checks.find(c => c.id === 'title-len')?.status, 'good')
})

test('title >60 chars warns (over new 60-char limit)', () => {
  const title = 'Du lịch Phú Quốc mùa hè 2026 — những điều bạn cần biết đầy đủ nhất'
  assert.ok(title.length > 60, `title.length=${title.length} should be > 60`)
  const { checks } = computeSeoScore({ title })
  assert.equal(checks.find(c => c.id === 'title-len')?.status, 'warn')
})

test('short title warns', () => {
  const { checks } = computeSeoScore({ title: 'Ngắn' })
  assert.equal(checks.find(c => c.id === 'title-len')?.status, 'warn')
})

// ── Description length — new upper bound 160 (was 165) ───────────────────────

test('description 100–160 chars is good', () => {
  const description = 'Phú Quốc là hòn đảo đẹp nhất Việt Nam với những bãi biển cát trắng, nước xanh trong và hệ sinh thái phong phú tuyệt vời.'
  assert.ok(description.length >= 100 && description.length <= 160, `desc.length=${description.length}`)
  const { checks } = computeSeoScore({ description })
  assert.equal(checks.find(c => c.id === 'desc-len')?.status, 'good')
})

test('description >160 chars warns (over new 160-char limit)', () => {
  const description = 'Phú Quốc là hòn đảo ngọc xinh đẹp nhất Việt Nam với những bãi biển cát trắng mịn, nước biển trong xanh ngắt và hệ sinh thái san hô cực kỳ phong phú vô cùng tuyệt vời và đáng khám phá.'
  assert.ok(description.length > 160, `desc.length=${description.length} should be > 160`)
  const { checks } = computeSeoScore({ description })
  assert.equal(checks.find(c => c.id === 'desc-len')?.status, 'warn')
})

test('short description warns', () => {
  const { checks } = computeSeoScore({ description: 'Quá ngắn.' })
  assert.equal(checks.find(c => c.id === 'desc-len')?.status, 'warn')
})

// ── Keyword density — new 1–1.5% good band (was 0.5–2.5%) ───────────────────

test('kw-density: 1–1.5% range is good', () => {
  // Build content where keyword appears at ~1.2% density
  // 100 syllables total → keyword (1 syllable) appears 1–2 times → 1–2%
  // Use 1 occurrence in 85 tokens → ~1.18%
  const base = makeSyllables(84)
  const contentMd = `Phú Quốc ${base}` // keyword as 1 of 85 syllable-tokens → 1/85 ≈ 1.18%
  const { checks } = computeSeoScore({
    focusKeywords: ['Phú Quốc'],
    contentMd,
  })
  const densityCheck = checks.find(c => c.id === 'kw-density')
  assert.equal(densityCheck?.status, 'good', `density check status: ${densityCheck?.status}, label: ${densityCheck?.label}`)
})

test('kw-density: 0.5% density (below 1%) is warn', () => {
  // 1 keyword occurrence in 200 syllables → 0.5%
  const base = makeSyllables(199)
  const contentMd = `Phú Quốc ${base}`
  const { checks } = computeSeoScore({
    focusKeywords: ['Phú Quốc'],
    contentMd,
  })
  const densityCheck = checks.find(c => c.id === 'kw-density')
  assert.equal(densityCheck?.status, 'warn', `density check status: ${densityCheck?.status}`)
})

test('kw-density: 0% (absent) is fail', () => {
  const contentMd = makeSyllables(100)
  const { checks } = computeSeoScore({
    focusKeywords: ['Phú Quốc'],
    contentMd,
  })
  const densityCheck = checks.find(c => c.id === 'kw-density')
  assert.equal(densityCheck?.status, 'fail')
})

test('kw-density: >2.5% is warn', () => {
  // 4 occurrences in 100 syllables → 4%
  const base = makeSyllables(96)
  const contentMd = `Phú Quốc Phú Quốc Phú Quốc Phú Quốc ${base}`
  const { checks } = computeSeoScore({
    focusKeywords: ['Phú Quốc'],
    contentMd,
  })
  const densityCheck = checks.find(c => c.id === 'kw-density')
  assert.equal(densityCheck?.status, 'warn', `expected warn for >2.5%, got: ${densityCheck?.status}`)
})

// ── kw-intro: first 10% of content (was first 100 chars) ────────────────────

test('kw-intro: keyword in first 10% of a long article is good', () => {
  // 1000-syllable article; keyword at position ~50 (well within first 10%)
  const prefix = makeSyllables(5) // 5 tokens before keyword
  const suffix = makeSyllables(990) // 990 tokens after
  // Plain text will be roughly: "từ0 từ1 từ2 từ3 từ4 Phú Quốc từ5 ..."
  // markdownToPlainText passes through plain text unchanged
  const contentMd = `${prefix} Phú Quốc ${suffix}`
  const { checks } = computeSeoScore({
    focusKeywords: ['Phú Quốc'],
    contentMd,
  })
  assert.equal(checks.find(c => c.id === 'kw-intro')?.status, 'good')
})

test('kw-intro: keyword only in last 50% of content is warn', () => {
  // 500 syllables; keyword appears only past the 50% mark
  const prefix = makeSyllables(450)
  const contentMd = `${prefix} Phú Quốc từ451 từ452 từ453`
  const { checks } = computeSeoScore({
    focusKeywords: ['Phú Quốc'],
    contentMd,
  })
  // First 10% = 50 syllables worth of chars; keyword is far past that
  assert.equal(checks.find(c => c.id === 'kw-intro')?.status, 'warn')
})

test('kw-intro: for short content (<200 chars) uses full min-200-char window', () => {
  // Very short content: keyword present in a 150-char string → should be good
  // because window = max(200, 10%) = 200, which covers the whole string
  const contentMd = 'Phú Quốc là điểm đến lý tưởng cho kỳ nghỉ hè của bạn và gia đình bạn.'
  const { checks } = computeSeoScore({
    focusKeywords: ['Phú Quốc'],
    contentMd,
  })
  assert.equal(checks.find(c => c.id === 'kw-intro')?.status, 'good')
})

// ── Content length — new VN syllable tiers ───────────────────────────────────
// Tiers (from RankMath EN word tiers × 0.7 VN factor, ESTIMATE):
//   <420 syl  → content-len: fail
//   420–699   → content-len: warn
//   ≥700      → content-len: good
//   700–1399  → content-len-ideal: warn
//   ≥1400     → content-len-ideal: good

test('content-len: <420 syllables is fail', () => {
  const contentMd = makeSyllables(300)
  const { checks } = computeSeoScore({ contentMd })
  assert.equal(checks.find(c => c.id === 'content-len')?.status, 'fail')
  assert.equal(checks.find(c => c.id === 'content-len-ideal')?.status, 'fail')
})

test('content-len: 420–699 syllables is warn', () => {
  const contentMd = makeSyllables(500)
  const { checks } = computeSeoScore({ contentMd })
  assert.equal(checks.find(c => c.id === 'content-len')?.status, 'warn')
})

test('content-len: ≥700 syllables is good', () => {
  const contentMd = makeSyllables(700)
  const { checks } = computeSeoScore({ contentMd })
  assert.equal(checks.find(c => c.id === 'content-len')?.status, 'good')
})

test('content-len-ideal: 700–1399 syllables is warn', () => {
  const contentMd = makeSyllables(900)
  const { checks } = computeSeoScore({ contentMd })
  assert.equal(checks.find(c => c.id === 'content-len-ideal')?.status, 'warn')
})

test('content-len-ideal: ≥1400 syllables is good', () => {
  const contentMd = makeSyllables(1400)
  const { checks } = computeSeoScore({ contentMd })
  assert.equal(checks.find(c => c.id === 'content-len-ideal')?.status, 'good')
})

// ── URL length check (new) ────────────────────────────────────────────────────

test('url-len: slug ≤75 chars is good', () => {
  const slug = 'du-lich-phu-quoc-2026-huong-dan-chi-tiet'
  assert.ok(slug.length <= 75, `slug.length=${slug.length}`)
  const { checks } = computeSeoScore({ slug })
  assert.equal(checks.find(c => c.id === 'url-len')?.status, 'good')
})

test('url-len: slug >75 chars is warn', () => {
  const slug = 'du-lich-phu-quoc-2026-huong-dan-chi-tiet-day-du-nhat-cho-gia-dinh-va-tre-em-va-nguoi-lon'
  assert.ok(slug.length > 75, `slug.length=${slug.length}`)
  const { checks } = computeSeoScore({ slug })
  assert.equal(checks.find(c => c.id === 'url-len')?.status, 'warn')
})

test('url-len check absent when no slug provided', () => {
  const { checks } = computeSeoScore({ slug: '' })
  assert.equal(checks.find(c => c.id === 'url-len'), undefined)
})

// ── Internal link check (new) ────────────────────────────────────────────────

test('internal-link: relative link in content is good', () => {
  const contentMd = `Nội dung có [liên kết nội bộ](/chuyen-di/phu-quoc) để tham khảo thêm.\n\n${makeSyllables(50)}`
  const { checks } = computeSeoScore({ contentMd })
  assert.equal(checks.find(c => c.id === 'internal-link')?.status, 'good')
})

test('internal-link: only external links is warn', () => {
  const contentMd = `Nội dung chỉ có [liên kết ngoài](https://example.com) mà thôi.\n\n${makeSyllables(50)}`
  const { checks } = computeSeoScore({ contentMd })
  assert.equal(checks.find(c => c.id === 'internal-link')?.status, 'warn')
})

test('internal-link: no links at all is warn', () => {
  const contentMd = makeSyllables(100)
  const { checks } = computeSeoScore({ contentMd })
  assert.equal(checks.find(c => c.id === 'internal-link')?.status, 'warn')
})

test('internal-link: anchor-only link (#section) counts as internal', () => {
  const contentMd = `Xem [phần này](#muc-luc) để biết thêm.\n\n${makeSyllables(50)}`
  const { checks } = computeSeoScore({ contentMd })
  assert.equal(checks.find(c => c.id === 'internal-link')?.status, 'good')
})

// ── Full integration — high score for well-optimised content ─────────────────

test('full good inputs yield high score (≥60)', () => {
  // 1400+ syllables to hit content-len-ideal good tier
  const longContent = makeSyllables(700)
  const { score } = computeSeoScore({
    title: 'Du lịch Phú Quốc — hướng dẫn chi tiết',
    description: 'Khám phá Phú Quốc với hướng dẫn du lịch Phú Quốc đầy đủ nhất, từ ăn uống đến lưu trú và điểm tham quan đẹp.',
    slug: 'du-lich-phu-quoc',
    focusKeywords: ['Phú Quốc'],
    contentMd: [
      '# Du lịch Phú Quốc',
      '',
      'Phú Quốc là điểm đến lý tưởng cho kỳ nghỉ hè.',
      '',
      '## Cách đến Phú Quốc',
      '',
      'Bạn có thể đến Phú Quốc bằng máy bay. Xem thêm tại [trang chủ](/home).',
      '',
      '## Lưu trú',
      '',
      '![khách sạn Phú Quốc](https://ex.com/img.jpg)',
      '',
      longContent,
    ].join('\n'),
  })
  assert.ok(score >= 60, `expected score >= 60, got ${score}`)
})
