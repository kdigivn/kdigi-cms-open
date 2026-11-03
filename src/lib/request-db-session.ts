import type { PayloadRequest } from 'payload'

/** The slice of a drizzle database handle raw-SQL helpers need. */
export interface ExecutableDb {
  execute: (query: unknown) => Promise<unknown>
}

/**
 * Drizzle handle for raw SQL issued from inside a request: the request's OPEN transaction
 * session when there is one, else the pool.
 *
 * Running on the session matters twice: the statement sees rows the request has written but not
 * committed yet, and it reuses the connection the request already holds — a second pool
 * checkout while the outer transaction is open can stall under pool pressure and leave that
 * transaction idle until it rolls back (measured with comment counts, see `sync-comment-count`).
 */
export function requestDb(req: PayloadRequest): ExecutableDb {
  const tid = req.transactionID
  const sessions = (req.payload.db as unknown as { sessions?: Record<string | number, { db: ExecutableDb }> })
    .sessions
  if ((typeof tid === 'string' || typeof tid === 'number') && sessions?.[tid]?.db) return sessions[tid].db
  return (req.payload.db as unknown as { drizzle: ExecutableDb }).drizzle
}
