/**
 * Header-only API-key authentication for the agent surface.
 *
 * Accepted: `Authorization: Bearer <key>` (what MCP clients send) and Payload's native
 * `Authorization: users API-Key <key>`. Rejected: cookie sessions (no header → no CSRF /
 * DNS-rebinding vector from a logged-in browser) and JWTs (one credential type for agents).
 */
import type { PayloadRequest, TypedUser } from 'payload'

import { isApiKeySession } from '../lib/api-key-session'
import { AgentError } from './errors'

const AUTH_HEADER = /^(bearer|users api-key)\s+(\S+)$/i

export async function resolveAgentUser(req: PayloadRequest): Promise<TypedUser> {
  const header = req.headers.get('authorization')?.trim() ?? ''
  const match = AUTH_HEADER.exec(header)
  if (!match) {
    throw new AgentError('unauthorized', 'Send the API key as "Authorization: Bearer <key>".')
  }
  const [, scheme, key] = match

  // Payload already ran its strategies for this request; the native scheme needs no second lookup.
  if (scheme.toLowerCase() === 'users api-key' && isApiKeySession(req.user) && req.user) return req.user

  const { user } = await req.payload.auth({ headers: new Headers({ authorization: `users API-Key ${key}` }) })
  if (!user || !isApiKeySession(user)) {
    throw new AgentError('unauthorized', 'Invalid or disabled API key.')
  }
  return user
}
