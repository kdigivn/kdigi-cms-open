/**
 * Tests for withScopedHookContext.
 *
 * Guards the invariant that keeps a hook's re-entry flag from suppressing the rest of the
 * outer hook chain: Payload writes the merged context onto whatever request object it is
 * handed, so a nested write must be given a copy, not the live request.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { withScopedHookContext } from './scoped-hook-request'

type FakeReq = Parameters<typeof withScopedHookContext>[0]

function makeReq(context: Record<string, unknown> = {}): FakeReq {
  return {
    context,
    transactionID: 'tx-1',
    locale: 'vi',
    user: { id: 3 },
    payload: { name: 'payload' },
  } as unknown as FakeReq
}

describe('withScopedHookContext', () => {
  it('carries the flag on the copy and leaves the caller context clean', () => {
    const req = makeReq({ locale: 'vi' })

    const scoped = withScopedHookContext(req, { __generatingJsonLd: true })

    assert.equal((scoped.context as Record<string, unknown>).__generatingJsonLd, true)
    assert.equal((req.context as Record<string, unknown>).__generatingJsonLd, undefined)
  })

  it('survives Payload assigning context onto the request it was handed', () => {
    // createLocalReq does exactly this: req.context = { ...req.context, ...context }
    const req = makeReq({ existing: 'keep' })
    const scoped = withScopedHookContext(req, { __someOtherFlag: true })

    scoped.context = { ...scoped.context, __addedByPayload: true }

    assert.deepEqual(req.context, { existing: 'keep' })
  })

  it('keeps transactionID so the nested write stays in the caller transaction', () => {
    const req = makeReq()

    const scoped = withScopedHookContext(req, { __postsWordCountSelfUpdate: true })

    assert.equal(scoped.transactionID, 'tx-1')
    assert.equal(scoped.locale, 'vi')
    assert.deepEqual(scoped.user, { id: 3 })
    assert.equal(scoped.payload, req.payload)
  })

  it('preserves existing context entries alongside the flag', () => {
    const req = makeReq({ __suppressExternalPublishHooks: true, locale: 'en' })

    const scoped = withScopedHookContext(req, { __generatingJsonLd: true })

    assert.deepEqual(scoped.context, {
      __suppressExternalPublishHooks: true,
      locale: 'en',
      __generatingJsonLd: true,
    })
  })

  it('tolerates a request with no context yet', () => {
    const req = { transactionID: 'tx-2' } as unknown as FakeReq

    const scoped = withScopedHookContext(req, { __generatingJsonLd: true })

    assert.deepEqual(scoped.context, { __generatingJsonLd: true })
  })
})
