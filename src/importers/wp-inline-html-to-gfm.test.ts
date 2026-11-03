import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inlineToMarkdown } from './wp-inline-html-to-gfm'
import { markdownToHtml } from '../lib/markdown-to-html'

function render(html: string): string {
  return markdownToHtml(inlineToMarkdown(html))
}

test('keeps spaces inside inline wrappers without fusing Vietnamese words', () => {
  const html = render('Nếu tìm kiếm<strong> vé tàu</strong>, hãy <span> đặt online</span>.')
  assert.match(html, /tìm kiếm <strong>vé tàu<\/strong>, hãy đặt online\./)
})

test('keeps punctuation-ending emphasis adjacent to text without literal delimiters', () => {
  const html = render('<strong>Liên hệ:</strong>Hotline <em>Địa chỉ:</em>Hà Nội')
  assert.match(html, /<strong>Liên hệ:<\/strong>Hotline/)
  assert.match(html, /<em>Địa chỉ:<\/em>Hà Nội/)
  assert.equal(html.includes('**'), false)
})

test('keeps linked emphasis adjacent to a word and nested styles', () => {
  const html = render('website<strong><a href="/">Example.com</a></strong> và <strong>đậm <em>nghiêng</em></strong>')
  assert.match(html, /website<strong><a href="\/">Example\.com<\/a><\/strong>/)
  assert.match(html, /<strong>đậm <em>nghiêng<\/em><\/strong>/)
  assert.equal(html.includes('**'), false)
})

test('preserves source line breaks and escapes literal markdown characters', () => {
  const html = render('Dòng 1<br>Dòng 2: * ký hiệu, [không phải link]')
  assert.match(html, /Dòng 1<br\s*\/?>(?:\n)?Dòng 2: \* ký hiệu, \[không phải link\]/)
})
