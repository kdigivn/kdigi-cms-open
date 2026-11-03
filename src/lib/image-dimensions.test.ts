import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { injectImageDimensions, type ImageSize } from './image-dimensions'

const sizes = new Map<string, ImageSize>([
  ['https://cdn.x/a.webp', { width: 768, height: 1327 }],
  ['https://cdn.x/b.webp', { width: 1280, height: 720 }],
])

describe('injectImageDimensions', () => {
  it('adds intrinsic width/height to images that have none', () => {
    const out = injectImageDimensions('<p><img src="https://cdn.x/a.webp" alt="A" /></p>', sizes)
    assert.equal(out, '<p><img src="https://cdn.x/a.webp" alt="A" width="768" height="1327" /></p>')
  })

  it('handles non-self-closing tags and several images in table cells', () => {
    const html = '<th><img src="https://cdn.x/a.webp" alt="A"> t</th><th><img alt="B" src="https://cdn.x/b.webp"></th>'
    const out = injectImageDimensions(html, sizes)
    assert.match(out, /<img src="https:\/\/cdn\.x\/a\.webp" alt="A" width="768" height="1327"> t/)
    assert.match(out, /<img alt="B" src="https:\/\/cdn\.x\/b\.webp" width="1280" height="720">/)
  })

  it('leaves images that already declare a size or have an unknown src untouched', () => {
    const sized = '<img src="https://cdn.x/a.webp" width="400" />'
    const unknown = '<img src="https://other/zzz.png" alt="z">'
    assert.equal(injectImageDimensions(sized, sizes), sized)
    assert.equal(injectImageDimensions(unknown, sizes), unknown)
  })

  it('is a no-op without html or without known sizes', () => {
    assert.equal(injectImageDimensions('', sizes), '')
    assert.equal(injectImageDimensions('<img src="https://cdn.x/a.webp">', new Map()), '<img src="https://cdn.x/a.webp">')
  })
})
