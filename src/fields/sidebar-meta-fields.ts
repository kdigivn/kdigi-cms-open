/**
 * Shared sidebar meta fields — DRY helpers for the edit-view right column.
 *
 * These fields were duplicated verbatim across Products / Pages / Posts.
 * Centralising them keeps the sidebar layout consistent and the scheduled-publish
 * hook in one place. All return top-level fields with `position: 'sidebar'`
 * (sidebar placement only works for top-level fields in Payload v3 — never inside
 * tabs/group/row).
 *
 * status is intentionally NOT here: its option labels differ per collection
 * (Products uses EN, Pages/Posts use VI), so it stays inline.
 */
import type { Field } from 'payload'

/**
 * Move an existing field factory's output into the sidebar.
 * Spreading the `Field` union and overriding `admin` inline defeats TS's
 * discriminant narrowing, so the cast is required and safe (we only add
 * `admin.position`, no shape change).
 */
export function inSidebar(field: Field): Field {
  return { ...field, admin: { ...('admin' in field ? field.admin : {}), position: 'sidebar' } } as Field
}

/**
 * Context flag set by importers (`phase-content`) that carry a real historical
 * publish date (e.g. the WordPress `date`). The date is kept instead of being
 * stamped to now(), so the frontend's date display and `-publishedAt` ordering
 * match the source site.
 */
export const PRESERVE_SOURCE_PUBLISHED_AT = '__preserveSourcePublishedAt'

/**
 * Resolve the stored `publishedAt` for a write.
 *   - not published                          → untouched
 *   - empty                                  → now
 *   - in the future                          → kept (scheduling)
 *   - in the past, importer flag set         → kept (source date)
 *   - in the past, doc was already published → kept (an edit must not re-date it)
 *   - in the past, draft → published flip    → now
 */
export function resolvePublishedAt(args: {
  value: unknown
  status: unknown
  previousStatus: unknown
  preserveSourceDate: boolean
  now?: Date
}): unknown {
  const { value, status, previousStatus, preserveSourceDate } = args
  if (status !== 'published') return value
  const now = args.now ?? new Date()
  if (!value) return now.toISOString()
  if (new Date(value as string) > now) return value
  if (preserveSourceDate || previousStatus === 'published') return value
  return now.toISOString()
}

/**
 * Scheduled-publish date field. Stamps now() when a doc flips to published with
 * an empty or past date; preserves future dates (scheduling), dates of docs that
 * were already published, and importer-supplied source dates.
 */
export function sidebarPublishedAtField(): Field {
  return {
    name: 'publishedAt',
    type: 'date',
    admin: {
      position: 'sidebar',
      description:
        'Đặt thời điểm tương lai để hẹn giờ đăng — bài chỉ hiển thị công khai từ lúc này. Giờ Việt Nam (UTC+7).',
      date: { pickerAppearance: 'dayAndTime' },
    },
    hooks: {
      beforeChange: [
        ({ value, data, originalDoc, req }) =>
          resolvePublishedAt({
            value,
            status: data?.status,
            previousStatus: originalDoc?.status,
            preserveSourceDate: Boolean(
              (req?.context as Record<string, unknown> | undefined)?.[PRESERVE_SOURCE_PUBLISHED_AT],
            ),
          }),
      ],
    },
  }
}

/** "Nhân bản" (duplicate record) button rendered in the sidebar panel. */
export function sidebarDuplicateActionField(): Field {
  return {
    name: 'duplicateAction',
    type: 'ui',
    admin: {
      position: 'sidebar',
      components: {
        Field: '@/components/admin/duplicate-record-button#DuplicateRecordButton',
      },
    },
  }
}

/** Compact "Cập nhật / Tạo" timestamps rendered at the bottom of the sidebar. */
export function sidebarDocMetaField(): Field {
  return {
    name: 'docMeta',
    type: 'ui',
    admin: {
      position: 'sidebar',
      components: {
        Field: '@/components/admin/doc-meta-field#DocMetaField',
      },
    },
  }
}
