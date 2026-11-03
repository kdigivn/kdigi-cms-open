import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { runProxy } from './proxy.js'

describe('kcms mcp proxy', () => {
  it('forwards initialize, tools/list and tools/call and tells the remote side the protocol version', async () => {
    const server = new McpServer({ name: 'fake-cms', version: '0.0.0' })
    server.registerTool('echo', { inputSchema: { text: z.string() } }, async ({ text }) => ({ content: [{ type: 'text', text }] }))

    const [clientSide, proxyLocal] = InMemoryTransport.createLinkedPair()
    const [proxyRemoteBase, serverSide] = InMemoryTransport.createLinkedPair()
    const versions: string[] = []
    const proxyRemote = Object.assign(proxyRemoteBase, { setProtocolVersion: (v: string) => versions.push(v) })

    await server.connect(serverSide)
    await runProxy(proxyLocal, proxyRemote)
    const client = new Client({ name: 'test', version: '0.0.0' })
    await client.connect(clientSide)

    const { tools } = await client.listTools()
    assert.deepEqual(
      tools.map((t) => t.name),
      ['echo'],
    )
    const result = await client.callTool({ name: 'echo', arguments: { text: 'xin chào' } })
    assert.deepEqual(result.content, [{ type: 'text', text: 'xin chào' }])
    assert.equal(versions.length, 1)

    await client.close()
    await server.close()
  })
})
