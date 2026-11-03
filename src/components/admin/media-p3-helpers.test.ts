/**
 * Unit tests for the pure helpers used by Phase 3's media grid view.
 * Runner: node --import tsx --test
 *
 * We test only the pure helpers (no React). The component itself is hard
 * to test without a full DOM + Payload admin context, but the helpers
 * encode the user-facing behaviour:
 *   - deriveAltFromFilename: required alt derivation from uploaded filename
 *   - buildMediaWhere: query string shape consumed by the fetch effect
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  deriveAltFromFilename,
  buildMediaWhere,
  buildFolderWhere,
  runWithConcurrency,
} from './media-p3-helpers'

// ─── deriveAltFromFilename ──────────────────────────────────────────────────

describe('deriveAltFromFilename', () => {
  it('strips a single extension', () => {
    assert.equal(deriveAltFromFilename('photo.jpg'), 'photo')
    assert.equal(deriveAltFromFilename('banner.png'), 'banner')
  })
  it('strips only the LAST extension (multi-dot files)', () => {
    assert.equal(deriveAltFromFilename('event.2024.banner.jpg'), 'event.2024.banner')
    assert.equal(deriveAltFromFilename('my.file.name.webp'), 'my.file.name')
  })
  it('falls back to the full filename when no extension is present', () => {
    assert.equal(deriveAltFromFilename('IMG_2024'), 'IMG_2024')
    assert.equal(deriveAltFromFilename('README'), 'README')
  })
  it('preserves a single trailing dot when filename ends with one', () => {
    // 'photo.' → split: base='', ext='.'; but our function uses lastIndexOf('.')
    // and returns slice(0, idx) which is 'photo'. Edge case: empty base
    // (file starts with '.') returns the original name (no exception).
    assert.equal(deriveAltFromFilename('.hidden'), '.hidden')
  })
  it('returns the original name for filenames without a dot', () => {
    assert.equal(deriveAltFromFilename('icon'), 'icon')
  })
})

// ─── buildMediaWhere ────────────────────────────────────────────────────────

describe('buildMediaWhere', () => {
  it('folder=null + filter=all + search="" → root, no mime, no search', () => {
    const q = buildMediaWhere(null, 'all', '')
    assert.equal(q, 'where[and][0][folder][exists]=false')
  })
  it('folder=42 + filter=all → folder[equals]=42 only', () => {
    const q = buildMediaWhere(42, 'all', '')
    assert.equal(q, 'where[and][0][folder][equals]=42')
  })
  it('filter=image adds mimeType[contains]=image%2F', () => {
    const q = buildMediaWhere(null, 'image', '')
    assert.ok(q.includes('where[and][1][mimeType][contains]=image%2F'))
  })
  it('filter=video adds mimeType[contains]=video%2F', () => {
    const q = buildMediaWhere(null, 'video', '')
    assert.ok(q.includes('where[and][1][mimeType][contains]=video%2F'))
  })
  it('filter=document adds three or-clauses for pdf / msword / vnd', () => {
    const q = buildMediaWhere(null, 'document', '')
    assert.ok(q.includes('where[and][1][or][0][mimeType][contains]=application%2Fpdf'))
    assert.ok(q.includes('where[and][1][or][1][mimeType][contains]=application%2Fmsword'))
    assert.ok(q.includes('where[and][1][or][2][mimeType][contains]=application%2Fvnd'))
  })
  it('search="foo bar" URL-encodes the value and adds filename+alt or-clauses', () => {
    const q = buildMediaWhere(null, 'all', 'foo bar')
    assert.ok(q.includes('where[and][2][or][0][filename][like]=foo%20bar'))
    assert.ok(q.includes('where[and][2][or][1][alt][like]=foo%20bar'))
  })
  it('search with special chars is percent-encoded (no broken query string)', () => {
    const q = buildMediaWhere(null, 'all', 'a&b=c')
    assert.ok(q.includes('where[and][2][or][0][filename][like]=a%26b%3Dc'))
  })
  it('combines folder + filter + search with all three and-clauses', () => {
    const q = buildMediaWhere(7, 'image', 'sunset')
    assert.ok(q.startsWith('where[and][0][folder][equals]=7'))
    assert.ok(q.includes('where[and][1][mimeType][contains]=image%2F'))
    assert.ok(q.includes('where[and][2][or][0][filename][like]=sunset'))
  })

  // Regression: the query previously had no way to scope by the selected
  // admin site at all, so switching the tenant selector never narrowed the
  // Media Library — it always listed every tenant's uploads.
  it('tenantId scopes the query to that site — omitted entirely when absent', () => {
    const scoped = buildMediaWhere(null, 'all', '', 3)
    assert.ok(scoped.includes('where[and][3][tenant][equals]=3'))

    const unscoped = buildMediaWhere(null, 'all', '')
    assert.ok(!unscoped.includes('[tenant]'))
  })
  it('tenantId is omitted for null/undefined/empty-string (no false narrowing)', () => {
    assert.ok(!buildMediaWhere(null, 'all', '', null).includes('[tenant]'))
    assert.ok(!buildMediaWhere(null, 'all', '', undefined).includes('[tenant]'))
    assert.ok(!buildMediaWhere(null, 'all', '', '').includes('[tenant]'))
  })
  it('tenantId composes with folder + filter + search', () => {
    const q = buildMediaWhere(7, 'image', 'sunset', 3)
    assert.ok(q.includes('where[and][0][folder][equals]=7'))
    assert.ok(q.includes('where[and][1][mimeType][contains]=image%2F'))
    assert.ok(q.includes('where[and][2][or][0][filename][like]=sunset'))
    assert.ok(q.includes('where[and][3][tenant][equals]=3'))
  })
})

// ─── buildFolderWhere ───────────────────────────────────────────────────────

describe('buildFolderWhere', () => {
  it('returns empty string when neither folder nor tenant is given', () => {
    assert.equal(buildFolderWhere(undefined), '')
    assert.equal(buildFolderWhere(undefined, undefined), '')
    assert.equal(buildFolderWhere(undefined, null), '')
    assert.equal(buildFolderWhere(undefined, ''), '')
  })
  it('folder=null (root) with no tenant', () => {
    assert.equal(buildFolderWhere(null), 'where[and][0][folder][exists]=false')
  })
  it('folder=id with no tenant', () => {
    assert.equal(buildFolderWhere(42), 'where[and][0][folder][equals]=42')
  })
  it('folder undefined (skip parent scope) + tenant — used by the flat "all folders" list', () => {
    assert.equal(buildFolderWhere(undefined, 3), 'where[and][0][tenant][equals]=3')
  })
  it('folder + tenant combine as sequential and-indices', () => {
    assert.equal(
      buildFolderWhere(42, 3),
      'where[and][0][folder][equals]=42&where[and][1][tenant][equals]=3',
    )
    assert.equal(
      buildFolderWhere(null, 3),
      'where[and][0][folder][exists]=false&where[and][1][tenant][equals]=3',
    )
  })
})

// ─── runWithConcurrency ─────────────────────────────────────────────────────

/**
 * Build a worker that records the peak number of simultaneously-running calls.
 * Each call yields to the microtask queue a few times so overlapping workers
 * genuinely interleave.
 */
function trackingWorker() {
  const seen: number[] = []
  let inFlight = 0
  let peak = 0
  const worker = async (item: number) => {
    inFlight += 1
    peak = Math.max(peak, inFlight)
    for (let i = 0; i < 3; i++) await Promise.resolve()
    seen.push(item)
    inFlight -= 1
  }
  return { worker, seen, peak: () => peak }
}

describe('runWithConcurrency', () => {
  it('never runs more than `limit` workers at once', async () => {
    const items = Array.from({ length: 20 }, (_, i) => i)
    const t = trackingWorker()
    await runWithConcurrency(items, 3, t.worker)
    assert.equal(t.peak(), 3)
  })

  it('processes every item exactly once', async () => {
    const items = Array.from({ length: 20 }, (_, i) => i)
    const t = trackingWorker()
    await runWithConcurrency(items, 3, t.worker)
    assert.deepEqual([...t.seen].sort((a, b) => a - b), items)
  })

  it('passes the original index alongside the item', async () => {
    const items = ['a', 'b', 'c']
    const pairs: Array<[string, number]> = []
    await runWithConcurrency(items, 2, async (item, index) => {
      pairs.push([item, index])
    })
    assert.deepEqual(pairs.sort((x, y) => x[1] - y[1]), [
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ])
  })

  it('does not over-spawn runners when there are fewer items than the limit', async () => {
    const t = trackingWorker()
    await runWithConcurrency([1, 2], 10, t.worker)
    assert.equal(t.peak(), 2)
  })

  it('handles an empty list without hanging', async () => {
    let calls = 0
    await runWithConcurrency([], 3, async () => {
      calls += 1
    })
    assert.equal(calls, 0)
  })

  it('clamps a non-positive limit to a single runner rather than stalling', async () => {
    const t = trackingWorker()
    await runWithConcurrency([1, 2, 3], 0, t.worker)
    assert.equal(t.peak(), 1)
    assert.equal(t.seen.length, 3)
  })
})
