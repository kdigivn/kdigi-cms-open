/**
 * `kcms mcp`: a stdio MCP server that forwards every JSON-RPC message to the CMS over
 * Streamable HTTP, injecting the API key. For clients that only speak stdio, and for keeping the
 * key out of client config files (it comes from KCMS_API_KEY / the kcms profile).
 */
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'

interface VersionedTransport extends Transport {
  setProtocolVersion?: (version: string) => void
}

function protocolVersionOf(message: JSONRPCMessage): string | undefined {
  if (!('result' in message) || typeof message.result !== 'object' || message.result === null) return undefined
  const version = (message.result as Record<string, unknown>).protocolVersion
  return typeof version === 'string' ? version : undefined
}

/** Pipe `local` (client side) ⇄ `remote` (server side) until either closes. */
export async function runProxy(local: Transport, remote: VersionedTransport, onError: (err: Error) => void = () => {}): Promise<void> {
  let closing = false
  const closeBoth = async () => {
    if (closing) return
    closing = true
    await Promise.allSettled([local.close(), remote.close()])
  }

  local.onmessage = (message) => {
    remote.send(message).catch((err: Error) => {
      onError(err)
      // Answer the request so the client does not hang waiting for a reply that will never come.
      if ('id' in message && 'method' in message) {
        void local.send({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: `kcms proxy: ${err.message}` } })
      }
    })
  }
  remote.onmessage = (message) => {
    // After initialize, the HTTP transport must send MCP-Protocol-Version on every request.
    const version = protocolVersionOf(message)
    if (version) remote.setProtocolVersion?.(version)
    local.send(message).catch(onError)
  }
  local.onerror = onError
  remote.onerror = onError
  local.onclose = () => void closeBoth()
  remote.onclose = () => void closeBoth()

  await remote.start()
  await local.start()
}
