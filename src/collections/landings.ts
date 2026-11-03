import type { CollectionConfig } from 'payload'
import { tenantScopedRead, tenantScopedVersionsRead } from '../access/tenant-scoped'
import { makeGuardRestoreSlugConflict } from '../hooks/guard-restore-slug-conflict'
import { makeContentDeleteAccess } from '../access/content-delete-access'
import { canManageContent, isAuthorRole } from '../access/role-matrix'
import { publishedAndLive } from '../access/published-and-live'
import { slugField } from '../fields/slug-field'
import { seoFieldGroup } from '../fields/seo-field-group'
import { sitemapPriorityField } from '../fields/sitemap-priority-field'
import { markdownHtmlField } from '../fields/markdown-html-field'
import { triggerRevalidate } from '../hooks/trigger-revalidate'
import { makeGenerateJsonLdHook } from '../hooks/generate-jsonld'
import { makeResolveOgImageFallbackHook } from '../hooks/resolve-og-image-fallback'
import { enforceAuthorPermissions } from '../hooks/enforce-author-permissions'
import { makeApplySeoTemplatesHook } from '../hooks/apply-seo-templates'
import { autoRedirectOnSlugChange } from '../hooks/auto-redirect-on-slug-change'

export const Landings: CollectionConfig = {
  slug: 'landings',
  labels: {
    singular: { vi: 'Trang đích', en: 'Landing' },
    plural: { vi: 'Trang đích', en: 'Landings' },
  },
  admin: {
    useAsTitle: 'title',
    description: 'Trang landing marketing — xây dựng bằng block builder, dùng cho chiến dịch và trang đích.',
    defaultColumns: ['title', 'slug', 'status', 'publishedAt', 'tenant'],
    listSearchableFields: ['title', 'slug', 'excerpt'],
    group: { vi: 'Nội dung', en: 'Content' },
    components: {
      beforeListTable: ['@/components/admin/seo-bulk-action#SeoBulkAction'],
    },
  },
  // SP1a-1: History / diff / restore in the admin. No `drafts` — publishing semantics
  // (`status`, `publishedAndLive`) are unchanged; 30 versions per document cap the growth.
  // SP1a-2: deleting moves to the Trash (recoverable); permanent delete is admin-only — see
  // `makeContentDeleteAccess`. The (tenant, slug) unique index is partial (active rows only).
  trash: true,
  versions: { maxPerDoc: 30 },
  access: {
    readVersions: tenantScopedVersionsRead,
    // Phase 1 authenticated path: tenant-scoped (super-admin sees all).
    // Phase 5 unauthenticated path: scheduled-aware (published AND publishedAt <= now).
    read: ({ req }) => {
      if (req.user) return tenantScopedRead({ req })
      return publishedAndLive()
    },
    // Phase 1: role-gated create/update/delete with author ownership on update/delete.
    create: ({ req: { user } }) => {
      if (!user || !canManageContent(user)) return false
      return true
    },
    update: ({ req: { user } }) => {
      if (!user || !canManageContent(user)) return false
      if (isAuthorRole(user)) return { createdBy: { equals: user.id } }
      return true
    },
    delete: makeContentDeleteAccess({ hasCreatedBy: true }),
  },
  hooks: {
    beforeChange: [enforceAuthorPermissions, makeGuardRestoreSlugConflict('slug'), makeApplySeoTemplatesHook('landing'), autoRedirectOnSlugChange],
    afterChange: [makeGenerateJsonLdHook('landing'), triggerRevalidate],
    afterRead: [makeResolveOgImageFallbackHook(true)],
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

    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
    },
    slugField(),
    {
      name: 'excerpt',
      type: 'textarea',
      localized: true,
    },
    {
      name: 'featuredImage',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
        { label: 'Archived', value: 'archived' },
      ],
      admin: { position: 'sidebar' },
    },
    {
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
          ({ value, data }) => {
            // Phase 5 C8: preserve future dates (scheduled) — only auto-set when empty or in past
            if (data?.status === 'published') {
              const now = new Date()
              if (!value || new Date(value) <= now) {
                return now.toISOString()
              }
            }
            return value
          },
        ],
      },
    },
    {
      name: 'isDisabled',
      type: 'checkbox',
      defaultValue: false,
      admin: { position: 'sidebar', description: 'Hide this landing page from public.' },
    },
    sitemapPriorityField(0.5),
    {
      name: 'template',
      type: 'select',
      defaultValue: 'default',
      options: [
        { label: 'Default', value: 'default' },
        { label: 'Wide', value: 'wide' },
        { label: 'Fullscreen', value: 'fullscreen' },
      ],
      admin: { position: 'sidebar' },
    },
    seoFieldGroup(),
    {
      name: 'layout',
      type: 'blocks',
      blocks: [
        {
          slug: 'hero',
          fields: [
            { name: 'title', type: 'text', localized: true },
            { name: 'subtitle', type: 'text', localized: true },
            { name: 'backgroundImage', type: 'upload', relationTo: 'media' },
            { name: 'ctaText', type: 'text', localized: true },
            { name: 'ctaUrl', type: 'text' },
          ],
        },
        {
          slug: 'content',
          fields: [
            // Markdown-first editing: bodyMd is what staff edit; legacy body (Lexical)
            // stays hidden as an afterRead fallback for any pre-existing data.
            ...markdownHtmlField('body', { localized: true }),
          ],
        },
        {
          slug: 'imageGallery',
          fields: [
            {
              name: 'images',
              type: 'array',
              fields: [
                { name: 'image', type: 'upload', relationTo: 'media', required: true },
              ],
            },
          ],
        },
        {
          slug: 'testimonials',
          fields: [
            {
              name: 'items',
              type: 'array',
              fields: [
                { name: 'name', type: 'text', required: true },
                { name: 'role', type: 'text' },
                { name: 'avatar', type: 'upload', relationTo: 'media' },
                { name: 'quote', type: 'textarea', required: true },
                { name: 'rating', type: 'number', min: 1, max: 5 },
              ],
            },
          ],
        },
        {
          slug: 'cta',
          fields: [
            { name: 'title', type: 'text', localized: true },
            { name: 'description', type: 'textarea', localized: true },
            { name: 'buttonText', type: 'text', localized: true },
            { name: 'buttonUrl', type: 'text' },
            {
              name: 'style',
              type: 'select',
              defaultValue: 'primary',
              options: [
                { label: 'Primary', value: 'primary' },
                { label: 'Secondary', value: 'secondary' },
                { label: 'Outline', value: 'outline' },
              ],
            },
          ],
        },
        {
          slug: 'faq',
          fields: [
            {
              name: 'items',
              type: 'array',
              fields: [
                { name: 'question', type: 'text', localized: true, required: true },
                { name: 'answer', type: 'textarea', localized: true, required: true },
              ],
            },
          ],
        },
        {
          slug: 'stats',
          fields: [
            {
              name: 'items',
              type: 'array',
              fields: [
                { name: 'label', type: 'text', localized: true, required: true },
                { name: 'value', type: 'text', required: true },
                { name: 'icon', type: 'text' },
              ],
            },
          ],
        },
        {
          slug: 'pricingTable',
          fields: [
            { name: 'title', type: 'text', localized: true },
            {
              name: 'columns',
              type: 'array',
              fields: [
                { name: 'name', type: 'text', required: true },
                { name: 'price', type: 'text' },
                { name: 'features', type: 'array', fields: [{ name: 'feature', type: 'text' }] },
                { name: 'ctaText', type: 'text' },
                { name: 'ctaUrl', type: 'text' },
                { name: 'highlighted', type: 'checkbox', defaultValue: false },
              ],
            },
          ],
        },
        {
          slug: 'blogFeed',
          fields: [
            { name: 'title', type: 'text', localized: true },
            { name: 'category', type: 'text' },
            { name: 'limit', type: 'number', defaultValue: 6 },
          ],
        },
        {
          slug: 'offerCards',
          fields: [
            { name: 'title', type: 'text', localized: true },
            {
              name: 'cards',
              type: 'array',
              fields: [
                { name: 'title', type: 'text', required: true },
                { name: 'description', type: 'textarea' },
                { name: 'discount', type: 'text' },
                { name: 'image', type: 'upload', relationTo: 'media' },
                { name: 'ctaUrl', type: 'text' },
                { name: 'expiryDate', type: 'date' },
              ],
            },
          ],
        },
        {
          slug: 'embed',
          fields: [
            { name: 'title', type: 'text', localized: true },
            { name: 'code', type: 'textarea', admin: { description: 'Raw HTML/iframe embed code.' } },
          ],
        },
        {
          slug: 'divider',
          fields: [
            {
              name: 'style',
              type: 'select',
              defaultValue: 'solid',
              options: [
                { label: 'Solid', value: 'solid' },
                { label: 'Dashed', value: 'dashed' },
                { label: 'Dotted', value: 'dotted' },
              ],
            },
            {
              name: 'spacing',
              type: 'select',
              defaultValue: 'md',
              options: [
                { label: 'Small', value: 'sm' },
                { label: 'Medium', value: 'md' },
                { label: 'Large', value: 'lg' },
              ],
            },
          ],
        },
      ],
    },
    {
      name: 'campaign',
      type: 'group',
      admin: { description: 'Campaign tracking fields.' },
      fields: [
        { name: 'name', type: 'text' },
        { name: 'utmSource', type: 'text' },
        { name: 'utmMedium', type: 'text' },
        { name: 'utmCampaign', type: 'text' },
        { name: 'conversionGoal', type: 'text' },
        { name: 'abTestId', type: 'text' },
      ],
    },
    {
      name: 'schemaType',
      type: 'select',
      defaultValue: 'WebPage',
      options: [
        { label: 'WebPage', value: 'WebPage' },
        { label: 'FAQPage', value: 'FAQPage' },
        { label: 'Article', value: 'Article' },
        { label: 'Product', value: 'Product' },
        { label: 'Event', value: 'Event' },
      ],
    },
    {
      name: 'faq',
      type: 'array',
      admin: { description: 'Inline FAQ items for JSON-LD FAQPage schema.' },
      fields: [
        { name: 'question', type: 'text', localized: true },
        { name: 'answer', type: 'textarea', localized: true },
      ],
    },
    // Phase 1: ownership tracking — auto-set on create by enforceAuthorPermissions hook
    {
      name: 'createdBy',
      type: 'relationship',
      relationTo: 'users',
      admin: { hidden: true, readOnly: true },
      access: { update: () => false },
    },
  ],
}
