import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolveExcerpt } from './normalize-raw-to-staged'

const AUTO = '<p>The old lighthouse is one of the best known landmarks on the coast and a favourite spot for [&hellip;]</p>\n'

describe('resolveExcerpt', () => {
  it("replaces WP's auto-truncated excerpt with the meta description", () => {
    assert.equal(
      resolveExcerpt(AUTO, 'Visit the old lighthouse – a coastal landmark since 1890.'),
      'Visit the old lighthouse – a coastal landmark since 1890.',
    )
  })

  it('strips zero-width characters and collapses whitespace from the description', () => {
    assert.equal(resolveExcerpt(AUTO, '  Quiet  beach\u200B.\u200B '), 'Quiet beach.')
  })

  it('keeps a hand-written excerpt untouched', () => {
    assert.equal(
      resolveExcerpt('<p>Summary written by the editor.</p>', 'Another SEO description.'),
      'Summary written by the editor.',
    )
  })

  it('leaves the excerpt unset when it is truncated and there is no description', () => {
    assert.equal(resolveExcerpt(AUTO, undefined), undefined)
    assert.equal(resolveExcerpt(AUTO, ' \u200B '), undefined)
  })

  it('returns undefined for an empty excerpt', () => {
    assert.equal(resolveExcerpt('', 'Description'), undefined)
    assert.equal(resolveExcerpt(null, 'Description'), undefined)
  })
})
