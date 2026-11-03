import type { CollectionBeforeChangeHook } from 'payload'

/**
 * Posts.beforeChange hook: `wordCount` from the `contentMd` (Markdown) body — the field staff
 * actually edit. `content` is the hidden Lexical mirror (an object, never a string), so
 * counting it always produced 0.
 *
 * SP1a-1 (versions): this used to be an afterChange hook that persisted the count with a
 * second `payload.update()`. With versions enabled every update writes a version row, so that
 * self-update doubled the history per save. The count is a pure function of the Markdown, so it
 * is computed here and saved by the SAME write — one version per save, no recursion flag, no
 * `updatedAt` drift for the admin editor.
 *
 * Word counting heuristic for Vietnamese content:
 *   - Strip HTML tags + markdown syntax
 *   - Count whitespace-separated tokens
 *   - Vietnamese often has no whitespace between syllables within a word;
 *     this heuristic counts tokens which approximates word count for VN content.
 *
 * Tied to migration `20260702_tp_posts_extend.ts` which adds the `word_count` column.
 */

function stripHtmlAndMarkdown(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')          // strip HTML tags
    .replace(/[*_`#>]/g, ' ')         // strip markdown formatting chars
    .replace(/```[\s\S]*?```/g, ' ')  // strip code blocks
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // markdown links → text only
    .replace(/\s+/g, ' ')              // collapse whitespace
    .trim()
}

function countWords(text: string): number {
  if (!text || text.length === 0) return 0
  const tokens = text.split(/\s+/).filter(Boolean)
  return tokens.length
}

/**
 * Compute wordCount from content field. Pure function exported for unit testing.
 */
export function computeWordCount(content: unknown): number {
  if (typeof content !== 'string') return 0
  return countWords(stripHtmlAndMarkdown(content))
}

export const postsWordCount: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  if (!data) return data
  // A partial update (e.g. a status toggle) carries no `contentMd`: count the stored body so
  // the value never drops to 0 on a save that did not touch the text. `contentMd` is
  // localized; both sides are the request-locale string here.
  const content =
    (data as { contentMd?: unknown }).contentMd !== undefined
      ? (data as { contentMd?: unknown }).contentMd
      : (originalDoc as { contentMd?: unknown } | undefined)?.contentMd
  ;(data as { wordCount?: number }).wordCount = computeWordCount(content)
  return data
}
