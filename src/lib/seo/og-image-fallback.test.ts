/**
 * Tests for the shared OG-image fallback helpers.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  extractTenantId,
  isPopulatedMedia,
  loadSiteDefaultOgImageMedia,
  mediaUrlOf,
  resolveMediaUrl,
} from './og-image-fallback'

describe('isPopulatedMedia', () => {
  it('true for objects carrying url or externalUrl', () => {
    assert.equal(isPopulatedMedia({ url: 'https://x/a.jpg' }), true)
    assert.equal(isPopulatedMedia({ externalUrl: 'https://x/a.jpg' }), true)
  })
  it('false for bare ids, null, and empty objects', () => {
    assert.equal(isPopulatedMedia(10), false)
    assert.equal(isPopulatedMedia('10'), false)
    assert.equal(isPopulatedMedia(null), false)
    assert.equal(isPopulatedMedia({}), false)
  })
})

describe('mediaUrlOf', () => {
  it('prefers externalUrl (CDN) over url', () => {
    assert.equal(mediaUrlOf({ url: '/a.jpg', externalUrl: 'https://cdn/a.jpg' }), 'https://cdn/a.jpg')
  })
  it('falls back to url when no externalUrl', () => {
    assert.equal(mediaUrlOf({ url: 'https://cdn/a.jpg' }), 'https://cdn/a.jpg')
  })
  it('undefined for unpopulated values', () => {
    assert.equal(mediaUrlOf(10), undefined)
    assert.equal(mediaUrlOf(null), undefined)
  })
})

describe('extractTenantId', () => {
  it('unwraps object tenant to its id', () => {
    assert.equal(extractTenantId({ id: 7, name: 'x' }), 7)
  })
  it('passes through scalar id and null', () => {
    assert.equal(extractTenantId(7), 7)
    assert.equal(extractTenantId('7'), '7')
    assert.equal(extractTenantId(null), null)
    assert.equal(extractTenantId(undefined), null)
  })
})

describe('resolveMediaUrl', () => {
  const payload = {
    findByID: async ({ id }: { id: unknown }) =>
      id === 10 ? { id: 10, url: 'https://cdn/from-id.jpg' } : null,
  } as never

  it('returns the URL directly from a populated media object without a fetch', async () => {
    assert.equal(await resolveMediaUrl(payload, { url: 'https://cdn/direct.jpg' }), 'https://cdn/direct.jpg')
  })
  it('fetches media by id and returns its URL', async () => {
    assert.equal(await resolveMediaUrl(payload, 10), 'https://cdn/from-id.jpg')
  })
  it('undefined for a missing id or nullish input', async () => {
    assert.equal(await resolveMediaUrl(payload, 404), undefined)
    assert.equal(await resolveMediaUrl(payload, null), undefined)
  })
})

describe('loadSiteDefaultOgImageMedia', () => {
  function makePayload() {
    const calls: unknown[] = []
    return {
      calls,
      payload: {
        findByID: async ({ id }: { id: unknown }) => {
          calls.push(id)
          return { id, seoDefaults: { ogImage: { id: 99, url: 'https://cdn/default.jpg' } } }
        },
      } as never,
    }
  }

  it('returns the populated site default media object', async () => {
    const { payload } = makePayload()
    const out = await loadSiteDefaultOgImageMedia(payload, 1, {})
    assert.deepEqual(out, { id: 99, url: 'https://cdn/default.jpg' })
  })

  it('returns null and does not fetch when tenantId is missing', async () => {
    const { payload, calls } = makePayload()
    const out = await loadSiteDefaultOgImageMedia(payload, null, {})
    assert.equal(out, null)
    assert.equal(calls.length, 0)
  })

  it('memoizes per tenant on the shared context', async () => {
    const { payload, calls } = makePayload()
    const ctx = {}
    await loadSiteDefaultOgImageMedia(payload, 1, ctx)
    await loadSiteDefaultOgImageMedia(payload, 1, ctx)
    assert.equal(calls.length, 1)
  })

  it('caches a null result (site without a default) so it is not re-fetched', async () => {
    const calls: unknown[] = []
    const payload = {
      findByID: async ({ id }: { id: unknown }) => {
        calls.push(id)
        return { id, seoDefaults: {} }
      },
    } as never
    const ctx = {}
    assert.equal(await loadSiteDefaultOgImageMedia(payload, 1, ctx), null)
    assert.equal(await loadSiteDefaultOgImageMedia(payload, 1, ctx), null)
    assert.equal(calls.length, 1)
  })

  it('dedupes CONCURRENT calls for the same tenant to a single read (no thundering herd)', async () => {
    // Regression test: a single find/list request fires this hook for many sibling
    // docs of the same tenant concurrently (e.g. a product alongside its populated
    // taxonomy `categories`, each needing the same tenant's default). Before
    // promise-memoization, only the FIRST caller's read populated the cache — any
    // caller racing in before that read resolved got a fresh (redundant) read of
    // its own; the two never influenced each other, but nothing here should
    // require sequencing to be correct.
    const calls: unknown[] = []
    let resolveFindByID!: (v: unknown) => void
    const payload = {
      findByID: async ({ id }: { id: unknown }) => {
        calls.push(id)
        return new Promise((resolve) => {
          resolveFindByID = () => resolve({ id, seoDefaults: { ogImage: { id: 99, url: 'https://cdn/default.jpg' } } })
        })
      },
    } as never
    const ctx = {}

    // Two callers start before either read resolves — the second must reuse the
    // first's in-flight promise rather than issuing its own findByID call.
    const first = loadSiteDefaultOgImageMedia(payload, 1, ctx)
    const second = loadSiteDefaultOgImageMedia(payload, 1, ctx)
    resolveFindByID(undefined)
    const [a, b] = await Promise.all([first, second])

    assert.equal(calls.length, 1, 'only one underlying findByID call for two concurrent callers')
    assert.deepEqual(a, { id: 99, url: 'https://cdn/default.jpg' })
    assert.deepEqual(b, { id: 99, url: 'https://cdn/default.jpg' })
  })
})
