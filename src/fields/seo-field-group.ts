/**
 * SEO field group — finalized contract for frontend KDIGI CMS provider.
 *
 * Matches seo-utils.ts setSeoData() and getBreadcrumbFromSEO() shape exactly:
 *   seo { title, description, robots[], canonicalOverride, breadcrumbTitle,
 *         focusKeywords[], breadcrumbs[{ url, text, isHidden }],
 *         openGraph { title, description, image, siteName, url, type, locale,
 *                     twitterMeta { card, title, description, image } },
 *         articleMeta { publishedTime, modifiedTime },
 *         updatedTime, jsonLd { raw } }
 *
 * Key structural rules (locked by frontend contract):
 *   - twitterMeta NESTED inside openGraph (seo.openGraph.twitterMeta)
 *   - articleMeta TOP-LEVEL sibling of openGraph on seo
 *   - jsonLd is object { raw: string } NOT a plain string field
 *   - breadcrumbs is an array with isHidden checkbox (filtered in getBreadcrumbFromSEO)
 *
 * Admin layout (Phase 2):
 *   - Basic (always visible): title 50% + focusKeywords 50% + description 100%
 *   - Advanced SEO (unnamed collapsible — NO name attr, does NOT shift field paths)
 *   - Hidden (admin.hidden: true): articleMeta, updatedTime, jsonLd, OG siteName/url/type/locale
 */
import type { Field } from 'payload'

export const seoFieldGroup = (): Field => ({
  name: 'seo',
  type: 'group',
  fields: [
    // ── Basic SEO (always visible) ──────────────────────────────────────────
    {
      name: 'title',
      type: 'text',
      localized: true,
      admin: { width: '50%', placeholder: 'Bỏ trống → dùng title bài viết' },
    },
    {
      name: 'focusKeywords',
      type: 'text',
      hasMany: true,
      admin: {
        width: '50%',
        description: 'Focus keywords for SEO (comma-separated or multiple values).',
      },
    },
    // AI generate button for SEO title (type:ui — no field path shift)
    {
      name: 'aiTitleBtn',
      type: 'ui',
      admin: {
        components: {
          Field: {
            path: '@/components/admin/seo-ai-generate-button#SeoAiGenerateButton',
            clientProps: { fieldPath: 'seo.title', fieldType: 'title', label: 'Tạo tiêu đề bằng AI' },
          },
        },
      },
    },
    {
      name: 'description',
      type: 'textarea',
      localized: true,
      admin: { placeholder: 'Bỏ trống → dùng excerpt bài viết' },
    },
    // AI generate button for SEO description
    {
      name: 'aiDescBtn',
      type: 'ui',
      admin: {
        components: {
          Field: {
            path: '@/components/admin/seo-ai-generate-button#SeoAiGenerateButton',
            clientProps: { fieldPath: 'seo.description', fieldType: 'description', label: 'Tạo mô tả bằng AI' },
          },
        },
      },
    },

    // ── Advanced SEO (unnamed collapsible — display-only, paths unchanged) ──
    {
      // IMPORTANT: no `name` on this collapsible — a named collapsible would
      // shift field paths (e.g. seo.canonicalOverride → seo.advancedSeo.canonicalOverride),
      // breaking the frontend REST contract. Unnamed = presentational wrapper only.
      type: 'collapsible',
      label: 'Advanced SEO',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'openGraph',
          type: 'group',
          fields: [
            { name: 'title', type: 'text', localized: true },
            { name: 'description', type: 'textarea', localized: true },
            {
              name: 'image',
              type: 'upload',
              relationTo: 'media',
              admin: {
                description:
                  'Thứ tự ưu tiên khi hiển thị công khai: ảnh này → Featured Image → ảnh mặc định của site (Trang & SEO). ' +
                  'Ảnh xem trước ở đây LUÔN là giá trị đang lưu thật sự trong DB — không phản ánh ảnh fallback đang thực sự hiển thị công khai. ' +
                  'Nếu thấy ảnh mặc định của site ở đây mà bạn muốn dùng Featured Image, hãy xoá field này để trống.',
              },
            },
            // imageAlt: persisting text field for OG image alt text.
            // Additive — does not move any existing field path.
            // Localized to match sibling OG title/description fields.
            { name: 'imageAlt', type: 'text', localized: true, admin: { description: 'Alt text cho ảnh Open Graph (dùng cho screen readers và SEO).' } },
            // AI generate button for OG image alt — writes into the real imageAlt field above
            {
              name: 'aiOgAltBtn',
              type: 'ui',
              admin: {
                components: {
                  Field: {
                    path: '@/components/admin/seo-ai-generate-button#SeoAiGenerateButton',
                    clientProps: { fieldPath: 'seo.openGraph.imageAlt', fieldType: 'alt', label: 'Tạo alt ảnh OG bằng AI' },
                  },
                },
              },
            },
            // Auto-derived by generate-jsonld hook — hide from editors
            { name: 'siteName', type: 'text', admin: { hidden: true } },
            { name: 'url', type: 'text', admin: { hidden: true } },
            { name: 'type', type: 'text', defaultValue: 'website', admin: { hidden: true } },
            { name: 'locale', type: 'text', admin: { hidden: true } },
            {
              // twitterMeta nested inside openGraph — seo.openGraph.twitterMeta
              name: 'twitterMeta',
              type: 'group',
              fields: [
                {
                  // When true (default), twitter fields mirror OG at save-time.
                  // Hiding the twitter-specific fields when on keeps the UI clean.
                  name: 'useFacebookData',
                  type: 'checkbox',
                  defaultValue: true,
                  admin: {
                    description: 'Dùng dữ liệu Open Graph cho Twitter/X (để trống twitter fields).',
                  },
                },
                {
                  name: 'card',
                  type: 'select',
                  options: ['summary', 'summary_large_image'],
                  defaultValue: 'summary_large_image',
                },
                {
                  name: 'title',
                  type: 'text',
                  localized: true,
                  admin: {
                    // Show only when useFacebookData is unchecked
                    condition: (_, siblingData) => !siblingData?.useFacebookData,
                  },
                },
                {
                  name: 'description',
                  type: 'textarea',
                  localized: true,
                  admin: {
                    condition: (_, siblingData) => !siblingData?.useFacebookData,
                  },
                },
                {
                  name: 'image',
                  type: 'upload',
                  relationTo: 'media',
                  admin: {
                    condition: (_, siblingData) => !siblingData?.useFacebookData,
                  },
                },
              ],
            },
          ],
        },
        {
          // breadcrumbs array — isHidden filtered in getBreadcrumbFromSEO()
          // FULLY AUTO-MANAGED: generated from the URL hierarchy on save
          // (apply-seo-templates, blank-only) and consumed by JSON-LD + the
          // frontend. `admin.hidden` removes the per-doc editor UI (RankMath-style:
          // breadcrumbs are derived, not hand-edited) while keeping the value in
          // the REST payload so the frontend/JSON-LD still read it. Do NOT use
          // top-level `hidden` here — that would strip it from the API too.
          name: 'breadcrumbs',
          type: 'array',
          admin: { hidden: true },
          fields: [
            { name: 'url', type: 'text' },
            { name: 'text', type: 'text', localized: true },
            {
              name: 'isHidden',
              type: 'checkbox',
              defaultValue: false,
            },
          ],
        },
        // Leaf breadcrumb label — auto (defaults to the doc title); hidden from the
        // editor like the trail above. Stays in the REST payload for the frontend.
        { name: 'breadcrumbTitle', type: 'text', localized: true, admin: { hidden: true } },
        // FAQ AI suggest button — preview-only.
        // FAQs live in the separate Faqs collection, not as a field on seo.
        // The button shows a preview panel in local component state only;
        // it does NOT call setValue or write to any form field path.
        // Editor copies accepted Q&A items into the Faqs collection manually.
        {
          name: 'aiFaqBtn',
          type: 'ui',
          admin: {
            components: {
              Field: {
                path: '@/components/admin/seo-ai-generate-button#SeoAiGenerateButton',
                clientProps: { fieldType: 'faq', label: 'Gợi ý FAQ bằng AI', previewOnly: true },
              },
            },
          },
        },
        { name: 'canonicalOverride', type: 'text' },
        {
          name: 'robots',
          type: 'select',
          hasMany: true,
          // Extended max-* directives match RankMath output so WP-migrated docs
          // keep their robots meta verbatim (enum values added by migration
          // 20260709_seo_robots_max_directives).
          options: [
            'index',
            'follow',
            'noindex',
            'nofollow',
            'max-snippet:-1',
            'max-image-preview:large',
            'max-video-preview:-1',
          ],
          defaultValue: ['index', 'follow'],
        },
      ],
    },

    // ── Auto-derived fields (hidden from editors) ────────────────────────────
    {
      // articleMeta is TOP-LEVEL on seo (sibling of openGraph, not nested inside it)
      // Auto-populated by generate-jsonld hook from publishedAt / updatedAt
      name: 'articleMeta',
      type: 'group',
      admin: { hidden: true },
      fields: [
        { name: 'publishedTime', type: 'date' },
        { name: 'modifiedTime', type: 'date' },
      ],
    },
    {
      name: 'updatedTime',
      type: 'date',
      admin: { hidden: true },
    },
    {
      // jsonLd.raw auto-populated by generate-jsonld afterChange hook
      name: 'jsonLd',
      type: 'group',
      admin: { hidden: true },
      fields: [
        {
          name: 'raw',
          type: 'textarea',
          admin: {
            readOnly: true,
            description: 'Auto-generated JSON-LD. Do not edit manually.',
          },
        },
      ],
    },

    // ── Internal link suggester (client-side panel, no persisted field) ──────
    // Suggests links to other docs in the same tenant based on focus keyword.
    // Non-blocking: loads asynchronously, collapsed by default.
    {
      name: 'internalLinkSuggester',
      type: 'ui',
      admin: {
        components: {
          Field: '@/components/admin/internal-link-suggester#InternalLinkSuggester',
        },
      },
    },

    // ── SEO analysis UI (client-side only, score never persisted) ────────────
    {
      name: 'seoAnalysis',
      type: 'ui',
      admin: {
        components: {
          Field: '@/components/admin/seo-analysis-field#SeoAnalysisField',
        },
      },
    },
  ],
})
