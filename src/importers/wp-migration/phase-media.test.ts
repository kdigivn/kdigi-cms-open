import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildMediaUrlIndex,
  resolveMediaRefForUrl,
  rewriteImageUrls,
} from './phase-media'
import { mediaSourceKey } from './import-context'
import type { StagedMediaRef } from './staged-doc-types'

describe('mediaSourceKey', () => {
  it('uses the WP id when known, else a stable hash of the URL without query/hash (fits maxLength 64)', () => {
    assert.equal(mediaSourceKey(42, 'https://wp.example.com/a.png'), '42')
    const a = mediaSourceKey(null, 'https://wp.example.com/wp-content/uploads/logo.png?x=1#h')
    assert.equal(a, mediaSourceKey(undefined, 'https://wp.example.com/wp-content/uploads/logo.png'))
    assert.notEqual(a, mediaSourceKey(null, 'https://wp.example.com/wp-content/uploads/2023/logo.png'))
    assert.match(a, /^url:[0-9a-f]{40}$/)
  })
})

const cfg = {
  site: 'blog',
  wpUrl: 'https://wp.example.com',
  wpHost: 'wp.example.com',
  publicHost: 'example.com',
  domain: 'example.org',
  language: 'en' as const,
}

function ref(sourceUrl: string, wpId = 1): StagedMediaRef {
  return { wpId, sourceUrl }
}

describe('phase-media URL and relationship helpers', () => {
  it('resolves mixed WP/CDN aliases by upload path while rejecting another site host', () => {
    const staged = [ref('https://cdn.example.com/wp-content/uploads/guide.webp')]
    const index = buildMediaUrlIndex(cfg, staged)

    assert.equal(
      resolveMediaRefForUrl('https://wp.example.com/wp-content/uploads/guide.webp?width=1200#hero', index),
      staged[0],
    )
    assert.equal(
      resolveMediaRefForUrl('https://cdn.other-site.test/wp-content/uploads/guide.webp', index),
      null,
    )
    assert.equal(
      resolveMediaRefForUrl('https://wp.example.com/wp-content/uploads/other.webp', index),
      null,
    )
  })

  it('rewrites Markdown table images and preserved HTML img without broad URL replacement', () => {
    const staged = [ref('https://cdn.example.com/wp-content/uploads/guide.webp')]
    const index = buildMediaUrlIndex(cfg, staged)
    const body = [
      '| Name | Image |',
      '| --- | --- |',
      '| A | ![guide](https://wp.example.com/wp-content/uploads/guide.webp?size=large#top) |',
      '<img class="legacy" src="https://cdn.example.com/wp-content/uploads/guide.webp">',
      '<img src="https://external.example/wp-content/uploads/guide.webp">',
    ].join('\n')

    const result = rewriteImageUrls(body, (url) =>
      resolveMediaRefForUrl(url, index) ? 'https://media.example.com/guide.webp' : null,
    )

    assert.match(result.content, /media\.example\.com\/guide\.webp#top/)
    assert.equal(result.content.match(/media\.example\.com\/guide\.webp/g)?.length, 2)
    assert.match(result.content, /external\.example\/wp-content\/uploads\/guide\.webp/)
    assert.equal(result.rewrittenUrls.length, 2)
  })
})
