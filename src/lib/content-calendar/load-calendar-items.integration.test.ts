/**
 * Content calendar loader (SP1a-3) against real Postgres + Payload.
 *
 *   PAYLOAD_INTEGRATION=1 R2_OFF=true node --env-file=.env --import tsx \
 *     --test src/lib/content-calendar/load-calendar-items.integration.test.ts
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
} from '../../test-utils/payload-integration'
import { getValidatedAdminTenantId, type TenantUser } from '../admin-selected-tenant'
import { monthRangeUtc } from './bucket-by-local-day'
import { loadCalendarItems } from './load-calendar-items'

describe('loadCalendarItems (SP1a-3)', { skip: !isIntegrationEnabled ? 'PAYLOAD_INTEGRATION=1 is not set' : false }, () => {
  let payload: Payload
  let fixture: TwoTenantsFixture
  const run = `${Date.now()}-${Math.floor(Math.random() * 1e5)}`
  // A month no real fixture data uses, so counts are exact.
  const MONTH = { year: 2031, month: 3 }
  const range = monthRangeUtc(MONTH)

  const post = async (tenant: number, title: string, status: string, publishedAt: string) => {
    const doc = await payload.create({
      collection: 'posts',
      data: { title, slug: `cal-${run}-${title}`, type: 'blog', status, publishedAt, tenant } as never,
      overrideAccess: true,
    })
    fixture.trackPost(doc.id as number)
    return doc
  }

  before(async () => {
    payload = await getIntegrationPayload()
    fixture = await setupTwoTenants(payload, 'calendar')
    const a = fixture.tenantA.site.id as number
    const b = fixture.tenantB.site.id as number
    await post(a, 'a-scheduled', 'published', '2031-03-10T02:00:00Z')
    await post(a, 'a-planned', 'draft', '2031-03-01T00:00:00Z')
    await post(a, 'a-local-april', 'published', '2031-03-31T17:30:00Z') // 1 Apr in ICT → outside
    await post(b, 'b-scheduled', 'published', '2031-03-12T02:00:00Z')
    const trashed = await post(a, 'a-trashed', 'published', '2031-03-15T02:00:00Z')
    await payload.update({ collection: 'posts', id: trashed.id, data: { deletedAt: new Date().toISOString() }, overrideAccess: true })
  })

  after(async () => {
    if (payload && fixture) await cleanupTwoTenants(payload, fixture)
    await closeIntegrationPayload(payload)
  })

  const titles = (items: Array<{ title: string }>) => items.map((item) => item.title).sort()

  test('an editor of tenant A sees A\u2019s dated drafts and scheduled posts in the local month, nothing trashed', async () => {
    const items = await loadCalendarItems(payload, fixture.tenantA.editor, fixture.tenantA.site.id, range)
    assert.deepEqual(titles(items), ['a-planned', 'a-scheduled'])
  })

  test('[RT-7] a forged payload-tenant=<B> cookie resolves back to A, and B\u2019s id yields nothing', async () => {
    const forged = `payload-tenant=${String(fixture.tenantB.site.id)}`
    const tenantId = getValidatedAdminTenantId({ cookieHeader: forged, user: fixture.tenantA.editor as unknown as TenantUser })
    assert.equal(String(tenantId), String(fixture.tenantA.site.id))

    const direct = await loadCalendarItems(payload, fixture.tenantA.editor, fixture.tenantB.site.id, range)
    assert.deepEqual(direct, [], 'access predicates still refuse tenant B rows')
  })

  test('a super-admin can select tenant B', async () => {
    const items = await loadCalendarItems(payload, fixture.superAdmin, fixture.tenantB.site.id, range)
    assert.deepEqual(titles(items), ['b-scheduled'])
  })

  test('anonymous callers are refused', async () => {
    await assert.rejects(loadCalendarItems(payload, null, fixture.tenantA.site.id, range), /authenticated user/)
  })
})
