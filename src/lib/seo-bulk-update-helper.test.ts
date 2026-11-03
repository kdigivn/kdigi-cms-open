/**
 * Unit tests for seo-bulk-update-helper.ts
 * Runner: node --import tsx --test src/lib/seo-bulk-update-helper.test.ts
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeSeoBulkPatches,
  DEFAULT_BATCH_SIZE,
  type DocSeoSnapshot,
  type SeoBulkFields,
} from './seo-bulk-update-helper.js'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const docWithFullSeo: DocSeoSnapshot = {
  id: '1',
  seo: {
    title: 'Existing Title',
    description: 'Existing description that is not blank',
    robots: ['index', 'follow'],
  },
}

const docWithBlankSeo: DocSeoSnapshot = {
  id: '2',
  seo: { title: '', description: null, robots: [] },
}

const docWithNoSeo: DocSeoSnapshot = {
  id: '3',
  // no seo object at all
}

const docWithPartialSeo: DocSeoSnapshot = {
  id: '4',
  seo: { title: 'Has a title', description: null, robots: undefined },
}

const fields: SeoBulkFields = {
  title: 'New Title',
  description: 'New description text',
  robots: ['index', 'follow'],
}

// ── blankOnly mode ────────────────────────────────────────────────────────────

describe('blankOnly mode (default)', () => {
  test('fills all blank fields on a doc with no seo', () => {
    const { patches, skipped } = computeSeoBulkPatches([docWithNoSeo], fields)
    assert.equal(patches.length, 1)
    assert.equal(skipped.length, 0)
    const patch = patches[0]
    assert.equal(patch.id, '3')
    assert.equal(patch.data['seo.title'], 'New Title')
    assert.equal(patch.data['seo.description'], 'New description text')
    assert.deepEqual(patch.data['seo.robots'], ['index', 'follow'])
  })

  test('fills all blank fields on a doc with empty seo strings/arrays', () => {
    const { patches } = computeSeoBulkPatches([docWithBlankSeo], fields)
    assert.equal(patches.length, 1)
    const patch = patches[0]
    assert.equal(patch.data['seo.title'], 'New Title')
    assert.equal(patch.data['seo.description'], 'New description text')
    assert.deepEqual(patch.data['seo.robots'], ['index', 'follow'])
  })

  test('skips doc where all fields are already populated', () => {
    const { patches, skipped } = computeSeoBulkPatches([docWithFullSeo], fields)
    assert.equal(patches.length, 0)
    assert.equal(skipped.length, 1)
    assert.equal(skipped[0], '1')
  })

  test('fills only blank fields on partial doc (has title, missing desc + robots)', () => {
    const { patches } = computeSeoBulkPatches([docWithPartialSeo], fields)
    assert.equal(patches.length, 1)
    const patch = patches[0]
    // title already set — must NOT be in patch
    assert.equal(patch.data['seo.title'], undefined)
    // desc and robots are blank — must be filled
    assert.equal(patch.data['seo.description'], 'New description text')
    assert.deepEqual(patch.data['seo.robots'], ['index', 'follow'])
  })

  test('only applies fields that are defined in the fields arg', () => {
    // Only robots — title and description are not specified
    const robotsOnly: SeoBulkFields = { robots: ['noindex', 'follow'] }
    const { patches } = computeSeoBulkPatches([docWithNoSeo], robotsOnly)
    assert.equal(patches.length, 1)
    assert.equal(patches[0].data['seo.title'], undefined)
    assert.equal(patches[0].data['seo.description'], undefined)
    assert.deepEqual(patches[0].data['seo.robots'], ['noindex', 'follow'])
  })

  test('returns empty plan for empty docs array', () => {
    const { patches, skipped, truncated } = computeSeoBulkPatches([], fields)
    assert.equal(patches.length, 0)
    assert.equal(skipped.length, 0)
    assert.equal(truncated.length, 0)
  })
})

// ── overwrite mode ────────────────────────────────────────────────────────────

describe('overwrite mode', () => {
  test('replaces all specified fields even when doc already has values', () => {
    const { patches, skipped } = computeSeoBulkPatches([docWithFullSeo], fields, 'overwrite')
    assert.equal(patches.length, 1)
    assert.equal(skipped.length, 0)
    const patch = patches[0]
    assert.equal(patch.data['seo.title'], 'New Title')
    assert.equal(patch.data['seo.description'], 'New description text')
    assert.deepEqual(patch.data['seo.robots'], ['index', 'follow'])
  })

  test('patches all docs regardless of existing values', () => {
    const docs = [docWithFullSeo, docWithBlankSeo, docWithNoSeo, docWithPartialSeo]
    const { patches } = computeSeoBulkPatches(docs, fields, 'overwrite')
    assert.equal(patches.length, 4)
    for (const patch of patches) {
      assert.equal(patch.data['seo.title'], 'New Title')
    }
  })
})

// ── Batch cap enforcement ─────────────────────────────────────────────────────

describe('batch size cap', () => {
  test('enforces default batch cap and reports truncated IDs', () => {
    const docs: DocSeoSnapshot[] = Array.from({ length: DEFAULT_BATCH_SIZE + 10 }, (_, i) => ({
      id: String(i + 1),
    }))
    const { patches, truncated } = computeSeoBulkPatches(docs, fields, 'overwrite')
    assert.equal(patches.length, DEFAULT_BATCH_SIZE)
    assert.equal(truncated.length, 10)
    // truncated IDs are the last 10
    assert.equal(truncated[0], String(DEFAULT_BATCH_SIZE + 1))
  })

  test('respects a custom batchSize', () => {
    const docs: DocSeoSnapshot[] = Array.from({ length: 20 }, (_, i) => ({ id: String(i) }))
    const { patches, truncated } = computeSeoBulkPatches(docs, fields, 'overwrite', 5)
    assert.equal(patches.length, 5)
    assert.equal(truncated.length, 15)
  })

  test('no truncation when docs fit within batch cap', () => {
    const docs = [docWithBlankSeo, docWithNoSeo]
    const { truncated } = computeSeoBulkPatches(docs, fields, 'overwrite')
    assert.equal(truncated.length, 0)
  })
})

// ── Scope isolation — helper never widens the provided set ───────────────────

describe('scope isolation', () => {
  test('patches only the IDs provided — never outside the input set', () => {
    const subset = [docWithBlankSeo, docWithNoSeo] // IDs: '2', '3'
    const { patches } = computeSeoBulkPatches(subset, fields, 'overwrite')
    const patchedIds = patches.map(p => String(p.id))
    assert.ok(patchedIds.every(id => ['2', '3'].includes(id)),
      `Expected only IDs 2,3 but got: ${patchedIds.join(',')}`)
    // Crucially: '1' (docWithFullSeo) is never included
    assert.ok(!patchedIds.includes('1'))
  })

  test('empty fields object results in all docs skipped (nothing to patch)', () => {
    const { patches, skipped } = computeSeoBulkPatches(
      [docWithBlankSeo, docWithNoSeo],
      {},
      'blankOnly',
    )
    assert.equal(patches.length, 0)
    assert.equal(skipped.length, 2)
  })
})

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('edge cases', () => {
  test('whitespace-only title is treated as blank', () => {
    const doc: DocSeoSnapshot = { id: 'ws', seo: { title: '   ' } }
    const { patches } = computeSeoBulkPatches([doc], { title: 'New' })
    assert.equal(patches.length, 1)
    assert.equal(patches[0].data['seo.title'], 'New')
  })

  test('robots noindex replaces existing index', () => {
    const doc: DocSeoSnapshot = { id: 'ri', seo: { robots: ['index', 'follow'] } }
    const { patches } = computeSeoBulkPatches([doc], { robots: ['noindex', 'follow'] }, 'overwrite')
    assert.equal(patches.length, 1)
    assert.deepEqual(patches[0].data['seo.robots'], ['noindex', 'follow'])
  })

  test('patch data object only contains defined fields (no extra keys)', () => {
    const { patches } = computeSeoBulkPatches([docWithNoSeo], { title: 'Only Title' })
    const keys = Object.keys(patches[0].data)
    assert.deepEqual(keys, ['seo.title'])
  })
})
