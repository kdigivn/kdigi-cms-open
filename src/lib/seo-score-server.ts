/**
 * Server-safe SEO scoring helpers.
 *
 * Single source of truth: delegates to computeSeoScore from seo-score.ts.
 * No browser APIs — safe to call from RSC, endpoints, and server hooks.
 *
 * The "server score" intentionally uses the SAME implementation as the
 * client SeoAnalysisField so editors always see the number that matches
 * what the audit widget and sort column report.
 */
import { computeSeoScore, type SeoInputs, type SeoScoreResult } from './seo-score'

export { computeSeoScore, type SeoInputs, type SeoScoreResult }

/**
 * A doc-level shape common to posts, pages, products, landings, and taxonomies.
 * Only the fields relevant to scoring are required; extras are ignored.
 */
export interface SeoableDoc {
  seo?: {
    title?: string | null
    description?: string | null
    focusKeywords?: string[] | null
    robots?: string[] | null
    canonicalOverride?: string | null
  } | null
  /** slug field (direct or nested) */
  slug?: string | null
  /** Lexical/MDX content rendered to plain text for density/length checks */
  contentMd?: string | null
  contentLexicalText?: string | null
}

/**
 * Extract SeoInputs from a Payload doc and compute its score.
 * Returns score 0 when the doc has no seo group at all.
 */
export function computeSeoScoreFromDoc(doc: SeoableDoc): SeoScoreResult {
  const seo = doc.seo ?? {}
  const inputs: SeoInputs = {
    title: seo.title ?? '',
    description: seo.description ?? '',
    focusKeywords: seo.focusKeywords ?? [],
    slug: doc.slug ?? '',
    contentMd: doc.contentMd ?? '',
    contentLexicalText: doc.contentLexicalText ?? '',
  }
  return computeSeoScore(inputs)
}

/**
 * Returns true when a doc is "SEO-deficient" — used by the audit endpoint
 * and audit widget to identify docs that need attention.
 *
 * A doc is deficient when ANY of these are true:
 *  - seo.title is blank
 *  - seo.description is blank
 *  - seo.robots includes 'noindex'
 *  - score < SEO_DEFICIENT_THRESHOLD (50)
 */
export const SEO_DEFICIENT_THRESHOLD = 50

export function isSeoDeficient(doc: SeoableDoc): boolean {
  const seo = doc.seo ?? {}
  if (!seo.title?.trim()) return true
  if (!seo.description?.trim()) return true
  if (seo.robots?.includes('noindex')) return true
  const { score } = computeSeoScoreFromDoc(doc)
  return score < SEO_DEFICIENT_THRESHOLD
}

/**
 * List of reasons a doc is deficient (used in audit widget detail rows).
 */
export function seoDeficiencyReasons(doc: SeoableDoc): string[] {
  const seo = doc.seo ?? {}
  const reasons: string[] = []
  if (!seo.title?.trim()) reasons.push('missing-title')
  if (!seo.description?.trim()) reasons.push('missing-desc')
  if (seo.robots?.includes('noindex')) reasons.push('noindex')
  if (seo.canonicalOverride !== null && seo.canonicalOverride !== undefined && seo.canonicalOverride !== '' && !seo.canonicalOverride.startsWith('http')) {
    reasons.push('broken-canonical')
  }
  const { score } = computeSeoScoreFromDoc(doc)
  if (score < SEO_DEFICIENT_THRESHOLD) reasons.push(`low-score:${score}`)
  return reasons
}
