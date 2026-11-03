/**
 * Mandatory optimistic concurrency for agent writes.
 *
 * Compare-and-write runs inside ONE transaction that first takes `SELECT … FOR UPDATE` on the
 * row: a concurrent writer (admin save, another agent call) blocks until we commit, and our
 * compare sees the committed `updated_at`. Without the row lock the read-compare-write would
 * race (Payload's update has no conditional `where` for a single id).
 */
import { sql } from '@payloadcms/db-postgres'
import { commitTransaction, initTransaction, killTransaction, type PayloadRequest } from 'payload'

import { requestDb } from '../lib/request-db-session'
import { AgentError } from './errors'

/** Table names of the collections agent ops write with a concurrency token. */
const TABLES = { posts: 'posts', pages: 'pages', media: 'media' } as const
export type LockableCollection = keyof typeof TABLES

const sameInstant = (a: string | Date, b: string | Date): boolean => new Date(a).getTime() === new Date(b).getTime()

/**
 * Run `write` in a transaction after verifying the row's `updated_at` equals `expectedUpdatedAt`.
 * `write` MUST use the same `req` so Payload joins this transaction instead of opening its own.
 */
export async function withRowLock<T>(
  req: PayloadRequest,
  collection: LockableCollection,
  id: number,
  expectedUpdatedAt: string,
  write: () => Promise<T>,
): Promise<T> {
  await initTransaction(req)
  try {
    const result = (await requestDb(req).execute(
      sql`select updated_at from ${sql.identifier(TABLES[collection])} where id = ${id} for update`,
    )) as { rows: Array<{ updated_at: string | Date }> }
    const row = result.rows[0]
    if (!row) throw new AgentError('not_found', `${collection} #${id} does not exist.`)
    if (!sameInstant(row.updated_at, expectedUpdatedAt)) {
      const current = new Date(row.updated_at).toISOString()
      throw new AgentError(
        'conflict',
        `${collection} #${id} changed since you read it (now updatedAt=${current}). Re-read it, re-apply your edit, and retry with the new updatedAt.`,
        { currentUpdatedAt: current },
      )
    }
    const value = await write()
    await commitTransaction(req)
    return value
  } catch (err) {
    await killTransaction(req)
    throw err
  }
}
