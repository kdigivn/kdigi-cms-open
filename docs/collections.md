# Collections

Reference for the KDIGI CMS content model: every collection, its key fields, versioning and trash behaviour, localization, and the hooks that matter.

Related: [multi-site.md](multi-site.md), [roles-and-permissions.md](roles-and-permissions.md) (access per collection), [content-markdown.md](content-markdown.md), [seo.md](seo.md), [media-storage.md](media-storage.md), [rest-api.md](rest-api.md), [architecture.md](architecture.md).

> **Terminology.** The *Sites* collection (`sites`) is the tenant boundary: the docs say "site", but the site-scoped collections carry a relationship field literally named `tenant`, and users carry a `tenants[]` array. Both are injected by `@payloadcms/plugin-multi-tenant` (`tenantsSlug: 'sites'` in `src/payload.config.ts`). There are no Payload globals; all per-site configuration lives in the Sites document.

Collections are registered in `src/payload.config.ts` and implemented in `src/collections/*.ts`.

## Overview

| Collection | Slug | Purpose | Site-scoped (`tenant`) | Localized fields | Versions / trash |
| --- | --- | --- | --- | --- | --- |
| Users | `users` | Admin accounts and roles | via `tenants[]` | no | no |
| Sites | `sites` | One document per site (tenant root) | n/a (is the tenant) | yes (branding text, footer, KG, manifest, page slugs) | no |
| Media | `media` | Uploads, folders, image editor | yes (own `tenant` field) | no | no |
| Taxonomies | `taxonomies` | Categories, product categories, tags, custom | yes | name, description, content, SEO | versions |
| Authors | `authors` | Public bylines | yes | bio | no |
| Menus | `menus` | Navigation trees | yes | item labels | no |
| FAQs | `faqs` | Groups of Q&A pairs | yes | question, answer | versions + trash |
| Pages | `pages` | Static pages | yes | title, content, SEO | versions + trash |
| Posts | `posts` | Blog posts, news, guides | yes | title, content, excerpt, SEO | versions + trash |
| Products | `products` | Product / service pages | yes | title, content, excerpt, notice, SEO | versions + trash |
| Landings | `landings` | Block-based marketing pages | yes | title, excerpt, block text, SEO | versions + trash |
| Shortcodes | `shortcodes` | Reusable Markdown snippets | yes | title, content | versions + trash |
| Redirects | `redirects` | 301/302 rules | yes | no | no |
| Comments | `comments` | Reader comments (moderated) | yes | no | no |
| Rating events | `rating-events` | IP dedup log for ratings (hidden) | no | no | no |

Payload also creates its own system collections: `payload-folders` (media folder tree, site-scoped through `src/collections/payload-folders-tenant-scope.ts`), `payload-jobs`, `payload-locked-documents`, `payload-preferences`, `payload-migrations`.

## Cross-cutting behaviour

### Localization

`src/payload.config.ts`: `localization: { locales: ['vi', 'en'], defaultLocale: 'vi', fallback: true }`. A missing `en` value falls back to `vi`. Admin UI language is configured separately (`i18n`, fallback `vi`). Field `localized: true` is used on titles, bodies, excerpts, SEO text, FAQ items, menu labels, shortcode content and the public-facing Sites strings. Admin labels are bilingual objects (`{ vi, en }`).

REST: pass `?locale=vi|en` (and optionally `fallback-locale`); `locale=all` returns every locale as an object.

### Drafts, versions, trash

- **No Payload `drafts`.** Publishing is a plain `status` select (`draft` | `published`; landings add `archived`). Only `status = 'published'` documents are public, and `publishedAt` in the future schedules publishing (see below).
- **Versions** (`versions: { maxPerDoc: 30 }`, no drafts): `pages`, `posts`, `products`, `landings`, `faqs`, `shortcodes`, `taxonomies`. The admin shows History, diff and Restore. `readVersions` uses `tenantScopedVersionsRead`; there is no anonymous history. Restore goes through normal `update` access and `beforeChange` hooks, so an author cannot restore a published version.
- **Trash** (`trash: true`): `pages`, `posts`, `products`, `landings`, `faqs`, `shortcodes`. Deleting in the admin moves the document to the trash (sets `deletedAt`); permanent delete is admin-level (see [roles-and-permissions.md](roles-and-permissions.md#site-scoped-predicates)). Slug (shortcode `name`) uniqueness per site applies only to non-trashed rows, so a replacement may reuse a trashed slug; restoring into a taken slug is refused with a bilingual validation error by `guard-restore-slug-conflict`.
- **Scheduling.** Setting `publishedAt` in the future keeps the date, and the anonymous read predicate (`publishedAndLive`) hides the document until then. When a document is saved as `published` with an empty `publishedAt`, it is stamped with the current time. Pages, posts and products use `sidebarPublishedAtField()` (`src/fields/sidebar-meta-fields.ts`), which also keeps the original date when an already-published document is edited; landings use a simpler inline hook that re-stamps any empty or past `publishedAt` on every save while `published`. The document appears on the first request after its time, but the frontend cache is only revalidated by saves, not by the clock.

### Uniqueness

Slugs are unique per site for pages, posts, products and landings (`(tenant, slug)`), and shortcode names per site (`(tenant, name)`); these five are **partial** unique indexes (`WHERE deleted_at IS NULL`), so trashed rows do not block reuse. Taxonomies are unique per `(tenant, type, slug)` (a `category` and a `tag` may share a slug) and redirects per `(tenant, from)`. All of them are created in the baseline migration `src/migrations/20261103_042158_initial.ts`; `sites.siteKey` and `users.email` are unique columns. Authors have no database index: slug uniqueness per site is checked in a collection `beforeValidate` hook.

### Markdown content fields

Body fields use `markdownHtmlField(name)` (`src/fields/markdown-html-field.ts`), which generates two fields: `<name>Md` (the Markdown source, edited with the Milkdown editor) and a hidden Lexical `<name>` field. Over REST, an `afterRead` hook converts `<name>Md` to sanitized HTML (expanding `[sc name="…"]` shortcodes first) and returns it as `<name>`; Local API and GraphQL see the stored values. So `contentMd` is the source of truth and `content` is the rendered HTML. Details in [content-markdown.md](content-markdown.md).

### SEO group

Pages, posts, products, landings and taxonomies share `seoFieldGroup()` (`src/fields/seo-field-group.ts`): group `seo` with `title`, `description`, `focusKeywords`, Open Graph/Twitter, `canonicalOverride`, `robots`, plus hidden derived values (`jsonLd.raw`, `articleMeta`). Defaults come from the site's `seoTitles` templates. See [seo.md](seo.md).

### Hooks that matter

| Hook | Where | What it does |
| --- | --- | --- |
| `enforceAuthorPermissions` | `beforeChange` on pages, posts, products, landings | Blocks `author` from publishing; sets `createdBy`. |
| `makeGuardRestoreSlugConflict` | `beforeChange` on pages, posts, products, landings (`slug`), shortcodes (`name`) | Friendly error when restoring from the trash into a taken slug. |
| `makeApplySeoTemplatesHook` | `beforeChange` on pages, posts, products, landings, taxonomies | Fills a blank `seo.title`/`seo.description` from the site's `seoTitles` templates; never overwrites existing values. |
| `autoRedirectOnSlugChange` | `beforeChange` on pages, posts, products, landings | When a slug changes on update, creates a 301 in `redirects` (same site). Never blocks the save. |
| `autoFillExcerpt` | `beforeChange` on posts, products | Fills a blank `excerpt` from the first 160 characters of `contentMd`. |
| `autoFillAuthor` | `beforeChange` on posts | On create, sets `author` to the `authors` row of the same site with the logged-in user's email. |
| `postsWordCount` | `beforeChange` on posts | Computes `wordCount` from `contentMd` in the same write (one version per save). |
| `makeGenerateJsonLdHook` | `afterChange` on pages, posts, products, landings, taxonomies | Builds the JSON-LD graph and stores it in `seo.jsonLd.raw` with a single scoped SQL update (no extra version). |
| `makeResolveOgImageFallbackHook` | `afterRead` | Virtual `og:image` fallback: `featuredImage` then the site's `seoDefaults.ogImage`. Never persisted. |
| `triggerRevalidate` / `triggerRevalidateAfterDelete` | `afterChange` / `afterDelete` | Queues a `revalidateFrontend` job that POSTs `https://<Sites.domain>/api/cms/revalidate` (see [architecture.md](architecture.md)). Saves never wait on the frontend. |
| `syncCommentCounts` | `afterChange`/`afterDelete` on comments | Recomputes `commentCount` on the parent post/product. |
| `normalizeTelephoneE164` | `beforeChange` on sites | Normalizes `knowledgeGraph.telephone` to E.164 (default region VN) into `telephoneE164`. |
| `triggerSiteRevalidate` | `afterChange` on sites | Revalidates the frontend when site settings change. |

## Sites — `src/collections/sites.ts`

The tenant root: one document per site. Identity, domain, branding, homepage, contact/footer, SEO defaults, integrations and storage credentials. Full field reference and how frontends use it: [multi-site.md](multi-site.md). Access: anonymous read; create/delete super-admin; update super-admin/admin (narrowed to assigned sites by the plugin); the `r2` group is super-admin only.

## Users — `src/collections/users.ts`

Auth collection with API keys (`useAPIKey: true`) and a 180-day token. Own field: `role` (`super-admin` | `admin` | `editor` | `author`, default `editor`). A `beforeChange` hook promotes the very first user of a fresh install to `super-admin`. The `tenants[]` array (rows with a `tenant` relationship to Sites) is injected by the plugin and must not be redeclared. See [roles-and-permissions.md](roles-and-permissions.md).

## Content collections

### Posts — `src/collections/posts.ts`

| Field | Type | Notes |
| --- | --- | --- |
| `type` | select, required, default `blog` | `blog` \| `news` \| `guide` |
| `title` | text, required, localized | |
| `status` | select, required, default `draft` | `draft` \| `published` |
| `publishedAt` | date | Scheduling, see above |
| `modified` | date, read-only | Set on every save |
| `slug` | text, required | Auto-generated from the title (diacritics and `đ` folded) when blank |
| `author` | → `authors` | Auto-filled on create when possible |
| `featuredImage` | upload → `media` | |
| `categories` | → `taxonomies`, hasMany | |
| `tier`, `cluster` | select `1`/`2`/`3`, → `taxonomies` | Optional internal topic-cluster metadata for editorial use and frontends; not rendered by the CMS and not used by the built-in link suggester |
| `wordCount` | number, read-only | `postsWordCount` hook |
| `sitemapPriority` | number 0–1, default `0.7` | |
| `isNotified` | checkbox | Lets a frontend surface the post in a notification list |
| `contentMd` / `content` | Markdown source / rendered HTML | Localized |
| `excerpt` | textarea, localized | |
| `faqs` | → `faqs`, hasMany | Feeds the FAQPage JSON-LD only |
| `seo` | group | See [seo.md](seo.md) |
| `kkStarRating` | group `{ avg, count, ratings }` | Aggregate rating, written by `POST /api/ratings/submit` |
| `commentCount` | number, `update: () => false` | Maintained by comment hooks |
| `createdBy` | → `users`, hidden, `update: () => false` | Ownership for the `author` role |

Hooks: `beforeChange` `[enforceAuthorPermissions, guardRestoreSlugConflict, autoFillAuthor, postsWordCount, autoFillExcerpt, applySeoTemplates, autoRedirectOnSlugChange]`; `afterChange` `[generateJsonLd, triggerRevalidate]`; `afterRead` `[resolveOgImageFallback]`. Versions (30) + trash.

### Pages — `src/collections/pages.ts`

`title`, `status`, `publishedAt`, `slug`, `pageType` (`default` | `blog` | `landing`; `blog` maps to the `BLOG` key in `Sites.pageGroup`), `isPillarPage`, `featuredImage`, `sitemapPriority` (default `0.6`), `contentMd`/`content`, `faqs`, `seo`, `createdBy`. Versions (30) + trash. Hooks as posts minus the author, excerpt and word-count hooks.

### Products — `src/collections/products.ts`

Generic product / service pages. Fields:

| Field | Notes |
| --- | --- |
| `title`, `status`, `publishedAt`, `slug`, `featuredImage`, `categories`, `author`, `sitemapPriority` (default `0.8`) | As posts |
| `contentMd`/`content`, `excerpt`, `faqs`, `seo` | |
| `hero.slider[].image`, `hero.slideVideo` | Image carousel and an embed URL (YouTube/TikTok) |
| `noticeMd`/`notice` | Second Markdown field for a notice block, localized |
| `prices[]` | Exactly one row (`minRows: 1`, `maxRows: 1`): `originalPrice`, `currentPrice`, `currency` (`VND` default; `USD`, `EUR`, `GBP`, `JPY`), `validUntil`. Kept as an array to keep a stable REST shape. `currency` feeds the JSON-LD Offer. |
| `kkStarRating` | Group `{ avg, count, ratings }`, `update: () => false` |
| `aggregateRatingOverride` | Checkbox: ignore the site's `knowledgeGraph.minReviewsForAggregate` threshold |
| `commentCount`, `createdBy` | As posts |

Versions (30) + trash.

### Landings — `src/collections/landings.ts`

Block-based marketing pages.

| Field | Notes |
| --- | --- |
| `title`, `slug`, `excerpt`, `featuredImage` | |
| `status` | `draft` \| `published` \| `archived` (only `published` is public) |
| `publishedAt`, `isDisabled`, `sitemapPriority` (default `0.5`), `template` (`default` \| `wide` \| `fullscreen`) | |
| `layout` | **Blocks**: `hero`, `content` (Markdown body), `imageGallery`, `testimonials`, `cta`, `faq`, `stats`, `pricingTable`, `blogFeed`, `offerCards`, `embed` (raw HTML/iframe), `divider` |
| `campaign` | `name`, `utmSource`, `utmMedium`, `utmCampaign`, `conversionGoal`, `abTestId` |
| `schemaType` | `WebPage` (default) \| `FAQPage` \| `Article` \| `Product` \| `Event` |
| `faq[]` | Inline Q&A for FAQPage JSON-LD |
| `seo`, `createdBy` | |

Versions (30) + trash.

## Taxonomy and navigation

### Taxonomies — `src/collections/taxonomies.ts`

`type` (required): `category` | `product-category` | `tag` | `custom` (with a free-text `customType` when `custom`, for example a taxonomy name preserved from a WordPress import). Keeping `category` (blog) separate from `product-category` (WooCommerce `product_cat`) is deliberate. Other fields: `name` (required, localized), `slug` (required, auto-slugified from the name), `description` (localized), `parent` (self relationship → tree), `contentWordCount` (auto, read-only; below `THIN_CONTENT_THRESHOLD = 500` words is flagged thin), `contentMd`/`content`, `seo`. Public read; versions (30), no trash. Hooks: SEO templates, JSON-LD, revalidate (also after delete).

### Menus — `src/collections/menus.ts`

`location` (`PRIMARY` | `SECONDARY_MENU` | `MOBILE_MENU` | `FOOTER_MENU` | `LOGGEDIN_ACCOUNT_MENU`). `tree` (JSON) is the canonical structure, edited with the drag-and-drop `MenuTreeField`; the legacy `items` array is hidden and kept only for compatibility. Over REST an `afterRead` hook removes `tree` and projects it to `items` for the requested locale; GraphQL and the Local API see the raw `tree` (labels as `{ vi, en }`).

### FAQs — `src/collections/faqs.ts`

One document is a **group** of questions: `group` (required label) and `items[]` of `{ question, answer }` (required, localized). `answer` is Markdown; over REST an `afterRead` hook expands shortcodes and renders sanitized HTML. Versions (30) + trash. Anonymous reads exclude trashed rows.

### Authors — `src/collections/authors.ts`

`name`, `slug` (auto), `avatar`, `bio` (localized), `sameAs[].url` (validated http(s) URLs, used for JSON-LD), `email` (never returned by REST). A collection-level `beforeValidate` enforces slug uniqueness per site.

## Supporting collections

### Media — `src/collections/media.ts`

Upload collection with native folders (`folders: true`), a custom grid list view and endpoints `POST /api/media/from-url` (SSRF-guarded import), `POST /api/media/:id/edit-image` and `POST /api/media/fetch-from-r2`. Fields: `alt` (required), `tenant` (site; auto-assigned on upload, only a super-admin may change it), `externalUrl` (http(s) only, becomes the public `url`), `version` (hidden cache-bust counter, appended as `?v=` when greater than 1), plus the upload fields. Per-site WebP compression and storage backend are described in [media-storage.md](media-storage.md).

`sourceMediaId` (indexed text, read-only in the admin sidebar, not localized; Media has no versions) holds the WordPress attachment id. It is written only by the [WordPress importer](wordpress-migration/README.md) so that re-running an import reuses existing media instead of uploading duplicates; WordPress ids are only unique per install, so every lookup is scoped by `tenant`. It is added by the migration `20261103_052647_media_source_media_id` (idempotent and reversible).

### Shortcodes — `src/collections/shortcodes.ts`

Reusable Markdown snippets: `title` (localized), `name` (required, `^[a-z0-9-]+$`, auto-derived from the title), `contentMd`/`content` (required, localized). Shortcodes are **per site**: a tag only resolves against shortcodes of the document's own site. Syntax `[sc name="my-shortcode" /]` or `[sc name="my-shortcode"][/sc]`; nesting depth is capped at 3, and unknown names, cycles or over-deep nesting expand to an empty string. Versions (30) + trash; saving revalidates the frontend. Details in [content-markdown.md](content-markdown.md) and [multi-site.md](multi-site.md#shortcodes-per-site).

### Redirects — `src/collections/redirects.ts`

`from`, `to`, `statusCode` (`301` default | `302`), `isEnabled`. `from` is unique per site (database index), so a duplicate source path is rejected. A `beforeValidate` hook normalizes `from` to a leading slash, rejects `from = to`, rejects external `to` URLs (internal paths only) and logs (does not block) a potential reverse chain. Public read, because the frontend fetches the enabled list; frontends should cap redirect hops themselves.

### Comments — `src/collections/comments.ts`

`post` **or** `product` (exactly one, enforced in `beforeValidate`), `authorName` (required, ≤100 chars, tags stripped), `authorEmail` (never returned), `content` (required, sanitized), `status` (`pending` default | `approved` | `spam`), `createdAt`. Public submission goes through `POST /api/comments/create` (body: `postId` or `productId`, `authorName`, `authorEmail`, `content`, `recaptchaToken`, `tenantSiteKey`); the endpoint checks that the parent belongs to the site named by `tenantSiteKey`, verifies reCAPTCHA when `RECAPTCHA_SECRET` is set (a failed score is logged, not blocking) and always stores `pending`. Hooks: `syncCommentCounts` (including the previous parent when a comment is re-linked), an optional webhook to `MODERATION_WEBHOOK_URL` for new pending comments, and `revalidateParentPostOnCommentApproval`.

### Rating events — `src/collections/rating-events.ts`

Hidden, internal. `collection` (`posts` | `products`), `contentId`, `ipHash` (SHA-256 of the client IP; the raw IP is never stored). All four access rules are `() => false`; only `POST /api/ratings/submit` (body: `collection`, `id`, `rating` 1–5, `tenantSiteKey`) writes it, using `overrideAccess: true`, to allow one vote per IP per document.

## Relationships

```
sites 1──* { pages, posts, products, landings, taxonomies, menus, faqs, authors,
             comments, shortcodes, redirects, media, payload-folders }
users *──* sites                      (users.tenants[])

posts      *──* taxonomies (categories)   *──1 taxonomies (cluster)
posts      *──1 authors   *──1 media (featuredImage)   *──* faqs   *──1 users (createdBy)
products   *──* taxonomies   *──1 authors   *──1 media   *──* faqs   hero.slider[] *──1 media
taxonomies *──1 taxonomies (parent)
comments   *──1 posts | products       (exactly one)
rating-events (collection, contentId, ipHash)   no foreign key
```
