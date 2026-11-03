/**
 * Converts WordPress rendered HTML (`content.rendered` / GraphQL `content`)
 * to GFM markdown for the CMS `contentMd` field.
 *
 * Why in-repo instead of a library: the runbook mandates archive-only sourcing
 * with tables/images/links preserved; `markdownToLexical` is lossy and the WP
 * output here is regular classic/Gutenberg/Elementor rendered HTML — a small
 * block walker covers it. Tables delegate to wp-html-table-to-gfm.
 *
 * Coverage: h1–h6, p, ul/ol (nested), table, figure/img, a, strong/em, br,
 * hr, blockquote, pre/code, iframe (kept as raw HTML — markdown-it renders it
 * when html is enabled). Unknown block wrappers (div/section/article/span —
 * Gutenberg `wp-block-*` and Elementor `elementor-*` containers) unwrap and
 * recurse. HTML comments (incl. `<!-- wp:block -->` delimiters) and
 * script/style blocks are dropped; unresolved `[shortcode]` tags are removed
 * from text (their inner content is kept).
 */
import { wpTableHtmlToGfm, wpGalleryHtmlToGfm } from './wp-html-table-to-gfm'
import { inlineToMarkdown } from './wp-inline-html-to-gfm'

// Named Latin-1/typographic entities WP occasionally emits alongside UTF-8.
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ', quot: '"', apos: "'", lt: '<', gt: '>',
  ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  agrave: 'à', aacute: 'á', acirc: 'â', atilde: 'ã', egrave: 'è', eacute: 'é',
  ecirc: 'ê', igrave: 'ì', iacute: 'í', ograve: 'ò', oacute: 'ó', ocirc: 'ô',
  otilde: 'õ', ugrave: 'ù', uacute: 'ú', yacute: 'ý', copy: '©', reg: '®', deg: '°',
}

const decodeEntities = (s: string): string =>
  s
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? m)
    .replace(/&amp;/gi, '&')

// Unresolved WP shortcodes (`[gallery ids="1,2"]`, `[caption …]`, `[/caption]`) show up in
// rendered HTML when their plugin is gone. Only text between tags is touched (never
// attributes, `<pre>` or `<code>`); the tag itself is removed and any wrapped content is kept.
const SHORTCODE_RE = /\[\/?[a-z][a-z0-9_-]*(?:\s[^\]<>]*)?\]/gi

export function stripShortcodes(html: string): string {
  return html
    .split(/(<pre\b[\s\S]*?<\/pre>|<code\b[\s\S]*?<\/code>)/i)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(/(^|>)([^<]+)/g, (_m, pre: string, text: string) => pre + text.replace(SHORTCODE_RE, '')),
    )
    .join('')
}

// ── Block tokenizer ───────────────────────────────────────────────────────────

interface Block {
  tag: string
  attrs: string
  inner: string
}

const BLOCK_TAGS = [
  'table', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'blockquote',
  'pre', 'figure', 'div', 'section', 'article', 'iframe',
] as const

const VOID_BLOCK_RE = /^<\s*(hr|img)\b([^>]*?)\/?>/i

/**
 * Find the matching close tag for the open tag at `start` (which must point at
 * '<tag'), honouring same-tag nesting. Returns the end index (after close tag)
 * and inner content, or null when unbalanced.
 */
function matchTag(html: string, start: number, tag: string): { end: number; attrs: string; inner: string } | null {
  const openRe = new RegExp(`<\\s*${tag}\\b([^>]*)>`, 'iy')
  openRe.lastIndex = start
  const open = openRe.exec(html)
  if (!open) return null
  const contentStart = openRe.lastIndex
  const scanRe = new RegExp(`<\\s*(/?)${tag}\\b[^>]*>`, 'gi')
  scanRe.lastIndex = contentStart
  let depth = 1
  let m: RegExpExecArray | null
  while ((m = scanRe.exec(html))) {
    depth += m[1] ? -1 : 1
    if (depth === 0) {
      return { end: scanRe.lastIndex, attrs: open[1] ?? '', inner: html.slice(contentStart, m.index) }
    }
  }
  return null
}

/** Split an HTML fragment into a flat list of top-level blocks + loose text. */
function tokenizeBlocks(html: string): Array<Block | { text: string }> {
  const out: Array<Block | { text: string }> = []
  let i = 0
  let textStart = 0

  const flushText = (upto: number) => {
    const t = html.slice(textStart, upto)
    if (t.trim()) out.push({ text: t })
  }

  while (i < html.length) {
    const lt = html.indexOf('<', i)
    if (lt === -1) break
    const rest = html.slice(lt)

    // comments / script / style — drop
    if (rest.startsWith('<!--')) {
      const end = html.indexOf('-->', lt)
      flushText(lt)
      i = textStart = end === -1 ? html.length : end + 3
      continue
    }
    const scriptStyle = rest.match(/^<\s*(script|style)\b/i)
    if (scriptStyle) {
      const matched = matchTag(html, lt, scriptStyle[1])
      flushText(lt)
      i = textStart = matched ? matched.end : html.length
      continue
    }

    const voidMatch = rest.match(VOID_BLOCK_RE)
    const tagMatch = rest.match(/^<\s*([a-z][a-z0-9]*)\b/i)
    const tag = tagMatch?.[1]?.toLowerCase()

    if (voidMatch && (voidMatch[1].toLowerCase() === 'hr' || isStandaloneImg(html, lt))) {
      flushText(lt)
      out.push({ tag: voidMatch[1].toLowerCase(), attrs: voidMatch[2] ?? '', inner: '' })
      i = textStart = lt + voidMatch[0].length
      continue
    }

    if (tag && (BLOCK_TAGS as readonly string[]).includes(tag)) {
      const matched = matchTag(html, lt, tag)
      if (matched) {
        flushText(lt)
        out.push({ tag, attrs: matched.attrs, inner: matched.inner })
        i = textStart = matched.end
        continue
      }
    }

    // not a recognized block — treat as inline text, keep scanning
    i = lt + 1
  }
  flushText(html.length)
  return out
}

/** A bare <img> between blocks (not inside a paragraph) renders as its own block. */
function isStandaloneImg(html: string, at: number): boolean {
  // look back: only whitespace or a block boundary before it on this segment
  const before = html.slice(Math.max(0, at - 200), at)
  return /(^|>)\s*$/.test(before)
}

// ── List conversion ───────────────────────────────────────────────────────────

function listToMarkdown(inner: string, ordered: boolean, indent: number): string {
  const lines: string[] = []
  const liRe = /<\s*li\b[^>]*>/gi
  let m: RegExpExecArray | null
  let idx = 0
  const items: string[] = []
  // matchTag per <li> to honour nested lists inside items
  while ((m = liRe.exec(inner))) {
    const matched = matchTag(inner, m.index, 'li')
    if (!matched) continue
    items.push(matched.inner)
    liRe.lastIndex = matched.end
  }
  for (const item of items) {
    idx++
    // pull nested lists out of the item before inline-converting the rest
    let nested = ''
    let rest = item
    const nestedTokens: string[] = []
    let guard = 0
    let listMatch: RegExpExecArray | null
    const nestedRe = /<\s*(ul|ol)\b[^>]*>/i
    while ((listMatch = nestedRe.exec(rest)) && guard++ < 20) {
      const sub = matchTag(rest, listMatch.index, listMatch[1].toLowerCase())
      if (!sub) break
      nestedTokens.push(listToMarkdown(sub.inner, listMatch[1].toLowerCase() === 'ol', indent + 1))
      rest = rest.slice(0, listMatch.index) + rest.slice(sub.end)
    }
    nested = nestedTokens.join('\n')
    const marker = ordered ? `${idx}.` : '-'
    const pad = '  '.repeat(indent)
    const text = inlineToMarkdown(rest).replace(/\n/g, `\n${pad}  `)
    lines.push(`${pad}${marker} ${text}${nested ? `\n${nested}` : ''}`)
  }
  return lines.join('\n')
}

// ── Main converter ────────────────────────────────────────────────────────────

/** Convert a WP rendered-HTML document/fragment to GFM markdown. */
export function wpHtmlToGfm(html: string): string {
  if (!html || !html.trim()) return ''
  const blocks = tokenizeBlocks(stripShortcodes(html))
  const out: string[] = []

  for (const block of blocks) {
    if ('text' in block) {
      const t = inlineToMarkdown(block.text)
      if (t) out.push(t)
      continue
    }
    const { tag, inner, attrs } = block
    switch (tag) {
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
        const level = Number(tag[1])
        const text = inlineToMarkdown(inner)
        if (text) out.push(`${'#'.repeat(level)} ${text.replace(/\n/g, ' ')}`)
        break
      }
      case 'p': {
        // WP emits invalid-but-common nesting like <p><div><table>…</table></div>
        // (browsers auto-close the <p>; the raw source does not) — recurse so
        // the nested blocks survive instead of being stripped as inline tags.
        if (/<\s*(table|div|section|ul|ol|figure|blockquote|iframe|h[1-6])\b/i.test(inner)) {
          const md = wpHtmlToGfm(inner)
          if (md) out.push(md)
          break
        }
        const text = inlineToMarkdown(inner)
        if (text) out.push(text)
        break
      }
      case 'ul':
      case 'ol': {
        const md = listToMarkdown(inner, tag === 'ol', 0)
        if (md) out.push(md)
        break
      }
      case 'table': {
        const md = wpTableHtmlToGfm(`<table${attrs}>${inner}</table>`)
        if (md) out.push(md)
        break
      }
      case 'blockquote': {
        const md = wpHtmlToGfm(inner)
        if (md) out.push(md.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n'))
        break
      }
      case 'pre': {
        const code = decodeEntities(inner.replace(/<[^>]+>/g, ''))
        if (code.trim()) out.push('```\n' + code.replace(/^\n+|\n+$/g, '') + '\n```')
        break
      }
      case 'hr':
        out.push('---')
        break
      case 'img': {
        const src = attrs.match(/src\s*=\s*["']([^"']*)["']/i)?.[1] ?? ''
        const alt = attrs.match(/alt\s*=\s*["']([^"']*)["']/i)?.[1] ?? ''
        if (src) out.push(`![${decodeEntities(alt)}](${src})`)
        break
      }
      case 'iframe': {
        // keep embeds (YouTube/TikTok) as raw HTML — markdown-it renders them
        const src = attrs.match(/src\s*=\s*["']([^"']*)["']/i)?.[1] ?? ''
        if (src) out.push(`<iframe src="${src}" allowfullscreen></iframe>`)
        break
      }
      case 'figure': {
        // figure wraps an img/table/iframe (+ optional figcaption)
        const caption = matchTag(inner, inner.search(/<\s*figcaption\b/i), 'figcaption')
        const withoutCaption = caption
          ? inner.replace(/<\s*figcaption\b[^>]*>[\s\S]*?<\s*\/\s*figcaption\s*>/i, '')
          : inner
        const md = wpHtmlToGfm(withoutCaption)
        if (md) out.push(md)
        if (caption) {
          const cap = inlineToMarkdown(caption.inner)
          if (cap) out.push(`*${cap}*`)
        }
        break
      }
      case 'div':
      case 'section':
      case 'article': {
        const galleryColumns = Number(attrs.match(/gallery-columns-(\d+)/i)?.[1] ?? 0)
        if (tag === 'div' && galleryColumns > 0) {
          const md = wpGalleryHtmlToGfm(inner, galleryColumns)
          if (md) {
            out.push(md)
            break
          }
        }
        // unwrap wrapper and recurse (e.g. wpDataTables wrapper divs)
        const md = wpHtmlToGfm(inner)
        if (md) out.push(md)
        break
      }
    }
  }

  return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
}
