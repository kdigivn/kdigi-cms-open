import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import type { PayloadRequest } from 'payload'

import { MCP_MAX_BODY_BYTES, mcpEndpoints } from './mcp'

const post = mcpEndpoints.find((e) => e.method === 'post')!.handler
const get = mcpEndpoints.find((e) => e.method === 'get')!.handler

const KEY_USER = { id: 7, email: 'agent@example.com', role: 'editor', tenants: [], _strategy: 'api-key' }

function fakeReq(body: string | ReadableStream<Uint8Array>, headers: Record<string, string> = {}) {
  const stream = typeof body === 'string' ? new Response(body).body : body
  return {
    url: 'http://localhost/api/mcp',
    headers: new Headers({ authorization: 'Bearer change-me', 'content-type': 'application/json', ...headers }),
    body: stream,
    user: null,
    payload: { auth: async () => ({ user: KEY_USER }), logger: { info() {}, warn() {}, error() {} } },
  } as unknown as PayloadRequest
}

/** A body that never declares its length — only a streaming cap catches it. */
function chunked(totalBytes: number): ReadableStream<Uint8Array> {
  const chunk = new Uint8Array(64 * 1024).fill(0x20)
  let sent = 0
  return new ReadableStream({
    pull(controller) {
      if (sent >= totalBytes) return controller.close()
      controller.enqueue(chunk)
      sent += chunk.byteLength
    },
  })
}

describe('POST /api/mcp boundaries', () => {
  afterEach(() => {
    delete process.env.MCP_ENABLED
  })

  it('answers 401 with a Bearer challenge when no key is sent', async () => {
    const res = await post(fakeReq('{}', { authorization: '' }))
    assert.equal(res.status, 401)
    assert.match(res.headers.get('www-authenticate') ?? '', /^Bearer/)
  })

  it('rejects an oversized body that has no Content-Length while streaming', async () => {
    const res = await post(fakeReq(chunked(MCP_MAX_BODY_BYTES + 128 * 1024)))
    assert.equal(res.status, 413)
  })

  it('rejects JSON-RPC batches', async () => {
    const res = await post(fakeReq('[{"jsonrpc":"2.0","id":1,"method":"ping"}]'))
    assert.equal(res.status, 400)
  })

  it('is 404 when MCP_ENABLED=false, before any auth work', async () => {
    process.env.MCP_ENABLED = 'false'
    assert.equal((await post(fakeReq('{}', { authorization: '' }))).status, 404)
    assert.equal((await get(fakeReq(''))).status, 404)
  })

  it('answers 405 to GET (no server-initiated stream on a stateless server)', async () => {
    assert.equal((await get(fakeReq(''))).status, 405)
  })
})
