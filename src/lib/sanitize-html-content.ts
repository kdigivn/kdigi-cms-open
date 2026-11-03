/**
 * HTML sanitizer for user-supplied rich HTML fields.
 * Guards against stored-XSS when content is rendered via dangerouslySetInnerHTML downstream.
 * Strips scripts, event handlers (onclick, onerror, etc.), and dangerous attributes.
 */
import sanitizeHtml from 'sanitize-html'

const SAFE_TAGS: string[] = [
  'p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'a', 'h2', 'h3', 'h4',
  'span', 'div', 'table', 'tr', 'td', 'th', 'tbody', 'thead', 'img',
]

const SAFE_ATTRS: sanitizeHtml.IOptions['allowedAttributes'] = {
  a: ['href', 'target', 'rel'],
  img: ['src', 'alt', 'width', 'height'],
  '*': ['class', 'style'],
}

export function sanitizeHtmlContent(dirty: string): string {
  return sanitizeHtml(dirty, {
    allowedTags: SAFE_TAGS,
    allowedAttributes: SAFE_ATTRS,
  })
}
