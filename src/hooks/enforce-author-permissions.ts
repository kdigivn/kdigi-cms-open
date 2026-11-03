/**
 * beforeChange hook — enforces author-role restrictions on content collections.
 *
 * Rules for role=author:
 * 1. Cannot publish, judged on the EFFECTIVE status (`data.status ?? originalDoc.status`), not
 *    only on a submitted one [RT-6]. Otherwise two bypasses existed: a partial update without
 *    `status` on a live document (edits went live unreviewed), and a trash RESTORE, which sends
 *    only `{ deletedAt: null }` — an author could bring an editor-trashed published page back
 *    online. Moving one's own document TO the trash is allowed (it takes it offline).
 * 2. `createdBy` is auto-set on first create and locked thereafter (cannot be changed
 *    by the author themselves).
 *
 * All other roles pass through unchanged (additive-only, no behavior reduction).
 */
import { APIError, type CollectionBeforeChangeHook } from 'payload'

export const AUTHOR_PUBLISH_FORBIDDEN_MESSAGE =
  'Vai trò Author không có quyền đăng bài. Vui lòng liên hệ Editor hoặc Admin để phê duyệt. ' +
  '/ The Author role cannot publish; ask an Editor or Admin to review.'

export const enforceAuthorPermissions: CollectionBeforeChangeHook = ({
  data,
  originalDoc,
  req,
  operation,
}) => {
  const user = req.user as { role?: string; id?: string | number } | null
  if (!user || user.role !== 'author') return data

  const previous = originalDoc as { status?: unknown; deletedAt?: unknown } | undefined
  const effectiveStatus = data?.status !== undefined ? data.status : previous?.status
  const isTrashing = data?.deletedAt !== undefined && data.deletedAt !== null && !previous?.deletedAt
  if (effectiveStatus === 'published' && !isTrashing) {
    // 403, not a plain Error: REST and agent callers get a permission failure, not a 500.
    throw new APIError(AUTHOR_PUBLISH_FORBIDDEN_MESSAGE, 403, undefined, true)
  }

  // Auto-set createdBy on create; preserve on update (do not allow author to reassign)
  if (operation === 'create') {
    data.createdBy = user.id
  }

  return data
}
