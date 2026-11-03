/**
 * Public demo account protection (`DEMO_ACCOUNT_EMAILS`).
 *
 * A listed account cannot change its own email / password / API key / API-key switch nor delete
 * itself, while an ordinary editor (not listed) still can change their own password, and a
 * super-admin can still manage the demo account.
 *
 * Runner: PAYLOAD_INTEGRATION=1 R2_OFF=true node --env-file=.env --import tsx \
 *   --test src/collections/users-demo-account.integration.test.ts
 */
import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Payload } from 'payload'

import { DEMO_ACCOUNT_DELETE_MESSAGE, DEMO_ACCOUNT_LOCKED_MESSAGE } from '../lib/demo-accounts'
import {
  getIntegrationPayload,
  closeIntegrationPayload,
  setupTwoTenants,
  cleanupTwoTenants,
  isIntegrationEnabled,
  type TwoTenantsFixture,
} from '../test-utils/payload-integration'

describe('Demo account protection', { skip: !isIntegrationEnabled ? 'PAYLOAD_INTEGRATION=1 is not set' : false }, () => {
  let payload: Payload
  let fixture: TwoTenantsFixture
  let previousEnv: string | undefined

  before(async () => {
    payload = await getIntegrationPayload()
    fixture = await setupTwoTenants(payload, 'users-demo')
    previousEnv = process.env.DEMO_ACCOUNT_EMAILS
    // tenantA.editor is the "public demo" account; tenantB.editor is an ordinary editor. Fixture
    // users carry an API key; the demo scenarios start from an account whose key switch is off.
    await payload.update({ collection: 'users', id: fixture.tenantA.editor.id, data: { enableAPIKey: false }, overrideAccess: true })
    process.env.DEMO_ACCOUNT_EMAILS = ` ${fixture.tenantA.editor.email.toUpperCase()} , other-demo@example.com`
  })

  after(async () => {
    if (previousEnv === undefined) delete process.env.DEMO_ACCOUNT_EMAILS
    else process.env.DEMO_ACCOUNT_EMAILS = previousEnv
    if (payload && fixture) await cleanupTwoTenants(payload, fixture)
    await closeIntegrationPayload(payload)
  })

  const demoSelfUpdate = (data: Record<string, unknown>) =>
    payload.update({
      collection: 'users',
      id: fixture.tenantA.editor.id,
      data,
      user: fixture.tenantA.editor,
      overrideAccess: false,
    })

  const rejectedAsDemo = { name: 'APIError', status: 403, message: DEMO_ACCOUNT_LOCKED_MESSAGE } as const

  test('demo account cannot change its own password (bilingual 403) and the old password still works', async () => {
    await assert.rejects(demoSelfUpdate({ password: 'HackedPassword789!' }), rejectedAsDemo)
    assert.match(DEMO_ACCOUNT_LOCKED_MESSAGE, /Tài khoản demo.*\/.*Public demo accounts/)
    const login = await payload.login({
      collection: 'users',
      data: { email: fixture.tenantA.editor.email, password: 'Password123!' },
    })
    assert.equal(login.user?.id, fixture.tenantA.editor.id)
  })

  test('demo account cannot change its own email', async () => {
    await assert.rejects(demoSelfUpdate({ email: `moved-${Date.now()}@example.com` }), rejectedAsDemo)
    const stored = await payload.findByID({ collection: 'users', id: fixture.tenantA.editor.id, overrideAccess: true })
    assert.equal(stored.email, fixture.tenantA.editor.email)
  })

  test('demo account cannot turn on its API key', async () => {
    await assert.rejects(demoSelfUpdate({ enableAPIKey: true }), rejectedAsDemo)
    await assert.rejects(demoSelfUpdate({ apiKey: 'a-chosen-api-key-0123456789' }), rejectedAsDemo)
    const stored = await payload.findByID({ collection: 'users', id: fixture.tenantA.editor.id, overrideAccess: true })
    assert.notEqual(stored.enableAPIKey, true)
  })

  test('saving the unchanged account (same email, no password) is still allowed', async () => {
    const updated = await demoSelfUpdate({ email: fixture.tenantA.editor.email.toUpperCase(), enableAPIKey: false })
    assert.equal(updated.id, fixture.tenantA.editor.id)
  })

  test('demo account cannot delete itself', async () => {
    await assert.rejects(
      payload.delete({ collection: 'users', id: fixture.tenantA.editor.id, user: fixture.tenantA.editor, overrideAccess: true }),
      { name: 'APIError', status: 403, message: DEMO_ACCOUNT_DELETE_MESSAGE },
    )
    const stored = await payload.findByID({ collection: 'users', id: fixture.tenantA.editor.id, overrideAccess: true })
    assert.equal(stored.id, fixture.tenantA.editor.id)
  })

  test('an ordinary editor can still change their own password', async () => {
    const self = fixture.tenantB.editor
    await payload.update({
      collection: 'users',
      id: self.id,
      data: { password: 'EditorNewPass456!' },
      user: self,
      overrideAccess: false,
    })
    const login = await payload.login({
      collection: 'users',
      data: { email: self.email, password: 'EditorNewPass456!' },
    })
    assert.equal(login.user?.id, self.id)
  })

  test('a super-admin can still reset the demo account password', async () => {
    await payload.update({
      collection: 'users',
      id: fixture.tenantA.editor.id,
      data: { password: 'ResetByAdmin321!' },
      user: fixture.superAdmin,
      overrideAccess: false,
    })
    const login = await payload.login({
      collection: 'users',
      data: { email: fixture.tenantA.editor.email, password: 'ResetByAdmin321!' },
    })
    assert.equal(login.user?.id, fixture.tenantA.editor.id)
  })

  test('with DEMO_ACCOUNT_EMAILS unset the same user may change their password (feature is opt-in)', async () => {
    const saved = process.env.DEMO_ACCOUNT_EMAILS
    delete process.env.DEMO_ACCOUNT_EMAILS
    try {
      await demoSelfUpdate({ password: 'OptInOff789!' })
    } finally {
      process.env.DEMO_ACCOUNT_EMAILS = saved
    }
    const login = await payload.login({
      collection: 'users',
      data: { email: fixture.tenantA.editor.email, password: 'OptInOff789!' },
    })
    assert.equal(login.user?.id, fixture.tenantA.editor.id)
  })
})
