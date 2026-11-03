import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import type { AgentContext } from '../agent-api'
import { MCP_INSTRUCTIONS } from './instructions'
import { registerPrompts } from './prompts'
import { registerResources } from './resources'
import { registerTools } from './tools'

/** Server version reported to clients; bump with the root package version. */
export const MCP_SERVER_VERSION = '1.1.0'

/** A fresh server per HTTP request (stateless transport); tools close over the key owner. */
export function buildMcpServer(ctx: AgentContext): McpServer {
  const server = new McpServer(
    { name: 'kdigi-cms', version: MCP_SERVER_VERSION },
    { instructions: MCP_INSTRUCTIONS, capabilities: { tools: {}, resources: {}, prompts: {} } },
  )
  registerTools(server, ctx)
  registerResources(server)
  registerPrompts(server)
  return server
}
