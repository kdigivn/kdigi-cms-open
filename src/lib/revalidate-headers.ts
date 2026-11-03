/**
 * Headers for the CMS → frontend revalidate ping (`POST https://{Sites.domain}/api/cms/revalidate`).
 *
 * When `REVALIDATE_SECRET` is set it is sent as `x-revalidate-secret`, so a frontend can reject
 * pings that did not come from this CMS. Unset (default) = the request stays unauthenticated.
 * Read on every call so tests and secret rotation do not need a restart-time import.
 */
export const REVALIDATE_SECRET_HEADER = 'x-revalidate-secret'

export function revalidateHeaders(): Record<string, string> {
  const secret = process.env.REVALIDATE_SECRET
  return secret
    ? { 'Content-Type': 'application/json', [REVALIDATE_SECRET_HEADER]: secret }
    : { 'Content-Type': 'application/json' }
}
