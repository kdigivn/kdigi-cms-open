/**
 * Unit tests for JSON-LD builder functions and graph assembler.
 *
 * Tests verify: correct @type, @id patterns, cross-reference @ids,
 * conditional node inclusion, and @graph envelope shape.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { buildImageObject } from './image-object'
import { buildWebSite } from './website'
import { buildOrganization } from './organization'
import { buildPerson } from './person'
import { buildBreadcrumbList } from './breadcrumb-list'
import { buildWebPage } from './webpage'
import { buildBlogPosting } from './article'
import { buildProduct } from './product'
import { buildFaqPage } from './faq-page'
import { serializeJsonLd } from './serialize'
import {
  assemblePostGraph,
  assemblePageGraph,
  assembleProductGraph,
  assembleTaxonomyGraph,
} from './graph-assembler'
import type { SiteJsonLdConfig } from './site-config-loader'

// ── Shared test fixture ───────────────────────────────────────────────────────

const SITE: SiteJsonLdConfig = {
  siteUrl: 'https://example.com',
  orgName: 'Example Site',
  logoUrl: 'https://cdn.example.com/logo.png',
  logoWidth: 512,
  logoHeight: 512,
  sameAs: ['https://www.facebook.com/example'],
  telephone: '+84-924-299-898',
  address: { streetAddress: 'Số 5 Trần Văn Hoài', addressCountry: 'VN' },
  lang: 'vi',
  additionalTypes: ['TravelAgency'],
  defaultOgImageUrl: null,
}

// ── ImageObject ───────────────────────────────────────────────────────────────

describe('buildImageObject', () => {
  it('sets @type, @id, and url to the image URL', () => {
    const node = buildImageObject({ url: 'https://cdn.example.com/photo.webp', caption: 'A photo' })
    assert.equal(node['@type'], 'ImageObject')
    assert.equal(node['@id'], 'https://cdn.example.com/photo.webp')
    assert.equal(node['url'], 'https://cdn.example.com/photo.webp')
    assert.equal(node['caption'], 'A photo')
    assert.equal(node['inLanguage'], 'vi')
  })

  it('omits width/height when not provided', () => {
    const node = buildImageObject({ url: 'https://cdn.example.com/photo.webp' })
    assert.equal(node['width'], undefined)
    assert.equal(node['height'], undefined)
  })

  it('includes width and height as integers when provided', () => {
    const node = buildImageObject({ url: 'https://cdn.example.com/photo.webp', width: 1920, height: 1080 })
    assert.equal(node['width'], 1920)
    assert.equal(node['height'], 1080)
  })
})

// ── WebSite ───────────────────────────────────────────────────────────────────

describe('buildWebSite', () => {
  it('uses /#website @id anchor', () => {
    const node = buildWebSite({
      name: 'Test Site',
      url: 'https://example.com',
      organizationId: 'https://example.com/#organization',
    })
    assert.equal(node['@id'], 'https://example.com/#website')
    assert.equal(node['@type'], 'WebSite')
    assert.deepEqual(node['publisher'], { '@id': 'https://example.com/#organization' })
  })
})

// ── Organization ─────────────────────────────────────────────────────────────

describe('buildOrganization', () => {
  it('emits TravelAgency + Organization type array', () => {
    const node = buildOrganization({
      name: 'Test Org',
      siteUrl: 'https://example.com',
      additionalTypes: ['TravelAgency'],
    })
    assert.deepEqual(node['@type'], ['TravelAgency', 'Organization'])
    assert.equal(node['@id'], 'https://example.com/#organization')
  })

  it('emits plain Organization when no additionalTypes', () => {
    const node = buildOrganization({ name: 'Test Org', siteUrl: 'https://example.com' })
    assert.equal(node['@type'], 'Organization')
  })

  it('includes logo with #logo @id anchor', () => {
    const node = buildOrganization({
      name: 'Test Org',
      siteUrl: 'https://example.com',
      logoUrl: 'https://cdn.example.com/logo.png',
    })
    const logo = node['logo'] as Record<string, unknown>
    assert.equal(logo['@id'], 'https://example.com/#logo')
    assert.equal(logo['url'], 'https://cdn.example.com/logo.png')
  })

  it('omits empty contactPoint.availableLanguage array', () => {
    const node = buildOrganization({
      name: 'Test Org',
      siteUrl: 'https://example.com',
      contactPoint: {
        telephone: '0924299898',
        contactType: 'customer service',
        availableLanguage: [],
      },
    })
    const cp = node['contactPoint'] as Record<string, unknown>
    assert.equal('availableLanguage' in cp, false)
    assert.equal(cp['telephone'], '0924299898')
  })

  it('keeps a non-empty contactPoint.availableLanguage array', () => {
    const node = buildOrganization({
      name: 'Test Org',
      siteUrl: 'https://example.com',
      contactPoint: { telephone: '0924299898', availableLanguage: ['vi'] },
    })
    const cp = node['contactPoint'] as Record<string, unknown>
    assert.deepEqual(cp['availableLanguage'], ['vi'])
  })

  it('emits a GeoCoordinates node when geo is provided', () => {
    const node = buildOrganization({
      name: 'Test Org',
      siteUrl: 'https://example.com',
      geo: { latitude: 10.2899, longitude: 103.984 },
    })
    const geo = node['geo'] as Record<string, unknown>
    assert.equal(geo['@type'], 'GeoCoordinates')
    assert.equal(geo['latitude'], 10.2899)
    assert.equal(geo['longitude'], 103.984)
  })

  it('omits geo when not provided', () => {
    const node = buildOrganization({ name: 'Test Org', siteUrl: 'https://example.com' })
    assert.equal(node['geo'], undefined)
  })

  it('emits openingHoursSpecification nodes when provided', () => {
    const node = buildOrganization({
      name: 'Test Org',
      siteUrl: 'https://example.com',
      openingHoursSpecification: [
        {
          dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
          opens: '08:00',
          closes: '17:30',
        },
      ],
    })
    assert.equal(node['openingHours'], undefined)
    assert.deepEqual(node['openingHoursSpecification'], [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        opens: '08:00',
        closes: '17:30',
      },
    ])
  })

  it('emits sameAs when provided', () => {
    const node = buildOrganization({
      name: 'Test Org',
      siteUrl: 'https://example.com',
      sameAs: ['https://facebook.com/test', 'https://tiktok.com/@test'],
    })
    assert.deepEqual(node['sameAs'], ['https://facebook.com/test', 'https://tiktok.com/@test'])
  })

  it('@id uses /#organization anchor — same formula as frontend org-schema @id', () => {
    // The frontend mapKnowledgeGraph emits @id = `${siteUrl}/#organization`.
    // buildOrganization must use the same formula so both entities deduplicate.
    const SITE_URL = 'https://example.org'
    const node = buildOrganization({
      name: 'Example Org',
      siteUrl: SITE_URL,
      additionalTypes: ['TravelAgency'],
    })
    assert.equal(node['@id'], `${SITE_URL}/#organization`)
  })
})

// ── Organization @graph — exactly one Org node (dedupe guard) ─────────────────

describe('assemblePostGraph/assemblePageGraph/assembleProductGraph — one Organization', () => {
  it('post graph has exactly one Organization node', () => {
    const graph = assemblePostGraph({
      slug: 'test-post',
      title: 'Test Post',
      site: SITE,
    })
    const nodes = graph['@graph'] as Array<Record<string, unknown>>
    const orgNodes = nodes.filter((n) => {
      const t = n['@type']
      return t === 'Organization' || (Array.isArray(t) && t.includes('Organization'))
    })
    assert.equal(orgNodes.length, 1, 'exactly one Organization node in post @graph')
    // @id must be stable
    assert.equal(orgNodes[0]['@id'], `${SITE.siteUrl}/#organization`)
  })

  it('page graph has exactly one Organization node', () => {
    const graph = assemblePageGraph({
      slug: 'test-page',
      title: 'Test Page',
      site: SITE,
    })
    const nodes = graph['@graph'] as Array<Record<string, unknown>>
    const orgNodes = nodes.filter((n) => {
      const t = n['@type']
      return t === 'Organization' || (Array.isArray(t) && t.includes('Organization'))
    })
    assert.equal(orgNodes.length, 1, 'exactly one Organization node in page @graph')
    assert.equal(orgNodes[0]['@id'], `${SITE.siteUrl}/#organization`)
  })

  it('product graph has exactly one Organization node', () => {
    const graph = assembleProductGraph({
      slug: 'product/test',
      title: 'Test Product',
      price: 100000,
      site: SITE,
    })
    const nodes = graph['@graph'] as Array<Record<string, unknown>>
    const orgNodes = nodes.filter((n) => {
      const t = n['@type']
      return t === 'Organization' || (Array.isArray(t) && t.includes('Organization'))
    })
    assert.equal(orgNodes.length, 1, 'exactly one Organization node in product @graph')
    assert.equal(orgNodes[0]['@id'], `${SITE.siteUrl}/#organization`)
  })
})

// ── Person ────────────────────────────────────────────────────────────────────

describe('buildPerson', () => {
  it('uses page URL + #author @id', () => {
    const node = buildPerson({
      name: 'CTV',
      pageUrl: 'https://example.com/bai-sao-phu-quoc/',
      organizationId: 'https://example.com/#organization',
    })
    assert.equal(node['@type'], 'Person')
    assert.equal(node['@id'], 'https://example.com/bai-sao-phu-quoc/#author')
    assert.equal(node['name'], 'CTV')
    assert.deepEqual(node['worksFor'], { '@id': 'https://example.com/#organization' })
  })
})

// ── BreadcrumbList ────────────────────────────────────────────────────────────

describe('buildBreadcrumbList', () => {
  it('returns null for empty breadcrumbs', () => {
    assert.equal(buildBreadcrumbList([], 'https://example.com'), null)
  })

  it('builds itemListElement with integer positions', () => {
    const node = buildBreadcrumbList(
      [{ url: '/', text: 'Trang chủ' }, { url: '/bai-sao/', text: 'Bãi Sao' }],
      'https://example.com',
      'https://example.com/bai-sao/',
    )
    assert.ok(node)
    assert.equal(node['@type'], 'BreadcrumbList')
    assert.equal(node['@id'], 'https://example.com/bai-sao/#breadcrumb')
    const items = node['itemListElement'] as Array<Record<string, unknown>>
    assert.equal(items[0]['position'], 1)
    assert.equal(items[1]['position'], 2)
    // Relative URLs get baseUrl prepended
    const item0 = items[0]['item'] as Record<string, unknown>
    assert.equal(item0['@id'], 'https://example.com/')
  })

  it('keeps absolute URLs as-is', () => {
    const node = buildBreadcrumbList(
      [{ url: 'https://example.com/', text: 'Home' }],
      'https://example.com',
    )
    const items = node!['itemListElement'] as Array<Record<string, unknown>>
    const item = items[0]['item'] as Record<string, unknown>
    assert.equal(item['@id'], 'https://example.com/')
  })

  it('collapses consecutive items pointing to the same URL (no circular homepage breadcrumb)', () => {
    const node = buildBreadcrumbList(
      [
        { url: '/', text: 'Trang chủ' },
        { url: '/', text: 'Example Site' },
      ],
      'https://example.com',
    )
    const items = node!['itemListElement'] as Array<Record<string, unknown>>
    assert.equal(items.length, 1)
    assert.equal(items[0]['position'], 1)
    assert.equal(
      (items[0]['item'] as Record<string, unknown>)['@id'],
      'https://example.com/',
    )
  })
})

// ── WebPage ───────────────────────────────────────────────────────────────────

describe('buildWebPage', () => {
  it('uses pageUrl + #webpage @id and cross-refs websiteId', () => {
    const node = buildWebPage({
      pageUrl: 'https://example.com/chinh-sach-bao-mat/',
      name: 'Chính sách bảo mật',
      websiteId: 'https://example.com/#website',
    })
    assert.equal(node['@type'], 'WebPage')
    assert.equal(node['@id'], 'https://example.com/chinh-sach-bao-mat/#webpage')
    assert.deepEqual(node['isPartOf'], { '@id': 'https://example.com/#website' })
  })

  it('uses ItemPage type when specified', () => {
    const node = buildWebPage({
      pageUrl: 'https://example.com/product/ve-tau/',
      name: 'Vé sản phẩm',
      websiteId: 'https://example.com/#website',
      pageType: 'ItemPage',
    })
    assert.equal(node['@type'], 'ItemPage')
  })

  it('cross-refs imageId via primaryImageOfPage', () => {
    const node = buildWebPage({
      pageUrl: 'https://example.com/bai-sao/',
      name: 'Bãi Sao',
      websiteId: 'https://example.com/#website',
      imageId: 'https://cdn.example.com/bai-sao.webp',
    })
    assert.deepEqual(node['primaryImageOfPage'], { '@id': 'https://cdn.example.com/bai-sao.webp' })
  })
})

// ── BlogPosting ───────────────────────────────────────────────────────────────

describe('buildBlogPosting', () => {
  it('emits BlogPosting (not Article)', () => {
    const node = buildBlogPosting({
      pageUrl: 'https://example.com/bai-sao-phu-quoc/',
      title: 'Bãi Sao Phú Quốc',
      organizationId: 'https://example.com/#organization',
    })
    assert.equal(node['@type'], 'BlogPosting')
  })

  it('cross-refs author by @id', () => {
    const node = buildBlogPosting({
      pageUrl: 'https://example.com/bai-sao-phu-quoc/',
      title: 'Bãi Sao Phú Quốc',
      organizationId: 'https://example.com/#organization',
      authorId: 'https://example.com/bai-sao-phu-quoc/#author',
    })
    const author = node['author'] as Record<string, unknown>
    assert.equal(author['@id'], 'https://example.com/bai-sao-phu-quoc/#author')
  })

  it('cross-refs webpage via isPartOf and mainEntityOfPage', () => {
    const node = buildBlogPosting({
      pageUrl: 'https://example.com/bai-sao/',
      title: 'Bãi Sao',
      organizationId: 'https://example.com/#organization',
    })
    assert.deepEqual(node['isPartOf'], { '@id': 'https://example.com/bai-sao/#webpage' })
    assert.deepEqual(node['mainEntityOfPage'], { '@id': 'https://example.com/bai-sao/#webpage' })
  })
})

// ── Product ───────────────────────────────────────────────────────────────────

describe('buildProduct', () => {
  it('includes aggregateRating when avg and count are present and pass threshold', () => {
    // ratingCount=23 >= MIN_REVIEWS_FOR_AGGREGATE (10) and ratingAvg=4.9 < 5
    const node = buildProduct({
      pageUrl: 'https://example.com/product/ve-tau/',
      name: 'Vé sản phẩm Hà Tiên',
      ratingAvg: 4.9,
      ratingCount: 23,
      commentCount: 23,
      webpageId: 'https://example.com/product/ve-tau/#webpage',
    })
    const ar = node['aggregateRating'] as Record<string, unknown>
    assert.equal(ar['@type'], 'AggregateRating')
    assert.equal(ar['ratingValue'], 4.9)
    assert.equal(ar['reviewCount'], 23)
  })

  it('omits aggregateRating when count is missing', () => {
    const node = buildProduct({
      pageUrl: 'https://example.com/product/ve-tau/',
      name: 'Vé sản phẩm Hà Tiên',
      webpageId: 'https://example.com/product/ve-tau/#webpage',
    })
    assert.equal(node['aggregateRating'], undefined)
  })

  it('omits aggregateRating when ratingCount=5 (below MIN_REVIEWS_FOR_AGGREGATE=10)', () => {
    // Below threshold: 5 < 10, no aggregateRating regardless of ratingAvg
    const node = buildProduct({
      pageUrl: 'https://example.com/product/ve-tau/',
      name: 'Vé sản phẩm Hà Tiên',
      ratingAvg: 4.5,
      ratingCount: 5,
      commentCount: 5,
      webpageId: 'https://example.com/product/ve-tau/#webpage',
    })
    assert.equal(node['aggregateRating'], undefined)
    assert.equal(node['review'], undefined, 'an aggregate average is not a single review record')
  })

  it('emits aggregateRating when ratingCount=10 (at MIN_REVIEWS_FOR_AGGREGATE threshold)', () => {
    // At threshold: 10 >= 10 and ratingAvg=4.5 < 5
    const node = buildProduct({
      pageUrl: 'https://example.com/product/ve-tau/',
      name: 'Vé sản phẩm Hà Tiên',
      ratingAvg: 4.5,
      ratingCount: 10,
      commentCount: 10,
      webpageId: 'https://example.com/product/ve-tau/#webpage',
    })
    const ar = node['aggregateRating'] as Record<string, unknown>
    assert.equal(ar['@type'], 'AggregateRating')
    assert.equal(ar['ratingValue'], 4.5)
    assert.equal(ar['reviewCount'], 10)
  })

  it('omits aggregateRating when ratingAvg=5.0 (perfect score is suspicious)', () => {
    // Perfect score: ratingAvg=5.0 triggers the < 5 gate failure
    const node = buildProduct({
      pageUrl: 'https://example.com/product/ve-tau/',
      name: 'Vé sản phẩm Hà Tiên',
      ratingAvg: 5.0,
      ratingCount: 10,
      webpageId: 'https://example.com/product/ve-tau/#webpage',
    })
    assert.equal(node['aggregateRating'], undefined)
  })

  it('emits aggregateRating when aggregateRatingOverride=true regardless of threshold', () => {
    // Admin override bypasses the threshold check
    const node = buildProduct({
      pageUrl: 'https://example.com/product/ve-tau/',
      name: 'Vé sản phẩm Hà Tiên',
      ratingAvg: 4.0,
      ratingCount: 3, // below threshold
      webpageId: 'https://example.com/product/ve-tau/#webpage',
      aggregateRatingOverride: true,
    })
    const ar = node['aggregateRating'] as Record<string, unknown>
    assert.equal(ar['@type'], 'AggregateRating')
    assert.equal(ar['ratingValue'], 4.0)
    assert.equal(ar['reviewCount'], 3)
  })

  it('respects custom minReviewsForAggregate from input', () => {
    // Custom threshold of 5 instead of default 10
    const node = buildProduct({
      pageUrl: 'https://example.com/product/ve-tau/',
      name: 'Vé sản phẩm Hà Tiên',
      ratingAvg: 4.5,
      ratingCount: 7,
      commentCount: 7,
      webpageId: 'https://example.com/product/ve-tau/#webpage',
      minReviewsForAggregate: 5,
    })
    const ar = node['aggregateRating'] as Record<string, unknown>
    assert.equal(ar['@type'], 'AggregateRating')
    assert.equal(ar['ratingValue'], 4.5)
    assert.equal(ar['reviewCount'], 7)
  })

  it('emits offers with price, priceCurrency VND, and availability InStock', () => {
    const node = buildProduct({
      pageUrl: 'https://example.com/product/ve-tau/',
      name: 'Vé sản phẩm Hà Tiên',
      price: 150000,
      webpageId: 'https://example.com/product/ve-tau/#webpage',
    })
    const offers = node['offers'] as Record<string, unknown>
    assert.equal(offers['@type'], 'Offer')
    assert.equal(offers['price'], 150000)
    assert.equal(offers['priceCurrency'], 'VND')
    assert.equal(offers['availability'], 'https://schema.org/InStock')
  })

  it('uses the product price currency for offers.priceCurrency', () => {
    const node = buildProduct({
      pageUrl: 'https://example.com/product/widget/',
      name: 'Widget',
      price: 25,
      priceCurrency: 'USD',
      webpageId: 'https://example.com/product/widget/#webpage',
    })
    assert.equal((node['offers'] as Record<string, unknown>)['priceCurrency'], 'USD')
  })

  it('does not infer a no-return policy from a policy URL alone', () => {
    const node = buildProduct({
      pageUrl: 'https://example.com/product/ve-tau/',
      name: 'Vé sản phẩm Côn Đảo',
      price: 150000,
      returnPolicyUrl: 'https://example.com/quy-dinh-hoan-ve-doi-ve/',
      webpageId: 'https://example.com/product/ve-tau/#webpage',
    })
    const offers = node['offers'] as Record<string, unknown>
    assert.equal(offers['hasMerchantReturnPolicy'], undefined)
    assert.equal(JSON.stringify(node).includes('MerchantReturnNotPermitted'), false)
  })

  it('omits offers when price is undefined (data gap surfaced by hook warn, not a throw)', () => {
    // Production behavior: generate-jsonld.ts warns and passes price:undefined.
    // buildProduct must silently omit offers — never throw — so saves always complete.
    const node = buildProduct({
      pageUrl: 'https://example.com/product/ve-tau/',
      name: 'Vé sản phẩm Hà Tiên',
      webpageId: 'https://example.com/product/ve-tau/#webpage',
      // price intentionally omitted
    })
    assert.equal(node['offers'], undefined)
  })

  it('omits offers when price is 0 (zero is not a valid price — importer/mis-key guard)', () => {
    // currentPrice: 0 can slip in from the schema (min:0 allows it but it is not
    // a real ticket price). The hook treats price<=0 as invalid and passes undefined.
    // buildProduct must also guard against 0 so it never emits a "free ticket" offer.
    const node = buildProduct({
      pageUrl: 'https://example.com/product/ve-tau/',
      name: 'Vé sản phẩm Hà Tiên',
      price: 0,
      webpageId: 'https://example.com/product/ve-tau/#webpage',
    })
    assert.equal(node['offers'], undefined)
  })
})

// ── assembleProductGraph — offers integration ─────────────────────────────────

describe('assembleProductGraph — offers', () => {
  it('product graph Product node carries offers when price provided', () => {
    const graph = assembleProductGraph({
      slug: 'product/ve-tau-ha-tien-phu-quoc',
      title: 'Vé sản phẩm Hà Tiên Phú Quốc',
      price: 150000,
      site: SITE,
    })
    const nodes = graph['@graph'] as Array<Record<string, unknown>>
    const product = nodes.find((n) => n['@type'] === 'Product') as Record<string, unknown>
    assert.ok(product, 'Product node missing')
    const offers = product['offers'] as Record<string, unknown>
    assert.ok(offers, 'offers block missing from Product node')
    assert.equal(offers['price'], 150000)
    assert.equal(offers['priceCurrency'], 'VND')
    assert.equal(offers['availability'], 'https://schema.org/InStock')
  })

  it('product graph has exactly one Product node', () => {
    const graph = assembleProductGraph({
      slug: 'product/ve-tau',
      title: 'Vé sản phẩm',
      price: 100000,
      site: SITE,
    })
    const nodes = graph['@graph'] as Array<Record<string, unknown>>
    const productNodes = nodes.filter((n) => n['@type'] === 'Product')
    assert.equal(productNodes.length, 1, 'exactly one Product node required')
  })

  it('product graph Product node has no offers when price is 0 (zero-price guard)', () => {
    // Hook passes price:undefined when currentPrice<=0 — assembler must also not
    // emit offers if price:0 slips through (double guard via buildProduct).
    const graph = assembleProductGraph({
      slug: 'product/ve-tau',
      title: 'Vé sản phẩm',
      price: 0,
      site: SITE,
    })
    const nodes = graph['@graph'] as Array<Record<string, unknown>>
    const product = nodes.find((n) => n['@type'] === 'Product') as Record<string, unknown>
    assert.equal(product['offers'], undefined, 'price:0 must not emit offers')
  })

  it('product graph has at most one FAQPage node', () => {
    const graph = assembleProductGraph({
      slug: 'product/ve-tau',
      title: 'Vé sản phẩm',
      price: 100000,
      faqs: [
        { question: 'Tàu mấy giờ?', answer: '7:00.' },
        { question: 'Giá vé?', answer: '150.000 VNĐ.' },
      ],
      site: SITE,
    })
    const nodes = graph['@graph'] as Array<Record<string, unknown>>
    const faqNodes = nodes.filter((n) => n['@type'] === 'FAQPage')
    assert.ok(faqNodes.length <= 1, 'at most one FAQPage node allowed')
  })
})

// ── FAQPage ───────────────────────────────────────────────────────────────────

describe('buildFaqPage', () => {
  it('returns null for empty faqs', () => {
    assert.equal(buildFaqPage([]), null)
  })

  it('maps question/answer to Question/Answer schema', () => {
    const node = buildFaqPage([{ question: 'Q?', answer: 'A.' }])
    assert.ok(node)
    const entities = node['mainEntity'] as Array<Record<string, unknown>>
    assert.equal(entities[0]['@type'], 'Question')
    assert.equal(entities[0]['name'], 'Q?')
    const ans = entities[0]['acceptedAnswer'] as Record<string, unknown>
    assert.equal(ans['text'], 'A.')
  })

  it('drops an item missing question or answer, keeps the valid one', () => {
    const node = buildFaqPage([
      { question: 'An toàn không?', answer: 'Có.' },
      { question: 'Mất name' }, // orphan — no answer
      { answer: 'Mất question' }, // orphan — no question
    ])
    assert.ok(node)
    const entities = node['mainEntity'] as Array<Record<string, unknown>>
    assert.equal(entities.length, 1)
    assert.equal(entities[0]['name'], 'An toàn không?')
  })

  it('treats blank/whitespace question or answer as orphan', () => {
    const node = buildFaqPage([
      { question: '  ', answer: 'A' },
      { question: 'Q', answer: '' },
    ])
    assert.equal(node, null)
  })

  it('returns null when every item is incomplete', () => {
    assert.equal(buildFaqPage([{ question: 'Q only' }]), null)
  })
})

// ── serializeJsonLd (XSS escape) ────────────────────────────────────────────────

describe('serializeJsonLd', () => {
  it('escapes "<" so "</script>" cannot break out of the script tag', () => {
    const out = serializeJsonLd({ headline: '</script><img src=x onerror=alert(1)>' })
    assert.ok(!out.includes('</'), 'raw "</" must not appear in serialized output')
    assert.ok(out.includes('\\u003c'), 'must encode "<" as \\u003c')
  })

  it('round-trips back to the original value (valid JSON)', () => {
    const value = { headline: 'a < b </script>' }
    assert.deepEqual(JSON.parse(serializeJsonLd(value)), value)
  })
})

// ── Graph assembler ───────────────────────────────────────────────────────────

describe('assemblePostGraph', () => {
  it('wraps in @context/@graph envelope', () => {
    const graph = assemblePostGraph({
      slug: 'bai-sao-phu-quoc',
      title: 'Bãi Sao Phú Quốc',
      site: SITE,
    })
    assert.equal(graph['@context'], 'https://schema.org')
    assert.ok(Array.isArray(graph['@graph']))
  })

  it('includes BlogPosting, WebPage, WebSite, and Organization nodes', () => {
    const graph = assemblePostGraph({
      slug: 'bai-sao-phu-quoc',
      title: 'Bãi Sao Phú Quốc',
      site: SITE,
    })
    const nodes = graph['@graph'] as Array<Record<string, unknown>>
    const types = nodes.map((n) => n['@type'])
    assert.ok(types.includes('BlogPosting'), 'BlogPosting missing')
    assert.ok(types.includes('WebPage'), 'WebPage missing')
    assert.ok(types.includes('WebSite'), 'WebSite missing')
    assert.ok(
      types.some((t) => Array.isArray(t) && t.includes('Organization')),
      'Organization missing',
    )
  })

  it('includes ImageObject and Person when imageUrl and authorName provided', () => {
    const graph = assemblePostGraph({
      slug: 'bai-sao-phu-quoc',
      title: 'Bãi Sao Phú Quốc',
      imageUrl: 'https://cdn.example.com/bai-sao.webp',
      authorName: 'CTV',
      site: SITE,
    })
    const nodes = graph['@graph'] as Array<Record<string, unknown>>
    const types = nodes.map((n) => n['@type'])
    assert.ok(types.includes('ImageObject'), 'ImageObject missing')
    assert.ok(types.includes('Person'), 'Person missing')
  })

  it('includes BreadcrumbList when breadcrumbs provided', () => {
    const graph = assemblePostGraph({
      slug: 'bai-sao-phu-quoc',
      title: 'Bãi Sao Phú Quốc',
      breadcrumbs: [
        { url: 'https://example.com/', text: 'Trang chủ' },
        { url: 'https://example.com/bai-sao-phu-quoc/', text: 'Bãi Sao' },
      ],
      site: SITE,
    })
    const nodes = graph['@graph'] as Array<Record<string, unknown>>
    const types = nodes.map((n) => n['@type'])
    assert.ok(types.includes('BreadcrumbList'), 'BreadcrumbList missing')
  })

  it('omits BreadcrumbList when no breadcrumbs', () => {
    const graph = assemblePostGraph({
      slug: 'bai-sao-phu-quoc',
      title: 'Bãi Sao Phú Quốc',
      breadcrumbs: [],
      site: SITE,
    })
    const nodes = graph['@graph'] as Array<Record<string, unknown>>
    const types = nodes.map((n) => n['@type'])
    assert.ok(!types.includes('BreadcrumbList'), 'BreadcrumbList should be absent')
  })
})

describe('assemblePageGraph', () => {
  it('includes WebPage, WebSite, Organization', () => {
    const graph = assemblePageGraph({
      slug: 'chinh-sach-bao-mat',
      title: 'Chính sách bảo mật',
      site: SITE,
    })
    const nodes = graph['@graph'] as Array<Record<string, unknown>>
    const types = nodes.map((n) => n['@type'])
    assert.ok(types.includes('WebPage'), 'WebPage missing')
    assert.ok(types.includes('WebSite'), 'WebSite missing')
    assert.ok(
      types.some((t) => Array.isArray(t) && t.includes('Organization')),
      'Organization missing',
    )
  })

  it('does NOT include BlogPosting', () => {
    const graph = assemblePageGraph({ slug: 'faq', title: 'FAQ', site: SITE })
    const nodes = graph['@graph'] as Array<Record<string, unknown>>
    const types = nodes.map((n) => n['@type'])
    assert.ok(!types.includes('BlogPosting'), 'BlogPosting should not appear in page graph')
  })
})

describe('assembleTaxonomyGraph', () => {
  it('wraps in @context/@graph envelope', () => {
    const graph = assembleTaxonomyGraph({ slug: 'diem-den/phu-quoc', title: 'Phú Quốc', site: SITE })
    assert.equal(graph['@context'], 'https://schema.org')
    assert.ok(Array.isArray(graph['@graph']))
  })

  it('includes CollectionPage, WebSite, and Organization nodes', () => {
    const graph = assembleTaxonomyGraph({ slug: 'diem-den/phu-quoc', title: 'Phú Quốc', site: SITE })
    const nodes = graph['@graph'] as Array<Record<string, unknown>>
    const types = nodes.map((n) => n['@type'])
    assert.ok(types.includes('CollectionPage'), 'CollectionPage missing')
    assert.ok(types.includes('WebSite'), 'WebSite missing')
    assert.ok(
      types.some((t) => Array.isArray(t) && t.includes('Organization')),
      'Organization missing',
    )
  })

  it('includes BreadcrumbList when breadcrumbs are provided', () => {
    const graph = assembleTaxonomyGraph({
      slug: 'diem-den/phu-quoc',
      title: 'Phú Quốc',
      breadcrumbs: [
        { url: 'https://example.com/', text: 'Trang chủ' },
        { url: 'https://example.com/diem-den/phu-quoc/', text: 'Phú Quốc' },
      ],
      site: SITE,
    })
    const nodes = graph['@graph'] as Array<Record<string, unknown>>
    const types = nodes.map((n) => n['@type'])
    assert.ok(types.includes('BreadcrumbList'), 'BreadcrumbList missing')
  })

  it('omits BreadcrumbList when no breadcrumbs', () => {
    const graph = assembleTaxonomyGraph({
      slug: 'diem-den/phu-quoc',
      title: 'Phú Quốc',
      breadcrumbs: [],
      site: SITE,
    })
    const nodes = graph['@graph'] as Array<Record<string, unknown>>
    const types = nodes.map((n) => n['@type'])
    assert.ok(!types.includes('BreadcrumbList'), 'BreadcrumbList should be absent')
  })

  it('does NOT include BlogPosting or Product nodes', () => {
    const graph = assembleTaxonomyGraph({ slug: 'diem-den/phu-quoc', title: 'Phú Quốc', site: SITE })
    const nodes = graph['@graph'] as Array<Record<string, unknown>>
    const types = nodes.map((n) => n['@type'])
    assert.ok(!types.includes('BlogPosting'), 'BlogPosting must not appear in taxonomy graph')
    assert.ok(!types.includes('Product'), 'Product must not appear in taxonomy graph')
  })

  it('CollectionPage @id uses #webpage anchor', () => {
    const graph = assembleTaxonomyGraph({ slug: 'diem-den/phu-quoc', title: 'Phú Quốc', site: SITE })
    const nodes = graph['@graph'] as Array<Record<string, unknown>>
    const page = nodes.find((n) => n['@type'] === 'CollectionPage') as Record<string, unknown>
    assert.ok(page, 'CollectionPage node not found')
    assert.equal(page['@id'], 'https://example.com/diem-den/phu-quoc/#webpage')
  })
})

describe('assembleProductGraph', () => {
  it('includes Product, ItemPage, WebSite, Organization', () => {
    const graph = assembleProductGraph({
      slug: 'product/ve-tau-ha-tien-phu-quoc',
      title: 'Vé sản phẩm Hà Tiên Phú Quốc',
      site: SITE,
    })
    const nodes = graph['@graph'] as Array<Record<string, unknown>>
    const types = nodes.map((n) => n['@type'])
    assert.ok(types.includes('Product'), 'Product missing')
    assert.ok(types.includes('ItemPage'), 'ItemPage missing')
    assert.ok(types.includes('WebSite'), 'WebSite missing')
    assert.ok(
      types.some((t) => Array.isArray(t) && t.includes('Organization')),
      'Organization missing',
    )
  })

  it('includes FAQPage node when faqs provided', () => {
    const graph = assembleProductGraph({
      slug: 'product/ve-tau',
      title: 'Vé sản phẩm',
      faqs: [{ question: 'Tàu mấy giờ?', answer: '7:00 sáng.' }],
      site: SITE,
    })
    const nodes = graph['@graph'] as Array<Record<string, unknown>>
    const types = nodes.map((n) => n['@type'])
    assert.ok(types.includes('FAQPage'), 'FAQPage missing')
  })
})
