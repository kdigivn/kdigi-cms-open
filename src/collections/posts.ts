/**
 * Posts collection — blog / news / guide posts per site (tenant).
 *
 * Critical field names a frontend can rely on:
 *   - kkStarRating.avg / .count / .ratings
 *   - commentCount (number, read-only for public — updated via Comments afterChange hook)
 *
 * Public REST reads filtered to status=published only.
 *
 * Form uses unnamed tabs + unnamed collapsibles (field paths stay top-level — no
 * REST/migration impact). Meta fields live in the sidebar; content body leads the
 * main column.
 */
import type { CollectionConfig, FieldHook } from 'payload'
import { tenantScopedRead, tenantScopedVersionsRead } from '../access/tenant-scoped'
import { makeGuardRestoreSlugConflict } from '../hooks/guard-restore-slug-conflict'
import { makeContentDeleteAccess } from '../access/content-delete-access'
import { canManageContent, isAuthorRole } from '../access/role-matrix'
import { publishedAndLive } from '../access/published-and-live'
import { seoFieldGroup } from '../fields/seo-field-group'
import { sitemapPriorityField } from '../fields/sitemap-priority-field'
import { slugField } from '../fields/slug-field'
import { markdownHtmlField } from '../fields/markdown-html-field'
import { postsWordCount } from '../hooks/posts-word-count'
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
import { autoFillAuthor } from '../hooks/auto-fill-author'
import { autoFillExcerpt } from '../hooks/auto-fill-excerpt'

/** Auto-set modified timestamp on every create/update — Red Team H7.
 * Field-level beforeChange: Payload assigns the return value to the
 * `modified` field. Returning `data` (the parent record) would corrupt
 * the column with the whole post object — return the date string only.
 */
const modifiedBeforeChange: FieldHook = ({ operation }) => {
  if (operation === 'update' || operation === 'create') {
    return new Date().toISOString()
  }
}
import { makeApplySeoTemplatesHook } from '../hooks/apply-seo-templates'
import { autoRedirectOnSlugChange } from '../hooks/auto-redirect-on-slug-change'

export const Posts: CollectionConfig = {
  slug: 'posts',
  labels: {
    singular: { vi: 'Bài viết', en: 'Post' },
    plural: { vi: 'Bài viết', en: 'Posts' },
  },
  admin: {
    useAsTitle: 'title',
    description: 'Bài viết blog, tin tức và hướng dẫn theo từng site. / Blog posts, news and guides per site.',
    defaultColumns: ['title', 'type', 'status', 'publishedAt', 'commentCount', 'tenant'],
    listSearchableFields: ['title', 'slug', 'excerpt'],
    group: { vi: 'Nội dung', en: 'Content' },
    components: {
      edit: {
        beforeDocumentControls: ['@/components/admin/doc-header-actions#DocHeaderActions'],
      },
      beforeListTable: ['@/components/admin/seo-bulk-action#SeoBulkAction'],
    },
  },
  hooks: {
    // Derived facts (wordCount) are computed here so they land in the
    // editor's own write — one version per save, no nested self-update.
    beforeChange: [enforceAuthorPermissions, makeGuardRestoreSlugConflict('slug'), autoFillAuthor, postsWordCount, autoFillExcerpt, makeApplySeoTemplatesHook('post'), autoRedirectOnSlugChange],
    afterChange: [makeGenerateJsonLdHook('post'), triggerRevalidate],
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

    // ─── Post type at root ───
    {
      name: 'type',
      type: 'select',
      required: true,
      defaultValue: 'blog',
      admin: {
        description: 'Loại bài viết — ảnh hưởng đến cách hiển thị và nhóm trên frontend. / Post type — lets a frontend group posts.',
      },
      options: [
        { label: 'Blog', value: 'blog' },
        { label: 'Tin tức (News)', value: 'news' },
        { label: 'Hướng dẫn (Guide)', value: 'guide' },
      ],
    },

    // ─── Title at root (full-width, above tabs; required for useAsTitle) ───
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
      admin: {
        description: 'Tiêu đề bài viết — hiển thị trên trang danh sách và chi tiết.',
      },
    },

    // ─── Sidebar meta fields (cannot be inside tabs in Payload v3) ───
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      admin: {
        description: 'Trạng thái bài viết — chỉ "Đã đăng" mới hiển thị công khai.',
        position: 'sidebar',
      },
      options: [
        { label: 'Bản nháp', value: 'draft' },
        { label: 'Đã đăng', value: 'published' },
      ],
    },
    sidebarPublishedAtField(),
    {
      name: 'modified',
      type: 'date',
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Cập nhật tự động mỗi khi lưu bài viết.',
        date: { pickerAppearance: 'dayOnly' },
      },
      hooks: {
        beforeChange: [modifiedBeforeChange],
      },
    },
    inSidebar(slugField()),
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'authors',
      hasMany: false,
      admin: {
        position: 'sidebar',
        description: 'Tác giả bài viết — hiển thị ở cuối bài.',
      },
    },
    {
      name: 'featuredImage',
      type: 'upload',
      relationTo: 'media',
      admin: {
        position: 'sidebar',
        description: 'Ảnh đại diện bài viết — hiển thị ở card và đầu trang chi tiết.',
      },
    },
    {
      name: 'categories',
      type: 'relationship',
      relationTo: 'taxonomies',
      hasMany: true,
      admin: {
        position: 'sidebar',
        description: 'Phân loại bài viết: danh mục, tag. / Taxonomies: categories, tags.',
      },
    },
    // Phase 5: tier + cluster + wordCount fields
    // Per red-team P12: tier is INTERNAL-ONLY — no UI badge displayed anywhere.
    // tier used for internal sorting/routing + cluster internal linking algorithm.
    {
      name: 'tier',
      type: 'select',
      options: [
        { label: 'Tier 1 (pillar/featured)', value: '1' },
        { label: 'Tier 2 (cluster main)', value: '2' },
        { label: 'Tier 3 (long-tail)', value: '3' },
      ],
      admin: {
        position: 'sidebar',
        description:
          'Tier nội bộ — không hiển thị UI. Tier 1 = pillar page + 5 hero spokes. Tier 2 = 10 cluster main. Tier 3 = 8 long-tail.',
      },
    },
    {
      name: 'cluster',
      type: 'relationship',
      relationTo: 'taxonomies',
      admin: {
        position: 'sidebar',
        description:
          'Cluster taxonomy (type=category). Powers internal linking matrix (Phase 5).',
        // Filter to category types only via custom component or admin condition.
      },
      // Note: per current schema, type filter on relationship must be set via
      // custom component or admin config. We rely on owner discipline to choose
      // only category-type taxonomies. See Phase 5 implementation for filter logic.
    },
    {
      name: 'wordCount',
      type: 'number',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description:
          'Số từ tự động tính từ content body (afterChange hook). Không sửa tay.',
      },
    },
    inSidebar(sitemapPriorityField(0.7)),
    {
      name: 'isNotified',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description: 'Hiển thị bài viết trong chuông thông báo (notification bell) trên frontend.',
      },
    },
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
            // Markdown body promoted to the top — primary editor surface.
            ...markdownHtmlField('content', { localized: true }),
            {
              name: 'excerpt',
              type: 'textarea',
              localized: true,
              admin: {
                description: 'Mô tả ngắn — hiển thị ở card preview và meta description (nếu không điền SEO riêng).',
              },
            },
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

        // ── Tab: Cài đặt ──────────────────────────────────────────────────
        {
          label: 'Cài đặt',
          fields: [
            {
              type: 'collapsible',
              label: 'Đánh giá & bình luận',
              admin: { initCollapsed: true },
              fields: [
                {
                  name: 'kkStarRating',
                  type: 'group',
                  admin: { description: 'Đánh giá sao tổng hợp — tự động cập nhật từ form đánh giá. Không cần sửa thủ công.' },
                  fields: [
                    { name: 'avg', type: 'number', min: 0, max: 5, defaultValue: 0 },
                    { name: 'count', type: 'number', min: 0, defaultValue: 0 },
                    { name: 'ratings', type: 'number', min: 0, defaultValue: 0 },
                  ],
                },
                {
                  // commentCount is derived — updated by Comments collection afterChange hook.
                  name: 'commentCount',
                  type: 'number',
                  defaultValue: 0,
                  min: 0,
                  access: {
                    read: () => true,
                    update: () => false,
                  },
                  admin: {
                    description: 'Auto-maintained count of approved comments. Not editable directly.',
                    readOnly: true,
                  },
                },
              ],
            },
          ],
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
