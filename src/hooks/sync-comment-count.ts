/**
 * Recomputes the approved-comment count on parent posts/products.
 *
 * Counting in the database (totalDocs) instead of incrementing in memory makes
 * concurrent approve/delete operations converge to the correct value.
 */
import type { PayloadRequest } from 'payload'
import { sql } from '@payloadcms/db-postgres'

import { requestDb } from '../lib/request-db-session'

/** Extract a relationship id whether the field is populated or a bare id. */
export function relationId(value: unknown): string | number | null {
  if (value == null) return null
  if (typeof value === 'object') {
    return ((value as { id?: string | number }).id ?? null) as string | number | null
  }
  return value as string | number
}

async function recount(
  req: PayloadRequest,
  parentCollection: 'posts' | 'products',
  relField: 'post' | 'product',
  parentId: string | number,
): Promise<void> {
  // Recompute the approved-comment count and write it in ONE atomic raw SQL statement.
  //
  // Why raw SQL instead of payload.find + payload.update (mirrors submit-rating.ts):
  // a nested payload.update on the parent opens its own operation, checks out a SECOND
  // pool connection while the comment's create transaction still holds the first, and
  // fires the parent's hook chain (JSON-LD / revalidate) —
  // and, with versions enabled, writes a version row per comment. Under pool pressure that nested checkout stalls, leaving the comment's
  // transaction idle-in-transaction until it times out and ROLLS BACK — i.e. comments
  // silently fail to persist. A single UPDATE here touches no hooks and returns its
  // connection immediately. commentCount is a derived display value, so a direct write
  // is correct.
  const idNum = Number(parentId)
  if (!Number.isInteger(idNum)) return
  const relCol = relField === 'product' ? 'product_id' : 'post_id'
  // Run on the request's transaction session when one is open. The comment row
  // that triggered this hook is not committed yet, so a fresh pool connection
  // counts stale data — commentCount would stay one behind until the NEXT
  // comment event. The session connection is already checked out for this
  // request, so this also keeps the no-second-pool-checkout property above.
  await requestDb(req).execute(sql`
    UPDATE ${sql.raw(parentCollection)}
    SET comment_count = (
      SELECT count(*) FROM comments
      WHERE ${sql.raw(relCol)} = ${idNum} AND status = 'approved'
    )
    WHERE id = ${idNum}
  `)
}

/**
 * Sync commentCount for every parent touched by a comment change — including
 * the PREVIOUS parent when a comment is re-linked, so old counts don't go stale.
 */
export async function syncCommentCounts(
  req: PayloadRequest,
  doc: Record<string, unknown>,
  previousDoc?: Record<string, unknown> | null,
): Promise<void> {
  try {
    const postIds = new Set<string | number>()
    const productIds = new Set<string | number>()

    for (const source of [doc, previousDoc ?? {}]) {
      const postId = relationId(source.post)
      const productId = relationId(source.product)
      if (postId != null) postIds.add(postId)
      if (productId != null) productIds.add(productId)
    }

    for (const id of postIds) await recount(req, 'posts', 'post', id)
    for (const id of productIds) await recount(req, 'products', 'product', id)
  } catch (err) {
    // Non-fatal: log and continue; count re-syncs on the next comment change.
    req.payload.logger.error({ err }, 'Failed to sync commentCount on parent document')
  }
}
