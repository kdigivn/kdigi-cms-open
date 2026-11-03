import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { resolvePublishedAt } from './sidebar-meta-fields'

const NOW = new Date('2026-10-02T10:00:00.000Z')
const PAST = '2026-04-23T09:26:55.000Z'
const FUTURE = '2026-12-01T00:00:00.000Z'

const resolve = (over: Partial<Parameters<typeof resolvePublishedAt>[0]>) =>
  resolvePublishedAt({
    value: PAST,
    status: 'published',
    previousStatus: undefined,
    preserveSourceDate: false,
    now: NOW,
    ...over,
  })

describe('resolvePublishedAt', () => {
  it('leaves non-published docs untouched', () => {
    assert.equal(resolve({ status: 'draft', value: undefined }), undefined)
    assert.equal(resolve({ status: 'draft' }), PAST)
  })

  it('stamps now when a published doc has no date', () => {
    assert.equal(resolve({ value: null }), NOW.toISOString())
  })

  it('stamps now on the draft -> published flip with a past date', () => {
    assert.equal(resolve({ previousStatus: 'draft' }), NOW.toISOString())
    assert.equal(resolve({ previousStatus: undefined }), NOW.toISOString())
  })

  it('keeps future dates so publishing can be scheduled', () => {
    assert.equal(resolve({ value: FUTURE, previousStatus: 'draft' }), FUTURE)
  })

  it('does not re-date an already-published doc when it is edited', () => {
    assert.equal(resolve({ previousStatus: 'published' }), PAST)
  })

  it('keeps the source date when the importer flag is set on a new doc', () => {
    assert.equal(resolve({ preserveSourceDate: true }), PAST)
  })
})
