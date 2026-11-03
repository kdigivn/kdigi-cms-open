/**
 * Pages collection — static CMS pages per tenant.
 *
 * Page shape a frontend can rely on:
 *   { id, uri, title, slug, date, isFrontPage, isPostsPage, content, featuredImage, seo }
 *
 * Public REST reads are filtered to status=published only.
 * Authenticated users (admins/editors) see all statuses.
 *
 * Form uses unnamed tabs (field paths stay top-level — no REST/migration impact).
 * Meta fields (status, publishedAt, slug, pageType, featuredImage, sitemap) sit in the
 * sidebar; content body leads the main column.
 */
import type { CollectionConfig } from 'payload'
import { tenantScopedRead, tenantScopedVersionsRead } from '../access/tenant-scoped'
import { makeGuardRestoreSlugConflict } from '../hooks/guard-restore-slug-conflict'
import { makeContentDeleteAccess } from '../access/content-delete-access'
import { canManageContent, isAuthorRole } from '../access/role-matrix'
import { publishedAndLive } from '../access/published-and-live'
import { seoFieldGroup } from '../fields/seo-field-group'
import { sitemapPriorityField } from '../fields/sitemap-priority-field'
import { slugField } from '../fields/slug-field'
import { markdownHtmlField } from '../fields/markdown-html-field'
import {
  inSidebar,
  sidebarPublishedAtField,
  sidebarDuplicateActionField,
  sidebarDocMetaField,
} from '../fields/sidebar-meta-fields'
import { makeGenerateJsonLdHook } from '../hooks/generate-jsonld'
import { makeResolveOgImageFallbackHook } from '../hooks/resolve-og-image-fallback'
import { triggerRevalidate } from '../hooks/trigger-revalidate'
import { enforceAuthorPermissions } from '../hooks/enforce-author-permissions'
import { makeApplySeoTemplatesHook } from '../hooks/apply-seo-templates'
import { autoRedirectOnSlugChange } from '../hooks/auto-redirect-on-slug-change'

export const Pages: CollectionConfig = {
  slug: 'pages',
  labels: {
    singular: { vi: 'Trang', en: 'Page' },
    plural: { vi: 'Trang', en: 'Pages' },
  },
  admin: {
    useAsTitle: 'title',
    description: 'Trang tĩnh của site (Giới thiệu, Điều khoản, Liên hệ, v.v.).',
    defaultColumns: ['title', 'slug', 'status', 'publishedAt', 'tenant'],
    listSearchableFields: ['title', 'slug'],
    group: { vi: 'Nội dung', en: 'Content' },
    components: {
      edit: {
        beforeDocumentControls: ['@/components/admin/doc-header-actions#DocHeaderActions'],
      },
      beforeListTable: ['@/components/admin/seo-bulk-action#SeoBulkAction'],
    },
  },
  hooks: {
    beforeChange: [enforceAuthorPermissions, makeGuardRestoreSlugConflict('slug'), makeApplySeoTemplatesHook('page'), autoRedirectOnSlugChange],
    afterChange: [makeGenerateJsonLdHook('page'), triggerRevalidate],
    afterRead: [makeResolveOgImageFallbackHook(true)],
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
      if (req.user) return tenantScopedRead({ req })
      return publishedAndLive()
    },
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

    // ─── Title at root (full-width, above tabs; required for useAsTitle) ───
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
    },

    // ─── Sidebar fields (cannot be inside tabs in Payload v3) ───
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      admin: {
        description: 'Trạng thái trang — chỉ "Đã đăng" mới hiển thị công khai.',
        position: 'sidebar',
      },
      options: [
        { label: 'Bản nháp', value: 'draft' },
        { label: 'Đã đăng', value: 'published' },
      ],
    },
    sidebarPublishedAtField(),
    inSidebar(slugField()),
    {
      name: 'pageType',
      type: 'select',
      defaultValue: 'default',
      options: [
        { label: 'Mặc định', value: 'default' },
        { label: 'Blog', value: 'blog' },
        { label: 'Landing', value: 'landing' },
      ],
      admin: {
        description: 'Loại trang — "Blog" dùng để ánh xạ key BLOG trong cấu hình Site.',
        position: 'sidebar',
      },
    },
    {
      name: 'isPillarPage',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description: 'Marks this page as a topic-cluster pillar. Renders hero banner above DefaultPage layout when true.',
        position: 'sidebar',
      },
    },
    {
      name: 'featuredImage',
      type: 'upload',
      relationTo: 'media',
      admin: { position: 'sidebar' },
    },
    inSidebar(sitemapPriorityField(0.6)),
    sidebarDuplicateActionField(),
    sidebarDocMetaField(),

    // ─── Tabs (unnamed → field paths stay top-level, REST shape unchanged) ───
    {
      type: 'tabs',
      tabs: [
        // ── Tab: Nội dung ──────────────────────────────────────────────────
        {
          label: 'Nội dung',
          fields: [
            ...markdownHtmlField('content', { localized: true }),
            {
              name: 'faqs',
              type: 'relationship',
              relationTo: 'faqs',
              hasMany: true,
              admin: {
                description: 'FAQ groups to attach for FAQPage JSON-LD (generate-jsonld.ts). Body FAQ visible to users; this relationship only feeds the JSON-LD hook.',
              },
            },
          ],
        },

        // ── Tab: SEO ───────────────────────────────────────────────────────
        {
          label: 'SEO',
          fields: [seoFieldGroup()],
        },
      ],
    },

    // ─── Hidden ownership field at root ───
    {
      name: 'createdBy',
      type: 'relationship',
      relationTo: 'users',
      admin: { hidden: true, readOnly: true },
      access: { update: () => false },
    },
  ],
}
