import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isRestoreFromTrash, makeGuardRestoreSlugConflict } from './guard-restore-slug-conflict'

type Args = Parameters<ReturnType<typeof makeGuardRestoreSlugConflict>>[0]

function args(data: Record<string, unknown>, originalDoc: Record<string, unknown>, holders: unknown[], queries: unknown[]) {
  return {
    data,
    originalDoc,
    collection: { slug: 'posts' },
    req: {
      payload: {
        find: async (query: unknown) => {
          queries.push(query)
          return { docs: holders }
        },
      },
    },
  } as unknown as Args
}

const TRASHED = { id: 5, slug: 'lich-tau', tenant: 1, deletedAt: '2026-09-27T00:00:00Z' }

describe('guardRestoreSlugConflict', () => {
  it('only a write that clears deletedAt on a trashed doc is a restore', () => {
    assert.equal(isRestoreFromTrash({ deletedAt: null }, TRASHED), true)
    assert.equal(isRestoreFromTrash({ title: 'x' }, TRASHED), false, 'editing inside the trash is not a restore')
    assert.equal(isRestoreFromTrash({ deletedAt: null }, { ...TRASHED, deletedAt: null }), false)
    assert.equal(isRestoreFromTrash({ deletedAt: '2026-09-28T00:00:00Z' }, TRASHED), false)
  })

  it('not a restore → no query at all', async () => {
    const queries: unknown[] = []
    await makeGuardRestoreSlugConflict('slug')(args({ title: 'x' }, TRASHED, [], queries))
    assert.equal(queries.length, 0)
  })

  it('restore while another active doc of the SAME tenant holds the slug → ValidationError', async () => {
    const queries: Array<{ where: unknown; trash: boolean }> = []
    await assert.rejects(
      makeGuardRestoreSlugConflict('slug')(args({ deletedAt: null }, TRASHED, [{ id: 9 }], queries)) as Promise<unknown>,
      (err: Error) => err.name === 'ValidationError',
    )
    assert.deepEqual(queries[0].where, {
      and: [{ slug: { equals: 'lich-tau' } }, { tenant: { equals: 1 } }, { id: { not_equals: 5 } }],
    })
    assert.equal(queries[0].trash, false, 'other trashed holders do not block a restore')
  })

  it('restore with no active holder passes the data through', async () => {
    const data = { deletedAt: null }
    assert.equal(await makeGuardRestoreSlugConflict('slug')(args(data, TRASHED, [], [])), data)
  })

  it('shortcodes guard on `name`', async () => {
    const queries: Array<{ where: { and: Array<Record<string, unknown>> } }> = []
    await makeGuardRestoreSlugConflict('name')(
      args({ deletedAt: null }, { id: 2, name: 'bang-gia', tenant: 1, deletedAt: 'x' }, [], queries),
    )
    assert.deepEqual(queries[0].where.and[0], { name: { equals: 'bang-gia' } })
  })
})
