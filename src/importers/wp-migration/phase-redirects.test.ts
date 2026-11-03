import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildContentRedirects, relativizeTarget } from './phase-redirects'

describe('buildContentRedirects', () => {
  it('redirects a dated WordPress permalink to the CMS public path', () => {
    const rows = buildContentRedirects([
      { collection: 'posts', slug: 'hello', sourcePath: '/2024/05/hello/', status: 'published' },
    ])
    assert.deepEqual(rows.map((r) => [r.from, r.to, r.statusCode]), [['/2024/05/hello/', '/hello', 301]])
  })

  it('maps products to /product/<slug> and nested pages to the flat slug', () => {
    const rows = buildContentRedirects([
      { collection: 'products', slug: 'mug', sourcePath: '/shop/mug/', status: 'published' },
      { collection: 'pages', slug: 'team', sourcePath: '/about/team/', status: 'published' },
    ])
    assert.deepEqual(rows.map((r) => r.to), ['/product/mug', '/team'])
  })

  it('skips unchanged paths, the homepage, drafts, missing paths and duplicate sources', () => {
    const rows = buildContentRedirects([
      { collection: 'pages', slug: 'contact', sourcePath: '/contact/', status: 'published' },
      { collection: 'pages', slug: 'home', sourcePath: '/', status: 'published' },
      { collection: 'posts', slug: 'draft-post', sourcePath: '/2024/draft-post/', status: 'draft' },
      { collection: 'posts', slug: 'no-path', status: 'published' },
      { collection: 'posts', slug: 'a', sourcePath: '/dup/', status: 'published' },
      { collection: 'posts', slug: 'b', sourcePath: '/dup', status: 'published' },
    ])
    assert.deepEqual(rows.map((r) => r.from), ['/dup/'])
    assert.equal(rows[0].to, '/a')
  })
})

describe('relativizeTarget', () => {
  it('strips the target domain, keeps other hosts and defaults to /', () => {
    assert.equal(relativizeTarget('https://www.example.org/blog/x', 'example.org'), '/blog/x')
    assert.equal(relativizeTarget('https://example.org', 'example.org'), '/')
    assert.equal(relativizeTarget('https://other.test/x', 'example.org'), 'https://other.test/x')
    assert.equal(relativizeTarget('/already/relative', 'example.org'), '/already/relative')
  })
})
