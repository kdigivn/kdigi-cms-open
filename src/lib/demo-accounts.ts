/**
 * Opt-in protection for public demo accounts.
 *
 * `DEMO_ACCOUNT_EMAILS` is a comma-separated list of user emails (case-insensitive). Those users
 * can still use the admin normally but cannot lock anyone else out of the demo: they cannot change
 * their own email, password, API key or API-key switch, and cannot delete themselves. An empty or
 * unset variable disables the feature (default).
 */

export const DEMO_ACCOUNT_LOCKED_MESSAGE =
  'Tài khoản demo công khai không được đổi email, mật khẩu hoặc API key. / ' +
  'Public demo accounts cannot change their email, password or API key.'

export const DEMO_ACCOUNT_DELETE_MESSAGE =
  'Tài khoản demo công khai không thể tự xóa. / Public demo accounts cannot delete themselves.'

/** Fields a demo account may never change on itself. */
export const DEMO_LOCKED_FIELDS = ['email', 'password', 'apiKey', 'enableAPIKey'] as const

const normalize = (email: string): string => email.trim().toLowerCase()

/** Parse a comma-separated email list into a normalized set. */
export function parseDemoAccountEmails(raw: string | undefined | null): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map(normalize)
      .filter((email) => email.length > 0),
  )
}

/** True when `email` is listed in `DEMO_ACCOUNT_EMAILS` (read on every call, so tests can toggle it). */
export function isDemoAccountEmail(email: unknown, raw: string | undefined = process.env.DEMO_ACCOUNT_EMAILS): boolean {
  if (typeof email !== 'string' || email.length === 0) return false
  return parseDemoAccountEmails(raw).has(normalize(email))
}

/**
 * Names of the locked fields that `data` would actually change on `original`.
 * `password` counts as a change whenever a non-empty value is submitted (hashes are never comparable);
 * `email`/`apiKey`/`enableAPIKey` only when the value differs, so the admin form re-submitting the
 * unchanged document still saves.
 */
export function changedLockedFields(
  data: Record<string, unknown> | undefined,
  original: Record<string, unknown> | undefined,
): string[] {
  if (!data) return []
  const changed: string[] = []
  if (typeof data.password === 'string' && data.password.length > 0) changed.push('password')
  if (typeof data.email === 'string' && normalize(data.email) !== normalize(String(original?.email ?? ''))) {
    changed.push('email')
  }
  if (data.apiKey !== undefined && data.apiKey !== null && data.apiKey !== '' && data.apiKey !== original?.apiKey) {
    changed.push('apiKey')
  }
  if (data.enableAPIKey !== undefined && Boolean(data.enableAPIKey) !== Boolean(original?.enableAPIKey)) {
    changed.push('enableAPIKey')
  }
  return changed
}
