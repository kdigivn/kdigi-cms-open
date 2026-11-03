import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { Access } from 'payload'

import { makeContentDeleteAccess } from './content-delete-access'

type User = { id: number; role: string; tenants?: Array<{ tenant: number }> }

function call(access: Access, user: User | null, data?: Record<string, unknown>) {
  return access({ req: { user } as never, data } as never)
}

const TRASH = { deletedAt: '2026-09-27T00:00:00.000Z' }
const editorA: User = { id: 1, role: 'editor', tenants: [{ tenant: 10 }] }
const authorA: User = { id: 2, role: 'author', tenants: [{ tenant: 10 }] }
const adminA: User = { id: 3, role: 'admin', tenants: [{ tenant: 10 }] }
const superAdmin: User = { id: 4, role: 'super-admin' }
const noTenant: User = { id: 5, role: 'editor', tenants: [] }

describe('makeContentDeleteAccess — trash vs permanent × role × createdBy', () => {
  const withCreatedBy = makeContentDeleteAccess({ hasCreatedBy: true })
  const withoutCreatedBy = makeContentDeleteAccess({ hasCreatedBy: false })

  it('anonymous and zero-tenant users can do neither', () => {
    assert.equal(call(withCreatedBy, null, TRASH), false)
    assert.equal(call(withCreatedBy, noTenant, TRASH), false)
  })

  it('editors may trash within their tenant but never permanently delete', () => {
    assert.deepEqual(call(withCreatedBy, editorA, TRASH), { tenant: { in: ['10'] } })
    assert.equal(call(withCreatedBy, editorA), false)
    assert.equal(call(withCreatedBy, editorA, { deletedAt: null }), false, 'null deletedAt is not a trash')
  })

  it('authors may trash only their own documents, still tenant-scoped [RT-13]', () => {
    assert.deepEqual(call(withCreatedBy, authorA, TRASH), {
      and: [{ tenant: { in: ['10'] } }, { createdBy: { equals: 2 } }],
    })
    assert.equal(call(withCreatedBy, authorA), false)
  })

  it('collections without createdBy never get an ownership clause (faqs/shortcodes)', () => {
    assert.deepEqual(call(withoutCreatedBy, authorA, TRASH), { tenant: { in: ['10'] } })
  })

  it('admins permanently delete within their tenant; super-admins everywhere', () => {
    assert.deepEqual(call(withCreatedBy, adminA), { tenant: { in: ['10'] } })
    assert.equal(call(withCreatedBy, superAdmin), true)
    assert.equal(call(withCreatedBy, superAdmin, TRASH), true)
  })
})
