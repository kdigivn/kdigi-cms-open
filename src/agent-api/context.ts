/**
 * Per-operation request isolation for agent calls.
 *
 * Every op gets its own Local-API request (`payloadAPI: 'local'`), never the HTTP request that
 * carried the MCP message: concurrent tool calls would otherwise share one `transactionID`
 * (one failing op rolls back another op's "successful" write), and REST-only afterRead work
 * (Markdown→HTML render, shortcode lookups) would run on every read only to be discarded.
 */
import { createLocalReq, type Payload, type PayloadRequest, type TypedUser } from 'payload'

import { isSuperAdminUser, type TenantUser, userTenantIds } from '../lib/admin-selected-tenant'

export const AGENT_LOCALES = ['vi', 'en'] as const
export type AgentLocale = (typeof AGENT_LOCALES)[number]
export const DEFAULT_AGENT_LOCALE: AgentLocale = 'vi'

/** The authenticated key owner + the Payload instance; built once per HTTP request. */
export interface AgentContext {
  payload: Payload
  user: TypedUser
  /** Super-admin keys see every site (and get a warning in `whoami`). */
  superAdmin: boolean
  /** Site ids the key owner is a member of (from the multi-tenant `tenants` array). */
  memberSiteIds: number[]
  log: (msg: string) => void
}

export function makeAgentContext(payload: Payload, user: TypedUser): AgentContext {
  // The generated `User` types `tenants` as nullable, the plugin helper's shape as optional.
  const tenantUser = user as unknown as TenantUser
  return {
    payload,
    user,
    superAdmin: isSuperAdminUser(tenantUser),
    memberSiteIds: userTenantIds(tenantUser).map(Number),
    log: (msg) => payload.logger.error(`[agent-api] ${msg}`),
  }
}

/**
 * A fresh request for one op. `fallbackLocale: false` so a read of an untranslated locale
 * returns empty fields instead of silently showing (and inviting a write-back of) `vi` text.
 */
export function agentReq(ctx: AgentContext, locale: AgentLocale = DEFAULT_AGENT_LOCALE): Promise<PayloadRequest> {
  return createLocalReq({ user: ctx.user, locale, fallbackLocale: false, context: { agentApi: true } }, ctx.payload)
}
