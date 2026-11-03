/**
 * Users self-update privilege boundaries.
 *
 * Every user may update their own document (password, API key), but `role` and the
 * plugin-injected `tenants` array are super-admin-only. Payload drops a field write the
 * caller may not perform (it keeps the stored value), so the assertions re-read the row.
 *
 * Runner: PAYLOAD_INTEGRATION=1 R2_OFF=true node --env-file=.env --import tsx \
 *   --test src/collections/users-self-escalation.integration.test.ts
 */
import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Payload } from 'payload'

import {
  getIntegrationPayload,
  closeIntegrationPayload,
  setupTwoTenants,
  cleanupTwoTenants,
  isIntegrationEnabled,
  type TwoTenantsFixture,
} from '../test-utils/payload-integration'

const tenantIds = (tenants: unknown): Array<number | string> =>
  ((tenants as Array<{ tenant: number | string | { id: number | string } }> | null) ?? []).map((row) =>
    typeof row.tenant === 'object' ? row.tenant.id : row.tenant,
  )

describe('Users self-escalation', { skip: !isIntegrationEnabled ? 'PAYLOAD_INTEGRATION=1 is not set' : false }, () => {
  let payload: Payload
  let fixture: TwoTenantsFixture

  before(async () => {
    payload = await getIntegrationPayload()
    fixture = await setupTwoTenants(payload, 'users-escalation')
  })

  after(async () => {
    if (payload && fixture) await cleanupTwoTenants(payload, fixture)
    await closeIntegrationPayload(payload)
  })

  for (const role of ['editor', 'author'] as const) {
    test(`${role} cannot promote their own role to super-admin`, async () => {
      const self = fixture.tenantA[role]
      await payload.update({
        collection: 'users',
        id: self.id,
        data: { role: 'super-admin' },
        user: self,
        overrideAccess: false,
      })
      const stored = await payload.findByID({ collection: 'users', id: self.id, overrideAccess: true })
      assert.equal(stored.role, role)
    })
  }

  test('editor cannot add another site to their own tenants', async () => {
    const self = fixture.tenantA.editor
    await payload.update({
      collection: 'users',
      id: self.id,
      data: { tenants: [{ tenant: fixture.tenantA.site.id }, { tenant: fixture.tenantB.site.id }] },
      user: self,
      overrideAccess: false,
    })
    const stored = await payload.findByID({ collection: 'users', id: self.id, overrideAccess: true, depth: 0 })
    assert.deepEqual(tenantIds(stored.tenants), [fixture.tenantA.site.id])
  })

  test('editor can still change their own password', async () => {
    const self = fixture.tenantA.editor
    await payload.update({
      collection: 'users',
      id: self.id,
      data: { password: 'NewPassword456!' },
      user: self,
      overrideAccess: false,
    })
    const login = await payload.login({
      collection: 'users',
      data: { email: self.email, password: 'NewPassword456!' },
    })
    assert.equal(login.user?.id, self.id)
  })

  test('super-admin can invite a new user', async () => {
    const created = await payload.create({
      collection: 'users',
      data: {
        email: `invited-${Date.now()}@example.com`,
        password: 'Invited-Pass-123!',
        role: 'editor',
        tenants: [{ tenant: fixture.tenantA.site.id }],
      },
      user: fixture.superAdmin,
      overrideAccess: false,
    })
    try {
      assert.equal(created.role, 'editor')
    } finally {
      await payload.delete({ collection: 'users', id: created.id, overrideAccess: true })
    }
  })
  test('super-admin can change another user role', async () => {

    const target = fixture.tenantB.author
    await payload.update({
      collection: 'users',
      id: target.id,
      data: { role: 'editor' },
      user: fixture.superAdmin,
      overrideAccess: false,
    })
    const stored = await payload.findByID({ collection: 'users', id: target.id, overrideAccess: true })
    assert.equal(stored.role, 'editor')
  })
})
