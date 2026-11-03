/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  buildMenuTree,
  buildStagedSiteConfig,
  extractOpenGraphImageUrl,
  langMatches,
  mapCommentStatus,
  mediaRef,
  menuLocationFor,
  normalizeMenuUrl,
  normalizeRawToStaged,
  parseHomepageGraph,
  seoOpenGraphImage,
  sourceOpenGraphImage,
  sourcePathOf,
  splitTermRefs,
  toContentMd,
} from './normalize-raw-to-staged'
import type { RawSeo } from './raw-wp-types'
import { buildSiteConfig } from './wp-migration-config'

const cfg = buildSiteConfig({
  site: 'demo',
  wpUrl: 'https://wp.example.com',
  publicUrl: 'https://www.example.com',
  domain: 'new.example.org',
  language: 'en',
})

describe('seo + term helpers', () => {
  it('keeps the actual og:image distinct from the featured/logo image', () => {
    const logo = mediaRef({ databaseId: 5, sourceUrl: 'https://cdn.example.com/logo.png' })
    const socialUrl = 'https://cdn.example.com/social.jpg'
    const social = sourceOpenGraphImage(
      `<meta property="og:image" content="${socialUrl}" />`,
      new Map([[socialUrl, { wpId: 9, sourceUrl: socialUrl, alt: 'Social' }]]),
    )
    assert.deepEqual(logo, { wpId: 5, sourceUrl: 'https://cdn.example.com/logo.png' })
    assert.deepEqual(social, { wpId: 9, sourceUrl: socialUrl, alt: 'Social' })
    assert.equal(extractOpenGraphImageUrl('<meta property="og:title" content="No image" />'), undefined)
    // attribute order and entities do not matter (Yoast / RankMath both)
    assert.equal(
      extractOpenGraphImageUrl('<meta content="https://x.example.com/a.jpg?a=1&amp;b=2" property="og:image">'),
      'https://x.example.com/a.jpg?a=1&b=2',
    )
  })

  it('falls back to seo.openGraph.imageUrl when the head has no og:image', () => {
    const seo: RawSeo = { openGraph: { imageUrl: 'https://cdn.example.com/fallback.jpg' } }
    assert.deepEqual(seoOpenGraphImage(seo, new Map()), { wpId: null, sourceUrl: 'https://cdn.example.com/fallback.jpg' })
    assert.equal(seoOpenGraphImage(null, new Map()), undefined)
  })

  it('splits terms into categories, tags and custom taxonomy refs', () => {
    const t = (databaseId: number, slug: string, name = slug) => ({ databaseId, slug, name })
    const out = splitTermRefs({
      category: { nodes: [t(1, 'news', 'News &amp; Views')] },
      post_tag: { nodes: [t(2, 'tips')] },
      product_cat: { nodes: [t(3, 'gear')] },
      genre: { nodes: [t(4, 'jazz')] },
    })
    assert.deepEqual(out.categories, [
      { slug: 'news', name: 'News & Views', wpId: 1 },
      { slug: 'gear', name: 'gear', wpId: 3 },
    ])
    assert.deepEqual(out.tags, [{ slug: 'tips', name: 'tips', wpId: 2 }])
    assert.deepEqual(out.customTerms, [{ slug: 'jazz', name: 'jazz', wpId: 4, taxonomy: 'genre' }])
    assert.deepEqual(splitTermRefs(undefined), { categories: [], tags: [], customTerms: [] })
  })

  it('matches language codes with region suffixes', () => {
    assert.equal(langMatches(undefined, 'en'), true)
    assert.equal(langMatches('en', 'en'), true)
    assert.equal(langMatches('EN_us', 'en'), true)
    assert.equal(langMatches('vi', 'en'), false)
    assert.equal(langMatches('eng', 'en'), false)
  })

  it('derives the source path from the permalink', () => {
    assert.equal(sourcePathOf('https://www.example.com/2024/05/my-post/'), '/2024/05/my-post/')
    assert.equal(sourcePathOf('https://www.example.com/?p=42'), '/?p=42')
    assert.equal(sourcePathOf(null), undefined)
  })

  it('maps WP comment status', () => {
    assert.equal(mapCommentStatus('approved'), 'approved')
    assert.equal(mapCommentStatus('hold'), 'pending')
    assert.equal(mapCommentStatus('spam'), 'spam')
    assert.equal(mapCommentStatus('trash'), undefined)
  })
})

describe('body links', () => {
  it('relativizes public-site links but keeps uploads absolute', () => {
    const md = toContentMd(
      '<p><a href="https://www.example.com/about/">About</a> <img src="https://www.example.com/wp-content/uploads/a.jpg" alt="A"> <a href="https://other.example.net/x">Ext</a></p>',
      cfg,
    )
    assert.equal(
      md,
      '[About](/about/) ![A](https://www.example.com/wp-content/uploads/a.jpg) [Ext](https://other.example.net/x)',
    )
  })
})

describe('menus', () => {
  const hostRe = /^https?:\/\/(?:www\.)?(?:wp\.example\.com|example\.com)(?=[/?#]|$)/i
  const norm = (p?: string | null, u?: string | null) => normalizeMenuUrl(p, u, hostRe)

  it('keeps query and hash on site-relative menu links and does not strip look-alike hosts', () => {
    assert.equal(normalizeMenuUrl('/', 'https://example.com/#hours', hostRe), '/#hours')
    assert.equal(normalizeMenuUrl('/s', 'https://example.com/search?x=1#r', hostRe), '/search?x=1#r')
    assert.equal(normalizeMenuUrl(null, 'https://example.com.evil.net/x', hostRe), 'https://example.com.evil.net/x')
    assert.equal(normalizeMenuUrl(null, '#', hostRe), '#')
  })

  it('builds a tree of any depth from flat items, ordered, with orphan + cycle protection', () => {
    const tree = buildMenuTree(
      [
        { databaseId: 3, parentDatabaseId: 2, label: 'Leaf', url: 'https://example.com/leaf/', order: 3 },
        { databaseId: 1, parentDatabaseId: 0, label: 'Top &amp; Co', url: 'https://example.com/', order: 1 },
        { databaseId: 2, parentDatabaseId: 1, label: 'Mid', path: '/mid/', order: 2 },
        { databaseId: 4, parentDatabaseId: 3, label: 'Deepest', url: '#', order: 4 },
        { databaseId: 5, parentDatabaseId: 99, label: 'Orphan', url: '/orphan/', order: 5 },
        { databaseId: 6, parentDatabaseId: 7, label: 'CycleA', url: '/a/', order: 6 },
        { databaseId: 7, parentDatabaseId: 6, label: 'CycleB', url: '/b/', order: 7 },
      ],
      norm,
    )
    assert.deepEqual(
      tree.map((n) => n.label),
      ['Top & Co', 'Orphan', 'CycleB'],
    )
    const top = tree[0]
    assert.equal(top.url, '/')
    assert.equal(top.children[0].label, 'Mid')
    assert.equal(top.children[0].url, '/mid/')
    assert.equal(top.children[0].children[0].label, 'Leaf')
    assert.equal(top.children[0].children[0].url, '/leaf/')
    assert.equal(top.children[0].children[0].children[0].label, 'Deepest')
    assert.doesNotThrow(() => JSON.stringify(tree), 'no circular structure')
  })

  it('maps theme locations / names to CMS locations', () => {
    assert.equal(menuLocationFor('footer_menu'), 'FOOTER_MENU')
    assert.equal(menuLocationFor('Mobile Navigation'), 'MOBILE_MENU')
    assert.equal(menuLocationFor('secondary'), 'SECONDARY_MENU')
    assert.equal(menuLocationFor('top-bar'), 'SECONDARY_MENU')
    assert.equal(menuLocationFor('desktop'), 'PRIMARY')
    assert.equal(menuLocationFor('My Account'), 'LOGGEDIN_ACCOUNT_MENU')
    assert.equal(menuLocationFor('logged-in'), 'LOGGEDIN_ACCOUNT_MENU')
    assert.equal(menuLocationFor('primary'), 'PRIMARY')
    assert.equal(menuLocationFor('Whatever'), 'PRIMARY')
  })
})

describe('site config from homepage JSON-LD', () => {
  it('reads a Yoast-style graph (logo by @id reference, SearchAction object, social profiles)', () => {
    const jsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage', '@id': 'https://www.example.com/#webpage' },
        {
          '@type': 'WebSite',
          '@id': 'https://www.example.com/#website',
          potentialAction: [
            { '@type': 'SearchAction', target: { urlTemplate: 'https://www.example.com/?s={search_term_string}' } },
          ],
        },
        {
          '@type': 'ImageObject',
          '@id': 'https://www.example.com/#/schema/logo/image/',
          url: 'https://wp.example.com/wp-content/uploads/logo.png',
        },
        {
          '@type': 'Organization',
          name: 'Example Studio',
          logo: { '@id': 'https://www.example.com/#/schema/logo/image/' },
          sameAs: ['https://www.facebook.com/example', 'https://x.com/example', 'https://www.facebook.com/example'],
        },
        { '@type': 'Person', name: 'Author Person' },
      ],
    })
    const doc = buildStagedSiteConfig(cfg, {
      name: 'Example &amp; Co',
      description: 'A demo site',
      logo: { databaseId: 3, sourceUrl: 'https://wp.example.com/wp-content/uploads/logo.png' },
      ga4Id: 'G-ABC123',
      homepageJsonLd: `<script type="application/ld+json" class="yoast-schema-graph">${jsonLd}</script>`,
    })
    assert.equal(doc.siteKey, 'demo')
    assert.equal(doc.domain, 'new.example.org')
    assert.equal(doc.defaultLanguage, 'en')
    assert.equal(doc.name, 'Example & Co')
    assert.deepEqual(doc.integration, { ga4Id: 'G-ABC123', gtmId: undefined })
    assert.equal(doc.branding.logo?.wpId, 3)
    assert.equal(doc.knowledgeGraph?.type, 'Organization')
    assert.equal(doc.knowledgeGraph?.businessType, 'Organization')
    assert.equal(doc.knowledgeGraph?.name, 'Example Studio')
    assert.equal(doc.knowledgeGraph?.logo?.sourceUrl, 'https://wp.example.com/wp-content/uploads/logo.png')
    assert.equal(doc.knowledgeGraph?.searchActionUrl, 'https://new.example.org/?s={search_term_string}')
    assert.deepEqual(doc.socialProfiles, [
      { platform: 'Facebook', url: 'https://www.facebook.com/example' },
      { platform: 'X', url: 'https://x.com/example' },
    ])
  })

  it('reads a RankMath LocalBusiness with address, geo and opening hours', () => {
    const doc = buildStagedSiteConfig(cfg, {
      homepageJsonLd: JSON.stringify({
        '@graph': [
          {
            '@type': ['Organization', 'LocalBusiness'],
            name: 'Corner Cafe',
            telephone: '+1 555 0100',
            address: { streetAddress: '1 Main St', addressLocality: 'Springfield', addressCountry: 'US' },
            geo: { latitude: '12.5', longitude: 99 },
            openingHours: ['Monday, Tuesday 08:00-17:00', 'garbage'],
            foundingDate: '01/02/2015',
          },
        ],
      }),
    })
    const kg = doc.knowledgeGraph
    assert.equal(kg?.businessType, 'LocalBusiness')
    assert.equal(kg?.telephone, '+1 555 0100')
    assert.deepEqual(kg?.geo, { latitude: 12.5, longitude: 99 })
    assert.deepEqual(kg?.openingHours, [{ dayOfWeek: ['Mo', 'Tu'], opens: '08:00', closes: '17:00' }])
    assert.equal(kg?.foundingDate, '2015-02-01')
  })

  it('omits the knowledge graph without JSON-LD and tolerates invalid JSON', () => {
    assert.equal(buildStagedSiteConfig(cfg, null).knowledgeGraph, undefined)
    assert.deepEqual(parseHomepageGraph('<script type="application/ld+json">{nope</script>'), [])
  })
})

// ── Full pipeline on a synthetic raw snapshot ─────────────────────────────────

const RANKMATH_SEO: RawSeo = {
  source: 'rankmath',
  title: 'Hello &amp; welcome',
  description: 'A RankMath description',
  canonicalUrl: 'https://www.example.com/2024/05/hello/',
  focusKeywords: ['hello'],
  robots: ['index', 'follow', 'max-snippet:-1', 'max-image-preview:large', 'weird-directive'],
  fullHead:
    '<meta property="og:image" content="https://wp.example.com/wp-content/uploads/og.jpg" />' +
    '<meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content="Tw title" />',
  openGraph: { title: 'OG hello', type: 'article', url: 'https://www.example.com/2024/05/hello/' },
}

const YOAST_SEO: RawSeo = {
  source: 'yoast',
  title: 'About us – Example',
  description: 'Yoast description',
  canonicalUrl: 'http://wp.example.com/about/',
  robots: ['noindex', 'nofollow'],
  openGraph: { imageUrl: 'https://wp.example.com/wp-content/uploads/about-og.png', siteName: 'Example' },
}

const term = (databaseId: number, slug: string, name = slug) => ({ databaseId, slug, name })

function writeRaw(root: string, rel: string, data: unknown): void {
  const file = path.join(root, 'raw', rel)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data))
}

function readStaged<T = Record<string, unknown>>(root: string, rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(root, 'staged', rel), 'utf-8')) as T
}

function stagedFiles(root: string, dir: string): string[] {
  const p = path.join(root, 'staged', dir)
  return fs.existsSync(p) ? fs.readdirSync(p).sort() : []
}

describe('normalizeRawToStaged', () => {
  let tmp: string
  let prevCwd: string
  let root: string
  const prevOffset = process.env.WP_UTC_OFFSET

  beforeEach(() => {
    prevCwd = process.cwd()
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kdigi-normalize-'))
    process.chdir(tmp)
    root = path.join(tmp, 'wp-archive', 'demo')
    delete process.env.WP_UTC_OFFSET
    seedArchive(root)
  })

  afterEach(() => {
    process.chdir(prevCwd)
    fs.rmSync(tmp, { recursive: true, force: true })
    if (prevOffset === undefined) delete process.env.WP_UTC_OFFSET
    else process.env.WP_UTC_OFFSET = prevOffset
  })

  function seedArchive(r: string): void {
    writeRaw(r, 'content/posts.json', [
      {
        databaseId: 10,
        title: 'Hello &amp; welcome',
        slug: 'hello',
        content: '<!-- wp:paragraph --><p>Hi <a href="https://www.example.com/about/">about</a>.</p><!-- /wp:paragraph -->',
        excerpt: '<p>Short &hellip; [&hellip;]</p>',
        date: '2024-05-01T10:00:00',
        modified: '2024-05-02T10:00:00Z',
        status: 'publish',
        link: 'https://www.example.com/2024/05/hello/',
        featuredImage: { node: { databaseId: 100, sourceUrl: 'https://wp.example.com/wp-content/uploads/hero.jpg', altText: 'Hero' } },
        author: { node: { databaseId: 2, name: 'Ann Author', slug: 'ann' } },
        terms: {
          category: { nodes: [term(1, 'news', 'News')] },
          post_tag: { nodes: [term(2, 'tips')] },
          genre: { nodes: [term(30, 'jazz', 'Jazz')] },
        },
        seo: RANKMATH_SEO,
        lang: 'en',
        kkStarRating: { avg: 4.5, count: 2, ratings: 9 },
      },
      {
        databaseId: 11,
        title: 'Bonjour',
        slug: 'bonjour',
        content: '<p>Salut</p>',
        status: 'draft',
        link: 'https://www.example.com/fr/bonjour/',
        lang: 'fr',
      },
    ])
    writeRaw(r, 'content/pages.json', [
      {
        databaseId: 20,
        title: 'About',
        slug: 'about',
        content: '<div class="elementor-section"><div class="elementor-widget-container"><h2>Who we are</h2></div></div>',
        status: 'private',
        link: 'https://www.example.com/about/',
        seo: YOAST_SEO,
      },
    ])
    writeRaw(r, 'content/products.json', [
      {
        databaseId: 40,
        title: 'Widget',
        slug: 'widget',
        content: '<p>A widget</p>',
        status: 'publish',
        menuOrder: 3,
        price: { regular: '19.90', sale: '15', currency: 'USD' },
        sku: 'W-1',
        gallery: [{ databaseId: 101, sourceUrl: 'https://wp.example.com/wp-content/uploads/w1.jpg', altText: 'W1' }],
        terms: { product_cat: { nodes: [term(5, 'gear', 'Gear')] }, product_tag: { nodes: [term(6, 'new')] } },
      },
    ])
    writeRaw(r, 'content/portfolio.json', [
      { databaseId: 60, title: 'Project X', slug: 'project-x', content: '<p>Case</p>', status: 'publish', link: 'https://www.example.com/portfolio/project-x/' },
    ])
    writeRaw(r, 'content/terms.json', {
      taxonomies: {
        category: { label: 'Categories', terms: [{ databaseId: 1, name: 'News', slug: 'news', description: '<p>All the news</p>', parentDatabaseId: 0, seo: RANKMATH_SEO }] },
        post_tag: { terms: [{ databaseId: 2, name: 'Tips', slug: 'tips' }] },
        product_tag: { terms: [{ databaseId: 6, name: 'New', slug: 'new' }] },
        product_cat: { terms: [{ databaseId: 5, name: 'Gear', slug: 'gear', parentDatabaseId: 0 }] },
        genre: {
          label: 'Genres',
          terms: [
            { databaseId: 30, name: 'Jazz', slug: 'jazz', parentDatabaseId: 31, seo: { openGraph: { imageUrl: 'https://wp.example.com/wp-content/uploads/jazz.jpg' } } },
            { databaseId: 31, name: 'Music', slug: 'music' },
            { databaseId: 32, name: 'Jazz FR', slug: 'jazz-fr', lang: 'fr' },
          ],
        },
      },
    })
    writeRaw(r, 'content/menus.json', [
      {
        databaseId: 7,
        name: 'Main menu',
        locations: ['primary'],
        items: [
          { databaseId: 1, parentDatabaseId: 0, label: 'Home', url: 'https://www.example.com/', order: 1 },
          { databaseId: 2, parentDatabaseId: 1, label: 'Services', url: 'https://www.example.com/services/', order: 2 },
          { databaseId: 3, parentDatabaseId: 2, label: 'Design', path: '/services/design/', order: 3 },
        ],
      },
      { databaseId: 8, name: 'Footer links', locations: ['footer_menu'], items: [{ databaseId: 4, label: 'Privacy', url: '/privacy/' }] },
      { databaseId: 9, name: 'Primary (old)', locations: [], items: [{ databaseId: 5, label: 'Old', url: '/old/' }] },
    ])
    writeRaw(r, 'content/site.json', {
      name: 'Demo Site',
      description: 'Just a demo',
      logo: { databaseId: 100, sourceUrl: 'https://wp.example.com/wp-content/uploads/hero.jpg' },
      gtmId: 'GTM-XYZ',
      homepageJsonLd: JSON.stringify({ '@graph': [{ '@type': 'Organization', name: 'Demo Org', sameAs: ['https://www.instagram.com/demo'] }] }),
    })
    writeRaw(r, 'content/comments.json', [
      { databaseId: 1, postDatabaseId: 10, postType: 'post', authorName: 'Bob', content: '<p>Nice &amp; good</p>', date: '2024-05-03T00:00:00', status: 'approved' },
      { databaseId: 2, postDatabaseId: 40, postType: 'product', authorName: 'Eve', content: 'Hmm', status: 'hold' },
      { databaseId: 3, postDatabaseId: 10, authorName: 'Bot', content: 'buy now', status: 'spam' },
      { databaseId: 4, postDatabaseId: 10, authorName: 'Gone', content: 'deleted', status: 'trash' },
      { databaseId: 5, postDatabaseId: 11, authorName: 'Fr', content: 'bonjour', status: 'approved' },
      { databaseId: 6, postDatabaseId: 20, postType: 'page', authorName: 'Pg', content: 'on a page', status: 'approved' },
    ])
    writeRaw(r, 'rest/media.json', [
      { id: 100, source_url: 'https://wp.example.com/wp-content/uploads/2024/hero.jpg', alt_text: 'Hero', mime_type: 'image/jpeg', caption: { rendered: '<p>Cap</p>' } },
      { id: 102, source_url: 'https://wp.example.com/wp-content/uploads/2024/my-photo.webp', alt_text: '' },
      { id: 103, source_url: 'https://wp.example.com/wp-content/uploads/2024/private-receipt.png', alt_text: 'x' },
    ])
    writeRaw(r, 'rest/users.json', [{ id: 2, slug: 'ann', name: 'Ann Author', description: '<p>Writes things</p>' }, { id: 3, slug: 'bo', name: 'Bo' }])
    fs.writeFileSync(path.join(r, 'denylist.json'), JSON.stringify({ media: [{ filenameStem: 'private-receipt', reason: 'private' }] }))
  }

  it('writes pages/posts/products from the unified snapshot, honouring the language filter', () => {
    const counts = normalizeRawToStaged(cfg)
    assert.equal(counts.posts, 2, 'hello + project-x (default cpt target); bonjour skipped')
    assert.equal(counts.pages, 1)
    assert.equal(counts.products, 1)

    const post = readStaged<Record<string, any>>(root, 'posts/hello.json')
    assert.equal(post.collection, 'posts')
    assert.equal(post.title, 'Hello & welcome')
    assert.equal(post.contentMd, 'Hi [about](/about/).')
    assert.equal(post.excerpt, 'A RankMath description', 'auto-truncated excerpt falls back to the SEO description')
    assert.equal(post.status, 'published')
    assert.equal(post.date, '2024-05-01T10:00:00+00:00')
    assert.equal(post.modified, '2024-05-02T10:00:00Z')
    assert.equal(post.sourcePath, '/2024/05/hello/')
    assert.equal(post.lang, 'en')
    assert.equal(post.authorSlug, 'ann')
    assert.deepEqual(post.categories, [{ slug: 'news', name: 'News', wpId: 1 }])
    assert.deepEqual(post.tags, [{ slug: 'tips', name: 'tips', wpId: 2 }])
    assert.deepEqual(post.customTerms, [{ slug: 'jazz', name: 'Jazz', wpId: 30, taxonomy: 'genre' }])
    assert.equal(post.featuredImage.wpId, 100)
    assert.equal(post.openGraphImage.sourceUrl, 'https://wp.example.com/wp-content/uploads/og.jpg')
    assert.deepEqual(post.kkStarRating, { avg: 4.5, count: 2, ratings: 9 })
    assert.deepEqual(post.wp, { databaseId: 10 })

    // RankMath-shaped SEO
    assert.equal(post.seo.title, 'Hello & welcome')
    assert.equal(post.seo.canonicalOverride, 'https://new.example.org/2024/05/hello/')
    assert.deepEqual(post.seo.robots, ['index', 'follow', 'max-snippet:-1', 'max-image-preview:large'])
    assert.equal(post.seo.openGraph.url, 'https://new.example.org/2024/05/hello/')
    assert.deepEqual(post.seo.openGraph.twitterMeta, { card: 'summary_large_image', title: 'Tw title' })

    const page = readStaged<Record<string, any>>(root, 'pages/about.json')
    assert.equal(page.contentMd, '## Who we are')
    assert.equal(page.status, 'draft')
    assert.equal(page.wpStatus, 'private')
    // Yoast-shaped SEO: http scheme kept, host rewritten, og image from openGraph.imageUrl
    assert.equal(page.seo.canonicalOverride, 'http://new.example.org/about/')
    assert.deepEqual(page.seo.robots, ['noindex', 'nofollow'])
    assert.equal(page.openGraphImage.sourceUrl, 'https://wp.example.com/wp-content/uploads/about-og.png')

    const product = readStaged<Record<string, any>>(root, 'products/widget.json')
    assert.deepEqual(product.price, { regular: 19.9, sale: 15, currency: 'USD' })
    assert.equal(product.sku, 'W-1')
    assert.equal(product.menuOrder, 3)
    assert.equal(product.gallery.length, 1)
    assert.deepEqual(product.categories.map((c: { slug: string }) => c.slug), ['gear'])
    assert.deepEqual(product.tags.map((c: { slug: string }) => c.slug), ['new'])

    assert.deepEqual(stagedFiles(root, 'posts'), ['hello.json', 'project-x.json'])
  })

  it('records skipped translations outside the site language', () => {
    normalizeRawToStaged(cfg)
    const skipped = readStaged<Array<Record<string, unknown>>>(root, '_skipped-translations.json')
    assert.deepEqual(skipped.map((s) => `${s.collection}:${s.slug}:${s.lang}`).sort(), [
      'posts:bonjour:fr',
      'taxonomies:jazz-fr:fr',
    ])
    assert.deepEqual(stagedFiles(root, 'taxonomies').filter((f) => f.includes('jazz-fr')), [])
  })

  it('fails loudly when --lang matches none of the language-tagged content', () => {
    const wrongLang = { ...cfg, language: 'vi' as const }
    assert.throws(() => normalizeRawToStaged(wrongLang), /pass --lang/)
  })

  it('maps custom post types to the requested staged collection', () => {
    normalizeRawToStaged(cfg, undefined, { cptMap: { portfolio: 'products' } })
    assert.deepEqual(stagedFiles(root, 'products'), ['project-x.json', 'widget.json'])
    assert.deepEqual(stagedFiles(root, 'posts'), ['hello.json'])
    assert.equal(readStaged<{ slug: string }>(root, 'products/project-x.json').slug, 'project-x')
    assert.throws(() => normalizeRawToStaged(cfg, undefined, { cptMap: { posts: 'pages' } }), /built-in/)
    assert.throws(
      () => normalizeRawToStaged(cfg, undefined, { cptMap: { portfolio: 'media' as 'posts' } }),
      /must be posts, pages or products/,
    )
  })

  it('writes every taxonomy (core + custom) with collision-free filenames', () => {
    normalizeRawToStaged(cfg)
    assert.deepEqual(stagedFiles(root, 'taxonomies'), [
      'category--category--news.json',
      'custom--genre--jazz.json',
      'custom--genre--music.json',
      'product-category--product_cat--gear.json',
      'tag--post_tag--tips.json',
      'tag--product_tag--new.json',
    ])
    const news = readStaged<Record<string, any>>(root, 'taxonomies/category--category--news.json')
    assert.equal(news.type, 'category')
    assert.equal(news.description, 'All the news')
    assert.equal(news.parentWpId, null)
    assert.deepEqual(news.wp, { databaseId: 1, taxonomy: 'category' })
    assert.equal(news.seo.canonicalOverride, 'https://new.example.org/2024/05/hello/')
    assert.equal(news.openGraphImage.sourceUrl, 'https://wp.example.com/wp-content/uploads/og.jpg')
    const jazz = readStaged<Record<string, any>>(root, 'taxonomies/custom--genre--jazz.json')
    assert.equal(jazz.type, 'custom')
    assert.equal(jazz.parentWpId, 31)
    assert.deepEqual(jazz.wp, { databaseId: 30, taxonomy: 'genre' })
    assert.equal(jazz.openGraphImage.sourceUrl, 'https://wp.example.com/wp-content/uploads/jazz.jpg')
  })

  it('stages authors from content nodes and rest/users.json', () => {
    normalizeRawToStaged(cfg)
    assert.deepEqual(stagedFiles(root, 'authors'), ['ann.json', 'bo.json'])
    const ann = readStaged<Record<string, any>>(root, 'authors/ann.json')
    assert.equal(ann.bio, 'Writes things')
    assert.deepEqual(ann.wp, { databaseId: 2 })
  })

  it('stages media, reports alt fallbacks and skips denylisted attachments', () => {
    normalizeRawToStaged(cfg)
    assert.deepEqual(stagedFiles(root, 'media'), ['100-hero.json', '102-my-photo.json'])
    const photo = readStaged<Record<string, any>>(root, 'media/102-my-photo.json')
    assert.equal(photo.alt, 'My photo')
    assert.equal(photo.localPath, 'wp-content/uploads/2024/my-photo.webp')
    const hero = readStaged<Record<string, any>>(root, 'media/100-hero.json')
    assert.equal(hero.caption, 'Cap')
    const report = fs.readFileSync(path.join(root, 'staged', 'media-alt-fallback-report.md'), 'utf-8')
    assert.match(report, /my-photo\.webp/)
  })

  it('stages menus as trees by location; a second menu for the same location goes to a dot-prefixed file', () => {
    normalizeRawToStaged(cfg)
    assert.deepEqual(stagedFiles(root, 'menus'), ['.unmapped-Primary_old_.json', 'FOOTER_MENU.json', 'PRIMARY.json'])
    const primary = readStaged<Record<string, any>>(root, 'menus/PRIMARY.json')
    assert.equal(primary.location, 'PRIMARY')
    assert.deepEqual(primary.wp, { databaseId: 7, name: 'Main menu', location: 'primary' })
    assert.equal(primary.tree[0].label, 'Home')
    assert.equal(primary.tree[0].url, '/')
    assert.equal(primary.tree[0].children[0].children[0].label, 'Design')
    assert.equal(primary.tree[0].children[0].children[0].url, '/services/design/')
    const unmapped = stagedFiles(root, 'menus').filter((f) => f.startsWith('.unmapped-'))
    assert.equal(unmapped.length, 1)
    assert.equal(readStaged<Record<string, any>>(root, `menus/${unmapped[0]}`).wp.databaseId, 9)
    assert.equal(readStaged<Record<string, any>>(root, 'menus/FOOTER_MENU.json').wp.databaseId, 8)
  })

  it('stages the site config and comments (status map, target lookup, skipped targets)', () => {
    normalizeRawToStaged(cfg)
    const site = readStaged<Record<string, any>>(root, 'site/site-config.json')
    assert.equal(site.name, 'Demo Site')
    assert.equal(site.integration.gtmId, 'GTM-XYZ')
    assert.equal(site.knowledgeGraph.name, 'Demo Org')
    assert.deepEqual(site.socialProfiles, [{ platform: 'Instagram', url: 'https://www.instagram.com/demo' }])

    assert.deepEqual(stagedFiles(root, 'comments'), ['1.json', '2.json', '3.json'])
    const c1 = readStaged<Record<string, any>>(root, 'comments/1.json')
    assert.equal(c1.content, 'Nice & good')
    assert.equal(c1.status, 'approved')
    assert.deepEqual(c1.target, { type: 'post', slug: 'hello', wpId: 10 })
    assert.equal(readStaged<Record<string, any>>(root, 'comments/2.json').status, 'pending')
    assert.deepEqual(readStaged<Record<string, any>>(root, 'comments/2.json').target, { type: 'product', slug: 'widget', wpId: 40 })
    assert.equal(readStaged<Record<string, any>>(root, 'comments/3.json').status, 'spam')
  })

  it('creates an empty faqs directory and does not generate redirects', () => {
    normalizeRawToStaged(cfg)
    assert.deepEqual(stagedFiles(root, 'faqs'), [])
    assert.equal(fs.existsSync(path.join(root, 'staged', 'redirects')), false)
  })

  it('honours `only` and applies WP_UTC_OFFSET to site-local dates', () => {
    process.env.WP_UTC_OFFSET = '+07:00'
    const counts = normalizeRawToStaged(cfg, new Set(['posts']))
    assert.deepEqual(Object.keys(counts), ['posts'])
    assert.equal(readStaged<{ date: string }>(root, 'posts/hello.json').date, '2024-05-01T10:00:00+07:00')
    assert.equal(fs.existsSync(path.join(root, 'staged', 'pages')), false)
  })

  it('suffixes a colliding file name instead of overwriting', () => {
    const pages = JSON.parse(fs.readFileSync(path.join(root, 'raw/content/pages.json'), 'utf-8'))
    pages.push({ databaseId: 21, title: 'About (child)', slug: 'about', content: '<p>x</p>', parentDatabaseId: 20 })
    writeRaw(root, 'content/pages.json', pages)
    normalizeRawToStaged(cfg, new Set(['pages']))
    assert.deepEqual(stagedFiles(root, 'pages'), ['about--21.json', 'about.json'])
  })
})
