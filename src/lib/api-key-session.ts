/**
 * API-key sessions (`Authorization: users API-Key …` / the MCP Bearer key) act as their owner on
 * every REST/GraphQL route, not only on `/api/mcp`. A leaked key must not become an account
 * takeover or an irreversible wipe, so key sessions may not touch credentials, role or site
 * membership, may not create accounts, and may not permanently delete anything (content goes to
 * the trash; media, taxonomies, menus, users, sites … cannot be deleted). Browser (JWT) sessions
 * are unaffected.
 */
import { changedLockedFields } from './demo-accounts'

export const API_KEY_SESSION_ACCOUNT_MESSAGE =
  'Phiên API key không được tạo tài khoản hoặc đổi email, mật khẩu, API key, vai trò, website. / ' +
  'API-key sessions cannot create accounts or change email, password, API key, role or sites.'

/** True when the request was authenticated by Payload's api-key strategy (`user._strategy`). */
export function isApiKeySession(user: unknown): boolean {
  return typeof user === 'object' && user !== null && '_strategy' in user && user._strategy === 'api-key'
}

function tenantIdsOf(value: unknown): string {
  if (!Array.isArray(value)) return ''
  const ids: string[] = []
  for (const row of value) {
    if (typeof row !== 'object' || row === null || !('tenant' in row)) continue
    const tenant = row.tenant
    const id = typeof tenant === 'object' && tenant !== null && 'id' in tenant ? tenant.id : tenant
    if (typeof id === 'string' || typeof id === 'number') ids.push(String(id))
  }
  return ids.sort().join()
}

/** Account fields an api-key session would change on `original` (names, for the error/log). */
export function changedAccountFields(
  data: Record<string, unknown> | undefined,
  original: Record<string, unknown> | undefined,
): string[] {
  if (!data) return []
  const changed = changedLockedFields(data, original)
  if (data.role !== undefined && data.role !== original?.role) changed.push('role')
  if (data.tenants !== undefined && tenantIdsOf(data.tenants) !== tenantIdsOf(original?.tenants)) {
    changed.push('tenants')
  }
  return changed
}
