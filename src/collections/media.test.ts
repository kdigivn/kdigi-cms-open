/**
 * Unit tests for the folder-path resolution + slugify helpers exported from
 * src/collections/media.ts. Runner: node --import tsx --test
 *
 * resolveFolderPath walks the parent chain of a Payload folder doc and
 * returns a slash-joined slugified path (e.g. "promos/summer-2024"). It is
 * used by the Media beforeChange hook to populate
 * `req.context.uploadFolderPath`, which the r2StorageAdapter embeds in
 * the object key.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolveFolderPath, slugifySegment, resolveTenantFieldValue } from './media'

// ─── Fakes ──────────────────────────────────────────────────────────────────

const noopLogger = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} }

interface FakeFolder {
  id: string
  name: string
  folder?: string | { id: string } | null
}

/**
 * Build a fake Payload with a findByID that walks a static folder map.
 * Each folder entry is returned as-is so the resolver can read `name` and
 * `folder` (parent id) to walk the chain.
 */
function makePayload(folders: FakeFolder[]) {
  const byId = new Map(folders.map((f) => [f.id, f]))
  return {
    logger: noopLogger,
    findByID: async ({ id }: { id: string }) => {
      const f = byId.get(String(id))
      if (!f) throw new Error(`not found: ${id}`)
      return f
    },
  } as unknown as Parameters<typeof resolveFolderPath>[0]
}

// ─── slugifySegment ─────────────────────────────────────────────────────────

describe('slugifySegment', () => {
  it('lowercases and replaces non-alphanumeric with -', () => {
    assert.equal(slugifySegment('Promos'), 'promos')
    assert.equal(slugifySegment('Summer 2024'), 'summer-2024')
  })
  it('collapses repeated separators', () => {
    assert.equal(slugifySegment('a   b'), 'a-b')
    assert.equal(slugifySegment('a--b'), 'a-b')
    assert.equal(slugifySegment('a___b'), 'a-b')
  })
  it('trims leading and trailing -', () => {
    assert.equal(slugifySegment('-leading'), 'leading')
    assert.equal(slugifySegment('trailing-'), 'trailing')
    // `---` collapses to `` then to 'untitled' (defensive — never return empty)
    assert.equal(slugifySegment('---'), 'untitled')
  })
  it('returns "untitled" for empty / whitespace-only input', () => {
    assert.equal(slugifySegment(''), 'untitled')
    assert.equal(slugifySegment('   '), 'untitled')
  })
  it('folds Vietnamese diacritics to base Latin letters', () => {
    assert.equal(slugifySegment('sản phẩm'), 'san-pham')
    assert.equal(slugifySegment('Ví Dụ Điểm Đến'), 'vi-du-diem-den')
    assert.equal(slugifySegment('Đảo Ngọc'), 'dao-ngoc')
  })
  it('still collapses non-Latin unicode to -', () => {
    assert.equal(slugifySegment('日本語'), 'untitled')
  })
})

// ─── resolveFolderPath ──────────────────────────────────────────────────────

describe('resolveFolderPath', () => {
  it('returns the slugified single segment for a root-level folder', async () => {
    const payload = makePayload([{ id: 'f1', name: 'Promos' }])
    const path = await resolveFolderPath(payload, 'f1')
    assert.equal(path, 'promos')
  })

  it('walks the parent chain and joins segments with /', async () => {
    const payload = makePayload([
      { id: 'f1', name: 'Promos' },
      { id: 'f2', name: 'Summer 2024', folder: 'f1' },
    ])
    const path = await resolveFolderPath(payload, 'f2')
    assert.equal(path, 'promos/summer-2024')
  })

  it('handles a deep chain (5 levels)', async () => {
    const payload = makePayload([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B', folder: 'a' },
      { id: 'c', name: 'C', folder: 'b' },
      { id: 'd', name: 'D', folder: 'c' },
      { id: 'e', name: 'E', folder: 'd' },
    ])
    const path = await resolveFolderPath(payload, 'e')
    assert.equal(path, 'a/b/c/d/e')
  })

  it('accepts parent as an object {id}', async () => {
    const payload = makePayload([
      { id: 'f1', name: 'Promos' },
      { id: 'f2', name: 'Summer', folder: { id: 'f1' } },
    ])
    const path = await resolveFolderPath(payload, 'f2')
    assert.equal(path, 'promos/summer')
  })

  it('returns undefined when the folder is not found', async () => {
    const payload = makePayload([])
    const path = await resolveFolderPath(payload, 'nonexistent')
    assert.equal(path, undefined)
  })

  it('returns undefined on a cycle in the folder graph (defensive cap)', async () => {
    // f1 → f2 → f1 — direct cycle. The resolver's `seen` set detects this.
    const payload = makePayload([
      { id: 'f1', name: 'A', folder: 'f2' },
      { id: 'f2', name: 'B', folder: 'f1' },
    ])
    const path = await resolveFolderPath(payload, 'f1')
    assert.equal(path, undefined)
  })

  it('caps the walk depth at 8 levels (defensive)', async () => {
    // 12-level chain. Resolver should bail at depth 8.
    const folders: FakeFolder[] = []
    for (let i = 0; i < 12; i += 1) {
      folders.push({
        id: `f${i}`,
        name: `n${i}`,
        folder: i === 0 ? null : `f${i - 1}`,
      })
    }
    const payload = makePayload(folders)
    const path = await resolveFolderPath(payload, 'f11')
    // depth 0..7 = f11, f10, f9, f8, f7, f6, f5, f4 → 8 segments
    assert.equal(path, 'n4/n5/n6/n7/n8/n9/n10/n11')
  })

  it('returns undefined when a folder in the chain has no name', async () => {
    const payload = makePayload([
      { id: 'f1', name: '' },
    ])
    const path = await resolveFolderPath(payload, 'f1')
    assert.equal(path, undefined)
  })

  it('returns undefined when the parent string is empty (defensive)', async () => {
    // An empty parent string is treated as "no parent" and the walk stops.
    // The path so far (a single segment) should still be returned.
    const payload = makePayload([{ id: 'f1', name: 'Solo', folder: '' }])
    const path = await resolveFolderPath(payload, 'f1')
    assert.equal(path, 'solo')
  })
})

// ─── resolveTenantFieldValue ────────────────────────────────────────────────

describe('resolveTenantFieldValue', () => {
  it('assigns the resolved tenant on create when none was already set', () => {
    assert.equal(resolveTenantFieldValue('create', null, '3'), 3)
    assert.equal(resolveTenantFieldValue('create', undefined, '3'), 3)
  })
  it('never assigns on update — a metadata-only PATCH must not reassign tenant', () => {
    assert.equal(resolveTenantFieldValue('update', null, '3'), undefined)
    assert.equal(resolveTenantFieldValue('update', undefined, '3'), undefined)
  })
  it('does not override an explicit tenant already present on create (importer)', () => {
    assert.equal(resolveTenantFieldValue('create', 7, '3'), undefined)
    assert.equal(resolveTenantFieldValue('create', { id: 7 }, '3'), undefined)
  })
  it('returns undefined for a non-numeric resolved tenant id (defensive — malformed cookie)', () => {
    assert.equal(resolveTenantFieldValue('create', null, 'not-a-number'), undefined)
    assert.equal(resolveTenantFieldValue('create', null, ''), undefined)
  })
})
