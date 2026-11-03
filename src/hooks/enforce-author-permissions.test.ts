import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { APIError } from 'payload'

import { enforceAuthorPermissions } from './enforce-author-permissions'

type Args = Parameters<typeof enforceAuthorPermissions>[0]

function run(
  role: string,
  data: Record<string, unknown>,
  originalDoc?: Record<string, unknown>,
): Record<string, unknown> {
  return enforceAuthorPermissions({
    data,
    originalDoc,
    req: { user: { id: 7, role } },
    operation: originalDoc ? 'update' : 'create',
  } as unknown as Args) as Record<string, unknown>
}

describe('enforceAuthorPermissions — effective status [RT-6]', () => {
  it('an author cannot submit status=published (403, message visible to the caller)', () => {
    assert.throws(
      () => run('author', { status: 'published' }, { status: 'draft' }),
      (err: unknown) => err instanceof APIError && err.status === 403 && /Author/.test(err.message),
    )
  })

  it('an author cannot restore a trashed published document ({ deletedAt: null } only)', () => {
    assert.throws(
      () => run('author', { deletedAt: null }, { status: 'published', deletedAt: '2026-09-27T00:00:00Z' }),
      /Author/,
    )
  })

  it('a partial update of a live document is judged on its stored status', () => {
    assert.throws(() => run('author', { title: 'sửa' }, { status: 'published' }), /Author/)
  })

  it('an author may move their own published document to the trash (takes it offline)', () => {
    const data = { deletedAt: '2026-09-27T00:00:00Z' }
    assert.equal(run('author', data, { status: 'published' }), data)
  })

  it('drafts stay editable, and a draft submitted over a published doc is an unpublish', () => {
    assert.ok(run('author', { title: 'x' }, { status: 'draft' }))
    assert.ok(run('author', { status: 'draft' }, { status: 'published' }))
  })

  it('create stamps createdBy; other roles are untouched', () => {
    assert.equal(run('author', { title: 'x' }).createdBy, 7)
    assert.ok(run('editor', { deletedAt: null }, { status: 'published', deletedAt: '2026-09-27T00:00:00Z' }))
  })
})
