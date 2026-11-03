import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { htmlToGfm, type HtmlToGfmResult } from './html-to-gfm'

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../e2e/fixtures/paste',
)
const readFixture = (name: string): string => fs.readFileSync(path.join(fixturesDir, name), 'utf-8')

const convert = (html: string, options: Parameters<typeof htmlToGfm>[1] = {}): HtmlToGfmResult =>
  htmlToGfm(html, options)

/** No HTML tags may survive, except GFM autolink syntax. */
function assertNoHtml(markdown: string): void {
  const tags = markdown.match(/<\/?[a-zA-Z][^>]*>/g) ?? []
  const offenders = tags.filter((tag) => !/^<(https?:\/\/|mailto:)/i.test(tag))
  assert.deepEqual(offenders, [], `raw HTML leaked into the Markdown: ${offenders.join(', ')}`)
}

test('Google Docs HTML → H1 recovered from the bold-paragraph pattern', () => {
  const result = convert(readFixture('gdocs.html'))
  assert.match(result.markdown, /^# Google Docs Heading/m)
  assert.ok(result.markdown.includes('**bold formatting**'), result.markdown)
  assert.ok(result.markdown.includes('[link](https://docs.google.com)'), result.markdown)
  assert.ok(!result.markdown.includes('style='), 'inline styles must not survive')
  assert.ok(!result.markdown.includes('docs-internal-guid'), 'the GDocs b-wrapper id must not survive')
  assertNoHtml(result.markdown)
})

test('Microsoft Word HTML → clean H1 and bold, no MsoNormal/o:p residue', () => {
  const result = convert(readFixture('word.html'))
  assert.match(result.markdown, /^# Word Heading 1/m)
  assert.ok(result.markdown.includes('**bold text**'), result.markdown)
  assert.ok(!result.markdown.includes('MsoNormal'), 'Word class names must not survive')
  assert.ok(!result.markdown.includes('o:p'), 'Word o:p tags must not survive')
  assertNoHtml(result.markdown)
})

test('Lark Docs HTML → heading from data-node-type, bold/italic from the run styles', () => {
  const result = convert(readFixture('lark.html'))
  assert.match(result.markdown, /^# Lark Heading 1/m)
  assert.ok(result.markdown.includes('**bold text**'), result.markdown)
  assert.ok(result.markdown.includes('*italic text*'), result.markdown)
  assert.ok(!result.markdown.includes('suite-editor-block'), 'Lark wrapper classes must not survive')
  assert.ok(!result.markdown.includes('data-block-id'), 'Lark data attributes must not survive')
  assertNoHtml(result.markdown)
})

test('a bold sentence that is not a whole paragraph stays bold text, not a heading', () => {
  const result = convert('<p>Some <b>bold</b> words inside a longer sentence.</p>')
  assert.ok(!result.markdown.startsWith('#'))
  assert.ok(result.markdown.includes('**bold**'), result.markdown)
})

test('a long fully-bold paragraph is not promoted to a heading (80-char guard)', () => {
  const long = 'x'.repeat(120)
  const result = convert(`<p><b>${long}</b></p>`)
  assert.ok(!result.markdown.startsWith('#'), result.markdown)
})

test('headerless tables get a synthesized GFM header row plus alignment delimiters', () => {
  const result = convert(
    '<table><tr><td align="center">a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>',
  )
  const rows = result.markdown.split('\n')
  assert.deepEqual(rows, ['| a | b |', '| :---: | --- |', '| c | d |'], result.markdown)
  assertNoHtml(result.markdown)
})

test('tables with a real header row keep it and read alignment from style', () => {
  const result = convert(
    '<table><thead><tr><th>h1</th><th style="text-align:right">h2</th></tr></thead>' +
      '<tbody><tr><td>x</td><td>y</td></tr></tbody></table>',
  )
  assert.deepEqual(result.markdown.split('\n'), ['| h1 | h2 |', '| --- | ---: |', '| x | y |'])
})

test('task list items serialize as GFM checkboxes', () => {
  const result = convert(
    '<ul><li><input type="checkbox" checked> done</li><li><input type="checkbox"> todo</li></ul>',
  )
  assert.ok(result.markdown.includes('- [x] done'), result.markdown)
  assert.ok(result.markdown.includes('- [ ] todo'), result.markdown)
})

test('nested lists keep their indentation', () => {
  const result = convert('<ul><li>outer<ul><li>inner</li></ul></li></ul>')
  assert.ok(/-\s+outer\n\s+- inner/.test(result.markdown), result.markdown)
})

test('javascript: and other unsafe links keep their text and are counted as dropped', () => {
  const result = convert('<p><a href="javascript:alert(1)">click</a> and <a href="vbscript:x">b</a></p>')
  assert.ok(result.markdown.includes('click'), result.markdown)
  assert.ok(!result.markdown.includes('javascript:'), 'unsafe hrefs must not survive')
  assert.equal(result.dropped.links, 2)
})

test('code blocks keep their language fence and never emit raw HTML', () => {
  const result = convert('<pre><code class="language-ts">const a = 1</code></pre>')
  assert.ok(result.markdown.includes('```ts'), result.markdown)
  assertNoHtml(result.markdown)
})

test('data: raster images become upload tokens; SVG and other types are dropped', () => {
  const png = 'data:image/png;base64,iVBORw0KGgo='
  const result = convert(
    `<p><img src="${png}" alt="shot"><img src="data:image/svg+xml;base64,PHN2Zz4=" alt="vector"></p>`,
  )
  assert.equal(result.images.length, 1, 'only the raster image may be uploaded')
  assert.equal(result.images[0].src, png)
  assert.ok(result.markdown.includes(`![shot](${result.images[0].token})`), result.markdown)
  assert.equal(result.dropped.images, 1)
  assert.ok(!result.markdown.includes('svg+xml'), 'SVG data URIs must be dropped [RT-11]')
})

test('remote images are kept as URLs (no rehosting)', () => {
  const result = convert('<p><img src="https://cdn.example.com/a.png" alt="remote"></p>')
  assert.ok(result.markdown.includes('![remote](https://cdn.example.com/a.png)'), result.markdown)
  assert.equal(result.images.length, 0)
})

test('image caps: over the count limit, the rest are dropped', () => {
  const png = 'data:image/png;base64,iVBORw0KGgo='
  const result = convert(`<p><img src="${png}"><img src="${png}"></p>`, { maxImages: 1 })
  assert.equal(result.images.length, 1)
  assert.equal(result.dropped.images, 1)
})

test('image caps: oversized payloads are dropped', () => {
  const big = `data:image/png;base64,${'A'.repeat(4000)}`
  const result = convert(`<p><img src="${big}"></p>`, { maxImageBytes: 1024 })
  assert.equal(result.images.length, 0)
  assert.equal(result.dropped.images, 1)
})

test('unknown/new-looking markup never reaches the output as HTML', () => {
  const result = convert(
    '<div class="wrapper" onclick="steal()"><section><custom-tag>text</custom-tag></section></div>',
  )
  assert.ok(result.markdown.includes('text'), result.markdown)
  assertNoHtml(result.markdown)
  assert.ok(!result.markdown.includes('steal()'))
})

test('dropped script/style content never appears in the output', () => {
  const result = convert('<p>safe</p><script>alert(1)</script><style>.a{color:red}</style>')
  assert.ok(result.markdown.includes('safe'))
  assert.ok(!result.markdown.includes('alert(1)'))
  assert.ok(!result.markdown.includes('color:red'))
})

test('markdown-special characters mid-line are not escaped', () => {
  const result = convert('<p>issue #12 uses snake_case names</p>')
  assert.ok(result.markdown.includes('issue #12'), result.markdown)
  assert.ok(!result.markdown.includes('\\#'), 'no spurious backslash escapes')
})

test('plain text with no markup passes through unchanged', () => {
  const result = convert('<p>just words</p>')
  assert.equal(result.markdown.trim(), 'just words')
})
