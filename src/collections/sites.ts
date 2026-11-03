/**
 * Sites collection — tenant root document.
 * One Sites doc per tenant (one website / domain).
 *
 * Form uses unnamed tabs (field paths stay top-level — no REST/migration impact).
 * Layout is presentation-only: row/collapsible wrappers, RowLabel + ColorPicker
 * admin components. Field key names, REST shape, and afterRead output are unchanged.
 * r2 group: per-site optional R2 credentials, server-only (access.read:false on secret leaves).
 * Color fields use ColorPickerField.
 */
import type {
  CollectionBeforeChangeHook,
  CollectionConfig,
} from 'payload'
import { isApiKeySession } from '../lib/api-key-session'
import { sanitizeHtmlContent } from '../lib/sanitize-html-content'
import { normalizeTelephoneE164 } from '../hooks/normalize-telephone-e164'
import { getEnvPageEndpoint } from '../endpoints/get-env-page'
import { siteSecretGetEndpoint, siteSecretPostEndpoint } from '../endpoints/site-secret-endpoint'
import { triggerSiteRevalidate } from '../hooks/trigger-revalidate'

const PAGE_GROUP_ENV_KEYS = [
  'FRONT_PAGE', 'BLOG', 'PROFILE', 'CONTACT', 'ABOUT', 'SEARCH',
  'SIGN_IN', 'SIGN_UP', 'FORGOT_PASSWORD', 'CONFIRM_EMAIL', 'PASSWORD_CHANGE',
  'TERM_CONDITION', 'PRIVACY_POLICY',
] as const

// Reusable admin component refs (resolved via @ alias importMap).
const ROW_LABEL = { RowLabel: '@/components/admin/array-row-label#ArrayRowLabel' } as const
const COLOR_FIELD = { Field: '@/components/admin/color-picker-field#ColorPickerField' } as const
const HERO_ICON_FIELD = { Field: '@/components/admin/hero-notice-icon-field#HeroNoticeIconField' } as const

// Only themes registered in your frontend's tailwind config render correctly;
// an unregistered name silently falls back, so the picker is constrained to valid keys.
const THEME_OPTIONS = [
  { label: 'Light (mặc định)', value: 'light' },
  { label: 'Dark', value: 'dark' },
  { label: 'Brand Red', value: 'brand-red' },
  { label: 'Brand Blue', value: 'brand-blue' },
  { label: 'Brand Green', value: 'brand-green' },
]

// Primary-taxonomy options for breadcrumbs (RankMath "Phân loại chính" parity).
// Values mirror taxonomies.ts `type` options; `none` disables the taxonomy crumb.
// The breadcrumb trail uses the doc's category term whose `type` matches the
// selected primary taxonomy (e.g. products → product-category → "Dịch vụ").
const PRIMARY_TAXONOMY_OPTIONS = [
  { label: '— Không chèn cấp taxonomy —', value: 'none' },
  { label: 'Product Category', value: 'product-category' },
  { label: 'Category', value: 'category' },
  { label: 'Tag', value: 'tag' },
]

// Curated icon keys for the homepage hero notice badges. Each value maps to a
// react-icons component in your frontend's hero icon registry; unknown/empty
// values fall back to the per-slot default there.
const HERO_NOTICE_ICON_OPTIONS = [
  { label: 'Tia sét', value: 'thunderbolt' },
  { label: 'Khiên (bảo chứng)', value: 'shield' },
  { label: 'Vé / Ticket', value: 'ticket' },
  { label: 'Đồng hồ', value: 'clock' },
  { label: 'Thanh toán', value: 'payment' },
  { label: 'Tích xác nhận', value: 'check' },
  { label: 'Hỗ trợ', value: 'support' },
  { label: 'Vị trí', value: 'location' },
]

// CSS color validator shared by branding.primaryColor (injected into <style>).
const validateCssColor = (value: unknown) => {
  if (!value || typeof value !== 'string') return true
  if (/[{}<>"'`;]/.test(value)) return 'Invalid CSS color: contains disallowed characters'
  if (value.length > 60) return 'CSS color value too long (max 60 chars)'
  return true
}

export const Sites: CollectionConfig = {
  slug: 'sites',
  // Mounted at /api/sites/:siteKey/env-page — must live here, not in config.endpoints.
  // Generic secret endpoints: GET /:id/secret?field=PATH (hasValue boolean), POST /:id/secret (set value).
  endpoints: [getEnvPageEndpoint, siteSecretGetEndpoint, siteSecretPostEndpoint],
  labels: {
    singular: { vi: 'Website', en: 'Site' },
    plural: { vi: 'Websites', en: 'Sites' },
  },
  admin: {
    useAsTitle: 'siteKey',
    description: 'Cấu hình gốc của site — mỗi website/tên miền có một document.',
    defaultColumns: ['siteKey', 'domain', 'defaultLanguage'],
    listSearchableFields: ['siteKey', 'domain'],
    group: { vi: 'Hệ thống', en: 'System' },
  },
  access: {
    // Read stays public (used by site-key env-page endpoint + multi-tenant plugin).
    read: () => true,
    create: ({ req: { user } }) => user?.role === 'super-admin',
    update: ({ req: { user } }) =>
      user?.role === 'super-admin' ||
      user?.role === 'admin',
    delete: ({ req: { user } }) => user?.role === 'super-admin' && !isApiKeySession(user),
  },
  hooks: {
    beforeChange: [normalizeTelephoneE164 as CollectionBeforeChangeHook],
    // Settings change revalidates the frontend.
    afterChange: [triggerSiteRevalidate],
  },
  fields: [
    // ─── Tabs (unnamed → field paths stay top-level, REST shape unchanged) ───
    {
      type: 'tabs',
      tabs: [
        // ── Tab: Hệ thống (identity + infra) ─────────────────────────────
        {
          label: 'Hệ thống',
          description: 'Định danh site và thông tin hạ tầng (R2 storage).',
          fields: [
            // Identity fields — not collapsed, row layouts preserved
            {
              type: 'row',
              fields: [
                {
                  name: 'siteKey',
                  type: 'text',
                  required: true,
                  unique: true,
                  admin: {
                    width: '50%',
                    placeholder: 'my-site',
                    description: 'Khóa định danh duy nhất — dùng làm site key trên frontend.',
                  },
                },
                {
                  name: 'domain',
                  type: 'text',
                  required: true,
                  admin: {
                    width: '50%',
                    placeholder: 'example.com',
                    description: 'Tên miền chính.',
                  },
                },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'defaultLanguage',
                  type: 'select',
                  options: [
                    { label: 'Tiếng Việt', value: 'vi' },
                    { label: 'English', value: 'en' },
                  ],
                  defaultValue: 'vi',
                  required: true,
                  admin: { width: '50%' },
                },
              ],
            },
            // Cloudflare R2 storage credentials
            {
              type: 'collapsible',
              label: 'Cloudflare R2 (Storage)',
              admin: { initCollapsed: true, description: 'Thông tin xác thực Cloudflare R2 theo từng site. Chỉ server-side.' },
              fields: [
                // Per-bucket Cloudflare R2 credentials — NEVER returned in REST reads
                {
                  name: 'r2',
                  type: 'group',
                  // Update restricted to super-admin: R2 credentials and bucket config are infrastructure secrets.
                  access: { update: ({ req: { user } }) => user?.role === 'super-admin' },
                  fields: [
                    {
                      type: 'row',
                      fields: [
                        { name: 'bucket', type: 'text', admin: { width: '50%', description: 'Tên bucket R2.' } },
                        { name: 'publicBaseUrl', type: 'text', admin: { width: '50%', placeholder: 'https://cdn.example.com', description: 'Base URL CDN công khai.' } },
                      ],
                    },
                    {
                      // Cloudflare account ID for this tenant's R2 bucket. Used to build the
                      // S3 endpoint (https://<accountId>.r2.cloudflarestorage.com). Required for
                      // R2 to work for this tenant — there is no global env account-id fallback.
                      name: 'accountId',
                      type: 'text',
                      admin: {
                        description: 'Cloudflare Account ID cho bucket R2 này. Bắt buộc để R2 hoạt động cho site này (không có fallback từ env).',
                      },
                    },
                    {
                      type: 'row',
                      fields: [
                        // Per-bucket R2 secrets — never returned in REST reads; server reads via overrideAccess:true
                        { name: 'accessKeyId', type: 'text', access: { read: () => false }, admin: { width: '50%', description: 'R2 access key ID (per-bucket token).' } },
                        { name: 'secretAccessKey', type: 'text', access: { read: () => false }, admin: { width: '50%', description: 'R2 secret access key (per-bucket token).' } },
                      ],
                    },
                    {
                      // Phase 2: per-tenant WebP-on-upload settings. When compressToWebp is on,
                      // uploads of raster images (jpeg/png/tiff/avif) are transcoded to WebP at
                      // the configured quality before storage. SVG and animated GIF are always
                      // preserved as-is. If the WebP result is larger than the original, the
                      // original is kept (skip-if-larger guard).
                      type: 'row',
                      fields: [
                        {
                          name: 'compressToWebp',
                          type: 'checkbox',
                          defaultValue: false,
                          admin: {
                            width: '50%',
                            description:
                              'Tự động chuyển ảnh sang WebP (chất lượng bên dưới) trước khi lưu R2. ' +
                              'Bỏ qua nếu file WebP lớn hơn bản gốc, và luôn bỏ qua SVG/GIF động.',
                          },
                        },
                        {
                          name: 'webpQuality',
                          type: 'number',
                          defaultValue: 80,
                          min: 1,
                          max: 100,
                          admin: {
                            width: '50%',
                            description: 'Chất lượng WebP (1–100). Mặc định 80. Chỉ áp dụng khi bật "Nén ảnh sang WebP".',
                            condition: (_, siblingData) => Boolean((siblingData as { compressToWebp?: boolean })?.compressToWebp),
                          },
                        },
                      ],
                    },
                    // Write-only UI editors for R2 secrets — store nothing; delegate to POST /:id/secret
                    {
                      name: 'accessKeyIdEditor',
                      type: 'ui',
                      admin: {
                        components: {
                          Field: {
                            path: '@/components/admin/site-secret-field#SiteSecretField',
                            clientProps: { secretPath: 'r2.accessKeyId', label: 'R2 Access Key ID' },
                          },
                        },
                      },
                    },
                    {
                      name: 'secretAccessKeyEditor',
                      type: 'ui',
                      admin: {
                        components: {
                          Field: {
                            path: '@/components/admin/site-secret-field#SiteSecretField',
                            clientProps: { secretPath: 'r2.secretAccessKey', label: 'R2 Secret Access Key' },
                          },
                        },
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },

        // ── Tab: Thương hiệu (theme + branding) ───────────────────────────
        {
          label: 'Thương hiệu',
          description: 'Theme, màu sắc, logo và font — bộ nhận diện của site.',
          fields: [
            {
              name: 'theme',
              type: 'select',
              defaultValue: 'light',
              options: THEME_OPTIONS,
              admin: {
                description: 'Theme giao diện — chỉ các theme đã đăng ký ở frontend mới hiển thị đúng (maps to getSiteConfig().theme).',
              },
            },
            {
              name: 'branding',
              type: 'group',
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'primaryColor',
                      type: 'text',
                      admin: {
                        width: '50%',
                        description: 'Màu thương hiệu chính (hex, rgb(), hsl() hoặc tên màu).',
                        components: COLOR_FIELD,
                      },
                      validate: validateCssColor,
                    },
                    {
                      name: 'fontFamily',
                      type: 'text',
                      admin: {
                        width: '50%',
                        placeholder: 'Be Vietnam Pro, sans-serif',
                        description: 'Chuỗi CSS font-family.',
                      },
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    { name: 'logo', type: 'upload', relationTo: 'media', admin: { width: '50%', description: 'Logo vuông / dọc' } },
                    { name: 'favicon', type: 'upload', relationTo: 'media', admin: { width: '50%', description: 'Favicon — cũng được dùng tự động làm PWA icons.' } },
                  ],
                },
                {
                  name: 'notFoundImage',
                  type: 'upload',
                  relationTo: 'media',
                  admin: { description: 'Ảnh hiển thị trên trang 404 của site này.' },
                },
                // Removed: branding.colors ("Bảng màu tùy chỉnh"). The frontend only
                // consumes branding.primaryColor (→ --brand-primary) + fontFamily; the
                // rest of the palette is owned by the theme class. The extra-color
                // array had no frontend consumer, so it only confused editors.
              ],
            },
          ],
        },

        // ── Tab: Trang chủ (landing hero/slider + featured + USP) ──────────
        {
          label: 'Trang chủ',
          description: 'Hero, slider và các khối nổi bật trên trang chủ.',
          fields: [
            {
              name: 'landing',
              type: 'group',
              fields: [
                {
                  type: 'collapsible',
                  label: 'Hero',
                  admin: { initCollapsed: false },
                  fields: [
                    {
                      name: 'heroTitle',
                      type: 'text',
                      localized: true,
                      admin: { description: 'Tiêu đề hero trang chủ.' },
                    },
                    {
                      type: 'row',
                      fields: [
                        {
                          name: 'heroNotice1Icon',
                          type: 'select',
                          defaultValue: 'thunderbolt',
                          options: HERO_NOTICE_ICON_OPTIONS,
                          admin: { width: '30%', description: 'Icon badge 1.', components: { Field: HERO_ICON_FIELD.Field } },
                        },
                        {
                          name: 'heroNotice1',
                          type: 'text',
                          localized: true,
                          admin: {
                            width: '70%',
                            description:
                              'Badge phụ 1, vd: "Giao hàng nhanh trong 24h". Để trống = dùng mặc định frontend.',
                          },
                        },
                      ],
                    },
                    {
                      type: 'row',
                      fields: [
                        {
                          name: 'heroNotice2Icon',
                          type: 'select',
                          defaultValue: 'shield',
                          options: HERO_NOTICE_ICON_OPTIONS,
                          admin: { width: '30%', description: 'Icon badge 2.', components: { Field: HERO_ICON_FIELD.Field } },
                        },
                        {
                          name: 'heroNotice2',
                          type: 'text',
                          localized: true,
                          admin: {
                            width: '70%',
                            description:
                              'Badge phụ 2, vd: "Hỗ trợ tận tâm". Để trống = dùng mặc định frontend.',
                          },
                        },
                      ],
                    },
                  ],
                },
                {
                  type: 'collapsible',
                  label: 'Slider',
                  admin: { initCollapsed: false, description: 'Ảnh slider trang chủ.' },
                  fields: [
                    {
                      name: 'slider',
                      type: 'array',
                      labels: { singular: 'Slide', plural: 'Slide' },
                      admin: { components: ROW_LABEL },
                      fields: [
                        {
                          type: 'row',
                          fields: [
                            { name: 'image', type: 'upload', relationTo: 'media', admin: { width: '50%' } },
                            { name: 'alt', type: 'text', admin: { width: '50%', description: 'Mô tả ảnh (alt).' } },
                          ],
                        },
                        {
                          type: 'row',
                          fields: [
                            { name: 'link', type: 'text', admin: { width: '70%', placeholder: '/blog' } },
                            { name: 'order', type: 'number', admin: { width: '30%' } },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              type: 'collapsible',
              label: 'Bài viết & sản phẩm nổi bật',
              admin: { initCollapsed: false },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'featuredPosts',
                      type: 'relationship',
                      relationTo: 'posts',
                      hasMany: true,
                      admin: { width: '50%', description: 'Bài viết nổi bật hiển thị ở marquee trang chủ, trang /blog và ô tìm kiếm (Tìm kiếm nổi bật).' },
                    },
                    {
                      name: 'featuredProducts',
                      type: 'relationship',
                      relationTo: 'products',
                      hasMany: true,
                      admin: { width: '50%', description: 'Sản phẩm / dịch vụ nổi bật hiển thị ở section đầu trang chủ.' },
                    },
                  ],
                },
              ],
            },
            {
              type: 'collapsible',
              label: 'Thẻ điểm mạnh (USP)',
              admin: { initCollapsed: false, description: 'Ví dụ: "Giao hàng nhanh", "Hỗ trợ 24/7".' },
              fields: [
                {
                  name: 'homePageHighlight',
                  type: 'array',
                  labels: { singular: 'Thẻ USP', plural: 'Thẻ USP' },
                  admin: { components: ROW_LABEL },
                  fields: [
                    { name: 'title', type: 'text', localized: true },
                    { name: 'description', type: 'textarea', localized: true },
                    { name: 'image', type: 'upload', relationTo: 'media' },
                  ],
                },
              ],
            },
          ],
        },

        // ── Tab: Liên hệ & Footer ─────────────────────────────────────────
        {
          label: 'Liên hệ & Footer',
          description: 'Nút liên hệ, icon header, nội dung footer và sidebar.',
          fields: [
            {
              name: 'contact',
              type: 'group',
              fields: [
                {
                  name: 'rightSide',
                  type: 'array',
                  labels: { singular: 'Nút liên hệ', plural: 'Nút liên hệ' },
                  admin: {
                    components: ROW_LABEL,
                    description: 'Nút liên hệ nổi bên phải màn hình (Facebook, Zalo, Điện thoại, Bản đồ, LiveChat).',
                  },
                  fields: [
                    {
                      type: 'row',
                      fields: [
                        { name: 'label', type: 'text', localized: true, admin: { width: '50%' } },
                        {
                          // Kênh liên hệ. Frontend của bạn chỉ render đúng các kênh này —
                          // chọn từ danh sách để không gõ sai khiến nút bị bỏ qua âm thầm
                          // khi hiển thị.
                          name: 'icon',
                          type: 'select',
                          options: [
                            { label: 'Facebook', value: 'facebook' },
                            { label: 'Điện thoại', value: 'phone' },
                            { label: 'Zalo', value: 'zalo' },
                            { label: 'Bản đồ', value: 'map' },
                          ],
                          admin: { width: '50%', description: 'Kênh liên hệ — quyết định icon hiển thị.' },
                        },
                      ],
                    },
                    {
                      type: 'row',
                      fields: [
                        { name: 'value', type: 'text', admin: { width: '45%', description: 'Số điện thoại, URL…' } },
                        { name: 'url', type: 'text', admin: { width: '45%' } },
                        { name: 'isVisible', type: 'checkbox', defaultValue: true, admin: { width: '10%' } },
                      ],
                    },
                  ],
                },
                {
                  name: 'headerIcons',
                  type: 'array',
                  labels: { singular: 'Icon header', plural: 'Icon header' },
                  admin: {
                    components: ROW_LABEL,
                    description: 'Icon link hiển thị trên header website (ví dụ: Facebook, Zalo).',
                  },
                  fields: [
                    {
                      type: 'row',
                      fields: [
                        { name: 'url', type: 'text', required: true, admin: { width: '50%' } },
                        { name: 'icon', type: 'text', admin: { width: '50%', description: 'Image URL hoặc icon name.' } },
                      ],
                    },
                    { name: 'tooltip', type: 'text', localized: true },
                  ],
                },
              ],
            },
            {
              name: 'footer',
              type: 'group',
              fields: [
                {
                  name: 'address',
                  type: 'array',
                  localized: true,
                  labels: { singular: 'Dòng địa chỉ', plural: 'Địa chỉ' },
                  admin: { components: ROW_LABEL },
                  fields: [
                    {
                      type: 'row',
                      fields: [
                        { name: 'text', type: 'text', required: true, admin: { width: '60%' } },
                        { name: 'link', type: 'text', admin: { width: '40%' } },
                      ],
                    },
                  ],
                },
                {
                  name: 'subfooter',
                  type: 'textarea',
                  localized: true,
                  admin: { description: 'Văn bản bản quyền cuối trang — hỗ trợ HTML cơ bản (sanitized khi lưu).' },
                  hooks: {
                    beforeChange: [
                      ({ value }) => {
                        if (typeof value === 'string') return sanitizeHtmlContent(value)
                        if (value && typeof value === 'object') {
                          const sanitized: Record<string, string> = {}
                          for (const [locale, html] of Object.entries(value as Record<string, string>)) {
                            sanitized[locale] = typeof html === 'string' ? sanitizeHtmlContent(html) : html
                          }
                          return sanitized
                        }
                        return value
                      },
                    ],
                  },
                },
                {
                  type: 'collapsible',
                  label: 'Liên kết hệ sinh thái & Đối tác',
                  admin: { initCollapsed: true },
                  fields: [
                    {
                      name: 'ecosystemLinks',
                      type: 'array',
                      labels: { singular: 'Liên kết', plural: 'Liên kết hệ sinh thái' },
                      admin: { components: ROW_LABEL },
                      fields: [
                        {
                          type: 'row',
                          fields: [
                            { name: 'label', type: 'text', localized: true, required: true, admin: { width: '50%' } },
                            { name: 'url', type: 'text', required: true, admin: { width: '50%' } },
                          ],
                        },
                        { name: 'logo', type: 'upload', relationTo: 'media' },
                      ],
                    },
                    {
                      name: 'partners',
                      type: 'array',
                      labels: { singular: 'Đối tác', plural: 'Đối tác' },
                      admin: { components: ROW_LABEL },
                      fields: [
                        {
                          type: 'row',
                          fields: [
                            { name: 'name', type: 'text', required: true, admin: { width: '50%' } },
                            { name: 'url', type: 'text', admin: { width: '50%' } },
                          ],
                        },
                        { name: 'logo', type: 'upload', relationTo: 'media' },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              type: 'collapsible',
              label: 'Widget sidebar',
              admin: { initCollapsed: true, description: 'QR thanh toán và HTML hiển thị ở sidebar.' },
              fields: [
                {
                  name: 'sidebar',
                  type: 'group',
                  fields: [
                    {
                      name: 'paymentQr',
                      type: 'upload',
                      relationTo: 'media',
                      admin: { description: 'Ảnh QR code cho sidebar thanh toán.' },
                    },
                    {
                      name: 'html',
                      type: 'textarea',
                      admin: { description: 'Nội dung HTML sidebar (ví dụ: thông tin thanh toán). Scripts bị loại bỏ khi lưu.' },
                      hooks: {
                        beforeChange: [
                          ({ value }) => {
                            if (typeof value === 'string') return sanitizeHtmlContent(value)
                            return value
                          },
                        ],
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },

        // ── Tab: Trang & SEO ──────────────────────────────────────────────
        {
          label: 'Trang & SEO',
          description: 'Ánh xạ trang hệ thống và metadata SEO mặc định.',
          fields: [
            {
              name: 'pageGroup',
              type: 'array',
              labels: { singular: 'Ánh xạ trang', plural: 'Ánh xạ trang' },
              admin: {
                components: ROW_LABEL,
                description: 'Ánh xạ key trang hệ thống (FRONT_PAGE, BLOG, ...) sang slug trang thực của site này.',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'key',
                      type: 'select',
                      required: true,
                      options: PAGE_GROUP_ENV_KEYS.map((k) => ({ label: k, value: k })),
                      admin: { width: '50%', description: 'Key trang hệ thống.' },
                    },
                    {
                      name: 'pageSlug',
                      type: 'text',
                      localized: true,
                      admin: { width: '50%', placeholder: '/about', description: 'Slug trang tương ứng.' },
                    },
                  ],
                },
              ],
            },
            {
              name: 'seoDefaults',
              type: 'group',
              admin: {
                description:
                  'Ảnh OG mặc định — phao dự phòng cho trang chưa set ảnh riêng. Tiêu đề/mô tả mặc định dùng nhóm "Tiêu đề SEO" (seoTitles) theo từng loại nội dung.',
              },
              fields: [
                {
                  name: 'ogImage',
                  type: 'upload',
                  relationTo: 'media',
                  admin: { description: 'Ảnh mặc định khi chia sẻ link lên mạng xã hội (Open Graph).' },
                },
              ],
            },
            {
              name: 'knowledgeGraph',
              type: 'group',
              label: 'Knowledge Graph (Tổ chức / Doanh nghiệp)',
              admin: {
                description:
                  'Thông tin định danh tổ chức cho Google Knowledge Graph & Local SEO. Để trống sẽ tự suy ra từ manifest / branding / liên hệ.',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'type',
                      type: 'select',
                      defaultValue: 'Organization',
                      options: [
                        { label: 'Tổ chức (Organization)', value: 'Organization' },
                        { label: 'Cá nhân (Person)', value: 'Person' },
                      ],
                      admin: { width: '50%', description: 'Loại thực thể đại diện cho site.' },
                    },
                    {
                      name: 'businessType',
                      type: 'select',
                      defaultValue: 'Organization',
                      options: [
                        { label: 'Tổ chức (Organization)', value: 'Organization' },
                        { label: 'Doanh nghiệp địa phương (LocalBusiness)', value: 'LocalBusiness' },
                        { label: 'Dịch vụ chuyên nghiệp (ProfessionalService)', value: 'ProfessionalService' },
                        { label: 'Cửa hàng (Store)', value: 'Store' },
                        { label: 'Nhà hàng (Restaurant)', value: 'Restaurant' },
                      ],
                      admin: {
                        width: '50%',
                        description: 'Loại hình schema.org — xác định @type bổ sung trước Organization.',
                      },
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    { name: 'name', type: 'text', localized: true, admin: { width: '50%', description: 'Tên hiển thị của tổ chức.' } },
                    { name: 'legalName', type: 'text', localized: true, admin: { width: '50%', description: 'Tên pháp lý đầy đủ (nếu khác tên hiển thị).' } },
                  ],
                },
                {
                  name: 'description',
                  type: 'textarea',
                  localized: true,
                  admin: { description: 'Mô tả ngắn về tổ chức.' },
                },
                {
                  name: 'logo',
                  type: 'upload',
                  relationTo: 'media',
                  admin: { description: 'Logo cho JSON-LD. Để trống sẽ dùng logo ở tab Thương hiệu.' },
                },
                {
                  type: 'row',
                  fields: [
                    { name: 'email', type: 'email', admin: { width: '33%', description: 'Email liên hệ công khai.' } },
                    { name: 'telephone', type: 'text', admin: { width: '33%', placeholder: '1900 1234', description: 'Số điện thoại liên hệ.' } },
                    { name: 'priceRange', type: 'text', admin: { width: '34%', placeholder: '$$', description: 'Khoảng giá (ví dụ: $$).' } },
                  ],
                },
                {
                  name: 'address',
                  type: 'group',
                  label: 'Địa chỉ',
                  fields: [
                    {
                      type: 'row',
                      fields: [
                        { name: 'streetAddress', type: 'text', admin: { width: '50%', description: 'Số nhà & tên đường.' } },
                        { name: 'addressLocality', type: 'text', admin: { width: '50%', description: 'Quận / huyện / thành phố.' } },
                      ],
                    },
                    {
                      type: 'row',
                      fields: [
                        { name: 'addressRegion', type: 'text', admin: { width: '34%', description: 'Tỉnh / vùng.' } },
                        { name: 'postalCode', type: 'text', admin: { width: '33%', description: 'Mã bưu chính.' } },
                        { name: 'addressCountry', type: 'text', defaultValue: 'VN', admin: { width: '33%', description: 'Mã quốc gia ISO (mặc định VN).' } },
                      ],
                    },
                  ],
                },
                {
                  name: 'geo',
                  type: 'group',
                  label: 'Toạ độ (GeoCoordinates)',
                  admin: { description: 'Toạ độ địa lý cho Local SEO. Để trống nếu không có.' },
                  fields: [
                    {
                      type: 'row',
                      fields: [
                        { name: 'latitude', type: 'number', admin: { width: '50%', placeholder: '10.7769', description: 'Vĩ độ.' } },
                        { name: 'longitude', type: 'number', admin: { width: '50%', placeholder: '106.7009', description: 'Kinh độ.' } },
                      ],
                    },
                  ],
                },
                {
                  name: 'openingHours',
                  type: 'array',
                  label: 'Giờ mở cửa',
                  labels: { singular: 'Khung giờ', plural: 'Khung giờ' },
                  admin: { description: 'Giờ làm việc theo ngày — chuyển thành openingHours schema.org.' },
                  fields: [
                    {
                      name: 'dayOfWeek',
                      type: 'select',
                      hasMany: true,
                      options: [
                        { label: 'Thứ 2 (Mo)', value: 'Mo' },
                        { label: 'Thứ 3 (Tu)', value: 'Tu' },
                        { label: 'Thứ 4 (We)', value: 'We' },
                        { label: 'Thứ 5 (Th)', value: 'Th' },
                        { label: 'Thứ 6 (Fr)', value: 'Fr' },
                        { label: 'Thứ 7 (Sa)', value: 'Sa' },
                        { label: 'Chủ nhật (Su)', value: 'Su' },
                      ],
                      admin: { description: 'Các ngày áp dụng khung giờ này.' },
                    },
                    {
                      type: 'row',
                      fields: [
                        { name: 'opens', type: 'text', admin: { width: '50%', placeholder: '06:00', description: 'Giờ mở (HH:mm).' } },
                        { name: 'closes', type: 'text', admin: { width: '50%', placeholder: '20:00', description: 'Giờ đóng (HH:mm).' } },
                      ],
                    },
                  ],
                },
                // ── SEO / rich-result fields ────────────────────────────────────────
                {
                  name: 'foundingDate',
                  type: 'date',
                  admin: {
                    description: 'Ngày thành lập — ISO 8601 (YYYY-MM-DD).',
                    date: { pickerAppearance: 'dayOnly' },
                  },
                },
                {
                  name: 'founders',
                  type: 'array',
                  labels: { singular: 'Founder', plural: 'Founders' },
                  admin: { description: 'Người sáng lập — hiển thị trong Knowledge Graph.' },
                  fields: [
                    { name: 'name', type: 'text', required: true },
                  ],
                },
                {
                  name: 'areaServed',
                  type: 'array',
                  labels: { singular: 'Khu vực', plural: 'Khu vực' },
                  admin: { description: 'Khu vực phục vụ — City / AdministrativeArea / Country.' },
                  fields: [
                    {
                      name: 'type',
                      type: 'select',
                      options: [
                        { label: 'Thành phố (City)', value: 'City' },
                        { label: 'Vùng hành chính (AdministrativeArea)', value: 'AdministrativeArea' },
                        { label: 'Quốc gia (Country)', value: 'Country' },
                      ],
                      defaultValue: 'City',
                    },
                    { name: 'name', type: 'text', required: true },
                  ],
                },
                {
                  name: 'knowsLanguage',
                  type: 'select',
                  hasMany: true,
                  options: [
                    { label: 'Tiếng Việt', value: 'vi' },
                    { label: 'English', value: 'en' },
                    { label: 'Français', value: 'fr' },
                    { label: '한국어', value: 'ko' },
                    { label: '中文', value: 'zh' },
                  ],
                  admin: { description: 'Ngôn ngữ được sử dụng — hiển thị trong Knowledge Graph.' },
                },
                {
                  name: 'contactPoint',
                  type: 'group',
                  label: 'Điểm liên hệ (ContactPoint)',
                  admin: { description: 'Thông tin liên hệ theo schema.org/ContactPoint.' },
                  fields: [
                    { name: 'telephone', type: 'text', admin: { description: 'Số điện thoại (sẽ chuẩn hoá E.164 tự động).' } },
                    { name: 'email', type: 'email' },
                    {
                      name: 'contactType',
                      type: 'select',
                      options: [
                        { label: 'Chăm sóc khách hàng (customer support)', value: 'customer support' },
                        { label: 'Bán hàng (sales)', value: 'sales' },
                        { label: 'Đặt chỗ (reservations)', value: 'reservations' },
                      ],
                    },
                    {
                      name: 'availableLanguage',
                      type: 'select',
                      hasMany: true,
                      options: [
                        { label: 'Tiếng Việt', value: 'vi' },
                        { label: 'English', value: 'en' },
                      ],
                    },
                    {
                      name: 'hoursAvailable',
                      type: 'text',
                      admin: { description: 'Giờ hoạt động — format schema.org: Mo-Su 00:00-23:59.' },
                    },
                  ],
                },
                {
                  name: 'returnPolicyUrl',
                  type: 'text',
                  admin: { description: 'URL tuyệt đối tới trang chính sách đổi/trả.' },
                },
                {
                  name: 'searchActionUrl',
                  type: 'text',
                  admin: { description: 'URL template cho SearchAction (dùng {search_term_string}).' },
                },
                {
                  name: 'minReviewsForAggregate',
                  type: 'number',
                  defaultValue: 10,
                  min: 0,
                  admin: { description: 'Ngưỡng đánh giá tối thiểu để hiển thị aggregateRating. Dưới ngưỡng → ẩn.' },
                },
                {
                  name: 'gbpPlaceId',
                  type: 'text',
                  admin: { description: 'Google Business Profile place_id cho site/chi nhánh này.' },
                },
                {
                  name: 'gbpMapEmbed',
                  type: 'textarea',
                  admin: { description: 'Iframe HTML nhúng bản đồ GBP.' },
                },
                {
                  name: 'wikidataId',
                  type: 'text',
                  admin: { description: 'Wikidata Q-id (ví dụ: Q12345).' },
                },
                {
                  name: 'wikipediaUrl',
                  type: 'text',
                  admin: { description: 'URL bài viết Wikipedia về thương hiệu/tổ chức.' },
                },
                {
                  name: 'youtubeChannelUrl',
                  type: 'text',
                  admin: { description: 'URL kênh YouTube chính thức (ví dụ: https://youtube.com/@brand).' },
                },
                {
                  name: 'tiktokUrl',
                  type: 'text',
                  admin: { description: 'URL tài khoản TikTok chính thức (ví dụ: https://tiktok.com/@brand).' },
                },
                {
                  name: 'additionalOffices',
                  type: 'array',
                  labels: { singular: 'Chi nhánh', plural: 'Chi nhánh' },
                  admin: { description: 'Danh sách chi nhánh — mỗi chi nhánh có NAP riêng.' },
                  fields: [
                    { name: 'name', type: 'text', required: true },
                    { name: 'address', type: 'textarea' },
                    {
                      name: 'geo',
                      type: 'group',
                      label: 'Toạ độ',
                      fields: [
                        { name: 'latitude', type: 'number' },
                        { name: 'longitude', type: 'number' },
                      ],
                    },
                    { name: 'telephone', type: 'text' },
                    { name: 'openingHours', type: 'text' },
                    { name: 'gbpPlaceId', type: 'text' },
                  ],
                },
                {
                  name: 'telephoneE164',
                  type: 'text',
                  admin: { readOnly: true, description: 'Số điện thoại E.164 — tự động tính từ telephone. Không sửa tay.' },
                },
              ],
            },
            {
              name: 'socialProfiles',
              type: 'array',
              label: 'Hồ sơ mạng xã hội (sameAs)',
              labels: { singular: 'Hồ sơ', plural: 'Hồ sơ' },
              admin: {
                description:
                  'Liên kết mạng xã hội chính thức → JSON-LD sameAs. Có giá trị sẽ thay thế việc tự dò từ icon liên hệ.',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'platform',
                      type: 'select',
                      options: [
                        { label: 'Facebook', value: 'Facebook' },
                        { label: 'YouTube', value: 'YouTube' },
                        { label: 'Zalo', value: 'Zalo' },
                        { label: 'X (Twitter)', value: 'X' },
                        { label: 'Instagram', value: 'Instagram' },
                        { label: 'TikTok', value: 'TikTok' },
                        { label: 'LinkedIn', value: 'LinkedIn' },
                        { label: 'Khác', value: 'Other' },
                      ],
                      admin: { width: '40%', description: 'Nền tảng.' },
                    },
                    {
                      name: 'url',
                      type: 'text',
                      admin: { width: '60%', placeholder: 'https://facebook.com/...', description: 'URL hồ sơ công khai.' },
                    },
                  ],
                },
              ],
            },
            {
              name: 'seoTitles',
              type: 'group',
              label: 'Mẫu tiêu đề & meta (Titles & Meta)',
              admin: {
                description:
                  'Mẫu tiêu đề / mô tả mặc định theo loại nội dung. Áp dụng khi lưu nếu SEO title/description để trống. Biến: %title% %sitename% %sep% %excerpt% %category% %focuskw% %pt_single% %pt_plural% %date% %modified% %term% %currentyear% %price%.',
              },
              fields: [
                {
                  name: 'separator',
                  type: 'select',
                  defaultValue: '|',
                  options: ['|', '-', '·', '»', '~', '—'].map((s) => ({ label: s, value: s })),
                  admin: { description: 'Ký tự phân tách (%sep%).' },
                },
                ...(
                  [
                    ['homepage', 'Trang chủ', '%sitename%', '%excerpt%'],
                    ['posts', 'Bài viết', '%title% %sep% %sitename%', '%excerpt%'],
                    ['pages', 'Trang', '%title% %sep% %sitename%', '%excerpt%'],
                    ['products', 'Sản phẩm', '%title% %sep% %sitename%', '%excerpt%'],
                    ['landings', 'Trang đích', '%title% %sep% %sitename%', '%excerpt%'],
                    ['taxonomies', 'Taxonomy (Phân loại)', '%term% %sep% %sitename%', '%excerpt%'],
                  ] as Array<[string, string, string, string]>
                ).map(([name, label, titleDefault, descDefault]) => ({
                  name,
                  type: 'group' as const,
                  label,
                  fields: [
                    {
                      // Not localized: templates are language-neutral (only %variables%);
                      // the variables themselves resolve to per-locale doc values at render.
                      name: 'titleTemplate',
                      type: 'text' as const,
                      defaultValue: titleDefault,
                      admin: { description: `Mẫu tiêu đề cho ${label.toLowerCase()}.` },
                    },
                    {
                      name: 'descriptionTemplate',
                      type: 'textarea' as const,
                      defaultValue: descDefault,
                      admin: { description: `Mẫu mô tả cho ${label.toLowerCase()}. Biến: %excerpt%, %price%, %currentyear%...` },
                    },
                  ],
                })),
              ],
            },
            {
              // Breadcrumbs config — RankMath "Phân loại chính" (primary taxonomy) parity.
              // Per content post-type, choose which taxonomy `type` drives the breadcrumb
              // middle crumb. The frontend auto-derives: Trang chủ → <term of this type
              // (+ parent chain)> → current doc. `none` = no taxonomy crumb (Home → doc).
              name: 'breadcrumbs',
              type: 'group',
              label: 'Breadcrumbs (Đường dẫn phân cấp)',
              admin: {
                description:
                  'Phân loại chính cho breadcrumb (giống RankMath). Breadcrumb tự dựng từ phân loại đã chọn — editor không cần nhập tay.',
              },
              fields: [
                {
                  name: 'primaryTaxonomyProduct',
                  type: 'select',
                  defaultValue: 'product-category',
                  options: PRIMARY_TAXONOMY_OPTIONS,
                  admin: { description: 'Phân loại chính cho Sản phẩm (mặc định: Product Category).' },
                },
                {
                  name: 'primaryTaxonomyPost',
                  type: 'select',
                  defaultValue: 'category',
                  options: PRIMARY_TAXONOMY_OPTIONS,
                  admin: { description: 'Phân loại chính cho Bài viết (mặc định: Category).' },
                },
              ],
            },
          ],
        },

        // ── Tab: Tích hợp ─────────────────────────────────────────────────
        {
          label: 'Tích hợp',
          description: 'Tracking và PWA manifest.',
          fields: [
            {
              name: 'integration',
              type: 'group',
              admin: { description: 'Mã tracking và tích hợp bên thứ ba — Analytics, GTM, reCAPTCHA.' },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'ga4Id',
                      type: 'text',
                      admin: { width: '50%', placeholder: 'G-XXXXXXXXXX', description: 'Mã Google Analytics 4.' },
                    },
                    {
                      name: 'gtmId',
                      type: 'text',
                      admin: { width: '50%', placeholder: 'GTM-XXXXXXX', description: 'Mã Google Tag Manager.' },
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'clarityId',
                      type: 'text',
                      admin: {
                        width: '50%',
                        description: 'Mã dự án Microsoft Clarity (heatmap / session recording). Chỉ a-z, 0-9, _ hoặc - (tối đa 40 ký tự).',
                      },
                      // Injected raw into <script> at layout.tsx — must be alphanumeric/safe only
                      validate: (value: unknown) => {
                        if (!value || typeof value !== 'string') return true
                        if (!/^[a-z0-9_-]{1,40}$/i.test(value)) return 'Clarity ID chỉ được chứa ký tự a-z, 0-9, _ hoặc - (tối đa 40 ký tự)'
                        return true
                      },
                    },
                  ],
                },
              ],
            },
            {
              type: 'collapsible',
              label: 'PWA Manifest',
              admin: { initCollapsed: true, description: 'Cấu hình PWA — hiển thị khi người dùng cài app lên điện thoại.' },
              fields: [
                {
                  name: 'manifest',
                  type: 'group',
                  fields: [
                    {
                      type: 'row',
                      fields: [
                        { name: 'name', type: 'text', localized: true, admin: { width: '50%', description: 'Tên đầy đủ của app PWA.' } },
                        { name: 'shortName', type: 'text', localized: true, admin: { width: '50%', description: 'Tên ngắn dưới icon.' } },
                      ],
                    },
                    {
                      name: 'description',
                      type: 'text',
                      localized: true,
                      admin: { description: 'Mô tả ngắn về app — hiển thị trong cửa hàng app.' },
                    },
                    // PWA icons are derived automatically from branding.favicon by
                    // your frontend (manifest.ts) — no manual per-size icon list needed.
                    {
                      type: 'row',
                      fields: [
                        { name: 'scope', type: 'text', defaultValue: '/', admin: { width: '33%' } },
                        { name: 'startUrl', type: 'text', defaultValue: '/', admin: { width: '33%', description: 'URL khởi động PWA.' } },
                        {
                          name: 'display',
                          type: 'select',
                          defaultValue: 'standalone',
                          options: [
                            { label: 'Standalone (ẩn thanh địa chỉ)', value: 'standalone' },
                            { label: 'Fullscreen', value: 'fullscreen' },
                            { label: 'Minimal UI', value: 'minimal-ui' },
                            { label: 'Browser (hiện thanh địa chỉ)', value: 'browser' },
                          ],
                          admin: { width: '34%', description: 'Chế độ hiển thị PWA.' },
                        },
                      ],
                    },
                    // theme_color comes from branding.primaryColor in your frontend —
                    // a separate manifest theme color would only cause drift, so it's omitted.
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}
