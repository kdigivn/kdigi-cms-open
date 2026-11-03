/**
 * Faqs collection — FAQ groups per tenant.
 *
 * Each document represents a named group of Q&A pairs.
 * Used by frontend to render FAQ sections on landing pages and blog posts.
 */
import type { CollectionAfterDeleteHook, CollectionConfig, FieldHook } from 'payload'
import { tenantScopedRead, tenantScopedWrite, tenantScopedVersionsRead } from '../access/tenant-scoped'
import { makeContentDeleteAccess } from '../access/content-delete-access'
import { triggerRevalidate, triggerRevalidateAfterDelete } from '../hooks/trigger-revalidate'
import { markdownToHtml } from '../lib/markdown-to-html'
import { expandShortcodesInMarkdown } from '../lib/shortcodes/expand-shortcodes'

/**
 * `answer` is authored as Markdown (editors paste `[text](url)` links, lists, etc. —
 * same convention as contentMd) but stored as a plain textarea. Convert to sanitized
 * HTML for REST consumers only, so the admin form still shows/edits raw Markdown.
 */
const answerAfterRead: FieldHook = async ({ value, req, data }) => {
  if (req?.payloadAPI !== 'REST') return value
  if (typeof value !== 'string' || !value) return value

  const tenantRef = (data as { tenant?: number | string | { id: number | string } } | undefined)?.tenant
  const tenantId = typeof tenantRef === 'object' && tenantRef !== null ? tenantRef.id : tenantRef
  const expanded = value.includes('[sc')
    ? await expandShortcodesInMarkdown(value, {
        payload: req.payload,
        req,
        tenantId,
        locale: req.locale,
      })
    : value

  return markdownToHtml(expanded)
}

export const Faqs: CollectionConfig = {
  slug: 'faqs',
  labels: {
    singular: { vi: 'FAQ', en: 'FAQ' },
    plural: { vi: 'FAQs', en: 'FAQs' },
  },
  admin: {
    useAsTitle: 'group',
    description: 'Nhóm câu hỏi thường gặp (FAQ) — mỗi document là một tập hỏi/đáp, dùng trên trang landing hoặc trang nội dung.',
    defaultColumns: ['group', 'tenant'],
    listSearchableFields: ['group'],
    group: { vi: 'Phân loại', en: 'Taxonomy' },
  },
  // SP1a-1: History / diff / restore in the admin. No `drafts` — publishing semantics
  // (`status`, `publishedAndLive`) are unchanged; 30 versions per document cap the growth.
  // SP1a-2: deleting moves to the Trash (recoverable); permanent delete is admin-only — see
  // `makeContentDeleteAccess`. The (tenant, slug) unique index is partial (active rows only).
  trash: true,
  versions: { maxPerDoc: 30 },
  access: {
    readVersions: tenantScopedVersionsRead,
    read: ({ req }) => {
      // [RT-4] Public, but never trashed — `?trash=true` must not widen an anonymous read.
      if (!req.user) return { deletedAt: { exists: false } }
      return tenantScopedRead({ req })
    },
    create: tenantScopedWrite,
    update: tenantScopedWrite,
    delete: makeContentDeleteAccess({ hasCreatedBy: false }),
  },
  hooks: {
    afterChange: [triggerRevalidate],
    afterDelete: [triggerRevalidateAfterDelete as CollectionAfterDeleteHook],
  },
  fields: [
    {
      name: 'group',
      type: 'text',
      required: true,
      admin: {
        description: 'Tên nhóm FAQ — dùng để tham chiếu khi gắn vào trang, ví dụ: "trang-dat-ve" hoặc "gioi-thieu".',
      },
    },
    {
      name: 'items',
      type: 'array',
      required: true,
      admin: { description: 'Question/answer pairs in this FAQ group.' },
      fields: [
        {
          name: 'question',
          type: 'text',
          required: true,
          localized: true,
        },
        {
          name: 'answer',
          type: 'textarea',
          required: true,
          localized: true,
          admin: {
            description: 'Hỗ trợ Markdown (link `[text](url)`, in đậm, xuống dòng) — tự render trực tiếp, không escape.',
          },
          hooks: {
            afterRead: [answerAfterRead],
          },
        },
      ],
    },
  ],
}
