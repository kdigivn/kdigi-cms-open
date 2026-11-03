/**
 * beforeChange hook — auto-fills `excerpt` from `contentMd` when the editor leaves it
 * blank, mirroring how WordPress derives an excerpt from post content.
 *
 * Derivation: markdown → plain text → collapse whitespace → first 160 chars, stored
 * as <p>-wrapped HTML to match the WP-imported excerpt convention (HTML, not plain text).
 *
 * Never overwrites an excerpt the editor already typed. Both `excerpt` and `contentMd`
 * are localized, so the hook handles both shapes the Payload data layer produces:
 *   - single-locale save  → field value is a string
 *   - locale="all" save   → field value is a { vi, en, ... } record (fill per locale)
 *
 * No-ops on partial updates that don't include contentMd.
 */
import type { CollectionBeforeChangeHook } from 'payload'
import { markdownToPlainText } from '../lib/vietnamese-text'

const EXCERPT_MAX_CHARS = 160

function deriveExcerpt(markdown: unknown): string | undefined {
  if (typeof markdown !== 'string' || !markdown.trim()) return undefined
  const plain = markdownToPlainText(markdown).replace(/\s+/g, ' ').trim()
  return plain ? `<p>${plain.slice(0, EXCERPT_MAX_CHARS)}</p>` : undefined
}

const isFilled = (v: unknown): boolean => typeof v === 'string' && v.trim().length > 0

export const autoFillExcerpt: CollectionBeforeChangeHook = ({ data }) => {
  if (!data) return data
  const md = data.contentMd
  const excerpt = data.excerpt

  // locale="all" save: contentMd is a per-locale record → fill each empty locale.
  if (md && typeof md === 'object' && !Array.isArray(md)) {
    const filled = (excerpt && typeof excerpt === 'object' && !Array.isArray(excerpt)
      ? { ...(excerpt as Record<string, unknown>) }
      : {}) as Record<string, unknown>
    for (const [locale, value] of Object.entries(md as Record<string, unknown>)) {
      if (isFilled(filled[locale])) continue
      const derived = deriveExcerpt(value)
      if (derived) filled[locale] = derived
    }
    return { ...data, excerpt: filled }
  }

  // single-locale save: contentMd is a string.
  if (isFilled(excerpt)) return data
  const derived = deriveExcerpt(md)
  return derived ? { ...data, excerpt: derived } : data
}
