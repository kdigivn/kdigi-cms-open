/**
 * Unit tests for markdown-to-html.ts
 * Runner: node --import tsx --test (node:test + node:assert)
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { markdownToHtml } from './markdown-to-html.js'

test('empty string returns empty string', () => {
  assert.equal(markdownToHtml(''), '')
})

test('headings converted to HTML', () => {
  const out = markdownToHtml('## Tiêu đề')
  assert.match(out, /<h2[^>]*>Tiêu đề<\/h2>/)
})

test('bold and italic', () => {
  const out = markdownToHtml('**in đậm** và *in nghiêng*')
  assert.match(out, /<strong>in đậm<\/strong>/)
  assert.match(out, /<em>in nghiêng<\/em>/)
})

test('unordered list', () => {
  const out = markdownToHtml('- item 1\n- item 2')
  assert.match(out, /<ul>/)
  assert.match(out, /<li>item 1<\/li>/)
})

test('link preserved with href', () => {
  const out = markdownToHtml('[click here](https://example.com)')
  assert.match(out, /<a [^>]*href="https:\/\/example\.com"/)
})

test('image with alt preserved', () => {
  const out = markdownToHtml('![alt text](https://example.com/img.jpg)')
  assert.match(out, /<img[^>]*src="https:\/\/example\.com\/img\.jpg"/)
  assert.match(out, /alt="alt text"/)
})

test('GFM table rendered', () => {
  const md = '| A | B |\n|---|---|\n| 1 | 2 |'
  const out = markdownToHtml(md)
  assert.match(out, /<table>/)
  assert.match(out, /<th[^>]*>A<\/th>/)
})

test('script tag stripped by sanitize', () => {
  const out = markdownToHtml('<script>alert("xss")</script>')
  assert.doesNotMatch(out, /<script>/)
})

test('code block preserved', () => {
  const out = markdownToHtml('```js\nconst x = 1\n```')
  assert.match(out, /<pre>/)
  assert.match(out, /<code/)
})

test('raw <br /> inside a table cell renders as a real line break, not literal text', () => {
  // Milkdown/remark's GFM table serializer emits literal `<br />` for hard
  // breaks inside cells (table rows can't contain real newlines) — the
  // renderer must parse that back into an actual <br>, not escape it to text.
  const md = '| A | B |\n|---|---|\n| <br /> | x |'
  const out = markdownToHtml(md)
  assert.match(out, /<td[^>]*>\s*<br\s*\/?>\s*<\/td>/)
  assert.doesNotMatch(out, /&lt;br/)
})

test('full AI-style markdown produces non-empty sanitized HTML', () => {
  const md = `
# Hướng dẫn du lịch Phú Quốc

## Cách đi

Bạn có thể đến **Phú Quốc** bằng:

- Máy bay từ TP.HCM (~45 phút)
- Tàu cao tốc từ Rạch Giá (~2.5 giờ)

## Nơi lưu trú

| Loại | Giá | Đặc điểm |
|------|-----|-----------|
| Resort 5* | 3tr+ | Bãi biển riêng |
| Homestay | 300k | Tiết kiệm |

## Liên hệ

Xem chi tiết tại [Example Link](https://example.com)
  `.trim()

  const out = markdownToHtml(md)
  assert.ok(out.length > 0)
  assert.match(out, /<h1[^>]*>/)
  assert.match(out, /<table>/)
  assert.match(out, /<ul>/)
  assert.doesNotMatch(out, /<script/)
})
