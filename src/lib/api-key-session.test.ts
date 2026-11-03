import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { changedAccountFields, isApiKeySession } from './api-key-session'

describe('isApiKeySession', () => {
  it('is true only for the api-key strategy', () => {
    assert.equal(isApiKeySession({ id: 1, _strategy: 'api-key' }), true)
    assert.equal(isApiKeySession({ id: 1, _strategy: 'local-jwt' }), false)
    assert.equal(isApiKeySession({ id: 1 }), false)
    assert.equal(isApiKeySession(null), false)
  })
})

describe('changedAccountFields', () => {
  const original = { email: 'a@example.com', role: 'editor', tenants: [{ tenant: 1 }, { tenant: { id: 2 } }] }

  it('flags credential, role and membership changes', () => {
    assert.deepEqual(changedAccountFields({ password: 'change-me' }, original), ['password'])
    assert.deepEqual(changedAccountFields({ role: 'super-admin' }, original), ['role'])
    assert.deepEqual(changedAccountFields({ tenants: [{ tenant: 1 }, { tenant: 3 }] }, original), ['tenants'])
  })

  it('ignores an unchanged re-submission (same membership in another order/shape)', () => {
    const data = { email: 'A@example.com', role: 'editor', tenants: [{ tenant: { id: 2 } }, { tenant: '1' }] }
    assert.deepEqual(changedAccountFields(data, original), [])
  })
})
