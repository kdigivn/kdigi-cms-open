/**
 * Tests for revalidateFrontendTask handler and config.
 *
 * Contract:
 * - Reads Site doc by input.tenantId with overrideAccess: true, depth: 0
 * - Skips without network call if site or domain is missing ({ output: { skipped: true, reason: 'no-domain' } })
 * - Sends POST to https://{domain}/api/cms/revalidate with exact body { collection, id, slug }
 * - Uses AbortSignal timeout (5000ms)
 * - Non-2xx HTTP status throws Error (triggering Payload Jobs retry with backoff)
 * - Returns { output: { ok: true, status } } on HTTP 2xx
 */
import assert from 'node:assert/strict'
import type { Mock } from 'node:test'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { RevalidateFrontendInput } from './revalidate-frontend-task'
import {
  REVALIDATE_FRONTEND_TASK_SLUG,
  REVALIDATE_TIMEOUT_MS,
  revalidateFrontendTask,
} from './revalidate-frontend-task'

type FetchFn = typeof globalThis.fetch

interface MockSite {
  id: number | string
  domain?: string | null
}

interface MockLogger {
  warn: Mock<(...args: unknown[]) => void>
  error: Mock<(...args: unknown[]) => void>
  info: Mock<(...args: unknown[]) => void>
  debug: Mock<(...args: unknown[]) => void>
}

interface StubReq {
  payload: {
    findByID: Mock<(...args: unknown[]) => Promise<MockSite | null>>
    logger: MockLogger
  }
}

function makeStubReq(siteOrError?: MockSite | null | Error): StubReq {
  return {
    payload: {
      findByID: mock.fn<(...args: unknown[]) => Promise<MockSite | null>>(async () => {
        if (siteOrError instanceof Error) {
          throw siteOrError
        }
        return siteOrError ?? null
      }),
      logger: {
        warn: mock.fn<(...args: unknown[]) => void>(),
        error: mock.fn<(...args: unknown[]) => void>(),
        info: mock.fn<(...args: unknown[]) => void>(),
        debug: mock.fn<(...args: unknown[]) => void>(),
      },
    },
  }
}

async function runTask(input: RevalidateFrontendInput, req: StubReq) {
  if (typeof revalidateFrontendTask.handler !== 'function') {
    throw new Error('revalidateFrontendTask.handler must be a function')
  }
  return revalidateFrontendTask.handler({
    input,
    req: req as never,
    job: undefined as never,
    inlineTask: undefined as never,
    tasks: undefined as never,
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('revalidateFrontendTask — handler & contract', () => {
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

  it('skips without fetch when site is not found (null)', async () => {
    const req = makeStubReq(null)
    const input: RevalidateFrontendInput = {
      tenantId: '1',
      collection: 'posts',
      id: '10',
      slug: 'test-post',
    }

    const result = await runTask(input, req)

    assert.equal(fetchMock.mock.calls.length, 0)
    assert.deepEqual(result, {
      output: { skipped: true, reason: 'no-domain' },
    })
  })

  it('skips without fetch when site domain is null or empty string', async () => {
    const reqNullDomain = makeStubReq({ id: 1, domain: null })
    const input: RevalidateFrontendInput = {
      tenantId: '1',
      collection: 'posts',
      id: '10',
      slug: 'test-post',
    }

    const resultNull = await runTask(input, reqNullDomain)
    assert.equal(fetchMock.mock.calls.length, 0)
    assert.deepEqual(resultNull, {
      output: { skipped: true, reason: 'no-domain' },
    })

    const reqEmptyDomain = makeStubReq({ id: 1, domain: '' })
    const resultEmpty = await runTask(input, reqEmptyDomain)
    assert.equal(fetchMock.mock.calls.length, 0)
    assert.deepEqual(resultEmpty, {
      output: { skipped: true, reason: 'no-domain' },
    })
  })

  it('sends POST with exact body to https://{domain}/api/cms/revalidate on happy path', async () => {
    const req = makeStubReq({ id: 1, domain: 'site.example.test' })
    const input: RevalidateFrontendInput = {
      tenantId: '1',
      collection: 'posts',
      id: '42',
      slug: 'lich-tau-phu-quoc',
    }

    const result = await runTask(input, req)

    assert.deepEqual(result, {
      output: { ok: true, status: 200 },
    })
    assert.equal(fetchMock.mock.calls.length, 1)

    const [url, init] = fetchMock.mock.calls[0]?.arguments as [string, RequestInit]
    assert.equal(url, 'https://site.example.test/api/cms/revalidate')
    assert.equal(init.method, 'POST')
    assert.deepEqual(init.headers, {
      'Content-Type': 'application/json',
    })
    assert.deepEqual(JSON.parse(init.body as string), {
      collection: 'posts',
      id: '42',
      slug: 'lich-tau-phu-quoc',
    })
    assert.ok(init.signal instanceof AbortSignal)
  })

  it('passes req to findByID with overrideAccess: true and depth: 0', async () => {
    const req = makeStubReq({ id: 1, domain: 'site.example.test' })
    const input: RevalidateFrontendInput = {
      tenantId: '1',
      collection: 'pages',
      id: '99',
      slug: 've-tau',
    }

    await runTask(input, req)

    assert.equal(req.payload.findByID.mock.calls.length, 1)
    const findCall = req.payload.findByID.mock.calls[0]?.arguments[0] as Record<string, unknown>
    assert.equal(findCall.collection, 'sites')
    assert.equal(findCall.id, '1')
    assert.equal(findCall.overrideAccess, true)
    assert.equal(findCall.depth, 0)
    assert.equal(findCall.req, req)
  })

  it('throws on non-2xx HTTP status (500) so Payload retries with backoff', async () => {
    globalThis.fetch = mock.fn(async () => {
      return new Response('Internal Server Error', { status: 500 })
    })

    const req = makeStubReq({ id: 1, domain: 'site.example.test' })
    const input: RevalidateFrontendInput = {
      tenantId: '1',
      collection: 'posts',
      id: '42',
      slug: 'fail-post',
    }

    await assert.rejects(
      async () => {
        await runTask(input, req)
      },
      (err: Error) => {
        assert.match(
          err.message,
          /revalidate https:\/\/site\.example\.test\/api\/cms\/revalidate returned HTTP 500/,
        )
        return true
      },
    )
  })

  it('throws on non-2xx HTTP status (404) so failure is visible in jobs table', async () => {
    globalThis.fetch = mock.fn(async () => {
      return new Response('Not Found', { status: 404 })
    })

    const req = makeStubReq({ id: 1, domain: 'site.example.test' })
    const input: RevalidateFrontendInput = {
      tenantId: '1',
      collection: 'posts',
      id: '42',
      slug: 'not-found-post',
    }

    await assert.rejects(
      async () => {
        await runTask(input, req)
      },
      (err: Error) => {
        assert.match(
          err.message,
          /revalidate https:\/\/site\.example\.test\/api\/cms\/revalidate returned HTTP 404/,
        )
        return true
      },
    )
  })

  it('exports expected task slug and timeout constant', () => {
    assert.equal(REVALIDATE_FRONTEND_TASK_SLUG, 'revalidateFrontend')
    assert.equal(revalidateFrontendTask.slug, 'revalidateFrontend')
    assert.equal(REVALIDATE_TIMEOUT_MS, 5000)
    const attempts = typeof revalidateFrontendTask.retries === 'object'
      ? revalidateFrontendTask.retries?.attempts
      : revalidateFrontendTask.retries
    assert.equal(attempts, 3)
  })
})
