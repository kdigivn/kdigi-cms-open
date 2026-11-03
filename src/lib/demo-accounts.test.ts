import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { changedLockedFields, isDemoAccountEmail, parseDemoAccountEmails } from './demo-accounts'

describe('parseDemoAccountEmails', () => {
  it('splits, trims, lowercases and drops empties', () => {
    assert.deepEqual([...parseDemoAccountEmails(' A@x.com, ,b@X.com ,')], ['a@x.com', 'b@x.com'])
  })
  it('treats unset/empty as no demo accounts', () => {
    assert.equal(parseDemoAccountEmails(undefined).size, 0)
    assert.equal(parseDemoAccountEmails('').size, 0)
  })
})

describe('isDemoAccountEmail', () => {
  it('matches case-insensitively and rejects others / non-strings', () => {
    assert.equal(isDemoAccountEmail('Demo@Example.com', 'demo@example.com,x@y.z'), true)
    assert.equal(isDemoAccountEmail('other@example.com', 'demo@example.com'), false)
    assert.equal(isDemoAccountEmail(undefined, 'demo@example.com'), false)
    assert.equal(isDemoAccountEmail('demo@example.com', ''), false)
  })
})

describe('changedLockedFields', () => {
  const original = { email: 'demo@example.com', enableAPIKey: false, apiKey: undefined }

  it('flags a submitted password', () => {
    assert.deepEqual(changedLockedFields({ password: 'x' }, original), ['password'])
  })
  it('flags a different email but not the same one in another case', () => {
    assert.deepEqual(changedLockedFields({ email: 'new@example.com' }, original), ['email'])
    assert.deepEqual(changedLockedFields({ email: 'DEMO@example.com' }, original), [])
  })
  it('flags API key changes only when the value differs', () => {
    assert.deepEqual(changedLockedFields({ enableAPIKey: true }, original), ['enableAPIKey'])
    assert.deepEqual(changedLockedFields({ enableAPIKey: false, apiKey: null }, original), [])
    assert.deepEqual(changedLockedFields({ apiKey: 'abc' }, original), ['apiKey'])
  })
  it('ignores unrelated fields and empty data', () => {
    assert.deepEqual(changedLockedFields({ role: 'editor' }, original), [])
    assert.deepEqual(changedLockedFields(undefined, original), [])
  })
})
