/**
 * Comments collection — user-submitted comments on posts or products, per tenant.
 *
 * Security rules (locked from plan Red Team review):
 *   1. authorEmail access.read = () => false — never in REST reads
 *   2. Public read filtered to status=approved only
 *   3. Default status = pending (requires moderation before public visibility)
 *
 * A comment must be linked to exactly one of: post or product.
 * Enforced via beforeValidate hook — create/update will reject if both or neither are set.
 *
 * After a comment is saved (approved or un-approved), an afterChange hook recomputes
 * the parent document's commentCount (count of approved comments).
 * The hook uses overrideAccess:true to bypass the commentCount write guard.
 */
import type { CollectionConfig } from 'payload'
import { tenantScopedRead, tenantScopedWrite } from '../access/tenant-scoped'
import { canModerateComments } from '../access/role-matrix'
import { relationId, syncCommentCounts } from '../hooks/sync-comment-count'
import { revalidateParentPostOnCommentApproval } from '../hooks/revalidate-on-comment-approval'
import { createCommentEndpoint } from '../endpoints/create-comment'
import { sanitizeHtmlContent } from '../lib/sanitize-html-content'

export const Comments: CollectionConfig = {
  slug: 'comments',
  // Mounted at /api/comments/create — must live here, not in config.endpoints.
  endpoints: [createCommentEndpoint],
  labels: {
    singular: { vi: 'Bình luận', en: 'Comment' },
    plural: { vi: 'Bình luận', en: 'Comments' },
  },
  admin: {
    useAsTitle: 'authorName',
    description: 'Bình luận từ người dùng trên bài viết hoặc sản phẩm. Cần duyệt trước khi hiển thị công khai.',
    defaultColumns: ['status', 'authorName', 'post', 'product', 'createdAt', 'tenant'],
    listSearchableFields: ['authorName', 'content'],
    group: { vi: 'Tương tác', en: 'Engagement' },
  },
  access: {
    // Unauthenticated: approved only. Authenticated: tenant-scoped (super-admin sees all).
    read: ({ req }) => {
      if (!req.user) return { status: { equals: 'approved' } }
      return tenantScopedRead({ req })
    },
    // Public comment creation handled via /api/comments/create custom endpoint
    create: tenantScopedWrite,
    // Authors cannot moderate comments — only roles in canModerateComments.
    // tenantScopedRead fallback keeps super-admin access intact.
    update: ({ req }) => {
      if (!canModerateComments(req.user)) return false
      return tenantScopedRead({ req })
    },
    delete: ({ req }) => {
      if (!canModerateComments(req.user)) return false
      return tenantScopedRead({ req })
    },
  },
  hooks: {
    beforeValidate: [
      // Sanitize user-supplied HTML to prevent persistent XSS in stored comments.
      ({ data, operation }) => {
        if (operation !== 'create' && operation !== 'update') return data
        const d = (data ?? {}) as Record<string, unknown>
        if (typeof d.content === 'string') d.content = sanitizeHtmlContent(d.content)
        if (typeof d.authorName === 'string') d.authorName = d.authorName.replace(/<[^>]*>/g, '')
        return data
      },
      ({ data, operation, originalDoc }) => {
        if (operation !== 'create' && operation !== 'update') return data

        const d = (data ?? {}) as Record<string, unknown>
        const orig = (originalDoc ?? {}) as Record<string, unknown>

        // Effective post/product after this write: a key present in the patch
        // wins (null = explicit clear), otherwise the stored value stands.
        // Key-presence checks stop partial PATCHes from sneaking in a second
        // parent or clearing both.
        const effPost = 'post' in d ? relationId(d.post) : relationId(orig.post)
        const effProduct =
          'product' in d ? relationId(d.product) : relationId(orig.product)

        if (effPost != null && effProduct != null) {
          throw new Error('A comment must be linked to either a post or a product — not both.')
        }
        if (effPost == null && effProduct == null) {
          throw new Error('A comment must be linked to a post or a product.')
        }

        return data
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, req }) => {
        // Recompute counts for the new parent AND the previous parent when a
        // comment is re-linked, so the old parent's count never goes stale.
        await syncCommentCounts(req, doc, previousDoc)

        // Webhook notification — fires only on creation of a pending comment.
        // No-op when MODERATION_WEBHOOK_URL is unset (dev / staging / on-prem).
        // Intentionally fire-and-forget: a webhook outage must never block the
        // main afterChange pipeline (count sync, revalidate, etc.).
        if (doc.status === 'pending' && !previousDoc?.id) {
          const webhookUrl = process.env.MODERATION_WEBHOOK_URL
          if (webhookUrl) {
            fetch(webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: `Comment mới chờ duyệt: ${doc.authorName || 'Ẩn danh'} — "${(doc.content || '').slice(0, 100)}"`,
              }),
              signal:
                typeof AbortSignal.timeout === 'function'
                  ? AbortSignal.timeout(3000)
                  : undefined,
            }).catch(() => {})
          }
        }
      },
      revalidateParentPostOnCommentApproval,
    ],
    afterDelete: [
      async ({ doc, req }) => {
        await syncCommentCounts(req, doc)
      },
    ],
  },
  fields: [
    {
      name: 'post',
      type: 'relationship',
      relationTo: 'posts',
      // Not required at field level — the beforeValidate hook enforces that exactly one
      // of post/product is set (allows the field to be null when product is set instead).
      required: false,
      hasMany: false,
      admin: { description: 'Bài viết được bình luận. Điền ô này HOẶC "Sản phẩm" — không điền cả hai.' },
    },
    {
      name: 'product',
      type: 'relationship',
      relationTo: 'products',
      required: false,
      hasMany: false,
      admin: { description: 'Sản phẩm được bình luận. Điền ô này HOẶC "Bài viết" — không điền cả hai.' },
    },
    {
      name: 'authorName',
      type: 'text',
      required: true,
      maxLength: 100,
      admin: { description: 'Tên người bình luận — hiển thị công khai bên dưới nội dung bình luận.' },
    },
    {
      // Never returned in REST reads — privacy guard matching sites.r2 pattern
      name: 'authorEmail',
      type: 'email',
      access: { read: () => false },
      admin: { description: 'Email người gửi — chỉ dùng nội bộ, không bao giờ hiển thị trên API.' },
    },
    {
      name: 'content',
      type: 'textarea',
      required: true,
      admin: { description: 'Nội dung bình luận — hiển thị công khai sau khi được duyệt.' },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      admin: {
        description: 'Trạng thái kiểm duyệt — chỉ "Đã duyệt" mới hiển thị công khai. Mặc định là Chờ duyệt.',
        position: 'sidebar',
      },
      options: [
        { label: 'Chờ duyệt', value: 'pending' },
        { label: 'Đã duyệt', value: 'approved' },
        { label: 'Spam', value: 'spam' },
      ],
    },
    {
      name: 'createdAt',
      type: 'date',
      defaultValue: () => new Date().toISOString(),
      admin: {
        description: 'Thời điểm gửi bình luận.',
        date: { pickerAppearance: 'dayAndTime' },
      },
    },
  ],
}
