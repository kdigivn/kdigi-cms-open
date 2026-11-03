import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildPlace } from './place'
import { pageTypeForSlug } from './webpage'

describe('buildPlace', () => {
  it('emits address, geo and a Google Maps link under {siteUrl}/#place', () => {
    const node = buildPlace({
      siteUrl: 'https://example.net',
      address: { streetAddress: 'Số 5', addressLocality: 'Ninh Kiều', postalCode: '' },
      geo: { latitude: 10.0223551, longitude: 105.7702972 },
    })
    assert.deepEqual(node, {
      '@type': 'Place',
      '@id': 'https://example.net/#place',
      geo: { '@type': 'GeoCoordinates', latitude: 10.0223551, longitude: 105.7702972 },
      hasMap: 'https://www.google.com/maps/search/?api=1&query=10.0223551,105.7702972',
      address: { '@type': 'PostalAddress', streetAddress: 'Số 5', addressLocality: 'Ninh Kiều' },
    })
  })

  it('emits an address-only place without geo/hasMap', () => {
    const node = buildPlace({ siteUrl: 'https://x.vn', address: { streetAddress: 'A' } })
    assert.equal(node?.geo, undefined)
    assert.equal(node?.hasMap, undefined)
  })

  it('returns null when the site has neither a usable address nor coordinates', () => {
    assert.equal(buildPlace({ siteUrl: 'https://x.vn' }), null)
    assert.equal(buildPlace({ siteUrl: 'https://x.vn', address: { streetAddress: '' } }), null)
  })
})

describe('pageTypeForSlug', () => {
  it('maps the standard contact/about slugs and leaves others as WebPage', () => {
    assert.equal(pageTypeForSlug('lien-he'), 'ContactPage')
    assert.equal(pageTypeForSlug('contact-us'), 'ContactPage')
    assert.equal(pageTypeForSlug('gioi-thieu'), 'AboutPage')
    assert.equal(pageTypeForSlug('about'), 'AboutPage')
    assert.equal(pageTypeForSlug('chinh-sach-bao-mat'), undefined)
    assert.equal(pageTypeForSlug('constructor'), undefined)
  })
})
