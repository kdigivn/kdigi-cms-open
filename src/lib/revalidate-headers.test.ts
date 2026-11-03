import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { revalidateHeaders } from './revalidate-headers'

describe('revalidateHeaders', () => {
  const saved = process.env.REVALIDATE_SECRET
  afterEach(() => {
    if (saved === undefined) delete process.env.REVALIDATE_SECRET
    else process.env.REVALIDATE_SECRET = saved
  })

  it('is unauthenticated when REVALIDATE_SECRET is unset', () => {
    delete process.env.REVALIDATE_SECRET
    assert.deepEqual(revalidateHeaders(), { 'Content-Type': 'application/json' })
  })

  it('adds x-revalidate-secret when REVALIDATE_SECRET is set', () => {
    process.env.REVALIDATE_SECRET = 's3cret'
    assert.deepEqual(revalidateHeaders(), { 'Content-Type': 'application/json', 'x-revalidate-secret': 's3cret' })
  })
})
