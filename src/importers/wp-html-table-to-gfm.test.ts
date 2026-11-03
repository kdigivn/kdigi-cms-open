/**
 * Unit tests for the WP HTML table → GFM markdown converter.
 * Synthetic fixtures modelled on WordPress table markup.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { cellToMarkdown, wpTableHtmlToGfm, extractTables } from './wp-html-table-to-gfm'

describe('cellToMarkdown', () => {
  it('keeps plain text and collapses whitespace', () => {
    assert.equal(cellToMarkdown('  ACME  LTD \n'), 'ACME LTD')
  })

  it('maps <strong> to ** and decodes entities', () => {
    assert.equal(
      cellToMarkdown('Company name <strong>ACME LTD</strong>'),
      'Company name **ACME LTD**',
    )
    assert.equal(cellToMarkdown('5 &#8211; 3 days &amp; holidays'), '5 – 3 days & holidays')
  })

  it('maps <a> to a markdown link, dropping nested tags', () => {
    assert.equal(
      cellToMarkdown('<a href="mailto:hi@example.com" target="_blank">hi@example.com</a>'),
      '[hi@example.com](mailto:hi@example.com)',
    )
  })

  it('escapes pipes inside a cell', () => {
    assert.equal(cellToMarkdown('a | b'), 'a \\| b')
  })

  it('keeps an <img> as a markdown image and encodes spaces in the URL', () => {
    assert.equal(
      cellToMarkdown(
        '<p><img loading="lazy" class="aligncenter" src="https://cdn.example.com/wp-content/uploads/a b.webp" alt="Pick a trip" width="400" srcset="x 1200w" /></p>',
      ),
      '![Pick a trip](https://cdn.example.com/wp-content/uploads/a%20b.webp)',
    )
  })

  it('keeps an image and its figcaption side by side', () => {
    assert.equal(
      cellToMarkdown('<figure><img src="/pier.jpg" alt="Pier"><figcaption>The old pier</figcaption></figure>'),
      '![Pier](/pier.jpg) The old pier',
    )
  })

  it('keeps an image that is wrapped in a link', () => {
    assert.equal(
      cellToMarkdown('<a href="/ticket/"><img src="/t.jpg" alt="Ticket"></a>'),
      '[![Ticket](/t.jpg)](/ticket/)',
    )
  })

  it('ignores lazy-load data-src and images without a src', () => {
    assert.equal(cellToMarkdown('<img data-src="/lazy.jpg" alt="x">'), '')
    assert.equal(cellToMarkdown('<img alt="no src">'), '')
  })
})

describe('wpTableHtmlToGfm', () => {
  it('rebuilds a 2-column legal table, treating colspan as first-column-only', () => {
    const html = `<table><tbody>
      <tr><td colspan="2">Company name <strong>ACME LTD</strong></td></tr>
      <tr><td>Tax ID</td><td>0000000000</td></tr>
      <tr><td>Email</td><td><a href="mailto:hi@example.com">hi@example.com</a></td></tr>
    </tbody></table>`
    assert.equal(
      wpTableHtmlToGfm(html),
      [
        '| Company name **ACME LTD** |  |',
        '| --- | --- |',
        '| Tax ID | 0000000000 |',
        '| Email | [hi@example.com](mailto:hi@example.com) |',
      ].join('\n'),
    )
  })

  it('handles a 4-column policy table with the first row as header', () => {
    const html = `<table><tbody>
      <tr><td>No.</td><td>Item</td><td>Time</td><td>Fee</td></tr>
      <tr><td>1</td><td>Refund</td><td>Within 24 hours</td><td>30%</td></tr>
    </tbody></table>`
    assert.equal(
      wpTableHtmlToGfm(html),
      [
        '| No. | Item | Time | Fee |',
        '| --- | --- | --- | --- |',
        '| 1 | Refund | Within 24 hours | 30% |',
      ].join('\n'),
    )
  })

  it('keeps image cells of a WP table whose <td> has a stray </p>', () => {
    const html = `<table><tbody><tr>
<td style="width: 50%;">Choose the <strong>outbound</strong> trip</p>
<p><img class="aligncenter" src="https://cdn.example.com/wp-content/uploads/out.webp" alt="Out" width="400" /></td>
<td style="width: 50%;">Choose the <strong>return</strong> trip</p>
<p><img class="aligncenter" src="https://cdn.example.com/wp-content/uploads/back.webp" alt="Back" width="400" /></td>
</tr></tbody></table>`
    assert.equal(
      wpTableHtmlToGfm(html),
      [
        '| Choose the **outbound** trip ![Out](https://cdn.example.com/wp-content/uploads/out.webp) | Choose the **return** trip ![Back](https://cdn.example.com/wp-content/uploads/back.webp) |',
        '| --- | --- |',
      ].join('\n'),
    )
  })

  it('keeps later rows aligned under a rowspan cell', () => {
    const html = `<table><tbody>
      <tr><td>Time</td><td>Type</td><td>Price</td></tr>
      <tr><td rowspan="2">07:30</td><td>Adult</td><td>390.000</td></tr>
      <tr><td>Child</td><td>195.000</td></tr>
      <tr><td>13:00</td><td>Adult</td><td>390.000</td></tr>
    </tbody></table>`
    assert.equal(
      wpTableHtmlToGfm(html),
      [
        '| Time | Type | Price |',
        '| --- | --- | --- |',
        '| 07:30 | Adult | 390.000 |',
        '|  | Child | 195.000 |',
        '| 13:00 | Adult | 390.000 |',
      ].join('\n'),
    )
  })

  it('combines rowspan and colspan without shifting columns', () => {
    const html = `<table><tbody>
      <tr><td>A</td><td>B</td><td>C</td></tr>
      <tr><td rowspan="2" colspan="2">AB</td><td>c1</td></tr>
      <tr><td>c2</td></tr>
    </tbody></table>`
    assert.equal(
      wpTableHtmlToGfm(html),
      ['| A | B | C |', '| --- | --- | --- |', '| AB |  | c1 |', '|  |  | c2 |'].join('\n'),
    )
  })

  it('returns empty string when there are no rows', () => {
    assert.equal(wpTableHtmlToGfm('<table></table>'), '')
  })
})

describe('extractTables', () => {
  it('finds every table fragment in order', () => {
    const html = '<p>x</p><table id="a"><tr><td>1</td></tr></table><h3>y</h3><table id="b"><tr><td>2</td></tr></table>'
    const tables = extractTables(html)
    assert.equal(tables.length, 2)
    assert.match(tables[0], /id="a"/)
    assert.match(tables[1], /id="b"/)
  })
})
