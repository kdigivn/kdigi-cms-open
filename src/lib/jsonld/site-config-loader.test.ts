/**
 * Characterization tests for loadSiteJsonLdConfig.
 *
 * Pins the CURRENT heuristic extraction (orgName from manifest.name, sameAs from
 * contact.headerIcons excluding self-domain, telephone from contact.rightSide
 * icon=phone, address from footer.address[0].text, hardcoded TravelAgency type)
 * so the loader rewrite can be proven non-regressive.
 *
 * Unit-isolated via a fake payload exposing only findByID (the sole method the
 * loader calls), so no DB is required.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { loadSiteJsonLdConfig } from './site-config-loader'
import type { BasePayload } from 'payload'

// ── Fake payload ─────────────────────────────────────────────────────────────

/** Build a fake BasePayload whose findByID returns the given site doc. */
function makeFakePayload(siteDoc: unknown): BasePayload {
  return {
    findByID: async () => siteDoc,
  } as unknown as BasePayload
}

/** Fake payload whose findByID rejects (simulates a DB error / missing doc). */
function makeRejectingPayload(): BasePayload {
  return {
    findByID: async () => {
      throw new Error('db down')
    },
  } as unknown as BasePayload
}

// ── Representative Sites fixture ─────────────────────────────────────────────

function makeSiteDoc(): Record<string, unknown> {
  return {
    domain: 'example.com',
    defaultLanguage: 'vi',
    manifest: { name: 'Example Site' },
    branding: {
      logo: { url: 'https://cdn.example.com/logo.png', width: 512, height: 512 },
    },
    contact: {
      rightSide: [
        { icon: 'mail', label: 'info@example.com' },
        { icon: 'phone', label: '0924 299 898' },
      ],
      headerIcons: [
        { icon: 'home', url: 'https://example.com/' }, // self-domain → excluded
        { icon: 'facebook', url: 'https://www.facebook.com/demo-site' },
        { icon: 'youtube', url: 'https://www.youtube.com/@demo-site' },
        { icon: 'zalo', url: 'tel:0924299898' }, // non-http → excluded
      ],
    },
    footer: {
      address: [{ text: 'Số 5 Trần Văn Hoài, Phú Quốc' }],
    },
  }
}

// ── Heuristic extraction ─────────────────────────────────────────────────────

describe('loadSiteJsonLdConfig — heuristic extraction', () => {
  it('extracts orgName, siteUrl, logo, telephone, address, additionalTypes', async () => {
    const cfg = await loadSiteJsonLdConfig(makeFakePayload(makeSiteDoc()), 'site-1')
    assert.ok(cfg)
    assert.equal(cfg.siteUrl, 'https://example.com')
    assert.equal(cfg.orgName, 'Example Site')
    assert.equal(cfg.logoUrl, 'https://cdn.example.com/logo.png')
    assert.equal(cfg.logoWidth, 512)
    assert.equal(cfg.logoHeight, 512)
    assert.equal(cfg.telephone, '0924299898') // whitespace stripped
    assert.deepEqual(cfg.address, {
      streetAddress: 'Số 5 Trần Văn Hoài, Phú Quốc',
      addressCountry: 'VN',
    })
    assert.equal(cfg.lang, 'vi')
    assert.deepEqual(cfg.additionalTypes, ['TravelAgency'])
  })

  it('collects sameAs from headerIcons, excluding self-domain and non-http', async () => {
    const cfg = await loadSiteJsonLdConfig(makeFakePayload(makeSiteDoc()), 'site-1')
    assert.ok(cfg)
    assert.deepEqual(cfg.sameAs, [
      'https://www.facebook.com/demo-site',
      'https://www.youtube.com/@demo-site',
    ])
  })

  it('prefers logo.externalUrl over logo.url when present', async () => {
    const doc = makeSiteDoc()
    ;(doc.branding as Record<string, unknown>).logo = {
      externalUrl: 'https://r2.example.com/logo.webp',
      url: 'https://cdn.example.com/logo.png',
      width: 256,
      height: 256,
    }
    const cfg = await loadSiteJsonLdConfig(makeFakePayload(doc), 'site-1')
    assert.equal(cfg?.logoUrl, 'https://r2.example.com/logo.webp')
  })

  it('returns null telephone when no phone entry looks like a number', async () => {
    const doc = makeSiteDoc()
    ;(doc.contact as Record<string, unknown>).rightSide = [{ icon: 'phone', label: 'Gọi ngay' }]
    const cfg = await loadSiteJsonLdConfig(makeFakePayload(doc), 'site-1')
    assert.equal(cfg?.telephone, null)
  })

  it('returns null address when footer address text is blank', async () => {
    const doc = makeSiteDoc()
    ;(doc.footer as Record<string, unknown>).address = []
    const cfg = await loadSiteJsonLdConfig(makeFakePayload(doc), 'site-1')
    assert.equal(cfg?.address, null)
  })

  it('falls back orgName to domain when manifest.name missing', async () => {
    const doc = makeSiteDoc()
    doc.manifest = {}
    const cfg = await loadSiteJsonLdConfig(makeFakePayload(doc), 'site-1')
    assert.equal(cfg?.orgName, 'example.com')
  })

  it('defaults lang to vi when defaultLanguage missing', async () => {
    const doc = makeSiteDoc()
    delete doc.defaultLanguage
    const cfg = await loadSiteJsonLdConfig(makeFakePayload(doc), 'site-1')
    assert.equal(cfg?.lang, 'vi')
  })
})

// ── Null / fallback contract ─────────────────────────────────────────────────

describe('loadSiteJsonLdConfig — null & error contract', () => {
  it('returns null when siteId is falsy', async () => {
    const cfg = await loadSiteJsonLdConfig(makeFakePayload(makeSiteDoc()), '')
    assert.equal(cfg, null)
  })

  it('returns null when findByID rejects', async () => {
    const cfg = await loadSiteJsonLdConfig(makeRejectingPayload(), 'site-1')
    assert.equal(cfg, null)
  })

  it('returns null when findByID resolves null (no doc)', async () => {
    const cfg = await loadSiteJsonLdConfig(makeFakePayload(null), 'site-1')
    assert.equal(cfg, null)
  })
})

// ── Localized field parsing ──────────────────────────────────────────────────

describe('loadSiteJsonLdConfig — localized manifest.name parsing', () => {
  it('parses a JSON-string locale map by lang', async () => {
    const doc = makeSiteDoc()
    doc.manifest = { name: '{"vi":"Sản Phẩm","en":"Product Tickets"}' }
    doc.defaultLanguage = 'en'
    const cfg = await loadSiteJsonLdConfig(makeFakePayload(doc), 'site-1')
    assert.equal(cfg?.orgName, 'Product Tickets')
  })

  it('parses an object locale map by lang', async () => {
    const doc = makeSiteDoc()
    doc.manifest = { name: { vi: 'Sản Phẩm', en: 'Product Tickets' } }
    const cfg = await loadSiteJsonLdConfig(makeFakePayload(doc), 'site-1')
    assert.equal(cfg?.orgName, 'Sản Phẩm') // lang=vi
  })

  it('treats a plain string as the value', async () => {
    const doc = makeSiteDoc()
    doc.manifest = { name: 'Plain Name' }
    const cfg = await loadSiteJsonLdConfig(makeFakePayload(doc), 'site-1')
    assert.equal(cfg?.orgName, 'Plain Name')
  })

  it('falls back to vi when requested lang absent from locale map', async () => {
    const doc = makeSiteDoc()
    doc.manifest = { name: { vi: 'Sản Phẩm', en: 'Product' } }
    doc.defaultLanguage = 'fr'
    const cfg = await loadSiteJsonLdConfig(makeFakePayload(doc), 'site-1')
    assert.equal(cfg?.orgName, 'Sản Phẩm')
  })
})

// ── Explicit knowledgeGraph fields (Phase 2) ─────────────────────────────────

/** Site doc with a fully-populated knowledgeGraph + socialProfiles. */
function makeSiteDocWithKG(): Record<string, unknown> {
  const doc = makeSiteDoc()
  doc.knowledgeGraph = {
    type: 'Organization',
    businessType: 'LocalBusiness',
    name: 'Công ty Example Site',
    legalName: 'Example Site Co., Ltd',
    description: 'Đặt vé tàu cao tốc đi Phú Quốc.',
    logo: { url: 'https://cdn.example.com/kg-logo.png', width: 600, height: 600 },
    email: 'sales@example.com',
    telephone: '1900 1234',
    priceRange: '$$',
    address: {
      streetAddress: '12 Nguyễn Trung Trực',
      addressLocality: 'Phú Quốc',
      addressRegion: 'Kiên Giang',
      postalCode: '92500',
      addressCountry: 'VN',
    },
    geo: { latitude: 10.2899, longitude: 103.984 },
    openingHours: [
      { dayOfWeek: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'], opens: '06:00', closes: '20:00' },
    ],
  }
  doc.socialProfiles = [
    { platform: 'Facebook', url: 'https://facebook.com/vtpq-official' },
    { platform: 'TikTok', url: 'https://tiktok.com/@vtpq' },
  ]
  return doc
}

describe('loadSiteJsonLdConfig — explicit knowledgeGraph wins', () => {
  it('prefers explicit name/legalName/description/email/telephone/priceRange', async () => {
    const cfg = await loadSiteJsonLdConfig(makeFakePayload(makeSiteDocWithKG()), 'site-1')
    assert.ok(cfg)
    assert.equal(cfg.orgName, 'Công ty Example Site')
    assert.equal(cfg.legalName, 'Example Site Co., Ltd')
    assert.equal(cfg.description, 'Đặt vé tàu cao tốc đi Phú Quốc.')
    assert.equal(cfg.email, 'sales@example.com')
    assert.equal(cfg.telephone, '19001234') // whitespace stripped
    assert.equal(cfg.priceRange, '$$')
  })

  it('prefers explicit logo over branding.logo', async () => {
    const cfg = await loadSiteJsonLdConfig(makeFakePayload(makeSiteDocWithKG()), 'site-1')
    assert.equal(cfg?.logoUrl, 'https://cdn.example.com/kg-logo.png')
    assert.equal(cfg?.logoWidth, 600)
    assert.equal(cfg?.logoHeight, 600)
  })

  it('builds a full explicit address with country default VN', async () => {
    const cfg = await loadSiteJsonLdConfig(makeFakePayload(makeSiteDocWithKG()), 'site-1')
    assert.deepEqual(cfg?.address, {
      streetAddress: '12 Nguyễn Trung Trực',
      addressLocality: 'Phú Quốc',
      addressRegion: 'Kiên Giang',
      postalCode: '92500',
      addressCountry: 'VN',
    })
  })

  it('passes geo through', async () => {
    const cfg = await loadSiteJsonLdConfig(makeFakePayload(makeSiteDocWithKG()), 'site-1')
    assert.deepEqual(cfg?.geo, { latitude: 10.2899, longitude: 103.984 })
  })

  it('maps structured openingHours to OpeningHoursSpecification rows with full day names', async () => {
    const cfg = await loadSiteJsonLdConfig(makeFakePayload(makeSiteDocWithKG()), 'site-1')
    assert.deepEqual(cfg?.openingHoursSpecification, [
      {
        dayOfWeek: [
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
          'Sunday',
        ],
        opens: '06:00',
        closes: '20:00',
      },
    ])
  })

  it('derives sameAs from socialProfiles when present', async () => {
    const cfg = await loadSiteJsonLdConfig(makeFakePayload(makeSiteDocWithKG()), 'site-1')
    assert.deepEqual(cfg?.sameAs, [
      'https://facebook.com/vtpq-official',
      'https://tiktok.com/@vtpq',
    ])
  })
})

describe('loadSiteJsonLdConfig — businessType → additionalTypes', () => {
  async function typeFor(businessType: string | undefined): Promise<string[]> {
    const doc = makeSiteDoc()
    doc.knowledgeGraph = businessType ? { businessType } : {}
    const cfg = await loadSiteJsonLdConfig(makeFakePayload(doc), 'site-1')
    return cfg!.additionalTypes
  }

  it('maps TravelAgency → ["TravelAgency"]', async () => {
    assert.deepEqual(await typeFor('TravelAgency'), ['TravelAgency'])
  })

  it('maps Organization → [] (plain Organization)', async () => {
    assert.deepEqual(await typeFor('Organization'), [])
  })

  it('maps other types through verbatim', async () => {
    assert.deepEqual(await typeFor('Restaurant'), ['Restaurant'])
    assert.deepEqual(await typeFor('TransportationService'), ['TransportationService'])
  })

  it('defaults to ["TravelAgency"] when businessType blank (preserves current output)', async () => {
    assert.deepEqual(await typeFor(undefined), ['TravelAgency'])
  })
})

describe('loadSiteJsonLdConfig — per-field heuristic fallback', () => {
  it('falls back to heuristics for every field when knowledgeGraph blank', async () => {
    // makeSiteDoc has no knowledgeGraph/socialProfiles → must match Phase 1 baseline.
    const cfg = await loadSiteJsonLdConfig(makeFakePayload(makeSiteDoc()), 'site-1')
    assert.equal(cfg?.orgName, 'Example Site')
    assert.equal(cfg?.telephone, '0924299898')
    assert.deepEqual(cfg?.sameAs, [
      'https://www.facebook.com/demo-site',
      'https://www.youtube.com/@demo-site',
    ])
    assert.deepEqual(cfg?.address, {
      streetAddress: 'Số 5 Trần Văn Hoài, Phú Quốc',
      addressCountry: 'VN',
    })
    // explicit-only fields stay undefined under fallback
    assert.equal(cfg?.email, undefined)
    assert.equal(cfg?.legalName, undefined)
    assert.equal(cfg?.geo, undefined)
  })

  it('falls back to header-icon sameAs when socialProfiles empty', async () => {
    const doc = makeSiteDocWithKG()
    doc.socialProfiles = []
    const cfg = await loadSiteJsonLdConfig(makeFakePayload(doc), 'site-1')
    assert.deepEqual(cfg?.sameAs, [
      'https://www.facebook.com/demo-site',
      'https://www.youtube.com/@demo-site',
    ])
  })
})
