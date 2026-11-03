import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { autoFillExcerpt } from './auto-fill-excerpt'

type Args = Parameters<typeof autoFillExcerpt>[0]

function run(data: Record<string, unknown>, originalDoc?: Record<string, unknown>): Record<string, unknown> {
  return autoFillExcerpt({ data, originalDoc } as unknown as Args) as Record<string, unknown>
}

describe('autoFillExcerpt', () => {
  it('derives an excerpt from contentMd when none is stored or sent', () => {
    assert.equal(run({ contentMd: '# Hello\n\nWorld' }).excerpt, '<p>Hello World</p>')
  })

  it('keeps the stored excerpt when a partial update sends contentMd without an excerpt key', () => {
    const out = run({ contentMd: 'New body' }, { excerpt: '<p>Curated</p>' })
    assert.equal(out.excerpt, undefined)
  })

  it('still derives when the editor explicitly clears the excerpt', () => {
    assert.equal(run({ contentMd: 'New body', excerpt: '' }, { excerpt: '<p>Curated</p>' }).excerpt, '<p>New body</p>')
  })
})
