import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  jsonLdSlugForDocument,
  resolveAuthorName,
  resolveOgImageUrl,
} from './generate-jsonld'

describe('generate-jsonld relationship and route helpers', () => {
  it('resolves a bare author relationship ID', async () => {
    const calls: Array<Record<string, unknown>> = []
    const payload = {
      findByID: async (args: Record<string, unknown>) => {
        calls.push(args)
        return { id: 42, name: 'Trương Nhựt Tiến' }
      },
    }

    const name = await resolveAuthorName(payload as never, 42)

    assert.equal(name, 'Trương Nhựt Tiến')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].collection, 'authors')
    assert.equal(calls[0].id, 42)
  })

  it('uses a populated author without another query', async () => {
    const payload = {
      findByID: async () => {
        throw new Error('findByID should not run for a populated relation')
      },
    }

    const name = await resolveAuthorName(payload as never, {
      id: 42,
      name: 'Trương Nhựt Tiến',
    })

    assert.equal(name, 'Trương Nhựt Tiến')
  })

  it('adds the frontend route prefix only for products', () => {
    assert.equal(jsonLdSlugForDocument('product', 'sai-gon-con-dao'), 'product/sai-gon-con-dao')
    assert.equal(jsonLdSlugForDocument('landing', 'sai-gon-con-dao'), 'sai-gon-con-dao')
    assert.equal(jsonLdSlugForDocument('post', 'kinh-nghiem-con-dao'), 'kinh-nghiem-con-dao')
  })
})

describe('resolveOgImageUrl — og:image cascade for JSON-LD', () => {
  const DEFAULT_URL = 'https://cdn.test/site-default.jpg'
  const FEATURED = { id: 10, url: 'https://cdn.test/featured.jpg' }
  const EXPLICIT_OG = { url: 'https://cdn.test/explicit-og.jpg' }
  const payload = { findByID: async () => null } as never

  it('uses a genuinely editor-set OG image over featuredImage', async () => {
    const url = await resolveOgImageUrl(payload, EXPLICIT_OG, FEATURED, DEFAULT_URL)
    assert.equal(url, 'https://cdn.test/explicit-og.jpg')
  })

  it('falls back to featuredImage when OG image is empty', async () => {
    const url = await resolveOgImageUrl(payload, undefined, FEATURED, DEFAULT_URL)
    assert.equal(url, 'https://cdn.test/featured.jpg')
  })

  it('falls back to the site default when both OG image and featuredImage are empty', async () => {
    const url = await resolveOgImageUrl(payload, undefined, undefined, DEFAULT_URL)
    assert.equal(url, DEFAULT_URL)
  })

  it('prefers featuredImage when the stored OG image is just the site default (stale backfill)', async () => {
    const staleOg = { url: DEFAULT_URL }
    const url = await resolveOgImageUrl(payload, staleOg, FEATURED, DEFAULT_URL)
    assert.equal(url, 'https://cdn.test/featured.jpg')
  })

  it('keeps the stale-default OG image when there is no featuredImage to prefer', async () => {
    const staleOg = { url: DEFAULT_URL }
    const url = await resolveOgImageUrl(payload, staleOg, undefined, DEFAULT_URL)
    assert.equal(url, DEFAULT_URL)
  })
})
