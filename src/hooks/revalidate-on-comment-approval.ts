/**
 * `comments` afterChange hook: revalidate the parent post's page when a comment becomes (or stops
 * being) publicly visible.
 *
 * Why: `syncCommentCounts` updates `posts.comment_count` with raw SQL on purpose (no parent hooks), so
 * approving a comment never reached `triggerRevalidate` and the frontend kept serving the cached post
 * page, without the comment and with the old count, until its ISR window expired.
 *
 * Fires only on a change of visibility: created already approved, pending -> approved, or approved ->
 * anything else. Pending submissions and edits that leave the status alone queue nothing. The job is
 * the same `revalidateFrontend` one the posts hooks queue (`collection: 'posts'`, the post's id and
 * slug, the comment's tenant), so sites without a `domain` queue nothing. Comments on products are not handled here.
 */
import type { CollectionAfterChangeHook } from 'payload'

import { isRevalidateSuppressed } from './publish-hook-guards'
import { relationId } from './sync-comment-count'
import { queueRevalidations } from './trigger-revalidate'

export const revalidateParentPostOnCommentApproval: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  if (isRevalidateSuppressed(req?.context as Record<string, unknown> | undefined)) return doc

  const visibleNow = doc.status === 'approved'
  const visibleBefore = previousDoc?.status === 'approved'
  if (visibleNow === visibleBefore) return doc

  const postId = relationId(doc.post)
  const tenantId = relationId(doc.tenant)
  if (postId == null || tenantId == null) return doc

  try {
    const post = await req.payload.findByID({
      collection: 'posts',
      id: postId,
      depth: 0,
      overrideAccess: true,
      select: { slug: true },
      req,
    })
    await queueRevalidations({
      doc: { id: post.id, slug: post.slug },
      collection: { slug: 'posts' },
      req,
      tenantId: String(tenantId),
    })
  } catch (err) {
    // Same stance as the other revalidate hooks: a failed lookup or queue insert never blocks moderation.
    req.payload.logger.error({ err }, 'Failed to queue revalidation for the parent post of a moderated comment')
  }
  return doc
}
