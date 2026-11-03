/**
 * revalidateParentPostOnCommentApproval: a comment that becomes (or stops being) approved queues one
 * `revalidateFrontend` job for its parent post, and nothing else does.
 */
import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import type { CollectionAfterChangeHook } from 'payload'

import { REVALIDATE_FRONTEND_TASK_SLUG } from '../jobs/revalidate-frontend-task'
import { revalidateParentPostOnCommentApproval } from './revalidate-on-comment-approval'

interface QueueCall {
  task: string
  input: { tenantId: string; collection: string; id: string; slug: string }
}

function makeReq(opts: { domain?: string | null; postThrows?: boolean; context?: Record<string, unknown> } = {}) {
  const queued: QueueCall[] = []
  const lookups: Array<{ collection: string; id: unknown }> = []
  const payload = {
    findByID: mock.fn(async (args: { collection: string; id: unknown }) => {
      lookups.push({ collection: args.collection, id: args.id })
      if (args.collection === 'posts') {
        if (opts.postThrows) throw new Error('not found')
        return { id: args.id, slug: 'five-forces' }
      }
      return { id: args.id, domain: 'domain' in opts ? opts.domain : 'example.com', edge: null }
    }),
    jobs: {
      queue: mock.fn(async (call: QueueCall) => {
        queued.push(call)
        return call
      }),
    },
    logger: { error: mock.fn() },
  }
  return { req: { payload, context: opts.context ?? {} }, queued, lookups, payload }
}

async function run(
  req: unknown,
  doc: Record<string, unknown>,
  previousDoc?: Record<string, unknown>,
): Promise<unknown> {
  return await revalidateParentPostOnCommentApproval({
    doc,
    previousDoc,
    req,
    operation: previousDoc ? 'update' : 'create',
    collection: { slug: 'comments' },
    context: {},
  } as unknown as Parameters<CollectionAfterChangeHook>[0])
}

const comment = (status: string, extra: Record<string, unknown> = {}) => ({ id: 9, status, post: 4, tenant: 7, ...extra })

describe('revalidateParentPostOnCommentApproval', () => {
  it('queues a posts revalidation when a pending comment is approved', async () => {
    const { req, queued } = makeReq()
    await run(req, comment('approved'), comment('pending'))
    assert.equal(queued.length, 1)
    assert.equal(queued[0]!.task, REVALIDATE_FRONTEND_TASK_SLUG)
    assert.deepEqual(queued[0]!.input, { tenantId: '7', collection: 'posts', id: '4', slug: 'five-forces' })
  })

  it('queues when a comment is created already approved', async () => {
    const { req, queued } = makeReq()
    await run(req, comment('approved'))
    assert.equal(queued.length, 1)
  })

  it('queues when an approved comment is hidden again', async () => {
    const { req, queued } = makeReq()
    await run(req, comment('pending'), comment('approved'))
    assert.equal(queued.length, 1)
  })

  it('accepts populated post and tenant relations', async () => {
    const { req, queued } = makeReq()
    await run(req, comment('approved', { post: { id: 4 }, tenant: { id: 7 } }), comment('pending'))
    assert.deepEqual(queued[0]!.input, { tenantId: '7', collection: 'posts', id: '4', slug: 'five-forces' })
  })

  it('queues nothing for a new pending comment', async () => {
    const { req, queued, lookups } = makeReq()
    await run(req, comment('pending'))
    assert.equal(queued.length, 0)
    assert.equal(lookups.length, 0)
  })

  it('queues nothing when an approved comment is edited without a status change', async () => {
    const { req, queued } = makeReq()
    await run(req, comment('approved', { content: 'edited' }), comment('approved'))
    assert.equal(queued.length, 0)
  })

  it('queues nothing for a comment on a product', async () => {
    const { req, queued } = makeReq()
    await run(req, { id: 9, status: 'approved', product: 3, post: null, tenant: 7 }, { id: 9, status: 'pending' })
    assert.equal(queued.length, 0)
  })

  it('respects __suppressExternalPublishHooks', async () => {
    const { req, queued, lookups } = makeReq({ context: { __suppressExternalPublishHooks: true } })
    await run(req, comment('approved'), comment('pending'))
    assert.equal(queued.length, 0)
    assert.equal(lookups.length, 0)
  })

  it('queues nothing when the tenant has no domain', async () => {
    const { req, queued } = makeReq({ domain: null })
    await run(req, comment('approved'), comment('pending'))
    assert.equal(queued.length, 0)
  })

  it('does not throw when the parent post cannot be read', async () => {
    const { req, queued, payload } = makeReq({ postThrows: true })
    const result = await run(req, comment('approved'), comment('pending'))
    assert.equal(queued.length, 0)
    assert.equal(payload.logger.error.mock.callCount(), 1)
    assert.deepEqual(result, comment('approved'))
  })
})
