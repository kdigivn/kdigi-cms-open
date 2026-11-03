/**
 * Slug field factory — URL-friendly identifier, auto-generated from title.
 *
 * NOTE: Payload's `unique: true` enforces a single-column unique index.
 * A compound unique index (tenant, slug) must be added via a Postgres migration
 * (see src/migrations/compound-slug-tenant-index.ts) to prevent cross-tenant collisions
 * under concurrent upserts or bulk imports.
 */
import type { Field } from 'payload'

export const slugField = (): Field => ({
  name: 'slug',
  type: 'text',
  required: true,
  admin: {
    description: 'URL-friendly identifier. Auto-generated from title if left blank.',
    components: {
      Field: '@/components/admin/slug-prefix-field#SlugPrefixField',
    },
  },
  hooks: {
    beforeValidate: [
      ({ value, data }) => {
        if (value) return value
        // Try to derive from localized title (vi first, then en, then raw string)
        const titleRaw = data?.title
        const title =
          typeof titleRaw === 'string'
            ? titleRaw
            : typeof titleRaw === 'object' && titleRaw !== null
              ? ((titleRaw as Record<string, string>).vi ?? (titleRaw as Record<string, string>).en ?? '')
              : ''

        if (!title) return value

        return title
          .toLowerCase()
          // Đ/đ don't decompose under NFD (they're base letters, not letter+combining-mark),
          // so the strip-diacritics step below silently drops them instead of folding to "d".
          .replace(/đ/g, 'd')
          .replace(/Đ/g, 'D')
          .normalize('NFD')
          // Strip combining diacritical marks (e.g. Vietnamese tones)
          .replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
      },
    ],
  },
})
