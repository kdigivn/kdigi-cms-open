/**
 * RankMath-style SEO scoring — pure, client-safe, no network calls.
 * Returns a 0–100 score plus a checklist of rules with traffic-light status.
 *
 * Thresholds calibrated to RankMath's documented rules (2026-06):
 *   - Keyword density: 1–1.5% good (RankMath Additional group, FACT)
 *   - Content length: VN syllable tiers mapped from RankMath EN word tiers (ESTIMATE, ×0.7 factor)
 *   - "First paragraph": first 10% of content (RankMath documented rule, FACT)
 *   - Title: ≤60 chars aligns to Google's 60-char safe limit / RankMath 575px preview
 *   - Description: ≤160 chars aligns to Google's 920px desktop limit (~158 chars)
 *   - URL length: ≤75 chars (RankMath Additional group, FACT)
 *   - Internal link: ≥1 internal link present (RankMath Additional group, FACT)
 */
import { countSyllables, keywordMatches, markdownToPlainText, stripDiacritics } from './vietnamese-text'

export type RuleStatus = 'good' | 'warn' | 'fail'

export interface SeoCheck {
  id: string
  label: string
  status: RuleStatus
  weight: number
}

export interface SeoScoreResult {
  score: number
  checks: SeoCheck[]
}

export interface SeoInputs {
  title?: string
  description?: string
  slug?: string
  focusKeywords?: string[]
  contentMd?: string
  contentLexicalText?: string
}

function good(id: string, label: string, weight: number): SeoCheck {
  return { id, label, status: 'good', weight }
}
function warn(id: string, label: string, weight: number): SeoCheck {
  return { id, label, status: 'warn', weight }
}
function fail(id: string, label: string, weight: number): SeoCheck {
  return { id, label, status: 'fail', weight }
}

/**
 * Detect internal markdown links: [text](relative-url) or [text](/path).
 * A link is considered internal if its href does NOT start with http:// or https://.
 */
function hasInternalLink(contentMd: string): boolean {
  const linkPattern = /\[([^\]]*)\]\(([^)]+)\)/g
  let match: RegExpExecArray | null
  while ((match = linkPattern.exec(contentMd)) !== null) {
    const href = match[2]
    if (href && !href.startsWith('http://') && !href.startsWith('https://')) {
      return true
    }
  }
  return false
}

export function computeSeoScore(inputs: SeoInputs): SeoScoreResult {
  const { title = '', description = '', slug = '', focusKeywords = [], contentMd = '', contentLexicalText = '' } = inputs
  const kw = focusKeywords[0] ?? ''
  const contentText = markdownToPlainText(contentMd) || contentLexicalText
  const titleChars = title.length
  const descChars = description.length

  const checks: SeoCheck[] = []

  // ── Focus keyword checks (weight 40 total) ──────────────────────────────
  if (!kw) {
    checks.push(fail('kw-set', 'Focus keyword chưa được đặt', 8))
  } else {
    checks.push(good('kw-set', 'Focus keyword đã đặt', 8))

    const kwInTitle = keywordMatches(title, kw) > 0
    checks.push(kwInTitle
      ? good('kw-title', 'Keyword có trong tiêu đề', 10)
      : fail('kw-title', 'Keyword chưa có trong tiêu đề', 10))

    const kwInDesc = keywordMatches(description, kw) > 0
    checks.push(kwInDesc
      ? good('kw-desc', 'Keyword có trong mô tả', 8)
      : fail('kw-desc', 'Keyword chưa có trong mô tả', 8))

    const slugNorm = stripDiacritics(slug.toLowerCase())
    const kwNorm = stripDiacritics(kw.toLowerCase())
    const kwInSlug = slugNorm.includes(kwNorm.replace(/\s+/g, '-')) || slugNorm.includes(kwNorm.replace(/\s+/g, ''))
    checks.push(kwInSlug
      ? good('kw-slug', 'Keyword có trong đường dẫn (slug)', 6)
      : warn('kw-slug', 'Keyword chưa có trong slug', 6))

    if (contentText) {
      // Keyword in first 10% of content (RankMath rule: first 10%; min 200 chars for short content)
      // Previously: first 100 chars (too narrow for long articles)
      const firstTenPct = contentText.slice(0, Math.max(200, Math.floor(contentText.length * 0.1)))
      checks.push(keywordMatches(firstTenPct, kw) > 0
        ? good('kw-intro', 'Keyword xuất hiện ở phần mở đầu', 5)
        : warn('kw-intro', 'Keyword chưa xuất hiện ở phần mở đầu', 5))

      // Keyword density: 1–1.5% good (RankMath Additional group)
      // Previously: 0.5–2.5% good (range was too wide)
      // >2.5% → warn (keyword stuffing risk, same upper bound as before)
      // 0–1%  → warn (too low)
      // 0%    → fail (keyword absent)
      const totalSyl = countSyllables(contentText)
      const kwCount = keywordMatches(contentText, kw)
      const density = totalSyl > 0 ? (kwCount / totalSyl) * 100 : 0
      if (density >= 1 && density <= 1.5) {
        checks.push(good('kw-density', `Mật độ keyword phù hợp (${density.toFixed(1)}%)`, 3))
      } else if (density === 0) {
        checks.push(fail('kw-density', 'Keyword chưa xuất hiện trong nội dung', 3))
      } else if (density > 2.5) {
        checks.push(warn('kw-density', `Mật độ keyword ${density.toFixed(1)}% quá cao (tốt: 1–1.5%)`, 3))
      } else {
        // density > 0 && density < 1, or density > 1.5 && density <= 2.5
        checks.push(warn('kw-density', `Mật độ keyword ${density.toFixed(1)}% (tốt: 1–1.5%)`, 3))
      }
    }
  }

  // ── Title length (weight 15) ─────────────────────────────────────────────
  // Upper bound: 60 chars (aligned to Google's 60-char safe target / RankMath 575px preview)
  // Previously: 65 chars upper bound
  if (titleChars === 0) {
    checks.push(fail('title-len', 'Tiêu đề chưa được đặt', 15))
  } else if (titleChars >= 40 && titleChars <= 60) {
    checks.push(good('title-len', `Độ dài tiêu đề phù hợp (${titleChars} ký tự)`, 15))
  } else if (titleChars < 40) {
    checks.push(warn('title-len', `Tiêu đề quá ngắn (${titleChars}/40–60 ký tự)`, 15))
  } else {
    checks.push(warn('title-len', `Tiêu đề quá dài (${titleChars}/40–60 ký tự)`, 15))
  }

  // ── Description length (weight 15) ───────────────────────────────────────
  // Upper bound: 160 chars (aligned to Google's 920px desktop limit ~158 chars)
  // Previously: 165 chars upper bound
  if (descChars === 0) {
    checks.push(fail('desc-len', 'Meta description chưa được đặt', 15))
  } else if (descChars >= 100 && descChars <= 160) {
    checks.push(good('desc-len', `Độ dài description phù hợp (${descChars} ký tự)`, 15))
  } else if (descChars < 100) {
    checks.push(warn('desc-len', `Description quá ngắn (${descChars}/100–160 ký tự)`, 15))
  } else {
    checks.push(warn('desc-len', `Description quá dài (${descChars}/100–160 ký tự)`, 15))
  }

  // ── Content quality ──────────────────────────────────────────────────────
  if (contentText) {
    const syllableCount = countSyllables(contentText)

    // Minimum content length (weight 10)
    // VN syllable tiers mapped from RankMath EN word tiers (÷0.7 factor, ESTIMATE):
    //   <420 syl  → fail  (< 600 EN words, RankMath 0% tier)
    //   420–700   → warn  (600–1000 EN words, RankMath 20% tier)
    //   ≥700      → good  (≥1000 EN words, RankMath 40%+ tier)
    // Previously: warn <400, good ≥800 (800 syl ≈ 1100 EN words, too lenient)
    if (syllableCount >= 700) {
      checks.push(good('content-len', `Nội dung đủ dài (${syllableCount} âm tiết)`, 10))
    } else if (syllableCount >= 420) {
      checks.push(warn('content-len', `Nội dung hơi ngắn (${syllableCount}/700 âm tiết)`, 10))
    } else {
      checks.push(fail('content-len', `Nội dung quá ngắn (${syllableCount}/420 âm tiết)`, 10))
    }

    // Ideal content length (weight 8) — additional credit for longer content
    // ≥1400 syl → good  (≥2000 EN words, RankMath 70% tier)
    // 700–1400  → warn  (1000–2000 EN words)
    // <700      → fail  (below meaningful threshold)
    if (syllableCount >= 1400) {
      checks.push(good('content-len-ideal', `Nội dung dài lý tưởng (${syllableCount} âm tiết)`, 8))
    } else if (syllableCount >= 700) {
      checks.push(warn('content-len-ideal', `Nội dung khá tốt, hướng tới ${1400} âm tiết để đạt điểm cao`, 8))
    } else {
      checks.push(fail('content-len-ideal', `Nội dung cần dài hơn (${syllableCount}/1400 âm tiết lý tưởng)`, 8))
    }

    // H2/H3 headings in markdown
    const hasSubheadings = /^#{2,3}\s/m.test(contentMd)
    checks.push(hasSubheadings
      ? good('headings', 'Có tiêu đề phụ (H2/H3)', 5)
      : warn('headings', 'Thiếu tiêu đề phụ H2/H3', 5))

    // Images with alt in markdown
    const hasImages = /!\[.+?\]/.test(contentMd)
    checks.push(hasImages
      ? good('img-alt', 'Ảnh có alt text', 5)
      : warn('img-alt', 'Không có ảnh hoặc thiếu alt text', 5))

    // Internal link check (RankMath Additional group)
    // A relative/internal link in markdown: href not starting with http(s)://
    checks.push(hasInternalLink(contentMd)
      ? good('internal-link', 'Có liên kết nội bộ trong nội dung', 4)
      : warn('internal-link', 'Thiếu liên kết nội bộ trong nội dung', 4))
  } else {
    // No content: fail all content checks
    checks.push(fail('content-len', 'Chưa có nội dung', 10))
    checks.push(fail('content-len-ideal', 'Chưa có nội dung', 8))
    checks.push(warn('headings', 'Thiếu tiêu đề phụ H2/H3', 5))
    checks.push(warn('img-alt', 'Không có ảnh hoặc thiếu alt text', 5))
    checks.push(warn('internal-link', 'Thiếu liên kết nội bộ trong nội dung', 4))
  }

  // ── URL length check (RankMath Additional group) ─────────────────────────
  // RankMath checks full URL ≤75 chars. We check the slug length as a proxy
  // since domain length is not available here. Slug > 75 chars is definitely too long.
  if (slug) {
    if (slug.length <= 75) {
      checks.push(good('url-len', `Slug URL có độ dài phù hợp (${slug.length} ký tự)`, 3))
    } else {
      checks.push(warn('url-len', `Slug URL quá dài (${slug.length} > 75 ký tự)`, 3))
    }
  }

  // ── Score calculation ────────────────────────────────────────────────────
  const totalWeight = checks.reduce((s, c) => s + c.weight, 0)
  const passedWeight = checks.filter(c => c.status === 'good').reduce((s, c) => s + c.weight, 0)
  const warnWeight = checks.filter(c => c.status === 'warn').reduce((s, c) => s + c.weight * 0.5, 0)
  const score = totalWeight > 0 ? Math.round(((passedWeight + warnWeight) / totalWeight) * 100) : 0

  return { score: Math.min(100, Math.max(0, score)), checks }
}
