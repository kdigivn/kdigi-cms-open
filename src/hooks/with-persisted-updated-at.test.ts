/**
 * Tests for withPersistedUpdatedAt.
 *
 * Guards the invariant that keeps the admin editor from force-reloading mid-edit: an
 * afterChange hook that persists derived data through payload.update() must return the
 * timestamp that write produced, because Payload stamps a new `updatedAt` on every write
 * and the client compares its copy against the stored row on the next field change.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { withPersistedUpdatedAt } from './with-persisted-updated-at'

describe('withPersistedUpdatedAt', () => {
  it('replaces updatedAt with the timestamp the write produced', () => {
    const doc = { id: 1, title: 'Vé sản phẩm Côn Đảo', updatedAt: '2026-07-23T10:00:00.000Z' }
    const persisted = { id: 1, updatedAt: '2026-07-23T10:00:00.412Z' }

    const result = withPersistedUpdatedAt(doc, persisted)

    assert.equal(result.updatedAt, '2026-07-23T10:00:00.412Z')
  })

  it('leaves every other field of the doc intact', () => {
    const doc = {
      id: 7,
      title: 'Lịch tàu Phú Quốc',
      seo: { title: 'x', jsonLd: { raw: '<script/>' } },
      updatedAt: '2026-07-23T10:00:00.000Z',
    }

    const result = withPersistedUpdatedAt(doc, { updatedAt: '2026-07-23T10:00:00.900Z' })

    assert.equal(result.id, 7)
    assert.equal(result.title, 'Lịch tàu Phú Quốc')
    // Populated/nested values must survive — the write result is depth 0 and cannot
    // stand in for the doc the caller already resolved.
    assert.deepEqual(result.seo, doc.seo)
  })

  it('does not mutate the doc it was given', () => {
    const doc = { id: 1, updatedAt: '2026-07-23T10:00:00.000Z' }

    withPersistedUpdatedAt(doc, { updatedAt: '2026-07-23T10:00:00.500Z' })

    assert.equal(doc.updatedAt, '2026-07-23T10:00:00.000Z')
  })

  it('keeps the original doc when the write returned no usable timestamp', () => {
    const doc = { id: 1, updatedAt: '2026-07-23T10:00:00.000Z' }

    assert.equal(withPersistedUpdatedAt(doc, {}).updatedAt, doc.updatedAt)
    assert.equal(withPersistedUpdatedAt(doc, null).updatedAt, doc.updatedAt)
    assert.equal(withPersistedUpdatedAt(doc, undefined).updatedAt, doc.updatedAt)
    assert.equal(withPersistedUpdatedAt(doc, { updatedAt: '' }).updatedAt, doc.updatedAt)
    assert.equal(withPersistedUpdatedAt(doc, { updatedAt: 1753264800000 }).updatedAt, doc.updatedAt)
  })
})
