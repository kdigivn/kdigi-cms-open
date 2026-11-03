import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildSiteConfig, cmsTaxonomyType, normalizeWpDate, mapWpStatus } from './wp-migration-config'
import { isRemoteDatabase } from './prod-backup-gate'

describe('buildSiteConfig', () => {
  it('derives hosts, strips www/trailing slashes and defaults language to vi', () => {
    const cfg = buildSiteConfig({
      site: 'my-blog',
      wpUrl: 'https://wp.example.com/',
      publicUrl: 'https://www.example.com',
      domain: 'https://new.example.org/',
    })
    assert.equal(cfg.wpUrl, 'https://wp.example.com')
    assert.equal(cfg.wpHost, 'wp.example.com')
    assert.equal(cfg.publicHost, 'example.com')
    assert.equal(cfg.domain, 'new.example.org')
    assert.equal(cfg.language, 'vi')
  })

  it('falls back to the WP host as public host', () => {
    const cfg = buildSiteConfig({ site: 'a', wpUrl: 'https://example.com', domain: 'example.com', language: 'en' })
    assert.equal(cfg.publicHost, 'example.com')
    assert.equal(cfg.language, 'en')
  })

  it('keeps a non-default port in the host so URL-matching regexes see it', () => {
    const cfg = buildSiteConfig({ site: 'a', wpUrl: 'http://127.0.0.1:8080/', domain: 'example.test' })
    assert.equal(cfg.wpHost, '127.0.0.1:8080')
    assert.equal(cfg.publicHost, '127.0.0.1:8080')
  })

  it('rejects invalid site keys, URLs and languages', () => {
    assert.throws(() => buildSiteConfig({ site: 'Bad Key', wpUrl: 'https://a.test', domain: 'a.test' }), /site key/)
    assert.throws(() => buildSiteConfig({ site: 'ok', wpUrl: 'not a url', domain: 'a.test' }), /--wp-url/)
    assert.throws(() => buildSiteConfig({ site: 'ok', wpUrl: 'https://a.test', domain: 'a.test', language: 'fr' }), /--lang/)
  })
})

describe('cmsTaxonomyType', () => {
  it('maps core and WooCommerce taxonomies, everything else is custom', () => {
    assert.equal(cmsTaxonomyType('category'), 'category')
    assert.equal(cmsTaxonomyType('post_tag'), 'tag')
    assert.equal(cmsTaxonomyType('product_tag'), 'tag')
    assert.equal(cmsTaxonomyType('product_cat'), 'product-category')
    assert.equal(cmsTaxonomyType('genre'), 'custom')
  })
})

describe('mapWpStatus / normalizeWpDate', () => {
  const saved = process.env.WP_UTC_OFFSET
  afterEach(() => {
    if (saved === undefined) delete process.env.WP_UTC_OFFSET
    else process.env.WP_UTC_OFFSET = saved
  })

  it('only publish stays published', () => {
    assert.equal(mapWpStatus('publish'), 'published')
    for (const s of ['draft', 'pending', 'private', 'future', undefined]) assert.equal(mapWpStatus(s), 'draft')
  })

  it('treats offset-less dates as UTC unless WP_UTC_OFFSET is set', () => {
    delete process.env.WP_UTC_OFFSET
    assert.equal(normalizeWpDate('2024-05-01T10:00:00'), '2024-05-01T10:00:00+00:00')
    process.env.WP_UTC_OFFSET = '+07:00'
    assert.equal(normalizeWpDate('2024-05-01T10:00:00'), '2024-05-01T10:00:00+07:00')
    assert.equal(normalizeWpDate('2024-05-01T10:00:00Z'), '2024-05-01T10:00:00Z')
    assert.equal(normalizeWpDate(null), null)
  })

  it('rejects a malformed WP_UTC_OFFSET', () => {
    process.env.WP_UTC_OFFSET = '7'
    assert.throws(() => normalizeWpDate('2024-05-01T10:00:00'), /WP_UTC_OFFSET/)
  })
})

describe('isRemoteDatabase (backup gate)', () => {
  it('treats loopback hosts as local and anything else as remote', () => {
    assert.equal(isRemoteDatabase('postgres://u:p@127.0.0.1:5432/db', {}), false)
    assert.equal(isRemoteDatabase('postgres://u:p@localhost/db', {}), false)
    assert.equal(isRemoteDatabase('postgres://u:p@db.example.com/db', {}), true)
    assert.equal(isRemoteDatabase('postgres://u:p@postgres:5432/db', {}), true)
  })

  it('honours KDIGI_LOCAL_DB_HOSTS and fails closed on unparseable URIs', () => {
    assert.equal(isRemoteDatabase('postgres://u:p@postgres:5432/db', { KDIGI_LOCAL_DB_HOSTS: 'postgres, db' }), false)
    assert.equal(isRemoteDatabase('not-a-uri', {}), true)
    assert.equal(isRemoteDatabase(undefined, {}), false)
  })
})
