import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { contentToMarkdownDoc, createArgs, parseMarkdownDoc, updateArgs, withUpdatedAt } from './markdown-doc.js'

const CONTENT = {
  collection: 'posts',
  id: 12,
  site: 'example',
  locale: 'vi',
  title: 'Xin chào: thế giới',
  slug: 'xin-chao',
  status: 'draft',
  publishedAt: null,
  updatedAt: '2026-11-03T10:00:00.000Z',
  bodySource: 'markdown',
  markdown: '## Heading\n\nBody with [link](/x).',
  featuredImage: { id: 5, url: 'https://cdn.example.com/a.png', alt: 'A' },
  seo: { title: 'SEO title', description: null, focusKeywords: ['xin chào'], canonicalOverride: null },
  type: 'blog',
  excerpt: 'Short',
  author: { id: 3, name: 'Writer' },
  categories: [
    { id: 1, type: 'category', slug: 'news', name: 'News' },
    { id: 2, type: 'tag', slug: 'ai', name: 'AI' },
  ],
}

describe('markdown doc round-trip', () => {
  it('get → file → parse yields no changes to send', () => {
    const doc = parseMarkdownDoc(contentToMarkdownDoc(CONTENT), 'posts')
    assert.deepEqual(updateArgs(doc, CONTENT, 'posts'), { id: 12, expectedUpdatedAt: '2026-11-03T10:00:00.000Z', locale: 'vi' })
  })

  it('keeps {type, slug} categories (a tag never turns into a category)', () => {
    const doc = parseMarkdownDoc(contentToMarkdownDoc(CONTENT), 'posts')
    assert.deepEqual(doc.meta.categories, [
      { type: 'category', slug: 'news' },
      { type: 'tag', slug: 'ai' },
    ])
  })

  it('sends only the edited fields, with the file updatedAt as the concurrency token', () => {
    const text = contentToMarkdownDoc(CONTENT).replace('Body with', 'Edited body with').replace('title: SEO title', 'title: New SEO title')
    const args = updateArgs(parseMarkdownDoc(text, 'posts'), CONTENT, 'posts')
    assert.deepEqual(args, {
      id: 12,
      expectedUpdatedAt: '2026-11-03T10:00:00.000Z',
      locale: 'vi',
      seo: { title: 'New SEO title' },
      markdown: '## Heading\n\nEdited body with [link](/x).',
    })
  })

  it('rejects unknown and wrong-collection keys instead of dropping them', () => {
    assert.throws(() => parseMarkdownDoc('---\ntitle: x\ntenant: 4\n---\nbody', 'posts'), /Unknown frontmatter key.*tenant/)
    assert.throws(() => parseMarkdownDoc('---\ntitle: x\nexcerpt: e\n---\nbody', 'pages'), /Unknown frontmatter key.*excerpt/)
    assert.throws(() => parseMarkdownDoc('---\nseo: { keywords: [a] }\n---\n', 'posts'), /Unknown seo key/)
  })

  it('refuses to update without the concurrency token', () => {
    const doc = parseMarkdownDoc('---\nid: 12\ntitle: x\n---\nbody', 'posts')
    assert.throws(() => updateArgs(doc, CONTENT, 'posts'), /updatedAt/)
  })

  it('builds create args without server-owned keys', () => {
    const args = createArgs(parseMarkdownDoc('---\ntitle: Hi\nsite: example\ncategories: [news]\n---\n\nBody\n', 'posts'), 'posts')
    assert.deepEqual(args, { markdown: 'Body', site: 'example', title: 'Hi', categories: ['news'] })
  })

  it('rewrites updatedAt in place after a save', () => {
    const text = contentToMarkdownDoc(CONTENT)
    const next = withUpdatedAt(text, '2026-11-04T00:00:00.000Z')
    assert.equal(parseMarkdownDoc(next, 'posts').meta.updatedAt, '2026-11-04T00:00:00.000Z')
    assert.equal(next.replace('2026-11-04T00:00:00.000Z', '2026-11-03T10:00:00.000Z'), text)
  })
})
