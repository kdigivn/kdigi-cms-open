/**
 * HTML → GFM Markdown for pasted rich content (phase 7, SP2-4).
 *
 * Pure and dependency-light: Turndown ships a node-capable parser (its own bundled DOM) and
 * uses `DOMParser` in the browser, so the same code path runs in the admin and in node unit
 * tests with no injected parser and no test-only DOM package. No Turndown plugin is used — `turndown-plugin-gfm` has been unmaintained
 * since 2019 and its table rule `keep`s raw HTML, which would leak arbitrary markup into the
 * Markdown that the REST renderer publishes with `html: true` [RT-11]. The tables/strike/task
 * rules below are written against the GFM subset the renderer supports.
 *
 * Output guarantee: no HTML tags ever survive. Turndown itself only emits what a rule asks
 * for, and `stripResidualHtml` is the belt-and-braces pass that also counts what it removed.
 */

import TurndownService from 'turndown'

/** Raster types allowed through the `data:` upload path — SVG is deliberately excluded [RT-11]. */
const UPLOADABLE_DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp)[;,]/i
/** Every other image source must be an absolute http(s) URL, or it is dropped. */
const KEEPABLE_IMAGE_SRC = /^https?:\/\//i
/** Links: anchors and mailto survive; `javascript:`/`data:`/`vbscript:` never do. */
const SAFE_LINK = /^(https?:|mailto:|tel:|#|\/(?!\/))/i

const DEFAULT_MAX_IMAGES = 10
const DEFAULT_MAX_IMAGE_BYTES = 10 * 1024 * 1024
/** Token prefix for `data:` images the caller must upload before insertion. */
const IMAGE_TOKEN = '\u0000kdigi-image-'

export interface PastedImage {
  /** Placeholder that appears in `markdown` until the caller substitutes an uploaded URL. */
  token: string
  /** Original `data:` URI. */
  src: string
  alt: string
  /** Decoded byte size, from the base64 payload. */
  bytes: number
}

export interface HtmlToGfmOptions {
  /** Cap on `data:` images carried through per paste. */
  maxImages?: number
  /** Cap on each `data:` image's decoded size. */
  maxImageBytes?: number
}

export interface HtmlToGfmResult {
  markdown: string
  /** `data:` images that survived the caps and need uploading before insertion. */
  images: PastedImage[]
  /** Counts of things dropped, so callers/tests can assert the safety rules ran. */
  dropped: { images: number; links: number; htmlTags: number }
}

function styleOf(element: Element): string {
  return (element.getAttribute('style') ?? '').replace(/\s+/g, '').toLowerCase()
}

function isBoldElement(element: Element): boolean {
  const style = styleOf(element)
  if (/font-weight:(bold|[6-9]\d\d)/.test(style)) return true
  if (/font-weight:(normal|[1-5]\d\d)/.test(style)) return false
  return element.classList.contains('text-bold') || /^(b|strong)$/i.test(element.tagName)
}

function isItalicElement(element: Element): boolean {
  const style = styleOf(element)
  if (/font-style:italic/.test(style)) return true
  if (element.classList.contains('text-italic')) return true
  return /^(i|em)$/i.test(element.tagName)
}

function textOf(element: Element): string {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * A paragraph that is nothing but bold text is how Google Docs' clipboard export represents
 * a named "Heading N" style (its paragraph styles do not survive the export, only the run
 * properties do). Recovered as an H1 — the phase's `rich-paste-matrix` expectation — but only
 * for a short, single-run paragraph, so an intentionally bold sentence stays a sentence.
 */
function isBoldHeadingParagraph(element: Element): boolean {
  const text = textOf(element)
  if (text.length === 0 || text.length > 80) return false
  const boldRuns = Array.from(element.querySelectorAll('b, strong, span')).filter(isBoldElement)
  if (boldRuns.length === 0) return false
  // The bold runs must account for the whole paragraph text, modulo collapsed whitespace.
  const boldText = boldRuns.map(textOf).join(' ').replace(/\s+/g, ' ').trim()
  return boldText.length > 0 && boldText.replace(/\s+/g, '') === text.replace(/\s+/g, '')
}

function anchorAlignment(value: string | null): string {
  const align = (value ?? '').toLowerCase()
  return align === 'center' || align === 'right' ? align : 'left'
}

/** GFM delimiter cell for one alignment (`:---`, `:---:`, `---:`). */
function gfmDelimiter(alignment: string): string {
  if (alignment === 'center') return ':---:'
  if (alignment === 'right') return '---:'
  return '---'
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim()
}

function tableToGfm(service: TurndownService, table: Element): string {
  const rows = Array.from(table.querySelectorAll('tr'))
  if (rows.length === 0) return ''

  const cellMatrix = rows.map((row) =>
    Array.from(row.children)
      .filter((cell) => /^(td|th)$/i.test(cell.tagName))
      .map((cell) => ({
        text: escapeCell(service.turndown(cell.innerHTML)),
        alignment: anchorAlignment(cell.getAttribute('align') ?? styleOf(cell).match(/text-align:(\w+)/)?.[1] ?? null),
      })),
  )

  const columnCount = Math.max(...cellMatrix.map((cells) => cells.length))
  if (columnCount === 0) return ''

  const hasHeaderRow = /^thead$/i.test(rows[0].parentElement?.tagName ?? '') ||
    Array.from(rows[0].children).every((cell) => /^th$/i.test(cell.tagName))

  // GFM has no headerless tables: when the source has none, the first row becomes the header
  // (this is exactly the case where `turndown-plugin-gfm` emitted raw HTML instead).
  const header = hasHeaderRow ? cellMatrix[0] : new Array(columnCount).fill(null).map((_, index) => cellMatrix[0][index] ?? { text: '', alignment: 'left' })
  const body = hasHeaderRow ? cellMatrix.slice(1) : cellMatrix.slice(1)
  const alignments = new Array(columnCount).fill(null).map((_, index) => header[index]?.alignment ?? 'left')

  const line = (cells: Array<{ text: string }>): string =>
    `| ${new Array(columnCount).fill(null).map((_, index) => cells[index]?.text ?? '').join(' | ')} |`

  return [
    line(header),
    `| ${alignments.map((alignment) => gfmDelimiter(alignment)).join(' | ')} |`,
    ...body.map(line),
  ].join('\n')
}

/** Removes anything that still looks like an HTML tag, keeping `<https://…>` autolinks. */
function stripResidualHtml(markdown: string): { markdown: string; removed: number } {
  let removed = 0
  const cleaned = markdown.replace(/<\/?[a-zA-Z][^>]*>/g, (match) => {
    if (/^<(https?:\/\/|mailto:)[^>]*>$/i.test(match)) return match
    removed += 1
    return ''
  })
  return { markdown: cleaned, removed }
}

export function htmlToGfm(html: string, options: HtmlToGfmOptions = {}): HtmlToGfmResult {
  const maxImages = options.maxImages ?? DEFAULT_MAX_IMAGES
  const maxImageBytes = options.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES

  const images: PastedImage[] = []
  const dropped = { images: 0, links: 0, htmlTags: 0 }

  const captureImage = (element: Element): string | null => {
    const src = element.getAttribute('src') ?? ''
    const alt = element.getAttribute('alt') ?? ''
    if (KEEPABLE_IMAGE_SRC.test(src)) return src
    if (UPLOADABLE_DATA_IMAGE.test(src)) {
      const base64 = src.slice(src.indexOf(',') + 1)
      const bytes = Math.floor((base64.length * 3) / 4)
      if (images.length >= maxImages || bytes > maxImageBytes) {
        dropped.images += 1
        return null
      }
      const token = `${IMAGE_TOKEN}${images.length}\u0000`
      images.push({ token, src, alt, bytes })
      return token
    }
    dropped.images += 1
    return null
  }

  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
    br: '  ',
  })

  // Nothing is `keep`-ed: unknown elements fall through to Turndown's blank rule, which emits
  // their content without the tag — the property that keeps raw HTML out of the Markdown.
  service.remove(['script', 'style', 'noscript', 'iframe', 'object', 'embed', 'meta', 'link', 'title', 'head', 'canvas', 'form', 'input', 'button'])

  // `svg` is not in Turndown's `remove` element map; dropping the whole element (not its
  // text) is the intended behaviour anyway — an inline SVG is decoration, not content [RT-11].
  service.addRule('kdigiDropInlineSvg', {
    filter: (node) => /^svg$/i.test(node.nodeName),
    replacement: () => '',
  })

  service.addRule('kdigiBoldWrapper', {
    filter: (node) => /^(b|strong)$/i.test(node.nodeName) && !isBoldElement(node as Element),
    replacement: (content) => content,
  })

  service.addRule('kdigiEmphasis', {
    filter: (node) => /^(b|strong|i|em)$/i.test(node.nodeName),
    replacement: (content, node) => {
      const element = node as Element
      if (isBoldElement(element)) return `**${content.trim()}**`
      if (isItalicElement(element)) return `*${content.trim()}*`
      return content
    },
  })

  service.addRule('kdigiSpan', {
    filter: (node) => /^span$/i.test(node.nodeName),
    replacement: (content, node) => {
      const element = node as Element
      const trimmed = content.trim()
      if (trimmed.length === 0) return ''
      if (isBoldElement(element)) return `**${trimmed}**`
      if (isItalicElement(element)) return `*${trimmed}*`
      return content
    },
  })

  service.addRule('kdigiStrikethrough', {
    filter: (node) => /^(s|del|strike)$/i.test(node.nodeName),
    replacement: (content) => `~~${content.trim()}~~`,
  })

  service.addRule('kdigiHeading', {
    filter: (node) => /^h[1-6]$/i.test(node.nodeName),
    replacement: (content, node) => {
      const level = Number(node.nodeName.slice(1))
      return `\n\n${'#'.repeat(level)} ${content.trim()}\n\n`
    },
  })

  service.addRule('kdigiLarkHeadingBlock', {
    filter: (node) =>
      /^(div|p)$/i.test(node.nodeName) && node.getAttribute('data-node-type') === 'heading',
    replacement: (content, node) => {
      const level = Number(node.getAttribute('data-heading-level') ?? '1')
      const safeLevel = Math.min(Math.max(level, 1), 6)
      return `\n\n${'#'.repeat(safeLevel)} ${content.trim()}\n\n`
    },
  })

  service.addRule('kdigiBoldHeadingParagraph', {
    filter: (node) => node.nodeName === 'P' && isBoldHeadingParagraph(node as Element),
    replacement: (_content, node) => `\n\n# ${textOf(node as Element)}\n\n`,
  })

  service.addRule('kdigiLink', {
    filter: (node) => node.nodeName === 'A',
    replacement: (content, node) => {
      const href = (node as Element).getAttribute('href') ?? ''
      const label = content.trim() || href
      if (!href || !SAFE_LINK.test(href.trim())) {
        if (href) dropped.links += 1
        return label
      }
      return `[${label}](${href.trim()})`
    },
  })

  service.addRule('kdigiImage', {
    filter: (node) => node.nodeName === 'IMG',
    replacement: (_content, node) => {
      const element = node as Element
      const target = captureImage(element)
      if (!target) return ''
      const alt = (element.getAttribute('alt') ?? '').replace(/[\[\]]/g, '')
      return `![${alt}](${target})`
    },
  })

  service.addRule('kdigiTable', {
    filter: (node) => node.nodeName === 'TABLE',
    replacement: (_content, node) => `\n\n${tableToGfm(service, node as Element)}\n\n`,
  })

  service.addRule('kdigiCodeBlock', {
    filter: (node) => node.nodeName === 'PRE',
    replacement: (_content, node) => {
      const code = (node as Element).querySelector('code')
      const className = code?.getAttribute('class') ?? ''
      const language = /language-([\w-]+)/.exec(className)?.[1] ?? ''
      const text = (code ?? (node as Element)).textContent ?? ''
      return `\n\n\`\`\`${language}\n${text.replace(/\n$/, '')}\n\`\`\`\n\n`
    },
  })

  service.addRule('kdigiTaskListItem', {
    filter: (node) => node.nodeName === 'LI',
    replacement: (content, node) => {
      const checkbox = (node as Element).querySelector('input[type="checkbox"]')
      if (!checkbox) return `\n- ${content.trim()}\n`
      const checked = (checkbox as HTMLInputElement).hasAttribute('checked')
      return `\n- [${checked ? 'x' : ' '}] ${content.trim()}\n`
    },
  })

  // Turndown parses the string itself (bundled DOM in node, `DOMParser` in the browser).
  const converted = service.turndown(html)
  const stripped = stripResidualHtml(converted)
  dropped.htmlTags = stripped.removed

  // Collapse the blank-line runs Turndown leaves behind rule boundaries, and drop trailing space.
  const markdown = stripped.markdown
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { markdown, images, dropped }
}
