import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { PayloadRequest } from 'payload'

import { resolveAgentUser } from './auth'
import { AgentError } from './errors'

const KEY_USER = { id: 7, email: 'agent@example.com', collection: 'users', _strategy: 'api-key' }

function fakeReq(headers: Record<string, string>, authResult: unknown, reqUser: unknown = null) {
  const seen: string[] = []
  const req = {
    headers: new Headers(headers),
    user: reqUser,
    payload: {
      auth: async ({ headers: h }: { headers: Headers }) => {
        seen.push(h.get('authorization') ?? '')
        return { user: authResult }
      },
    },
  } as unknown as PayloadRequest
  return { req, seen }
}

const rejects = (p: Promise<unknown>) =>
  assert.rejects(p, (err: unknown) => err instanceof AgentError && err.code === 'unauthorized')

describe('resolveAgentUser', () => {
  it('rejects a request without an Authorization header even if a cookie session exists', async () => {
    const { req } = fakeReq({ cookie: 'payload-token=x' }, KEY_USER, { ...KEY_USER, _strategy: 'local-jwt' })
    await rejects(resolveAgentUser(req))
  })

  it('rejects the JWT scheme', async () => {
    const { req } = fakeReq({ authorization: 'JWT abc.def.ghi' }, KEY_USER)
    await rejects(resolveAgentUser(req))
  })

  it('resolves a Bearer key through the api-key strategy', async () => {
    const { req, seen } = fakeReq({ authorization: 'Bearer change-me-key' }, KEY_USER)
    assert.equal((await resolveAgentUser(req)).id, 7)
    assert.deepEqual(seen, ['users API-Key change-me-key'])
  })

  it('rejects a Bearer token that authenticates as something other than an API key', async () => {
    const { req } = fakeReq({ authorization: 'Bearer a.jwt.token' }, { ...KEY_USER, _strategy: 'local-jwt' })
    await rejects(resolveAgentUser(req))
  })

  it('rejects an unknown or disabled key', async () => {
    const { req } = fakeReq({ authorization: 'Bearer wrong' }, null)
    await rejects(resolveAgentUser(req))
  })

  it('reuses the api-key session Payload already resolved for the native scheme', async () => {
    const { req, seen } = fakeReq({ authorization: 'users API-Key change-me-key' }, null, KEY_USER)
    assert.equal((await resolveAgentUser(req)).id, 7)
    assert.deepEqual(seen, [])
  })
})
