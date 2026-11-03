import type { CollectionConfig, CollectionAfterDeleteHook, Field } from 'payload'

import { tenantScopedRead, tenantScopedWrite, tenantScopedVersionsRead } from '../access/tenant-scoped'
import { makeGuardRestoreSlugConflict } from '../hooks/guard-restore-slug-conflict'
import { makeContentDeleteAccess } from '../access/content-delete-access'
import { markdownHtmlField } from '../fields/markdown-html-field'
import { triggerRevalidate, triggerRevalidateAfterDelete } from '../hooks/trigger-revalidate'

function normalizeShortcodeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function resolveTitle(data: Record<string, unknown> | undefined): string {
  const titleRaw = data?.title

  if (typeof titleRaw === 'string') return titleRaw
  if (typeof titleRaw === 'object' && titleRaw !== null) {
    const localized = titleRaw as Record<string, string>
    return localized.vi ?? localized.en ?? ''
  }

  return ''
}

const shortcodeTagCellField: Field = {
  name: 'tagSnippet',
  type: 'ui',
  admin: {
    components: {
      Cell: '@/components/admin/shortcode-tag-cell#ShortcodeTagCell',
    },
  },
}

export const Shortcodes: CollectionConfig = {
  slug: 'shortcodes',
  labels: {
    singular: { vi: 'Shortcode', en: 'Shortcode' },
    plural: { vi: 'Shortcode', en: 'Shortcodes' },
  },
  admin: {
    useAsTitle: 'title',
    group: { vi: 'Nội dung', en: 'Content' },
    description:
      'Nội dung dùng lại (bảng giá, quy định, hướng dẫn...). Chèn vào Content Md bằng thẻ [sc name="ten-shortcode"][/sc].',
    defaultColumns: ['title', 'name', 'tagSnippet', 'tenant'],
    listSearchableFields: ['title', 'name'],
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
    beforeChange: [makeGuardRestoreSlugConflict('name')],
    afterChange: [triggerRevalidate],
    afterDelete: [triggerRevalidateAfterDelete as CollectionAfterDeleteHook],
  },
  fields: [
    shortcodeTagCellField,
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
      admin: {
        description: 'Tên hiển thị cho biên tập viên, ví dụ: "Quy định mang thú cưng".',
      },
    },
    {
      name: 'name',
      type: 'text',
      required: true,
      index: true,
      admin: {
        description:
          'Machine name duy nhất trong từng tenant. Có thể copy tag này để chèn: [sc name="ten-shortcode"][/sc].',
      },
      hooks: {
        beforeValidate: [
          ({ value, data }) => {
            if (typeof value === 'string' && value.trim()) return normalizeShortcodeName(value.trim())

            const title = resolveTitle(data as Record<string, unknown> | undefined)
            if (!title) return value

            return normalizeShortcodeName(title)
          },
        ],
      },
      validate: (value: string | null | undefined) => {
        if (typeof value !== 'string' || !value) return 'Name shortcode là bắt buộc.'
        if (/^[a-z0-9-]+$/.test(value)) return true
        return 'Name shortcode chỉ được gồm chữ thường a-z, số 0-9 và dấu gạch ngang.'
      },
    },
    ...markdownHtmlField('content', { localized: true, required: true }),
  ],
}
