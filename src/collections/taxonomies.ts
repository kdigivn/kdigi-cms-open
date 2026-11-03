/**
 * Taxonomies collection — unified taxonomy store (categories, product categories, tags,
 * plus `custom` for taxonomies preserved from other systems, e.g. WordPress).
 *
 * Self-referential `parent` allows tree structures (categories with children).
 */
import type { CollectionAfterDeleteHook, CollectionConfig } from 'payload'
import { tenantScopedRead, tenantScopedWrite, tenantScopedVersionsRead } from '../access/tenant-scoped'
import { seoFieldGroup } from '../fields/seo-field-group'
import { markdownHtmlField } from '../fields/markdown-html-field'
import { makeApplySeoTemplatesHook } from '../hooks/apply-seo-templates'
import { makeGenerateJsonLdHook } from '../hooks/generate-jsonld'
import { makeResolveOgImageFallbackHook } from '../hooks/resolve-og-image-fallback'
import { triggerRevalidate, triggerRevalidateAfterDelete } from '../hooks/trigger-revalidate'

/** Minimum word count for taxonomies — below this is flagged as thin content. */
export const THIN_CONTENT_THRESHOLD = 500

/** Count whitespace-delimited words in a string. */
const countWords = (text: string): number =>
  text.trim().split(/\s+/).filter(Boolean).length

export const Taxonomies: CollectionConfig = {
  slug: 'taxonomies',
  labels: {
    singular: { vi: 'Taxonomy', en: 'Taxonomy' },
    plural: { vi: 'Taxonomies', en: 'Taxonomies' },
  },
  admin: {
    useAsTitle: 'name',
    description: 'Kho taxonomy thống nhất: danh mục, danh mục sản phẩm, tag. / Unified taxonomy store: categories, product categories, tags.',
    defaultColumns: ['name', 'type', 'slug', 'tenant'],
    listSearchableFields: ['name', 'slug'],
    group: { vi: 'Phân loại', en: 'Taxonomy' },
    components: {
      beforeListTable: ['@/components/admin/seo-bulk-action#SeoBulkAction'],
    },
  },
  // SP1a-1: History / diff / restore in the admin. No `drafts` — publishing semantics
  // (`status`, `publishedAndLive`) are unchanged; 30 versions per document cap the growth.
  versions: { maxPerDoc: 30 },
  access: {
    readVersions: tenantScopedVersionsRead,
    read: ({ req }) => {
      if (!req.user) return true
      return tenantScopedRead({ req })
    },
    create: tenantScopedWrite,
    update: tenantScopedWrite,
    delete: tenantScopedWrite,
  },
  hooks: {
    // Auto-fill blank seo.title/description from the site's taxonomies template on save.
    // Blank-only guard: existing SEO values (e.g. from importers) are never overwritten.
    beforeChange: [makeApplySeoTemplatesHook('taxonomy')],
    // Generate JSON-LD (CollectionPage + BreadcrumbList + WebSite + Organization) on save.
    afterChange: [makeGenerateJsonLdHook('taxonomy'), triggerRevalidate],
    afterDelete: [triggerRevalidateAfterDelete as CollectionAfterDeleteHook],
    // Virtual og:image fallback → site default only (taxonomies have no featuredImage).
    afterRead: [makeResolveOgImageFallbackHook(false)],
  },
  fields: [
    // ─── SEO list-cell — UI field; shows presence + score badge in list view ─
    {
      name: 'seoListCell',
      type: 'ui',
      admin: {
        components: {
          Cell: '@/components/admin/seo-list-cell#SeoListCell',
        },
      },
    },

    // ─── Auto-derived word count — flags thin content ──────────────────────────
    {
      name: 'contentWordCount',
      type: 'number',
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Auto-derived from description length. Flags <500 as thin.',
        components: {
          Cell: '@/components/admin/thin-content-warning#ThinContentWarningCell',
        },
      },
      hooks: {
        beforeChange: [
          ({ data }) => {
            if (!data) return 0
            const desc = data.description
            if (!desc) return 0
            const total = typeof desc === 'string' ? desc : Object.values(desc).join(' ')
            return countWords(total)
          },
        ],
      },
    },

    {
      name: 'type',
      type: 'select',
      required: true,
      options: [
        { label: 'Category', value: 'category' },
        { label: 'Product Category', value: 'product-category' },
        { label: 'Tag', value: 'tag' },
        { label: 'Custom', value: 'custom' },
      ],
      admin: {
        description: 'Loại taxonomy. / Taxonomy type.',
      },
    },
    {
      name: 'name',
      type: 'text',
      required: true,
      localized: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      admin: {
        description: 'URL-friendly identifier. Must be unique within a tenant + type combination.',
        components: {
          Field: '@/components/admin/slug-prefix-field#SlugPrefixField',
        },
      },
      hooks: {
        beforeValidate: [
          ({ value, data }) => {
            if (value) return value
            const nameRaw = data?.name
            const name =
              typeof nameRaw === 'string'
                ? nameRaw
                : typeof nameRaw === 'object' && nameRaw !== null
                  ? ((nameRaw as Record<string, string>).vi ?? (nameRaw as Record<string, string>).en ?? '')
                  : ''
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
      name: 'description',
      type: 'textarea',
      localized: true,
    },
    {
      name: 'parent',
      type: 'relationship',
      relationTo: 'taxonomies',
      hasMany: false,
      admin: {
        description: 'Parent taxonomy for hierarchical types (category). Leave empty for root.',
      },
    },
    {
      name: 'customType',
      type: 'text',
      admin: {
        description: 'Tên taxonomy tuỳ chỉnh (ví dụ khi import từ WordPress). / Custom taxonomy name, e.g. preserved from a WordPress import.',
        condition: (data) => data?.type === 'custom',
      },
    },

    // ── Tabs ─────────────────────────────────────────────────────────────────
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Content',
          fields: [...markdownHtmlField('content', { localized: true })],
        },
        {
          label: 'SEO',
          fields: [seoFieldGroup()],
        },
      ],
    },
  ],
}
