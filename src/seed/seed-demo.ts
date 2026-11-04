#!/usr/bin/env node
/**
 * Demo seed — one "Demo" site with sample content, so a fresh install has something to look at.
 *
 *   pnpm seed:demo        (loads .env; needs DATABASE_URI + PAYLOAD_SECRET, migrations applied)
 *   SEED_DEMO=true docker compose up
 *
 * Creates (all Vietnamese-first with an English translation, Markdown in the `{name}Md` fields):
 *   - site `demo` (domain `localhost`) with `pageGroup` FRONT_PAGE → `trang-chu`,
 *     ABOUT → `gioi-thieu`, CONTACT → `lien-he` (both locales)
 *   - 1 author, 3 categories + 3 tags
 *   - 3 published posts + 1 draft post, 3 published pages (`trang-chu`, `gioi-thieu`, `lien-he`),
 *     1 FAQ group
 *   - PRIMARY + FOOTER_MENU menus
 *   - 1 generated cover image (also proves media storage works: local disk, or R2 if configured)
 *
 * It does NOT create a user: open /admin and the first-user form creates your super-admin.
 *
 * Idempotent: every record is looked up first (site by siteKey, content by tenant + slug,
 * menus by tenant + location) and left untouched when it already exists, so re-running never
 * duplicates content and never overwrites edits you made to the demo.
 *
 * Hooks: the seed deliberately runs the normal content hooks (SEO templates, JSON-LD,
 * revalidate-job queueing) so the demo is realistic. If you ever need to bypass them, pass the
 * flag through `withScopedHookContext(req, { __generatingJsonLd: true })`
 * (src/hooks/scoped-hook-request.ts) — never a bare `context:` argument (CLAUDE.md).
 */
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { getPayload, type Payload, type Where } from 'payload'
import config from '../payload.config'

type Id = number

const SITE_KEY = 'demo'
const COVER_FILENAME = 'demo-cover.png'

interface Localized {
  vi: string
  en: string
}

const log = (msg: string) => console.log(`[seed:demo] ${msg}`)

// ─── Content ────────────────────────────────────────────────────────────────

const AUTHOR = {
  slug: 'demo-author',
  name: 'KDIGI Demo',
  bio: {
    vi: 'Tác giả mẫu của bản demo KDIGI CMS.',
    en: 'Sample author of the KDIGI CMS demo.',
  } satisfies Localized,
}

const CATEGORIES = [
  {
    slug: 'huong-dan',
    name: { vi: 'Hướng dẫn', en: 'Guides' },
    description: { vi: 'Bài hướng dẫn từng bước.', en: 'Step-by-step guides.' },
  },
  {
    slug: 'tin-tuc',
    name: { vi: 'Tin tức', en: 'News' },
    description: { vi: 'Cập nhật và thông báo.', en: 'Updates and announcements.' },
  },
  {
    slug: 'meo-hay',
    name: { vi: 'Mẹo hay', en: 'Tips' },
    description: { vi: 'Mẹo nhỏ giúp làm việc nhanh hơn.', en: 'Small tips to work faster.' },
  },
] as const

const TAGS = [
  { slug: 'bat-dau', name: { vi: 'Bắt đầu', en: 'Getting started' } },
  { slug: 'noi-dung', name: { vi: 'Nội dung', en: 'Content' } },
  { slug: 'seo', name: { vi: 'SEO', en: 'SEO' } },
] as const

interface PostSeed {
  slug: string
  category: string
  type: 'guide' | 'blog' | 'news'
  /** Defaults to `published`; one seeded draft shows an unpublished post in the admin. */
  status?: 'published' | 'draft'
  title: Localized
  excerpt: Localized
  content: Localized
  tags: readonly string[]
}

const POSTS: PostSeed[] = [
  {
    slug: 'chao-mung-den-voi-kdigi-cms',
    category: 'huong-dan',
    type: 'guide' as const,
    title: { vi: 'Chào mừng đến với KDIGI CMS', en: 'Welcome to KDIGI CMS' },
    excerpt: {
      vi: 'Tổng quan nhanh về cách một CMS headless nhiều website hoạt động.',
      en: 'A quick tour of how a multi-site headless CMS works.',
    },
    content: {
      vi: `## KDIGI CMS là gì?

**KDIGI CMS** là một CMS headless nhiều website: mỗi website là một *Site*, và mọi nội dung (bài viết, trang, menu, FAQ) thuộc về đúng một site.

- Quản trị tại \`/admin\`
- API REST tại \`/api\`
- Giao diện (frontend) của bạn đọc nội dung qua API và tự quyết định cách hiển thị

### Bước tiếp theo

1. Tạo tài khoản quản trị đầu tiên.
2. Mở **Bài viết** và thử chỉnh sửa bài này — trình soạn thảo dùng Markdown.
3. Thêm site của riêng bạn trong mục **Websites**.
`,
      en: `## What is KDIGI CMS?

**KDIGI CMS** is a multi-site headless CMS: every website is a *Site*, and all content (posts, pages, menus, FAQs) belongs to exactly one site.

- Admin lives at \`/admin\`
- REST API lives at \`/api\`
- Your frontend reads content through the API and decides how to render it

### Next steps

1. Create the first admin account.
2. Open **Posts** and try editing this one — the editor speaks Markdown.
3. Add your own site under **Websites**.
`,
    },
    tags: ['bat-dau'],
  },
  {
    slug: 'viet-bai-bang-markdown',
    category: 'huong-dan',
    type: 'blog' as const,
    title: { vi: 'Viết bài bằng Markdown', en: 'Writing posts in Markdown' },
    excerpt: {
      vi: 'Trình soạn thảo Markdown trực quan: tiêu đề, danh sách, bảng, hình ảnh.',
      en: 'The visual Markdown editor: headings, lists, tables and images.',
    },
    content: {
      vi: `## Soạn thảo trực quan

Gõ \`/\` để mở menu chèn nhanh. Nội dung được lưu dưới dạng **Markdown chuẩn (GFM)** nên dễ di chuyển và kiểm soát phiên bản.

| Thành phần | Cú pháp |
| --- | --- |
| Tiêu đề | \`## Tiêu đề\` |
| In đậm | \`**đậm**\` |
| Liên kết | \`[văn bản](https://example.com)\` |

> Mẹo: dán nội dung từ Google Docs hoặc Word — trình soạn thảo sẽ tự chuyển sang Markdown.
`,
      en: `## Visual editing

Type \`/\` to open the quick-insert menu. Content is stored as **standard Markdown (GFM)**, so it is easy to move around and version.

| Element | Syntax |
| --- | --- |
| Heading | \`## Heading\` |
| Bold | \`**bold**\` |
| Link | \`[text](https://example.com)\` |

> Tip: paste from Google Docs or Word — the editor converts it to Markdown for you.
`,
    },
    tags: ['bat-dau', 'noi-dung'],
  },
  {
    slug: 'toi-uu-seo-cho-moi-bai-viet',
    category: 'meo-hay',
    type: 'news' as const,
    title: { vi: 'Tối ưu SEO cho mỗi bài viết', en: 'SEO basics for every post' },
    excerpt: {
      vi: 'Tiêu đề SEO, mô tả và dữ liệu có cấu trúc (JSON-LD) được tạo tự động.',
      en: 'SEO title, description and structured data (JSON-LD) are generated for you.',
    },
    content: {
      vi: `## SEO được tích hợp sẵn

Mỗi bài viết và trang có thẻ **SEO** riêng. KDIGI CMS:

- tạo dữ liệu có cấu trúc **JSON-LD** (Article, BreadcrumbList, FAQPage…) khi bạn lưu;
- cho phép đặt mẫu tiêu đề/mô tả theo phong cách RankMath;
- chấm điểm SEO ngay trong danh sách bài viết.

Hãy thử điền *Tiêu đề SEO* và *Mô tả* trong tab **SEO** của bài này.
`,
      en: `## SEO is built in

Every post and page has its own **SEO** tab. KDIGI CMS:

- generates **JSON-LD** structured data (Article, BreadcrumbList, FAQPage…) when you save;
- supports RankMath-style title/description templates;
- scores SEO right in the posts list.

Try filling in *SEO title* and *Description* in the **SEO** tab of this post.
`,
    },
    tags: ['seo', 'noi-dung'],
  },
  {
    slug: 'ban-nhap-demo',
    category: 'tin-tuc',
    type: 'news',
    status: 'draft',
    title: { vi: 'Bản nháp: sắp ra mắt', en: 'Draft: coming soon' },
    excerpt: {
      vi: 'Bài viết ở trạng thái nháp — chỉ hiển thị trong admin, không xuất hiện trên website.',
      en: 'A draft post — visible in the admin only, never on the public site.',
    },
    content: {
      vi: `## Đây là bản nháp

Bài viết này đang ở trạng thái **Bản nháp** nên API công khai không trả về nó.

- Sửa nội dung thoải mái rồi đổi trạng thái sang **Đã đăng**.
- Đặt *Ngày đăng* trong tương lai để hẹn giờ xuất bản.

Xoá bài này khi bạn đã quen với quy trình duyệt bài.
`,
      en: `## This is a draft

This post is in **Draft** status, so the public API never returns it.

- Edit it freely, then switch the status to **Published**.
- Set a future *Publish date* to schedule it.

Delete this post once you are comfortable with the review flow.
`,
    },
    tags: ['noi-dung'],
  },
]

const PAGES = [
  {
    slug: 'trang-chu',
    title: { vi: 'Trang chủ', en: 'Home' },
    content: {
      vi: `# Chào mừng đến với KDIGI CMS

Đây là **trang chủ** của website Demo. Nội dung trang được quản trị viên viết bằng Markdown và đọc qua API công khai, nên frontend của bạn toàn quyền quyết định cách hiển thị.

## Bắt đầu từ đâu?

- **Bài viết** — blog, tin tức và hướng dẫn, lọc theo danh mục hoặc thẻ.
- **Trang** — nội dung tĩnh như giới thiệu, liên hệ, điều khoản.
- **Menu** — dựng điều hướng dùng chung cho mọi giao diện.

> Trang này được gắn với key hệ thống \`FRONT_PAGE\` trong phần *Trang & SEO* của site, nên frontend luôn tìm thấy nó dù bạn đổi slug.
`,
      en: `# Welcome to KDIGI CMS

This is the **home page** of the Demo website. Admins write page content in Markdown and frontends read it through the public API, so your site decides exactly how it is rendered.

## Where to start

- **Posts** — blog, news and guides, filterable by category or tag.
- **Pages** — static content such as about, contact and terms.
- **Menus** — build navigation shared by every frontend.

> This page is mapped to the \`FRONT_PAGE\` system key under the site's *Pages & SEO* tab, so a frontend finds it even after you change the slug.
`,
    },
  },
  {
    slug: 'gioi-thieu',
    title: { vi: 'Giới thiệu', en: 'About' },
    content: {
      vi: `# Giới thiệu

Đây là website **Demo** chạy trên KDIGI CMS. Hãy sửa hoặc xoá trang này và thêm nội dung của riêng bạn.
`,
      en: `# About

This is the **Demo** website running on KDIGI CMS. Edit or delete this page and add your own content.
`,
    },
  },
  {
    slug: 'lien-he',
    title: { vi: 'Liên hệ', en: 'Contact' },
    content: {
      vi: `# Liên hệ

Gửi câu hỏi hoặc góp ý qua [GitHub Issues](https://github.com/kdigivn/kdigi-cms-open/issues).
`,
      en: `# Contact

Send questions or feedback through [GitHub Issues](https://github.com/kdigivn/kdigi-cms-open/issues).
`,
    },
  },
]

const FAQ = {
  group: 'demo-faq',
  items: [
    {
      question: { vi: 'KDIGI CMS có miễn phí không?', en: 'Is KDIGI CMS free?' },
      answer: {
        vi: 'Có. KDIGI CMS là mã nguồn mở theo giấy phép MIT.',
        en: 'Yes. KDIGI CMS is open source under the MIT license.',
      },
    },
    {
      question: { vi: 'Tôi có thể quản lý nhiều website không?', en: 'Can I manage several websites?' },
      answer: {
        vi: 'Có. Mỗi website là một **Site** riêng với nội dung và người dùng được phân quyền.',
        en: 'Yes. Each website is its own **Site** with scoped content and users.',
      },
    },
    {
      question: { vi: 'Ảnh tải lên được lưu ở đâu?', en: 'Where are uploaded images stored?' },
      answer: {
        vi: 'Mặc định trên đĩa cục bộ (`./media`). Có thể bật Cloudflare R2 riêng cho từng site.',
        en: 'On local disk (`./media`) by default. Cloudflare R2 can be enabled per site.',
      },
    },
  ],
}

type MenuNode = { id: string; label: { vi: string; en: string }; url: string; children: MenuNode[] }
const node = (vi: string, en: string, url: string, children: MenuNode[] = []): MenuNode => ({
  id: randomUUID(),
  label: { vi, en },
  url,
  children,
})

const MENUS: Array<{ location: 'PRIMARY' | 'FOOTER_MENU'; tree: () => MenuNode[] }> = [
  {
    location: 'PRIMARY',
    tree: () => [
      node('Trang chủ', 'Home', '/'),
      node('Bài viết', 'Blog', '/blog', [
        node('Hướng dẫn', 'Guides', '/category/huong-dan'),
        node('Tin tức', 'News', '/category/tin-tuc'),
        node('Mẹo hay', 'Tips', '/category/meo-hay'),
      ]),
      node('Giới thiệu', 'About', '/gioi-thieu'),
      node('Liên hệ', 'Contact', '/lien-he'),
    ],
  },
  {
    location: 'FOOTER_MENU',
    tree: () => [
      node('Giới thiệu', 'About', '/gioi-thieu'),
      node('Liên hệ', 'Contact', '/lien-he'),
      node('GitHub', 'GitHub', 'https://github.com/kdigivn/kdigi-cms-open'),
    ],
  },
]

/**
 * System pages a frontend resolves by key (Sites → "Trang & SEO"). `pageSlug` is localized, but
 * page slugs are not, so both locales point at the same slug. Missing keys are appended; keys a
 * site already maps are never overwritten.
 */
const PAGE_GROUP: Array<{ key: 'FRONT_PAGE' | 'ABOUT' | 'CONTACT'; pageSlug: string }> = [
  { key: 'FRONT_PAGE', pageSlug: 'trang-chu' },
  { key: 'ABOUT', pageSlug: 'gioi-thieu' },
  { key: 'CONTACT', pageSlug: 'lien-he' },
]

// ─── Helpers ────────────────────────────────────────────────────────────────

async function findOne(
  payload: Payload,
  collection: 'sites' | 'authors' | 'taxonomies' | 'posts' | 'pages' | 'faqs' | 'menus' | 'media',
  where: Where,
): Promise<{ id: Id } | undefined> {
  const res = await payload.find({
    collection,
    where,
    limit: 1,
    depth: 0,
    overrideAccess: true,
    // Soft-deleted rows must not count as "already seeded" nor block a re-create.
    trash: false,
  })
  return res.docs[0] as { id: Id } | undefined
}

async function ensurePageGroup(payload: Payload, siteId: Id): Promise<void> {
  const viRows =
    (
      await payload.findByID({ collection: 'sites', id: siteId, depth: 0, locale: 'vi', overrideAccess: true })
    ).pageGroup ?? []
  const missing = PAGE_GROUP.filter((g) => !viRows.some((r) => r.key === g.key))
  if (missing.length === 0) return // user's mapping — leave it alone

  // Preserve every existing row verbatim and append only the missing keys.
  const updated =
    (
      await payload.update({
        collection: 'sites',
        id: siteId,
        locale: 'vi',
        data: {
          pageGroup: [
            ...viRows.map((r) => ({ id: r.id ?? undefined, key: r.key, pageSlug: r.pageSlug ?? undefined })),
            ...missing.map((g) => ({ key: g.key, pageSlug: g.pageSlug })),
          ],
        },
        overrideAccess: true,
      })
    ).pageGroup ?? []

  // `pageSlug` is localized: fill the English side for the rows we just added, keep existing ones.
  const enSlugById = new Map(
    (
      (
        await payload.findByID({ collection: 'sites', id: siteId, depth: 0, locale: 'en', overrideAccess: true })
      ).pageGroup ?? []
    ).map((r) => [r.id, r.pageSlug] as const),
  )
  const knownIds = new Set(viRows.map((r) => r.id))
  await payload.update({
    collection: 'sites',
    id: siteId,
    locale: 'en',
    data: {
      pageGroup: updated.map((r) => ({
        id: r.id ?? undefined,
        key: r.key,
        pageSlug: knownIds.has(r.id)
          ? (enSlugById.get(r.id) ?? undefined)
          : PAGE_GROUP.find((g) => g.key === r.key)?.pageSlug,
      })),
    },
    overrideAccess: true,
  })
  log(`mapped pageGroup keys: ${missing.map((g) => g.key).join(', ')}`)
}

async function ensureSite(payload: Payload): Promise<Id> {
  const existing = await findOne(payload, 'sites', { siteKey: { equals: SITE_KEY } })
  if (existing) {
    log(`site "${SITE_KEY}" exists (id ${existing.id})`)
    // `demo:reset` keeps the Sites row, so an existing site still needs the system-page mapping.
    await ensurePageGroup(payload, existing.id)
    return existing.id
  }
  const created = await payload.create({
    collection: 'sites',
    data: { siteKey: SITE_KEY, domain: 'localhost', defaultLanguage: 'vi' },
    overrideAccess: true,
  })
  log(`created site "${SITE_KEY}" (id ${created.id})`)
  await ensurePageGroup(payload, created.id)
  return created.id
}

async function ensureAuthor(payload: Payload, tenant: Id): Promise<Id> {
  const where: Where = { and: [{ tenant: { equals: tenant } }, { slug: { equals: AUTHOR.slug } }] }
  const existing = await findOne(payload, 'authors', where)
  if (existing) return existing.id
  const created = await payload.create({
    collection: 'authors',
    locale: 'vi',
    data: { name: AUTHOR.name, slug: AUTHOR.slug, bio: AUTHOR.bio.vi, tenant },
    overrideAccess: true,
  })
  await payload.update({
    collection: 'authors',
    id: created.id,
    locale: 'en',
    data: { bio: AUTHOR.bio.en },
    overrideAccess: true,
  })
  log('created author')
  return created.id
}

/** Create a generated cover image through the normal upload path (local disk or R2). */
async function ensureCover(payload: Payload, tenant: Id): Promise<Id> {
  const where: Where = { and: [{ tenant: { equals: tenant } }, { filename: { equals: COVER_FILENAME } }] }
  const existing = await findOne(payload, 'media', where)
  if (existing) return existing.id

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0f172a"/><stop offset="1" stop-color="#2563eb"/>
    </linearGradient></defs>
    <rect width="1200" height="630" fill="url(#g)"/>
    <circle cx="420" cy="315" r="150" fill="#ffffff" fill-opacity="0.18"/>
    <circle cx="780" cy="315" r="220" fill="#ffffff" fill-opacity="0.12"/>
  </svg>`
  const data = await sharp(Buffer.from(svg)).png().toBuffer()
  const created = await payload.create({
    collection: 'media',
    data: { alt: 'KDIGI CMS demo cover', tenant },
    file: { data, mimetype: 'image/png', name: COVER_FILENAME, size: data.length },
    overrideAccess: true,
  })
  log(`created cover image (${created.id})`)
  return created.id
}

async function ensureTaxonomy(
  payload: Payload,
  tenant: Id,
  type: 'category' | 'tag',
  entry: { slug: string; name: Localized; description?: Localized },
): Promise<Id> {
  const where: Where = {
    and: [{ tenant: { equals: tenant } }, { type: { equals: type } }, { slug: { equals: entry.slug } }],
  }
  const existing = await findOne(payload, 'taxonomies', where)
  if (existing) return existing.id
  const created = await payload.create({
    collection: 'taxonomies',
    locale: 'vi',
    data: { type, slug: entry.slug, name: entry.name.vi, description: entry.description?.vi, tenant },
    overrideAccess: true,
  })
  await payload.update({
    collection: 'taxonomies',
    id: created.id,
    locale: 'en',
    data: { name: entry.name.en, description: entry.description?.en },
    overrideAccess: true,
  })
  log(`created ${type} "${entry.slug}"`)
  return created.id
}

async function ensurePost(
  payload: Payload,
  tenant: Id,
  refs: { author: Id; cover: Id; categories: Map<string, Id>; tags: Map<string, Id> },
  post: PostSeed,
  index: number,
): Promise<void> {
  const where: Where = { and: [{ tenant: { equals: tenant } }, { slug: { equals: post.slug } }] }
  if (await findOne(payload, 'posts', where)) return
  const categories = [post.category, ...post.tags].map((s) =>
    s === post.category ? refs.categories.get(s) : refs.tags.get(s),
  )
  const status = post.status ?? 'published'
  const publishedAt = new Date(Date.now() - (index + 1) * 24 * 3600 * 1000).toISOString()
  const created = await payload.create({
    collection: 'posts',
    locale: 'vi',
    data: {
      tenant,
      slug: post.slug,
      type: post.type,
      status,
      // Drafts keep publishedAt empty so a later publish stamps the real date.
      ...(status === 'published' ? { publishedAt } : {}),
      title: post.title.vi,
      excerpt: post.excerpt.vi,
      contentMd: post.content.vi,
      author: refs.author,
      featuredImage: refs.cover,
      categories: categories.filter((c): c is Id => c !== undefined),
    },
    overrideAccess: true,
  })
  await payload.update({
    collection: 'posts',
    id: created.id,
    locale: 'en',
    data: { title: post.title.en, excerpt: post.excerpt.en, contentMd: post.content.en },
    overrideAccess: true,
  })
  log(`created post "${post.slug}"`)
}

async function ensurePage(payload: Payload, tenant: Id, page: (typeof PAGES)[number]): Promise<void> {
  const where: Where = { and: [{ tenant: { equals: tenant } }, { slug: { equals: page.slug } }] }
  if (await findOne(payload, 'pages', where)) return
  const created = await payload.create({
    collection: 'pages',
    locale: 'vi',
    data: {
      tenant,
      slug: page.slug,
      status: 'published',
      publishedAt: new Date().toISOString(),
      title: page.title.vi,
      contentMd: page.content.vi,
    },
    overrideAccess: true,
  })
  await payload.update({
    collection: 'pages',
    id: created.id,
    locale: 'en',
    data: { title: page.title.en, contentMd: page.content.en },
    overrideAccess: true,
  })
  log(`created page "${page.slug}"`)
}

async function ensureFaq(payload: Payload, tenant: Id): Promise<void> {
  const where: Where = { and: [{ tenant: { equals: tenant } }, { group: { equals: FAQ.group } }] }
  if (await findOne(payload, 'faqs', where)) return
  const created = await payload.create({
    collection: 'faqs',
    locale: 'vi',
    data: {
      tenant,
      group: FAQ.group,
      items: FAQ.items.map((i) => ({ question: i.question.vi, answer: i.answer.vi })),
    },
    overrideAccess: true,
  })
  // Re-send the same row ids so the English text lands on the existing rows.
  const rows = (created as unknown as { items?: Array<{ id?: string }> }).items ?? []
  await payload.update({
    collection: 'faqs',
    id: created.id,
    locale: 'en',
    data: {
      items: FAQ.items.map((i, n) => ({ id: rows[n]?.id, question: i.question.en, answer: i.answer.en })),
    },
    overrideAccess: true,
  })
  log(`created FAQ group "${FAQ.group}"`)
}

async function ensureMenu(
  payload: Payload,
  tenant: Id,
  menu: (typeof MENUS)[number],
): Promise<void> {
  const where: Where = { and: [{ tenant: { equals: tenant } }, { location: { equals: menu.location } }] }
  if (await findOne(payload, 'menus', where)) return
  await payload.create({
    collection: 'menus',
    data: { tenant, location: menu.location, tree: menu.tree() },
    overrideAccess: true,
  })
  log(`created menu ${menu.location}`)
}

// ─── Entry point ────────────────────────────────────────────────────────────

export async function seedDemo(payload: Payload): Promise<void> {
  const tenant = await ensureSite(payload)
  const author = await ensureAuthor(payload, tenant)
  const cover = await ensureCover(payload, tenant)

  const categories = new Map<string, Id>()
  for (const c of CATEGORIES) categories.set(c.slug, await ensureTaxonomy(payload, tenant, 'category', c))
  const tags = new Map<string, Id>()
  for (const t of TAGS) tags.set(t.slug, await ensureTaxonomy(payload, tenant, 'tag', t))

  for (const [i, post] of POSTS.entries()) {
    await ensurePost(payload, tenant, { author, cover, categories, tags }, post, i)
  }
  for (const page of PAGES) await ensurePage(payload, tenant, page)
  await ensureFaq(payload, tenant)
  for (const menu of MENUS) await ensureMenu(payload, tenant, menu)

  log('done — open /admin to create your first user and explore the "Demo" site')
}

async function main() {
  const payload = await getPayload({ config })
  try {
    await seedDemo(payload)
  } finally {
    await payload.destroy()
  }
}

// Only run when invoked directly (`node ... src/seed/seed-demo.ts`), never on import.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
