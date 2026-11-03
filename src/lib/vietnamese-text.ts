/**
 * Vietnamese text utilities for SEO scoring.
 * Syllable counting: Vietnamese words are largely monosyllabic, so
 * whitespace-split is a reasonable approximation of syllable count.
 */

/** Count syllables by splitting on whitespace (approx for Vietnamese). */
export function countSyllables(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/** Normalize diacritics for slug/URL comparison. */
export function stripDiacritics(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
}

/**
 * Count non-overlapping keyword occurrences in text.
 * Case-insensitive; diacritics-aware (tries both exact and normalized match).
 */
export function keywordMatches(text: string, keyword: string): number {
  if (!text || !keyword) return 0
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const exactMatches = (text.match(new RegExp(escaped, 'gi')) ?? []).length
  if (exactMatches > 0) return exactMatches
  // Fallback: normalized comparison
  const normText = stripDiacritics(text.toLowerCase())
  const normKeyword = stripDiacritics(keyword.toLowerCase())
  const normEscaped = normKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return (normText.match(new RegExp(normEscaped, 'g')) ?? []).length
}

/** Extract plain text from a markdown string (strip markdown syntax). */
export function markdownToPlainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/[*_~]+/g, '')
    .replace(/>\s?/g, '')
    .replace(/[-*+]\s+/g, '')
    .replace(/\d+\.\s+/g, '')
    .trim()
}
