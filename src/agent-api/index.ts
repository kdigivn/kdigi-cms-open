/**
 * Transport-agnostic operations for AI agents (MCP today). Each op validates its input with the
 * strict schema, runs as the API-key owner, and returns a compact JSON-able result or throws
 * `AgentError`. `runOp` adds the audit log line (no bodies, no keys) and error mapping.
 */
import type { z } from 'zod'

import type { AgentContext } from './context'
import { toAgentError } from './errors'

export { resolveAgentUser } from './auth'
export { type AgentContext, makeAgentContext } from './context'
export { AgentError, type AgentErrorCode, toAgentError } from './errors'
export * as content from './content'
export * as media from './media'
export * as seo from './seo'
export * as shortcodes from './shortcodes'
export * as sites from './sites'
export * as taxonomies from './taxonomies'
export { schemas } from './schemas'

export async function runOp<S extends z.ZodType, R>(
  ctx: AgentContext,
  name: string,
  schema: S,
  rawInput: unknown,
  op: (ctx: AgentContext, input: z.infer<S>) => Promise<R>,
): Promise<R> {
  const started = Date.now()
  let ok = false
  let code: string | undefined
  try {
    const result = await op(ctx, schema.parse(rawInput ?? {}))
    ok = true
    return result
  } catch (err) {
    const agentError = toAgentError(err, ctx.log)
    code = agentError.code
    throw agentError
  } finally {
    const input = rawInput && typeof rawInput === 'object' ? rawInput : {}
    ctx.payload.logger.info({
      msg: 'agent-op',
      op: name,
      userId: ctx.user.id,
      ...('site' in input ? { site: input.site } : {}),
      ...('id' in input ? { docId: input.id } : {}),
      ok,
      ...(code ? { code } : {}),
      ms: Date.now() - started,
    })
  }
}
