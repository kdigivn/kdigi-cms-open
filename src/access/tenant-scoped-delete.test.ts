import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { PayloadRequest } from 'payload'

import { tenantScopedDelete } from './tenant-scoped'

const call = (user: Record<string, unknown>) => tenantScopedDelete({ req: { user } as unknown as PayloadRequest })

describe('tenantScopedDelete', () => {
  it('lets a browser session delete inside its own sites', () => {
    assert.deepEqual(call({ id: 1, role: 'editor', tenants: [{ tenant: 4 }] }), { tenant: { in: ['4'] } })
  })

  it('denies every API-key session, super-admin included', () => {
    assert.equal(call({ id: 1, role: 'editor', tenants: [{ tenant: 4 }], _strategy: 'api-key' }), false)
    assert.equal(call({ id: 2, role: 'super-admin', _strategy: 'api-key' }), false)
  })
})
