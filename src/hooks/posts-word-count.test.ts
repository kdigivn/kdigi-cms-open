/**
 * posts-word-count: a beforeChange hook since SP1a-1 (one write per save — see the hook doc).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { postsWordCount, computeWordCount } from './posts-word-count'

type HookArgs = Parameters<typeof postsWordCount>[0]

function run(data: Record<string, unknown>, originalDoc?: Record<string, unknown>, context: Record<string, unknown> = {}) {
  return postsWordCount({
    data,
    originalDoc,
    req: { context } as unknown as HookArgs['req'],
    operation: originalDoc ? 'update' : 'create',
  } as unknown as HookArgs) as Record<string, unknown>
}

describe('posts-word-count — beforeChange', () => {
  it('counts the submitted Markdown into the same write', () => {
    assert.equal(run({ contentMd: '# Tiêu đề\n\nMột hai ba' }).wordCount, 5)
  })

  it('a partial update without contentMd counts the stored body instead of zeroing it', () => {
    assert.equal(run({ status: 'published' }, { contentMd: 'one two three' }).wordCount, 3)
  })

  it('an emptied body counts 0 (explicit empty string wins over the stored body)', () => {
    assert.equal(run({ contentMd: '' }, { contentMd: 'one two three' }).wordCount, 0)
  })

})

describe('computeWordCount — pure helper', () => {
  it('returns 0 for empty / non-string content', () => {
    assert.equal(computeWordCount(''), 0)
    assert.equal(computeWordCount(null), 0)
    assert.equal(computeWordCount(undefined), 0)
    assert.equal(computeWordCount(42), 0)
  })

  it('counts whitespace-separated tokens', () => {
    assert.equal(computeWordCount('one two three'), 3)
  })

  it('strips HTML tags and markdown', () => {
    assert.equal(computeWordCount('<p>hello <strong>world</strong></p>'), 2)
    assert.equal(computeWordCount('# Heading\n\nBody text'), 3)
  })
})
