/**
 * beforeChange guard for restoring from the trash (SP1a-2).
 *
 * A trashed document keeps its slug (or shortcode `name`), and the unique indexes are now
 * PARTIAL (`WHERE deleted_at IS NULL`) so a replacement may reuse it. Restoring the original
 * afterwards would violate that index; without this guard the editor would get a raw database
 * error. Here it becomes a field-level ValidationError with a bilingual message.
 */
import type { CollectionBeforeChangeHook, CollectionSlug, Where } from 'payload'
import { ValidationError } from 'payload'

type Keyed = { deletedAt?: unknown; tenant?: unknown } & Record<string, unknown>

/** Restore = the stored doc is trashed and this write explicitly clears `deletedAt`. */
export function isRestoreFromTrash(data: Keyed | undefined, originalDoc: Keyed | undefined): boolean {
  return Boolean(originalDoc?.deletedAt) && data !== undefined && 'deletedAt' in data && !data.deletedAt
}

function tenantIdOf(value: unknown): string | number | undefined {
  if (value && typeof value === 'object') return (value as { id?: string | number }).id
  return typeof value === 'string' || typeof value === 'number' ? value : undefined
}

export function makeGuardRestoreSlugConflict(field: 'slug' | 'name' | 'key'): CollectionBeforeChangeHook {
  return async ({ data, originalDoc, req, collection }) => {
    if (!isRestoreFromTrash(data as Keyed, originalDoc as Keyed)) return data

    const value = (data as Keyed)[field] ?? (originalDoc as Keyed)[field]
    const tenantId = tenantIdOf((data as Keyed).tenant ?? (originalDoc as Keyed).tenant)
    if (typeof value !== 'string' || !value || tenantId === undefined) return data

    const where: Where = {
      and: [
        { [field]: { equals: value } },
        { tenant: { equals: tenantId } },
        { id: { not_equals: (originalDoc as { id: string | number }).id } },
      ],
    }
    const holders = await req.payload.find({
      collection: collection.slug as CollectionSlug,
      where,
      trash: false,
      limit: 1,
      depth: 0,
      pagination: false,
      overrideAccess: true,
      req,
    })
    if (holders.docs.length > 0) {
      throw new ValidationError({
        collection: collection.slug,
        errors: [
          {
            path: field,
            message:
              `"${value}" đang được dùng bởi một tài liệu khác trong site này — đổi ${field} của một bên rồi khôi phục lại. ` +
              `/ "${value}" is used by another document on this site — rename one of them, then restore.`,
          },
        ],
      })
    }
    return data
  }
}
