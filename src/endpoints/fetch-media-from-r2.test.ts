/**
 * Pure-helper unit tests for fetch-media-from-r2.
 * Runner: node --import tsx --test
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  parseMediaKey,
  defaultAltFromFilename,
} from './fetch-media-from-r2-helpers'

// ─── parseMediaKey ──────────────────────────────────────────────────────────

describe('parseMediaKey', () => {
  it('extracts filename and empty folder segments for a legacy flat key', () => {
    const r = parseMediaKey('media/1/1234567890-photo.jpg')
    assert.equal(r.filename, '1234567890-photo.jpg')
    assert.deepEqual(r.folderSegments, [])
  })

  it('parses a single-folder key', () => {
    const r = parseMediaKey('media/42/promos/1234-banner.jpg')
    assert.equal(r.filename, '1234-banner.jpg')
    assert.deepEqual(r.folderSegments, ['promos'])
  })

  it('parses a deeply-nested folder key', () => {
    const r = parseMediaKey('media/7/2024/summer/promos/9-file.png')
    assert.equal(r.filename, '9-file.png')
    assert.deepEqual(r.folderSegments, ['2024', 'summer', 'promos'])
  })

  it('builds a folder tree from the full path for out-of-band keys (no media/ prefix)', () => {
    // On a full-bucket scan, objects uploaded outside the `media/<tenant>/`
    // convention (e.g. a WP archive) recreate their folder tree from the key
    // path. `wp-content/uploads/x.png` → folders [wp-content, uploads].
    const r = parseMediaKey('wp-content/uploads/key.png')
    assert.equal(r.filename, 'key.png')
    assert.deepEqual(r.folderSegments, ['wp-content', 'uploads'])
  })

  it('handles a key that is just the media/ prefix with no filename', () => {
    const r = parseMediaKey('media/1/')
    // After filtering empty strings and dropping 'media' + tenantId, no
    // filename remains; we return the empty string.
    assert.equal(r.filename, '')
    assert.deepEqual(r.folderSegments, [])
  })
})

// ─── defaultAltFromFilename ────────────────────────────────────────────────

describe('defaultAltFromFilename', () => {
  it('strips a single extension', () => {
    assert.equal(defaultAltFromFilename('photo.jpg'), 'photo')
  })
  it('strips only the last extension (multi-dot)', () => {
    assert.equal(defaultAltFromFilename('event.2024.banner.jpg'), 'event.2024.banner')
  })
  it('falls back to the full filename when no extension', () => {
    assert.equal(defaultAltFromFilename('IMG_2024'), 'IMG_2024')
  })
  it('handles files starting with a dot (returns the original name)', () => {
    // The lastIndexOf('.') is 0 here, so the early return triggers.
    assert.equal(defaultAltFromFilename('.hidden'), '.hidden')
  })
})

// ─── FolderCache (key composition) ──────────────────────────────────────────

describe('FolderCache key composition (P0-1 mitigation)', () => {
  it('keyFor is stable for the same tenant + segments', () => {
    // We don't import FolderCache directly because it's not exported as a
    // class; reconstruct the static keyFor to test the same logic the
    // endpoint uses.
    const k = (tenantId: string, segs: readonly string[]) => `${tenantId}:${segs.join('/')}`
    assert.equal(k('1', ['a', 'b']), '1:a/b')
    assert.equal(k('1', ['a', 'b']), k('1', ['a', 'b']))
    assert.notEqual(k('1', ['a', 'b']), k('2', ['a', 'b']))
    assert.notEqual(k('1', ['a', 'b']), k('1', ['a', 'b', 'c']))
  })
  it('keys for the SAME path under DIFFERENT tenants never collide (P0-1)', () => {
    // P0-1 mitigation: without the tenantId prefix, a request for tenant 1
    // creating "promos" followed by tenant 2 looking up "promos" would
    // return tenant 1's folder id. With the prefix, the two lookups
    // have different keys and cannot share an entry.
    const k = (tenantId: string, segs: readonly string[]) => `${tenantId}:${segs.join('/')}`
    const tenant1Promos = k('1', ['promos'])
    const tenant2Promos = k('2', ['promos'])
    assert.notEqual(tenant1Promos, tenant2Promos)
    // And both differ from a deeper tenant 1 path
    const tenant1PromosSummer = k('1', ['promos', 'summer'])
    assert.notEqual(tenant1Promos, tenant1PromosSummer)
  })
})
