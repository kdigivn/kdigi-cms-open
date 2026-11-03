/**
 * Products collection — generic product / service pages.
 *
 * Public REST reads filtered to status=published only.
 *
 * Form uses unnamed tabs + unnamed collapsibles (field paths stay top-level — no
 * REST/migration impact). Editor-facing layout: content first in the main column,
 * meta fields in the sidebar.
 */
import type { CollectionConfig } from 'payload'
import { tenantScopedRead, tenantScopedVersionsRead } from '../access/tenant-scoped'
import { makeGuardRestoreSlugConflict } from '../hooks/guard-restore-slug-conflict'
import { makeContentDeleteAccess } from '../access/content-delete-access'
import { canManageContent, isAuthorRole } from '../access/role-matrix'
import { publishedAndLive } from '../access/published-and-live'
import { markdownHtmlField } from '../fields/markdown-html-field'
import { seoFieldGroup } from '../fields/seo-field-group'
import { sitemapPriorityField } from '../fields/sitemap-priority-field'
import { slugField } from '../fields/slug-field'
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
import { autoFillExcerpt } from '../hooks/auto-fill-excerpt'
import { makeApplySeoTemplatesHook } from '../hooks/apply-seo-templates'
import { autoRedirectOnSlugChange } from '../hooks/auto-redirect-on-slug-change'

export const Products: CollectionConfig = {
  slug: 'products',
  labels: {
    singular: { vi: 'Sản phẩm', en: 'Product' },
    plural: { vi: 'Sản phẩm', en: 'Products' },
  },
  admin: {
    useAsTitle: 'title',
    description: 'Trang sản phẩm / dịch vụ. / Product or service pages.',
    defaultColumns: ['title', 'status', 'publishedAt', 'commentCount', 'tenant'],
    listSearchableFields: ['title', 'slug', 'excerpt'],
    group: { vi: 'Nội dung', en: 'Content' },
    components: {
      edit: {
        beforeDocumentControls: ['@/components/admin/doc-header-actions#DocHeaderActions'],
      },
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
    // enforceAuthorPermissions runs first (author permissions are local; fail fast on auth).
    beforeChange: [enforceAuthorPermissions, makeGuardRestoreSlugConflict('slug'), autoFillExcerpt, makeApplySeoTemplatesHook('product'), autoRedirectOnSlugChange],
    afterChange: [makeGenerateJsonLdHook('product'), triggerRevalidate],
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

    // ─── Title at root (full-width, above tabs; required for useAsTitle) ───
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
      admin: {
        description: 'Tên sản phẩm — hiển thị làm tiêu đề trang và trong kết quả tìm kiếm.',
      },
    },

    // ─── Sidebar fields — MUST be at root level outside tabs ─────────────
    // Placing inside tabs would silently break position:'sidebar' (Payload ignores it).
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
      ],
      admin: { position: 'sidebar' },
    },
    sidebarPublishedAtField(),
    inSidebar(slugField()),
    {
      name: 'featuredImage',
      type: 'upload',
      relationTo: 'media',
      admin: {
        position: 'sidebar',
        description: 'Ảnh đại diện sản phẩm — hiển thị ở card trang chủ và đầu trang chi tiết.',
      },
    },
    {
      // Linked taxonomies: categories, tags, product categories. A frontend
      // resolves the kind via the `type` field on each taxonomy doc.
      name: 'categories',
      type: 'relationship',
      relationTo: 'taxonomies',
      hasMany: true,
      admin: {
        position: 'sidebar',
        description: 'Linked taxonomies: categories, tags, product categories.',
      },
    },
    {
      // Mirrors posts.author (posts.ts:170) — products had no author field, so
      // product bylines were unbuildable. Optional relationship: existing products
      // get null author and render no byline (safe, additive).
      name: 'author',
      type: 'relationship',
      relationTo: 'authors',
      hasMany: false,
      admin: {
        position: 'sidebar',
        description: 'Tác giả — hiển thị byline trên trang sản phẩm.',
      },
    },
    inSidebar(sitemapPriorityField(0.8)),
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
            // content = main route-page body. Markdown stored, HTML served via REST.
            // Promoted to the top of the content tab — primary editor surface.
            ...markdownHtmlField('content', { localized: true }),
            {
              name: 'excerpt',
              type: 'textarea',
              localized: true,
              admin: { description: 'Mô tả ngắn — dùng ở card preview và meta description khi không điền SEO riêng.' },
            },
            {
              type: 'collapsible',
              label: 'Hero',
              admin: { initCollapsed: true },
              fields: [
                {
                  name: 'hero',
                  type: 'group',
                  fields: [
                    {
                      name: 'slider',
                      type: 'array',
                      admin: { description: 'Slide images for the hero carousel.' },
                      fields: [
                        { name: 'image', type: 'upload', relationTo: 'media', required: true },
                      ],
                    },
                    {
                      name: 'slideVideo',
                      type: 'text',
                      admin: {
                        description:
                          'Link video nhúng. YouTube: https://www.youtube.com/embed/<VIDEO_ID>?autoplay=1 — TikTok: https://www.tiktok.com/embed/<VIDEO_ID>. / Embed URL of a YouTube or TikTok video.',
                      },
                    },
                  ],
                },
              ],
            },
            // notice — Markdown stored, HTML served via REST
            ...markdownHtmlField('notice', { localized: true }),
            {
              name: 'faqs',
              type: 'relationship',
              relationTo: 'faqs',
              hasMany: true,
              admin: { description: 'FAQ groups to display on this landing page.' },
            },
          ],
        },

        // ── Tab: Giá & đánh giá ───────────────────────────────────────────
        {
          label: 'Giá & đánh giá',
          fields: [
            {
              type: 'collapsible',
              label: { vi: 'Giá & đánh giá', en: 'Pricing & ratings' },
              admin: { initCollapsed: true },
              fields: [
                {
                  name: 'prices',
                  type: 'array',
                  // Single price tier only: a frontend reads prices[0]. Kept as an
                  // array (not a group) so the REST prices[] contract stays stable.
                  minRows: 1,
                  maxRows: 1,
                  admin: { description: 'Giá — chỉ 1 bộ: Giá gốc + Giá hiện tại + ngày hết hạn. / One price tier: original + current price + expiry.' },
                  fields: [
                    { name: 'originalPrice', type: 'number', min: 0, required: true },
                    { name: 'currentPrice', type: 'number', min: 0, required: true },
                    {
                      name: 'currency',
                      type: 'select',
                      defaultValue: 'VND',
                      options: [
                        { label: 'VND', value: 'VND' },
                        { label: 'USD', value: 'USD' },
                        { label: 'EUR', value: 'EUR' },
                        { label: 'GBP', value: 'GBP' },
                        { label: 'JPY', value: 'JPY' },
                      ],
                      admin: { description: 'Mã tiền tệ ISO 4217 dùng cho JSON-LD Offer. / ISO 4217 code used in the JSON-LD Offer.' },
                    },
                    { name: 'validUntil', type: 'date', admin: { description: 'Ngày hết hiệu lực của giá này. Để trống = không có ngày hết hạn.' } },
                  ],
                },
                {
                  // KK Star Rating is customer-generated (imported from WordPress
                  // KK Star Ratings) — never editor-entered. Read-only; importers
                  // write it with overrideAccess. Display-only like commentCount.
                  name: 'kkStarRating',
                  type: 'group',
                  access: {
                    read: () => true,
                    update: () => false,
                  },
                  admin: {
                    description: 'Đánh giá KK Star — tự động tổng hợp từ lượt đánh giá của khách trên frontend (endpoint submit-rating, lưu vào rating-events). Chỉ xem, không nhập tay. Giá trị ban đầu có thể import từ WordPress.',
                    readOnly: true,
                  },
                  fields: [
                    { name: 'avg', type: 'number', min: 0, max: 5, admin: { description: 'Điểm trung bình 0–5.' } },
                    { name: 'count', type: 'number', min: 0, admin: { description: 'Tổng số lượt đánh giá.' } },
                    { name: 'ratings', type: 'number', min: 0, admin: { description: 'Tổng điểm đánh giá.' } },
                  ],
                },
                {
                  name: 'aggregateRatingOverride',
                  type: 'checkbox',
                  defaultValue: false,
                  admin: {
                    description: 'Bật ON để bỏ qua ngưỡng minReviewsForAggregate (chỉ dùng sau khi đã audit đánh giá thủ công).',
                  },
                },
              ],
            },
            {
              // commentCount is derived — updated by Comments collection afterChange hook.
              // Write access disabled for non-system callers to prevent manual tampering.
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

        // ── Tab: SEO ──────────────────────────────────────────────────────
        {
          label: 'SEO',
          fields: [
            seoFieldGroup(),
          ],
        },
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
