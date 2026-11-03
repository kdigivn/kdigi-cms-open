import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { hashPayload, pickPrimaryPrice, projectLive, runContentPhase, taxonomyIdsForDoc } from './phase-content'
import { staged, type ImportContext } from './import-context'

describe('phase-content helpers', () => {
  describe('hashPayload', () => {
    it('returns stable hash regardless of key insertion order', () => {
      const a = hashPayload({ title: 'A', slug: 'a', contentMd: 'x', status: 'published' })
      const b = hashPayload({ status: 'published', contentMd: 'x', slug: 'a', title: 'A' })
      assert.equal(a, b)
    })
    it('returns different hash when fields change', () => {
      const a = hashPayload({ title: 'A', slug: 'a', contentMd: 'x', status: 'published' })
      const b = hashPayload({ title: 'B', slug: 'a', contentMd: 'x', status: 'published' })
      assert.notEqual(a, b)
    })
    it('detects a change in a nested field (e.g. seo.openGraph.image) — regression guard', () => {
      const a = hashPayload({ title: 'A', seo: { openGraph: { image: 'url-1' } } })
      const b = hashPayload({ title: 'A', seo: { openGraph: { image: 'url-2' } } })
      assert.notEqual(a, b)
    })
    it('two objects with different key sets never accidentally match — regression guard', () => {
      // The bug this guards against: JSON.stringify(obj, Object.keys(obj).sort())
      // filters every nesting level by the SAME top-level key list, so an
      // object with extra keys (tenant, categories, ...) could never
      // structurally match a shorter comparison object even when the shared
      // fields were identical.
      const withExtraKeys = hashPayload({ title: 'A', tenant: 1, categories: [1, 2] })
      const shortForm = hashPayload({ title: 'A' })
      assert.notEqual(withExtraKeys, shortForm)
    })
    it('treats equal-instant ISO datetimes with different offsets as the same value — regression guard', () => {
      // seo.articleMeta.publishedTime: staged/ keeps the WP `+07:00` offset,
      // Payload's Local API always returns UTC `.000Z` for the same instant.
      const a = hashPayload({ seo: { articleMeta: { publishedTime: '2025-12-25T09:00:16+07:00' } } })
      const b = hashPayload({ seo: { articleMeta: { publishedTime: '2025-12-25T02:00:16.000Z' } } })
      assert.equal(a, b)
    })
    it('treats an offset-less ISO datetime as UTC, not local time — regression guard', () => {
      // Some staged/ dates carry no timezone suffix at all (WP exported them
      // that way). Payload/Postgres treat that as UTC on write; `new
      // Date(str)` alone would parse it as local time and shift it.
      const a = hashPayload({ seo: { articleMeta: { publishedTime: '2025-12-22T16:56:37' } } })
      const b = hashPayload({ seo: { articleMeta: { publishedTime: '2025-12-22T16:56:37.000Z' } } })
      assert.equal(a, b)
    })
  })

  describe('projectLive', () => {
    it('drops Payload-only keys (id, unset defaults) from array-of-object fields — regression guard', () => {
      // prices is an array of objects; Payload always returns a generated
      // row `id` and unset-field defaults (e.g. validUntil: null) that this
      // phase never writes. Naive array pass-through made these always diff.
      const shape = { prices: [{ currentPrice: 100, originalPrice: 100 }] }
      const live = { prices: [{ currentPrice: 100, originalPrice: 100, id: 'abc123', validUntil: null }] }
      assert.deepEqual(projectLive(live, shape), shape)
    })
    it('leaves a length-mismatched array unprojected so it still shows as a diff', () => {
      const shape = { categories: [1, 2] }
      const live = { categories: [1, 2, 3] }
      const projected = projectLive(live, shape)
      assert.notDeepEqual(projected, shape)
    })
  })
  describe('taxonomy promotion', () => {
    it('resolves core + custom refs in the current site and deduplicates them', () => {
      const ids = new Map<string, string | number>([
        ['category:news', 10],
        ['tag:travel', 20],
        ['custom:genre:jazz', 30],
        ['custom:genre:blues', 20], // same CMS id as the tag → deduplicated
      ])
      const post = {
        categories: [{ slug: 'news', name: 'News', wpId: 1 }],
        tags: [{ slug: 'travel', name: 'Travel', wpId: 2 }],
        customTerms: [
          { taxonomy: 'genre', slug: 'jazz', name: 'Jazz', wpId: 3 },
          { taxonomy: 'genre', slug: 'blues', name: 'Blues', wpId: 4 },
          { taxonomy: 'genre', slug: 'missing-here', name: 'Missing', wpId: 5 },
        ],
      }
      assert.deepEqual(taxonomyIdsForDoc(post, ids), [10, 20, 30])
    })
    it('uses product-category for product categories', () => {
      const ids = new Map<string, string | number>([['product-category:shoes', 5]])
      assert.deepEqual(
        taxonomyIdsForDoc({ categories: [{ slug: 'shoes', name: 'Shoes', wpId: 1 }], tags: [] }, ids, 'product-category'),
        [5],
      )
    })
  })

  it('updates source dates when only dates differ, then skips an identical repeat', async () => {
    const sourcePost = {
      collection: 'posts' as const,
      title: 'Date-only post',
      slug: 'date-only-post',
      contentMd: 'Body',
      wpStatus: 'publish',
      status: 'published' as const,
      date: '2026-01-10T00:00:00+07:00',
      modified: '2026-01-14T00:00:00+07:00',
      wp: { databaseId: 1 },
      categories: [],
      tags: [],
      seo: {},
    }
    let live: Record<string, unknown> = {
      id: 101,
      title: sourcePost.title,
      slug: sourcePost.slug,
      contentMd: sourcePost.contentMd,
      status: sourcePost.status,
      tenant: 7,
      publishedAt: '2026-01-01T00:00:00.000Z',
      seo: {
        articleMeta: {
          publishedTime: '2026-01-01T00:00:00.000Z',
          modifiedTime: '2026-01-02T00:00:00.000Z',
        },
      },
    }
    let updates = 0
    const payload = {
      find: async (args: { collection: string }) => {
        if (args.collection === 'taxonomies') return { docs: [], totalDocs: 0 }
        if (args.collection === 'faqs') return { docs: [], totalDocs: 0, hasNextPage: false }
        if (args.collection === 'authors') return { docs: [], totalDocs: 0 }
        if (args.collection === 'posts') return { docs: [{ id: 101 }], totalDocs: 1 }
        return { docs: [], totalDocs: 0 }
      },
      findByID: async () => live,
      update: async (args: { data: unknown }) => {
        const incoming = args.data as Record<string, unknown>
        const incomingSeo = (incoming.seo ?? {}) as Record<string, unknown>
        const currentSeo = (live.seo ?? {}) as Record<string, unknown>
        live = {
          ...live,
          ...incoming,
          seo: {
            ...currentSeo,
            ...incomingSeo,
            articleMeta: {
              ...((currentSeo.articleMeta ?? {}) as Record<string, unknown>),
              ...((incomingSeo.articleMeta ?? {}) as Record<string, unknown>),
            },
          },
        }
        updates++
        return live
      },
      create: async () => ({ id: 101 }),
    }
    const originals = { pages: staged.pages, posts: staged.posts, products: staged.products }
    staged.pages = () => []
    staged.posts = () => [sourcePost]
    staged.products = () => []
    try {
      const ctx = {
        cfg: { site: 'date-test', wpUrl: 'https://wp.example.test', wpHost: 'wp.example.test', publicHost: 'wp.example.test', domain: 'example.test', language: 'en' as const },
        payload: payload as unknown as ImportContext['payload'],
        tenantId: 7,
        dryRun: false,
        log: () => {},
      } satisfies ImportContext
      await runContentPhase(ctx)
      assert.equal(updates, 1)
      assert.equal(live.publishedAt, sourcePost.date)
      assert.equal(
        ((live.seo as Record<string, unknown>).articleMeta as Record<string, unknown>).modifiedTime,
        sourcePost.modified,
      )
      await runContentPhase(ctx)
      assert.equal(updates, 1)
    } finally {
      staged.pages = originals.pages
      staged.posts = originals.posts
      staged.products = originals.products
    }
  })

  describe('pickPrimaryPrice', () => {
    it('uses the sale price as current and the regular price as original', () => {
      assert.deepEqual(pickPrimaryPrice({ regular: 200, sale: 150, currency: 'USD' }), {
        originalPrice: 200,
        currentPrice: 150,
        currency: 'USD',
      })
    })
    it('uses the regular price for both when there is no sale', () => {
      assert.deepEqual(pickPrimaryPrice({ regular: 50 }), { originalPrice: 50, currentPrice: 50 })
    })
    it('returns null without a price', () => {
      assert.equal(pickPrimaryPrice(undefined), null)
      assert.equal(pickPrimaryPrice({}), null)
    })
  })
})