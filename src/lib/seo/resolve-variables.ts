/**
 * Pure `%variable%` resolver for SEO title/description templates (Rank Math parity).
 *
 * Substitutes a fixed set of variables from a context object, drops unknown
 * variables, and cleans up the artifacts empty values leave behind (doubled or
 * dangling separators, repeated whitespace). No I/O and no dynamic clock vars —
 * every value is supplied by the caller so the result is deterministic at save-time.
 *
 * Supported: %title% %sitename% %sep% %excerpt% %category% %focuskw%
 *            %pt_single% %pt_plural% %date% %modified% %term%
 *            %currentyear% %price%
 * %term% resolves to the taxonomy term name (same as %title% for non-taxonomy docs).
 * %currentyear% is supplied by the caller (current calendar year string, browser-safe).
 * %price% resolves to the document price value (e.g. from doc.price).
 */

export interface SeoVarContext {
  title?: string
  siteName?: string
  /** Separator glyph, also the value of %sep%. Defaults to '|'. */
  sep?: string
  excerpt?: string
  category?: string
  focusKw?: string
  ptSingle?: string
  ptPlural?: string
  date?: string
  modified?: string
  /** Taxonomy term name — resolved from the `name` field of taxonomy docs. */
  term?: string
  /**
   * Current calendar year string — caller-supplied so this module stays browser-safe.
   * Pass `String(new Date().getFullYear())` from the hook or component.
   */
  currentYear?: string
  /**
   * Document price value — resolved from the `price` field (if any) on the doc.
   * Stripped when blank (unknown var cleanup applies).
   */
  price?: string
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Resolve a template string against the context, returning a cleaned final string. */
export function resolveSeoTemplate(template: string, ctx: SeoVarContext): string {
  if (!template) return ''
  const sep = ctx.sep ?? '|'

  const map: Record<string, string> = {
    title: ctx.title ?? '',
    sitename: ctx.siteName ?? '',
    sep,
    excerpt: ctx.excerpt ?? '',
    category: ctx.category ?? '',
    focuskw: ctx.focusKw ?? '',
    pt_single: ctx.ptSingle ?? '',
    pt_plural: ctx.ptPlural ?? '',
    date: ctx.date ?? '',
    modified: ctx.modified ?? '',
    // %term% = taxonomy term name; for non-taxonomy docs this is '' (stripped like an unknown var).
    term: ctx.term ?? '',
    // %currentyear% — supplied by caller; absent means unknown var, stripped.
    currentyear: ctx.currentYear ?? '',
    // %price% — from doc.price; absent/blank is stripped like unknown var.
    price: ctx.price ?? '',
  }

  // Substitute known vars; unknown %...% → '' (stripped).
  let out = template.replace(/%([a-z_]+)%/gi, (_m, name: string) =>
    Object.prototype.hasOwnProperty.call(map, name.toLowerCase())
      ? map[name.toLowerCase()]
      : '',
  )

  out = out.replace(/\s+/g, ' ').trim()

  // Clean up separator artifacts left by empty values.
  const s = escapeRegExp(sep)
  // Collapse runs of separators (e.g. "| |" → "|") created by an empty middle var.
  out = out.replace(new RegExp(`(?:${s}\\s*){2,}`, 'g'), `${sep} `)
  // Strip leading / trailing separators.
  out = out
    .replace(new RegExp(`^(?:\\s*${s}\\s*)+`), '')
    .replace(new RegExp(`(?:\\s*${s}\\s*)+$`), '')

  return out.replace(/\s+/g, ' ').trim()
}
