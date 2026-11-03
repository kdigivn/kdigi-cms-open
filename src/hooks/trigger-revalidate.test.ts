/**
 * Tests for triggerRevalidate and triggerRevalidateAfterDelete hooks.
 *
 * Since phase 3 (SP0-R3), these hooks are thin "decide + queue" wrappers:
 * - They resolve the tenant's frontend domain via Site lookup
 * - They queue a `revalidateFrontend` job on `req.payload.jobs.queue`
 * - On slug rename (previousDoc.slug !== doc.slug), they queue TWO jobs (new + old slug)
 * - Context guards (__suppressExternalPublishHooks, __generatingJsonLd)
 *   suppress queuing entirely
 * - Tenant guards (no tenant, findByID throws, domain missing/empty) skip queuing
 * - `globalThis.fetch` is NEVER called by either hook
 */
import assert from 'node:assert/strict'
import type { Mock } from 'node:test'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import { REVALIDATE_FRONTEND_TASK_SLUG } from '../jobs/revalidate-frontend-task'
import { triggerRevalidate, triggerRevalidateAfterDelete } from './trigger-revalidate'

// ── Helpers & Types ──────────────────────────────────────────────────────────

type FetchFn = typeof globalThis.fetch

interface MockSite {
  id: number | string
  domain?: string | null
  siteKey?: string
}

interface MockQueueCall {
  task: string
  input: {
    tenantId: string
    collection: string
    id: string
    slug: string
  }
  req?: unknown
}

interface MockLogger {
  warn: Mock<(...args: unknown[]) => void>
  error: Mock<(...args: unknown[]) => void>
  info: Mock<(...args: unknown[]) => void>
  debug: Mock<(...args: unknown[]) => void>
}

interface MockPayload {
  findByID: Mock<(...args: unknown[]) => Promise<MockSite | null>>
  jobs: {
    queue: Mock<(call: MockQueueCall) => Promise<MockQueueCall>>
  }
  logger: MockLogger
  queued: MockQueueCall[]
}

function makePayload(siteOrError?: MockSite | null | Error): MockPayload {
  const queued: MockQueueCall[] = []
  return {
    queued,
    findByID: mock.fn<(...args: unknown[]) => Promise<MockSite | null>>(async () => {
      if (siteOrError instanceof Error) {
        throw siteOrError
      }
      return siteOrError ?? null
    }),
    jobs: {
      queue: mock.fn<(call: MockQueueCall) => Promise<MockQueueCall>>(async (call: MockQueueCall) => {
        queued.push(call)
        return call
      }),
    },
    logger: {
      warn: mock.fn<(...args: unknown[]) => void>(),
      error: mock.fn<(...args: unknown[]) => void>(),
      info: mock.fn<(...args: unknown[]) => void>(),
      debug: mock.fn<(...args: unknown[]) => void>(),
    },
  }
}

function makeChangeArgs(opts: {
  payload: MockPayload
  context?: Record<string, unknown>
  doc?: Record<string, unknown>
  previousDoc?: Record<string, unknown>
  collectionSlug?: string
}): Parameters<CollectionAfterChangeHook>[0] {
  return {
    collection: { slug: opts.collectionSlug ?? 'posts' } as never,
    context: opts.context ?? {},
    doc: (opts.doc ?? { id: 10, slug: 'test-post', tenant: 1 }) as never,
    operation: 'update',
    previousDoc: opts.previousDoc as never,
    req: {
      context: opts.context ?? {},
      payload: opts.payload as unknown as Parameters<CollectionAfterChangeHook>[0]['req']['payload'],
    } as unknown as Parameters<CollectionAfterChangeHook>[0]['req'],
  } as unknown as Parameters<CollectionAfterChangeHook>[0]
}

function makeDeleteArgs(opts: {
  payload: MockPayload
  context?: Record<string, unknown>
  doc?: Record<string, unknown>
  collectionSlug?: string
}): Parameters<CollectionAfterDeleteHook>[0] {
  const doc = opts.doc ?? { id: 10, slug: 'test-post', tenant: 1 }
  return {
    collection: { slug: opts.collectionSlug ?? 'posts' } as never,
    context: opts.context ?? {},
    doc: doc as never,
    id: (doc.id as number | string) ?? 10,
    req: {
      context: opts.context ?? {},
      payload: opts.payload as unknown as Parameters<CollectionAfterDeleteHook>[0]['req']['payload'],
    } as unknown as Parameters<CollectionAfterDeleteHook>[0]['req'],
  } as unknown as Parameters<CollectionAfterDeleteHook>[0]
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('triggerRevalidate — context guards', () => {
  let originalFetch: FetchFn
  let fetchMock: Mock<FetchFn>

  beforeEach(() => {
    originalFetch = globalThis.fetch
    fetchMock = mock.fn<FetchFn>(async () => {
      return new Response(JSON.stringify({ revalidated: true }), { status: 200 })
    })
    globalThis.fetch = fetchMock
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('skips when __suppressExternalPublishHooks context flag is true', async () => {
    const payload = makePayload({ id: 1, domain: 'example.com' })
    const args = makeChangeArgs({
      payload,
      context: { __suppressExternalPublishHooks: true },
    })

    const result = await triggerRevalidate(args)

    assert.equal(payload.findByID.mock.calls.length, 0)
    assert.equal(payload.jobs.queue.mock.calls.length, 0)
    assert.equal(fetchMock.mock.calls.length, 0)
    assert.deepEqual(result, args.doc)
  })

  it('skips when __generatingJsonLd context flag is true', async () => {
    const payload = makePayload({ id: 1, domain: 'example.com' })
    const args = makeChangeArgs({
      payload,
      context: { __generatingJsonLd: true },
    })

    const result = await triggerRevalidate(args)

    assert.equal(payload.findByID.mock.calls.length, 0)
    assert.equal(payload.jobs.queue.mock.calls.length, 0)
    assert.equal(fetchMock.mock.calls.length, 0)
    assert.deepEqual(result, args.doc)
  })
})

describe('triggerRevalidate — tenant & site resolution guards', () => {
  let originalFetch: FetchFn
  let fetchMock: Mock<FetchFn>

  beforeEach(() => {
    originalFetch = globalThis.fetch
    fetchMock = mock.fn<FetchFn>(async () => {
      return new Response(JSON.stringify({ revalidated: true }), { status: 200 })
    })
    globalThis.fetch = fetchMock
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('skips when doc has no tenant reference', async () => {
    const payload = makePayload({ id: 1, domain: 'example.com' })
    const args = makeChangeArgs({
      payload,
      doc: { id: 10, slug: 'orphan-doc' },
    })

    const result = await triggerRevalidate(args)

    assert.equal(payload.findByID.mock.calls.length, 0)
    assert.equal(payload.jobs.queue.mock.calls.length, 0)
    assert.equal(fetchMock.mock.calls.length, 0)
    assert.deepEqual(result, args.doc)
  })

  it('skips gracefully when findByID throws (e.g. database error)', async () => {
    const payload = makePayload(new Error('Site lookup failed'))
    const args = makeChangeArgs({ payload })

    const result = await triggerRevalidate(args)

    assert.equal(payload.findByID.mock.calls.length, 1)
    assert.equal(payload.jobs.queue.mock.calls.length, 0)
    assert.equal(fetchMock.mock.calls.length, 0)
    assert.deepEqual(result, args.doc)
  })

  it('skips when resolved site has no domain', async () => {
    const payload = makePayload({ id: 1, domain: null })
    const args = makeChangeArgs({ payload })

    const result = await triggerRevalidate(args)

    assert.equal(payload.findByID.mock.calls.length, 1)
    assert.equal(payload.jobs.queue.mock.calls.length, 0)
    assert.equal(fetchMock.mock.calls.length, 0)
    assert.deepEqual(result, args.doc)
  })

  it('skips when resolved site domain is empty string', async () => {
    const payload = makePayload({ id: 1, domain: '' })
    const args = makeChangeArgs({ payload })

    const result = await triggerRevalidate(args)

    assert.equal(payload.findByID.mock.calls.length, 1)
    assert.equal(payload.jobs.queue.mock.calls.length, 0)
    assert.equal(fetchMock.mock.calls.length, 0)
    assert.deepEqual(result, args.doc)
  })
})

describe('triggerRevalidate — happy path & contract', () => {
  let originalFetch: FetchFn
  let fetchMock: Mock<FetchFn>

  beforeEach(() => {
    originalFetch = globalThis.fetch
    fetchMock = mock.fn<FetchFn>(async () => {
      return new Response(JSON.stringify({ revalidated: true }), { status: 200 })
    })
    globalThis.fetch = fetchMock
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('queues revalidateFrontend job with exact input { tenantId, collection, id, slug }', async () => {
    const payload = makePayload({ id: 1, domain: 'site-a.example.test' })
    const doc = { id: 42, slug: 'hello-world', tenant: 1 }
    const args = makeChangeArgs({
      payload,
      collectionSlug: 'posts',
      doc,
    })

    const result = await triggerRevalidate(args)

    assert.equal(fetchMock.mock.calls.length, 0)
    assert.equal(payload.jobs.queue.mock.calls.length, 1)
    assert.deepEqual(payload.queued[0], {
      task: REVALIDATE_FRONTEND_TASK_SLUG,
      input: {
        tenantId: '1',
        collection: 'posts',
        id: '42',
        slug: 'hello-world',
      },
      req: args.req,
    })
    assert.deepEqual(result, doc)
  })

  it('resolves tenant ID when tenant is an object reference { id: 42 }', async () => {
    const payload = makePayload({ id: 42, domain: 'site-b.example.test' })
    const doc = { id: 99, slug: 'about-us', tenant: { id: 42 } }
    const args = makeChangeArgs({
      payload,
      collectionSlug: 'pages',
      doc,
    })

    await triggerRevalidate(args)

    assert.equal(fetchMock.mock.calls.length, 0)
    assert.equal(payload.findByID.mock.calls.length, 1)
    const findCall = payload.findByID.mock.calls[0]?.arguments[0] as { id?: unknown } | undefined
    assert.equal(findCall?.id, '42')
    assert.equal(payload.jobs.queue.mock.calls.length, 1)
    assert.deepEqual(payload.queued[0], {
      task: REVALIDATE_FRONTEND_TASK_SLUG,
      input: {
        tenantId: '42',
        collection: 'pages',
        id: '99',
        slug: 'about-us',
      },
      req: args.req,
    })
  })

  it('queues two revalidation jobs on slug rename (new slug and previous slug)', async () => {
    const payload = makePayload({ id: 1, domain: 'site-a.example.test' })
    const doc = { id: 42, slug: 'new-slug', tenant: 1 }
    const previousDoc = { id: 42, slug: 'old-slug', tenant: 1 }
    const args = makeChangeArgs({
      payload,
      collectionSlug: 'posts',
      doc,
      previousDoc,
    })

    const result = await triggerRevalidate(args)

    assert.equal(fetchMock.mock.calls.length, 0)
    assert.equal(payload.jobs.queue.mock.calls.length, 2)
    assert.deepEqual(payload.queued[0], {
      task: REVALIDATE_FRONTEND_TASK_SLUG,
      input: {
        tenantId: '1',
        collection: 'posts',
        id: '42',
        slug: 'new-slug',
      },
      req: args.req,
    })
    assert.deepEqual(payload.queued[1], {
      task: REVALIDATE_FRONTEND_TASK_SLUG,
      input: {
        tenantId: '1',
        collection: 'posts',
        id: '42',
        slug: 'old-slug',
      },
      req: args.req,
    })
    assert.deepEqual(result, doc)
  })
})

describe('triggerRevalidateAfterDelete — afterDelete variant', () => {
  let originalFetch: FetchFn
  let fetchMock: Mock<FetchFn>

  beforeEach(() => {
    originalFetch = globalThis.fetch
    fetchMock = mock.fn<FetchFn>(async () => {
      return new Response(JSON.stringify({ revalidated: true }), { status: 200 })
    })
    globalThis.fetch = fetchMock
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('queues revalidation job on document deletion', async () => {
    const payload = makePayload({ id: 1, domain: 'deleted.example.test' })
    const doc = { id: 88, slug: 'deleted-product', tenant: 1 }
    const args = makeDeleteArgs({
      payload,
      collectionSlug: 'products',
      doc,
    })

    const result = await triggerRevalidateAfterDelete(args)

    assert.equal(fetchMock.mock.calls.length, 0)
    assert.equal(payload.jobs.queue.mock.calls.length, 1)
    assert.deepEqual(payload.queued[0], {
      task: REVALIDATE_FRONTEND_TASK_SLUG,
      input: {
        tenantId: '1',
        collection: 'products',
        id: '88',
        slug: 'deleted-product',
      },
      req: args.req,
    })
    assert.deepEqual(result, doc)
  })
})
