import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

import type { Connection } from './config.js'
import { CliError, EXIT, toolError } from './errors.js'

export const CLI_VERSION = '0.1.0'

export const mcpUrl = (baseUrl: string) => new URL(`${baseUrl}/api/mcp`)

export function httpTransport(conn: Pick<Connection, 'url' | 'apiKey'>): StreamableHTTPClientTransport {
  return new StreamableHTTPClientTransport(mcpUrl(conn.url), {
    requestInit: { headers: { Authorization: `Bearer ${conn.apiKey}` } },
  })
}

export interface Kcms {
  call<T = Record<string, unknown>>(tool: string, args?: Record<string, unknown>): Promise<T>
  client: Client
  conn: Connection
  close(): Promise<void>
}

/** The SDK's StreamableHTTPError carries the HTTP status in `code`. */
function httpStatusOf(err: unknown): number | undefined {
  return typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'number' ? err.code : undefined
}

function connectError(err: unknown, url: string): CliError {
  const message = err instanceof Error ? err.message : String(err)
  const status = httpStatusOf(err)
  if (status === 401) return new CliError('The API key was rejected (401). Check KCMS_API_KEY or run `kcms login`.', EXIT.auth, 'unauthorized')
  if (status === 404) return new CliError(`${url}/api/mcp answered 404 — is MCP_ENABLED=false or the URL wrong?`, EXIT.op)
  return new CliError(`Cannot reach ${url}/api/mcp: ${message}`, EXIT.op)
}

export async function connect(conn: Connection): Promise<Kcms> {
  const client = new Client({ name: 'kcms-cli', version: CLI_VERSION })
  try {
    await client.connect(httpTransport(conn))
  } catch (err) {
    throw connectError(err, conn.url)
  }
  return {
    client,
    conn,
    async call(tool, args = {}) {
      const result = await client.callTool({ name: tool, arguments: args })
      const text = Array.isArray(result.content)
        ? result.content.map((c) => (c && typeof c === 'object' && 'text' in c ? String(c.text) : '')).join('\n')
        : ''
      if (result.isError) throw toolError(text)
      if (result.structuredContent) return result.structuredContent as never
      return JSON.parse(text || '{}') as never
    },
    close: () => client.close(),
  }
}
