import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { wpHtmlToGfm } from './wp-html-to-gfm'
import { wpGalleryHtmlToGfm } from './wp-html-table-to-gfm'

const item = (n: number) =>
  `<figure class="gallery-item"><div class="gallery-icon"><img src="/i${n}.jpg" alt="Ảnh ${n}" width="1280"></div>` +
  `<figcaption class="wp-caption-text gallery-caption">Chú thích ${n}</figcaption></figure>`

describe('wpGalleryHtmlToGfm', () => {
  it('lays items out in N columns with image + caption per cell', () => {
    assert.equal(
      wpGalleryHtmlToGfm(item(1) + item(2) + item(3) + item(4), 2),
      [
        '| ![Ảnh 1](/i1.jpg) Chú thích 1 | ![Ảnh 2](/i2.jpg) Chú thích 2 |',
        '| --- | --- |',
        '| ![Ảnh 3](/i3.jpg) Chú thích 3 | ![Ảnh 4](/i4.jpg) Chú thích 4 |',
      ].join('\n'),
    )
  })

  it('pads a short last row and returns empty for a block without items', () => {
    assert.match(wpGalleryHtmlToGfm(item(1) + item(2) + item(3), 2), /\| !\[Ảnh 3\]\(\/i3\.jpg\) Chú thích 3 \| {2}\|$/)
    assert.equal(wpGalleryHtmlToGfm('<div></div>', 2), '')
  })
})

describe('wpHtmlToGfm gallery block', () => {
  it('converts a WP gallery div to a table but still unwraps ordinary divs', () => {
    const html = `<p>Nội thất</p><div id="gallery-1" class="gallery gallery-columns-2">${item(1)}${item(2)}</div><div><p>sau</p></div>`
    assert.equal(
      wpHtmlToGfm(html),
      'Nội thất\n\n| ![Ảnh 1](/i1.jpg) Chú thích 1 | ![Ảnh 2](/i2.jpg) Chú thích 2 |\n| --- | --- |\n\nsau',
    )
  })
})
