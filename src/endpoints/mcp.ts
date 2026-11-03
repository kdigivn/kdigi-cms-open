/**
 * Model Context Protocol endpoint — `POST /api/mcp` (Streamable HTTP, stateless, JSON responses).
 *
 * Auth is header-only (`Authorization: Bearer <users API key>`); cookies and JWTs are refused
 * (see `src/agent-api/auth.ts`). Each request builds a fresh server whose tools run as the key
 * owner through the normal collection access rules. `GET` (server-initiated SSE stream) and
 * `DELETE` (session end) are not used by a stateless server → 405.
 *
 * Disabled with `MCP_ENABLED=false` (the route then answers 404).
 */
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { Endpoint, PayloadHandler } from 'payload'

import { AgentError, makeAgentContext, resolveAgentUser } from '../agent-api'
import { buildMcpServer } from '../mcp/server'

/** Largest accepted JSON-RPC message; bodies are Markdown, so 2 MB is generous. */
export const MCP_MAX_BODY_BYTES = 2 * 1024 * 1024

export function mcpEnabled(): boolean {
  return process.env.MCP_ENABLED?.trim().toLowerCase() !== 'false'
}

function jsonRpcError(status: number, code: number, message: string, headers?: Record<string, string>): Response {
  return Response.json({ jsonrpc: '2.0', id: null, error: { code, message } }, { status, headers })
}

/** Reads at most `maxBytes`; `null` when the body is larger (checked while streaming, not after). */
async function readBodyCapped(body: ReadableStream<Uint8Array> | null | undefined, maxBytes: number): Promise<string | null> {
  if (!body) return ''
  const chunks: Uint8Array[] = []
  let total = 0
  const reader = body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

const handlePost: PayloadHandler = async (req) => {
  if (!mcpEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  let user
  try {
    user = await resolveAgentUser(req)
  } catch (err) {
    if (err instanceof AgentError && err.code === 'unauthorized') {
      return jsonRpcError(401, -32001, err.message, { 'WWW-Authenticate': 'Bearer realm="kdigi-cms"' })
    }
    throw err
  }

  const declared = Number(req.headers.get('content-length') ?? NaN)
  if (Number.isFinite(declared) && declared > MCP_MAX_BODY_BYTES) {
    return jsonRpcError(413, -32600, `Request body exceeds ${MCP_MAX_BODY_BYTES} bytes`)
  }
  const text = await readBodyCapped(req.body, MCP_MAX_BODY_BYTES)
  if (text === null) return jsonRpcError(413, -32600, `Request body exceeds ${MCP_MAX_BODY_BYTES} bytes`)

  let parsedBody: unknown
  try {
    parsedBody = JSON.parse(text)
  } catch {
    return jsonRpcError(400, -32700, 'Parse error: body is not valid JSON')
  }
  // Batches would run several writes inside one HTTP request; MCP 2025-06 dropped them anyway.
  if (Array.isArray(parsedBody)) return jsonRpcError(400, -32600, 'JSON-RPC batches are not supported')

  const ctx = makeAgentContext(req.payload, user)
  if (ctx.superAdmin) {
    req.payload.logger.warn({ msg: 'mcp: super-admin API key in use — it bypasses site isolation', userId: user.id })
  }
  const server = buildMcpServer(ctx)
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  try {
    await server.connect(transport)
    // The body stream is consumed above, so the transport gets headers + the parsed message.
    const forwarded = new Request(req.url ?? 'http://localhost/api/mcp', { method: 'POST', headers: req.headers })
    return await transport.handleRequest(forwarded, { parsedBody })
  } finally {
    await server.close().catch(() => undefined)
  }
}

const methodNotAllowed: PayloadHandler = () =>
  mcpEnabled()
    ? jsonRpcError(405, -32000, 'Method not allowed: this MCP server is stateless (POST only)', { Allow: 'POST' })
    : Response.json({ error: 'Not found' }, { status: 404 })

export const mcpEndpoints: Endpoint[] = [
  { method: 'post', path: '/mcp', handler: handlePost },
  { method: 'get', path: '/mcp', handler: methodNotAllowed },
  { method: 'delete', path: '/mcp', handler: methodNotAllowed },
]
