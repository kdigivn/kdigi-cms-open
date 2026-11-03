/**
 * Tests for autoRedirectOnSlugChange hook.
 *
 * Verifies: slug unchanged → no redirect; slug changed → exactly one redirect
 * (old→new); re-save (same slug again) → no duplicate; self-loop guard (from === to).
 */
import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'

import { autoRedirectOnSlugChange } from './auto-redirect-on-slug-change'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePayload(existingRedirects: Array<{ from: string }> = []) {
  const created: unknown[] = []
  return {
    created,
    create: mock.fn(async (args: { data: unknown }) => {
      created.push(args.data)
      return args.data
    }),
    find: mock.fn(async () => ({
      totalDocs: existingRedirects.length,
      docs: existingRedirects,
    })),
    logger: { warn: mock.fn(), error: mock.fn() },
  }
}

function makeReq(payload: ReturnType<typeof makePayload>) {
  return { payload }
}

function makeArgs(opts: {
  originalSlug?: string
  newSlug: string
  tenant?: string
  payload?: ReturnType<typeof makePayload>
}): Parameters<typeof autoRedirectOnSlugChange>[0] {
  return {
    data: { slug: opts.newSlug, tenant: opts.tenant ?? 'tenant-1' },
    originalDoc: opts.originalSlug !== undefined
      ? { slug: opts.originalSlug, tenant: opts.tenant ?? 'tenant-1' }
      : undefined,
    operation: 'update',
    context: {},
    req: makeReq(opts.payload ?? makePayload()) as never,
    collection: { slug: 'posts' } as never,
  } as unknown as Parameters<typeof autoRedirectOnSlugChange>[0]
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('autoRedirectOnSlugChange', () => {
  it('no-op on create (no originalDoc)', async () => {
    const payload = makePayload()
    const args = {
      data: { slug: 'new-slug', tenant: 'tenant-1' },
      originalDoc: undefined,
      operation: 'create',
      context: {},
      req: makeReq(payload) as never,
      collection: { slug: 'posts' } as never,
    } as unknown as Parameters<typeof autoRedirectOnSlugChange>[0]
    await autoRedirectOnSlugChange(args)
    assert.equal(payload.create.mock.calls.length, 0)
  })

  it('no-op when slug is unchanged', async () => {
    const payload = makePayload()
    await autoRedirectOnSlugChange(makeArgs({
      originalSlug: 'same-slug',
      newSlug: 'same-slug',
      payload,
    }))
    assert.equal(payload.create.mock.calls.length, 0)
  })

  it('creates one 301 with root paths (trailing slash) for posts/pages on slug change', async () => {
    const payload = makePayload()
    await autoRedirectOnSlugChange(makeArgs({
      originalSlug: 'old-slug',
      newSlug: 'new-slug',
      payload,
    }))
    assert.equal(payload.create.mock.calls.length, 1)
    const created = payload.created[0] as Record<string, unknown>
    assert.equal(created.from, '/old-slug/')
    assert.equal(created.to, '/new-slug/')
    assert.equal(created.statusCode, '301')
    assert.equal(created.isEnabled, true)
  })

  it('prefixes product redirects with /product/ (collection segment)', async () => {
    const payload = makePayload()
    const args = {
      data: { slug: 'new-slug', tenant: 'tenant-1' },
      originalDoc: { slug: 'old-slug', tenant: 'tenant-1' },
      operation: 'update',
      context: {},
      req: makeReq(payload) as never,
      collection: { slug: 'products' } as never,
    } as unknown as Parameters<typeof autoRedirectOnSlugChange>[0]
    await autoRedirectOnSlugChange(args)
    assert.equal(payload.create.mock.calls.length, 1)
    const created = payload.created[0] as Record<string, unknown>
    assert.equal(created.from, '/product/old-slug/')
    assert.equal(created.to, '/product/new-slug/')
  })

  it('does not create duplicate when redirect from→to already exists', async () => {
    const payload = makePayload([{ from: '/old-slug' }])
    // find returns totalDocs:1 — redirect exists
    await autoRedirectOnSlugChange(makeArgs({
      originalSlug: 'old-slug',
      newSlug: 'new-slug',
      payload,
    }))
    assert.equal(payload.create.mock.calls.length, 0)
  })

  it('does not create self-loop redirect (from === to)', async () => {
    const payload = makePayload()
    await autoRedirectOnSlugChange(makeArgs({
      originalSlug: 'same',
      newSlug: 'same',
      payload,
    }))
    assert.equal(payload.create.mock.calls.length, 0)
  })

  it('does not create redirect when originalDoc has no slug', async () => {
    const payload = makePayload()
    const args = {
      data: { slug: 'new-slug', tenant: 'tenant-1' },
      originalDoc: { tenant: 'tenant-1' }, // no slug
      operation: 'update',
      context: {},
      req: makeReq(payload) as never,
      collection: { slug: 'posts' } as never,
    } as unknown as Parameters<typeof autoRedirectOnSlugChange>[0]
    await autoRedirectOnSlugChange(args)
    assert.equal(payload.create.mock.calls.length, 0)
  })

  it('sends a NUMERIC tenant id (Payload rejects string relationship ids for serial-id collections)', async () => {
    const payload = makePayload()
    await autoRedirectOnSlugChange(makeArgs({
      originalSlug: 'old-slug',
      newSlug: 'new-slug',
      tenant: '3',
      payload,
    }))
    const created = payload.created[0] as Record<string, unknown>
    assert.equal(created.tenant, 3)
    assert.equal(typeof created.tenant, 'number')
  })

  it('omits the tenant when the id is not numeric instead of sending an invalid string', async () => {
    const payload = makePayload()
    await autoRedirectOnSlugChange(makeArgs({
      originalSlug: 'old-slug',
      newSlug: 'new-slug',
      tenant: 'tenant-1',
      payload,
    }))
    const created = payload.created[0] as Record<string, unknown>
    assert.equal('tenant' in created, false)
  })
})
