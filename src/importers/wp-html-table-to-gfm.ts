/**
 * Converts a WordPress `<table>` HTML fragment to a GFM (pipe) markdown table.
 *
 * Why this exists: WordPress `.md` exports flatten multi-column tables down to
 * their first cell, dropping the value columns. This rebuilds the full table
 * from the rendered HTML so markdown-it renders all columns again.
 *
 * Faithful but lossy where GFM cannot express WP markup:
 *   - the first <tr> becomes the header row (markdown-it requires one)
 *   - colspan=N occupies N columns: content in the first, the rest empty
 *   - rowspan=N keeps later rows column-aligned: the covered cells are empty
 *   - <img> becomes an inline `![alt](src)` image (also inside links and
 *     <figure>); a figcaption stays as text next to its image
 *   - inline strong/em/anchor/br map to bold, italic, links, and spaces;
 *     all other tags are stripped
 *   - HTML entities are decoded; pipes inside cells are escaped
 */

import { inlineToMarkdown } from './wp-inline-html-to-gfm'

/** Convert the inner HTML of a single cell to inline markdown. */
export function cellToMarkdown(inner: string): string {
  const inline = inner
    .replace(/<\s*br\s*\/?>/gi, ' ')
    .replace(/<\s*\/?\s*(?:p|div|figure|figcaption|li|ul|ol)\b[^>]*>/gi, ' ')
  return inlineToMarkdown(inline).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()
}

/** Parse one `<table>...</table>` fragment into a 2D array of markdown cells. */
function parseRows(tableHtml: string): string[][] {
  const rows: string[][] = []
  // column index -> how many further rows a rowspan cell from above still covers
  const covered = new Map<number, number>()
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
  let tr: RegExpExecArray | null
  while ((tr = trRe.exec(tableHtml))) {
    const row: string[] = []
    let col = 0
    const fillCovered = (): void => {
      while ((covered.get(col) ?? 0) > 0) {
        covered.set(col, (covered.get(col) ?? 0) - 1)
        row.push('')
        col++
      }
    }
    const cellRe = /<t([dh])\b([^>]*)>([\s\S]*?)<\/t\1>/gi
    let cell: RegExpExecArray | null
    while ((cell = cellRe.exec(tr[1]))) {
      fillCovered()
      const span = Math.max(1, Number(cell[2].match(/colspan\s*=\s*"?(\d+)/i)?.[1] ?? 1))
      const rowspan = Math.max(1, Number(cell[2].match(/rowspan\s*=\s*"?(\d+)/i)?.[1] ?? 1))
      row.push(cellToMarkdown(cell[3]))
      for (let i = 1; i < span; i++) row.push('')
      if (rowspan > 1) for (let i = 0; i < span; i++) covered.set(col + i, rowspan - 1)
      col += span
    }
    fillCovered()
    rows.push(row)
  }
  return rows
}

/**
 * Convert a WP `<table>` HTML fragment to a GFM markdown table string.
 * Returns '' when the fragment has no rows.
 */
export function wpTableHtmlToGfm(tableHtml: string): string {
  const rows = parseRows(tableHtml)
  if (!rows.length) return ''
  const ncol = rows.reduce((m, r) => Math.max(m, r.length), 0)
  const pad = (r: string[]): string[] => {
    const c = [...r]
    while (c.length < ncol) c.push('')
    return c
  }
  const line = (r: string[]): string => `| ${pad(r).join(' | ')} |`
  const [header, ...body] = rows
  return [line(header), `| ${Array(ncol).fill('---').join(' | ')} |`, ...body.map(line)].join('\n')
}

/**
 * Convert a WP `[gallery columns="N"]` block (`<div class="gallery gallery-columns-N">`
 * holding `<figure class="gallery-item">` items) to a GFM table of N columns, one
 * `![alt](src) caption` cell per item. Flattening it to sequential images lost
 * the grid; a header-only-style table keeps it (same shape as the ticket-card
 * image tables). Returns '' when the block has no usable items.
 */
export function wpGalleryHtmlToGfm(galleryHtml: string, columns: number): string {
  const ncol = Math.max(1, Math.min(columns, 6))
  const items = (galleryHtml.match(/<figure\b[^>]*gallery-item[^>]*>[\s\S]*?<\/figure>/gi) ?? [])
    .map((figure) => cellToMarkdown(figure))
    .filter(Boolean)
  if (!items.length) return ''
  const rows: string[][] = []
  for (let i = 0; i < items.length; i += ncol) {
    const row = items.slice(i, i + ncol)
    while (row.length < ncol) row.push('')
    rows.push(row)
  }
  const line = (r: string[]): string => `| ${r.join(' | ')} |`
  const [header, ...body] = rows
  return [line(header), `| ${Array(ncol).fill('---').join(' | ')} |`, ...body.map(line)].join('\n')
}

/** Extract every `<table>...</table>` fragment from an HTML document, in order. */
export function extractTables(html: string): string[] {
  return html.match(/<table\b[\s\S]*?<\/table>/gi) ?? []
}
