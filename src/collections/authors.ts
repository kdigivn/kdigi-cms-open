/**
 * Authors collection — post author profiles.
 *
 * Matches frontend Author type from types/author.ts:
 *   { avatar?: { url, width, height }, name, slug?, email, url?, sameAs? }
 *
 * email is not exposed in REST reads (privacy guard).
 */
import type { CollectionAfterDeleteHook, CollectionConfig, Where } from 'payload'
import { tenantScopedRead, tenantScopedWrite } from '../access/tenant-scoped'
import { triggerRevalidate, triggerRevalidateAfterDelete } from '../hooks/trigger-revalidate'

/** Resolve a tenant ID from either a string or relationship object. */
function resolveTenantId(
  tenant: string | { id: string } | undefined | null,
): string | null {
  if (!tenant) return null
  return typeof tenant === 'string' ? tenant : tenant.id
}

export const Authors: CollectionConfig = {
  slug: 'authors',
  labels: {
    singular: { vi: 'Tác giả', en: 'Author' },
    plural: { vi: 'Tác giả', en: 'Authors' },
  },
  admin: {
    useAsTitle: 'name',
    description: 'Hồ sơ tác giả bài viết — hiển thị tên và ảnh ở cuối bài.',
    defaultColumns: ['name', 'slug', 'tenant'],
    listSearchableFields: ['name', 'slug'],
    group: { vi: 'Phân loại', en: 'Taxonomy' },
  },
  access: {
    // Public byline data (name/slug/avatar/bio) must be readable for unauthenticated
    // REST reads so post/product author relationships resolve on the public site.
    // email stays blocked via field-level access:{read:()=>false} below.
    read: ({ req }) => {
      if (req.user) return tenantScopedRead({ req })
      return true
    },
    create: tenantScopedWrite,
    update: tenantScopedWrite,
    delete: tenantScopedWrite,
  },
  hooks: {
    beforeValidate: [
      // Per-tenant slug uniqueness — runs at the COLLECTION level so the
      // multi-tenant plugin has already assigned `data.tenant` by this point.
      // (Field-level beforeValidate fires too early; tenant is still undefined there.)
      async ({ data, req, originalDoc }) => {
        const slug = typeof data?.slug === 'string' ? data.slug : ''
        if (!slug) return // no slug to check — auto-slug runs at field level

        // Prefer data.tenant (set by multi-tenant plugin at collection-level
        // beforeValidate), fall back to originalDoc.tenant for partial updates
        // where tenant isn't being changed.
        const tenantId =
          resolveTenantId(
            (data as { tenant?: string | { id: string } } | undefined)?.tenant,
          ) ??
          resolveTenantId(
            (originalDoc as { tenant?: string | { id: string } } | undefined)?.tenant,
          )

        if (!tenantId) return // tenant not yet known; skip check

        const and: Where[] = [{ tenant: { equals: tenantId } }, { slug: { equals: slug } }]
        if (originalDoc?.id) {
          and.push({ id: { not_equals: originalDoc.id } })
        }

        const existing = await req.payload.find({
          collection: 'authors',
          where: { and },
          limit: 1,
          depth: 0,
        })
        if (existing.totalDocs > 0) {
          throw new Error(`Slug "${slug}" đã tồn tại trong tenant này.`)
        }
      },
    ],
    afterChange: [triggerRevalidate],
    afterDelete: [triggerRevalidateAfterDelete as CollectionAfterDeleteHook],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: { description: 'Tên tác giả — hiển thị công khai trên bài viết.' },
    },
    {
      name: 'slug',
      type: 'text',
      admin: {
        description: 'URL-friendly author identifier. Must be unique within a tenant (author @id / profile URL).',
      },
      hooks: {
        beforeValidate: [
          ({ value, data }) => {
            if (value) return value
            const name = typeof data?.name === 'string' ? data.name : ''
            if (!name) return value
            return name
              .toLowerCase()
              .normalize('NFD')
              .replace(/[̀-ͯ]/g, '')
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '')
          },
        ],
      },
    },
    {
      name: 'avatar',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'Author profile picture.' },
    },
    {
      name: 'bio',
      type: 'textarea',
      localized: true,
      admin: { description: 'Tiểu sử tác giả — hiển thị ở cuối bài viết.' },
    },
    {
      name: 'sameAs',
      type: 'array',
      labels: {
        singular: { vi: 'Liên kết hồ sơ', en: 'Profile link' },
        plural: { vi: 'Liên kết hồ sơ', en: 'Profile links' },
      },
      admin: {
        description:
          'URL hồ sơ công khai của tác giả (Facebook, LinkedIn, website…) — dùng cho thuộc tính sameAs trong JSON-LD.',
      },
      fields: [
        {
          name: 'url',
          type: 'text',
          required: true,
          // Full URL parse, not a prefix regex — defense-in-depth at data entry
          // (the frontend sanitize gate is not the only gate).
          validate: (value: unknown) => {
            if (typeof value !== 'string') return 'Required'
            try {
              const u = new URL(value)
              return u.protocol === 'http:' || u.protocol === 'https:' ? true : 'Must be http(s)'
            } catch {
              return 'Must be an absolute http(s) URL'
            }
          },
        },
      ],
    },
    {
      // Email stored for admin use — never returned in REST reads
      name: 'email',
      type: 'email',
      access: { read: () => false },
      admin: { description: 'Contact email — not exposed via REST.' },
    },
  ],
}
