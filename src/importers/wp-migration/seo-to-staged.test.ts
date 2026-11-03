import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { RawSeo } from './raw-wp-types'
import { buildStagedSeo, decodeSeoEntities, extractMetaContent, makeRewriteHost } from './seo-to-staged'
import { buildSiteConfig } from './wp-migration-config'

const cfg = buildSiteConfig({
  site: 'demo',
  wpUrl: 'https://wp.example.com',
  publicUrl: 'https://www.example.com',
  domain: 'new.example.org',
})

describe('makeRewriteHost', () => {
  it('rewrites backend + public host (with or without www), keeps scheme, path, query and hash', () => {
    const rewrite = makeRewriteHost(cfg)
    assert.equal(rewrite('https://wp.example.com/a/b/?x=1#h'), 'https://new.example.org/a/b/?x=1#h')
    assert.equal(rewrite('http://www.example.com/a/'), 'http://new.example.org/a/')
    assert.equal(rewrite('https://example.com'), 'https://new.example.org')
    assert.equal(rewrite('https://other.example.net/a/'), 'https://other.example.net/a/')
    assert.equal(rewrite('https://example.com.evil.net/a'), 'https://example.com.evil.net/a')
  })
})

describe('buildStagedSeo', () => {
  it('maps a RankMath-shaped node', () => {
    const seo: RawSeo = {
      source: 'rankmath',
      title: 'Tom &amp; Jerry &#8211; Home',
      description: 'It&#039;s a description',
      breadcrumbTitle: 'Home',
      canonicalUrl: 'https://www.example.com/home/',
      focusKeywords: ['tom', 'jerry'],
      robots: ['Index', 'follow', 'max-snippet:-1', 'max-video-preview:-1', 'max-image-preview:large', 'unsupported'],
      openGraph: { title: 'OG', description: 'OG desc', type: 'website', url: 'https://wp.example.com/home/', updatedTime: '2024-05-01T00:00:00+00:00' },
      fullHead:
        '<meta name="twitter:card" content="summary" />\n<meta content="Tw &amp; title" name="twitter:title">\n<meta name="twitter:description" content="Tw desc">',
    }
    assert.deepEqual(buildStagedSeo(seo, cfg), {
      title: 'Tom & Jerry – Home',
      description: "It's a description",
      breadcrumbTitle: 'Home',
      canonicalOverride: 'https://new.example.org/home/',
      focusKeywords: ['tom', 'jerry'],
      robots: ['index', 'follow', 'max-snippet:-1', 'max-video-preview:-1', 'max-image-preview:large'],
      openGraph: {
        title: 'OG',
        description: 'OG desc',
        type: 'website',
        url: 'https://new.example.org/home/',
        updatedTime: '2024-05-01T00:00:00+00:00',
        twitterMeta: { card: 'summary', title: 'Tw & title', description: 'Tw desc' },
      },
    })
  })

  it('maps a Yoast-shaped node (single keyphrase, noindex, unknown twitter card)', () => {
    const seo: RawSeo = {
      source: 'yoast',
      title: 'About',
      canonicalUrl: 'http://wp.example.com/about/',
      focusKeywords: ['about us'],
      robots: ['noindex', 'nofollow', 'noindex'],
      fullHead: '<meta name="twitter:card" content="player" />',
      openGraph: { imageUrl: 'https://wp.example.com/og.png', siteName: 'Example', locale: 'en_US' },
    }
    assert.deepEqual(buildStagedSeo(seo, cfg), {
      title: 'About',
      canonicalOverride: 'http://new.example.org/about/',
      focusKeywords: ['about us'],
      robots: ['noindex', 'nofollow'],
      openGraph: { twitterMeta: { card: 'summary_large_image' } },
    })
  })

  it('defaults robots to index,follow and returns only robots for an empty node', () => {
    assert.deepEqual(buildStagedSeo({ source: 'none' }, cfg), { robots: ['index', 'follow'] })
    assert.deepEqual(buildStagedSeo({ robots: ['bogus'] }, cfg), { robots: ['index', 'follow'] })
  })
})

describe('decodeSeoEntities / extractMetaContent', () => {
  it('decodes common entities and numeric references', () => {
    assert.equal(decodeSeoEntities(' &lt;b&gt; &amp; &#8217;x&#8217; &#128512; '), "<b> & ’x’ 😀")
  })

  it('reads meta content regardless of attribute order and name/property', () => {
    assert.equal(extractMetaContent('<meta property="og:image" content="a.jpg">', 'og:image'), 'a.jpg')
    assert.equal(extractMetaContent('<meta content="b.jpg" name="OG:IMAGE" />', 'og:image'), 'b.jpg')
    assert.equal(extractMetaContent('<meta property="og:title" content="t">', 'og:image'), null)
  })
})
