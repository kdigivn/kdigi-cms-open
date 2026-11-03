/**
 * Converts CommonMark/GFM markdown to sanitized HTML.
 * Pure function — safe to import in both server and client contexts.
 * Used by markdownHtmlField afterRead hook to serve HTML to REST consumers.
 */
import MarkdownIt from 'markdown-it'
import sanitizeHtml from 'sanitize-html'

// html: true — required because Milkdown/remark's GFM table serializer
// emits literal `<br />` for hard breaks inside table cells (a table row
// can't contain a real newline). sanitizeHtml() below is the actual
// security boundary (allowlisted tags/attrs), so allowing markdown-it to
// parse raw HTML here is safe — anything not in ALLOWED_TAGS is stripped.
const md = new MarkdownIt({
  html: true,
  breaks: false,
  linkify: true,
})

// Allow all standard content tags; strip script/style/event handlers.
const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr',
  'strong', 'em', 'del', 's', 'code', 'pre', 'blockquote',
  'ul', 'ol', 'li',
  'a',
  'img',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'div', 'span',
  'figure', 'figcaption',
]

const ALLOWED_ATTRS: sanitizeHtml.IOptions['allowedAttributes'] = {
  a: ['href', 'title', 'target', 'rel'],
  img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
  th: ['align'],
  td: ['align'],
  code: ['class'],
  pre: ['class'],
  '*': ['id', 'class'],
}

export function markdownToHtml(markdown: string): string {
  if (!markdown) return ''
  const raw = md.render(markdown)
  return sanitizeHtml(raw, { allowedTags: ALLOWED_TAGS, allowedAttributes: ALLOWED_ATTRS })
}
