# Multi-Site

How one KDIGI CMS installation serves many independent websites: the Sites model, how a site is defined, how frontends pick their site, and how to add a new one.

Related: [roles-and-permissions.md](roles-and-permissions.md) (isolation and user-to-site assignment), [collections.md](collections.md), [media-storage.md](media-storage.md), [seo.md](seo.md), [rest-api.md](rest-api.md), [architecture.md](architecture.md).

> **Terminology.** The **Sites** collection (`sites`, source `src/collections/sites.ts`) is the tenant boundary. Prose uses "site"; the code uses `tenant`: content collections have a relationship field named `tenant`, users have a `tenants[]` array, and the admin site selector stores its choice in the `payload-tenant` cookie. This comes from `@payloadcms/plugin-multi-tenant` configured with `tenantsSlug: 'sites'` (`src/payload.config.ts`).

## Model

- One **Sites** document = one website. All per-site configuration lives in that document (there are no Payload globals).
- Site-scoped collections (`pages`, `posts`, `products`, `landings`, `taxonomies`, `menus`, `faqs`, `authors`, `comments`, `shortcodes`, `redirects`, plus `media` and `payload-folders`) each carry a `tenant` relationship to Sites. A document belongs to exactly one site.
- Users are linked to sites through `users.tenants[]`. A super-admin sees and manages every site; other roles only their assigned sites. See [roles-and-permissions.md](roles-and-permissions.md).
- One CMS deployment, one database, any number of frontends. Adding a site is data entry, not a redeploy.

## How a site is defined

The Sites form has six tabs. Tabs are unnamed, so field paths are top-level (for example `seoTitles`, not `tabSeo.seoTitles`).

| Tab | Fields | Notes |
| --- | --- | --- |
| Hệ thống (System) | `siteKey`, `domain`, `defaultLanguage`, group `r2` | Identity and optional storage credentials |
| Thương hiệu (Branding) | `theme`, `branding` (`primaryColor`, `fontFamily`, `logo`, `favicon`, `notFoundImage`) | Visual identity |
| Trang chủ (Home) | `landing` (`heroTitle`, `heroNotice1/2` + `…Icon`, `slider[]`), `featuredPosts`, `featuredProducts`, `homePageHighlight[]` | Homepage content blocks |
| Liên hệ & Footer (Contact & footer) | `contact` (`rightSide[]`, `headerIcons[]`), `footer` (`address[]`, `subfooter`, `ecosystemLinks[]`, `partners[]`), `sidebar` (`paymentQr`, `html`) | Floating contact buttons, header icons, footer and sidebar content |
| Trang & SEO (Pages & SEO) | `pageGroup[]`, `seoDefaults`, `knowledgeGraph`, `socialProfiles[]`, `seoTitles`, `breadcrumbs` | See [seo.md](seo.md) |
| Tích hợp (Integrations) | `integration` (`ga4Id`, `gtmId`, `clarityId`), `manifest` (PWA) | Tracking and web-app manifest |

### Identity: `siteKey`, `domain`, `defaultLanguage`

| Field | Type | Meaning |
| --- | --- | --- |
| `siteKey` | text, required, unique | Stable machine identifier (for example `my-blog`). Frontends use it to find their site, and public endpoints accept it (`tenantSiteKey`, `/api/sites/:siteKey/env-page`). Admin title field. |
| `domain` | text, required | Primary **bare host name**, no scheme and no trailing slash (for example `www.example.com`). The CMS builds `https://<domain>` from it. |
| `defaultLanguage` | select, required, default `vi` | `vi` or `en`. Used as the language of generated JSON-LD. |

What reads `domain`:

| Consumer | Behaviour |
| --- | --- |
| `revalidateFrontend` job (`src/jobs/revalidate-frontend-task.ts`) | `POST https://<domain>/api/cms/revalidate` with `{ collection, id, slug }` after content changes. A site with no `domain` is skipped. Timeout 5 s, retried with backoff. |
| JSON-LD (`src/lib/jsonld/site-config-loader.ts`) | `siteUrl = https://<domain>` for canonical and `@id` URLs. |
| "View on site" (`GET /api/frontend-doc-url?collection=&slug=&tenantId=`) | Base URL = env `FRONTEND_BASE_URL` if set, else `https://<domain>` of the given site, else `http://localhost:3002`. Admin-only. |

So each site's frontend must serve `POST /api/cms/revalidate` on its own domain, and the CMS must be able to reach it over HTTPS. Revalidation jobs only run when `ENABLE_JOBS_AUTORUN=true` on exactly one CMS instance.

### Branding and homepage

| Field | Notes |
| --- | --- |
| `theme` | Select: `light` (default), `dark`, `brand-red`, `brand-blue`, `brand-green`. Only themes your frontend registers render correctly. The options are a Postgres enum (`enum_sites_theme`), so adding one means editing `THEME_OPTIONS` in `src/collections/sites.ts` **and** a new migration that runs `ALTER TYPE "enum_sites_theme" ADD VALUE '<name>'`; without the migration, saving a site with the new theme fails. |
| `branding.primaryColor` | CSS color, validated (no `{ } < > " ' \` ;`, max 60 chars) because frontends may inject it into a `<style>` block. |
| `branding.fontFamily` | CSS `font-family` string. |
| `branding.logo`, `favicon`, `notFoundImage` | Uploads to `media`. The favicon is also what a frontend can derive PWA icons from. |
| `landing.heroTitle`, `heroNotice1`, `heroNotice2` (localized), `heroNotice1Icon`, `heroNotice2Icon` | Homepage hero text and two badges; icons are a fixed select (`thunderbolt`, `shield`, `ticket`, `clock`, `payment`, `check`, `support`, `location`) resolved by your frontend. |
| `landing.slider[]` | `image`, `alt`, `link`, `order`. |
| `featuredPosts`, `featuredProducts` | Relationships (hasMany) to posts / products for homepage sections. |
| `homePageHighlight[]` | Selling-point cards: `title`, `description` (localized), `image`. |

### Contact and footer

`contact.rightSide[]` are floating contact buttons (`label` localized, `icon` select `facebook` | `phone` | `zalo` | `map`, `value`, `url`, `isVisible`). `contact.headerIcons[]` are header links (`url`, `icon`, `tooltip`). `footer.address[]` (localized lines with optional link), `footer.subfooter` (localized text, HTML sanitized on save), `footer.ecosystemLinks[]`, `footer.partners[]`, and `sidebar.paymentQr` / `sidebar.html` (script tags stripped on save).

### SEO-related per-site settings

| Field | Purpose |
| --- | --- |
| `pageGroup[]` | Maps well-known page keys to this site's real page slugs (`key` select: `FRONT_PAGE`, `BLOG`, `PROFILE`, `CONTACT`, `ABOUT`, `SEARCH`, `SIGN_IN`, `SIGN_UP`, `FORGOT_PASSWORD`, `CONFIRM_EMAIL`, `PASSWORD_CHANGE`, `TERM_CONDITION`, `PRIVACY_POLICY`; `pageSlug` localized). Read through `GET /api/sites/:siteKey/env-page?key=<KEY>`. |
| `seoDefaults.ogImage` | Fallback Open Graph image. |
| `seoTitles` | `separator` plus `titleTemplate` / `descriptionTemplate` per `homepage`, `posts`, `pages`, `products`, `landings`, `taxonomies`, using RankMath-style variables (`%title%`, `%sitename%`, `%sep%`, `%excerpt%`, …). Applied on save when a document's SEO title/description is blank. |
| `breadcrumbs.primaryTaxonomyProduct`, `primaryTaxonomyPost` | Which taxonomy type forms the middle breadcrumb (`none`, `product-category`, `category`, `tag`). |
| `knowledgeGraph` | Organization/Person identity for JSON-LD: `type`, `businessType`, names, `description`, `logo`, `email`, `telephone` (normalized to `telephoneE164`), `address`, `geo`, `openingHours`, `foundingDate`, `founders`, `areaServed`, `knowsLanguage`, `contactPoint`, URLs (`wikidataId`, `wikipediaUrl`, `youtubeChannelUrl`, `tiktokUrl`), `additionalOffices`, `minReviewsForAggregate` (default 10), and more. Blank fields fall back to manifest/branding/contact values. |
| `socialProfiles[]` | `platform` + `url`, emitted as `sameAs`. |

### Integrations

`integration.ga4Id`, `gtmId`, `clarityId` (restricted to `a-z0-9_-`, max 40 chars, because it is injected into a script), and the PWA `manifest` (`name`, `shortName`, `description`, `scope`, `startUrl`, `display`). Frontends read them from the Sites document; the CMS itself does not inject tracking code.

### Per-site storage: `r2`

Optional group, **super-admin write only**. Without it the site's uploads go to local disk. Fields: `bucket`, `publicBaseUrl`, `accountId`, `accessKeyId`, `secretAccessKey`, `compressToWebp`, `webpQuality`. A site uses Cloudflare R2 only when `bucket` and `accountId` are set; the two key fields are write-only secrets (never returned by REST/GraphQL; set them with the Sites form's secret editors, which call `POST /api/sites/:id/secret`). Env `R2_OFF=true` forces local disk for every site. WebP-on-upload is configured in this group, so it applies to R2 sites. Details: [media-storage.md](media-storage.md).

### Access and hooks on Sites

| Item | Behaviour |
| --- | --- |
| Read | Public for anonymous callers (frontends need it before they can authenticate). Logged-in non-super-admin users are narrowed to their assigned sites by the plugin. |
| Create / delete | Super-admin only. |
| Update | `super-admin`, `admin` (narrowed to assigned sites); the `r2` group is super-admin only. |
| `beforeChange` | `normalizeTelephoneE164` (`knowledgeGraph.telephone` → `telephoneE164`). |
| `afterChange` | `triggerSiteRevalidate`: settings are rendered on every page, so a save queues a frontend revalidation. |
| Collection endpoints | `GET /api/sites/:siteKey/env-page?key=<KEY>`, `GET` and `POST /api/sites/:id/secret` |

Because anonymous read is open, **never put a secret in a normal Sites field**. Anything sensitive must have `access.read: () => false` (as the `r2` keys do).

## How a frontend selects its site

The CMS never infers the site from the request host. A frontend is configured with its own `siteKey` and scopes every request itself.

1. **Resolve the site once** (cache it):

   ```bash
   curl 'https://cms.example.com/api/sites?where[siteKey][equals]=my-blog&limit=1&depth=1'
   ```

   Keep `docs[0].id` (the numeric site id) plus the branding/contact/SEO settings you need. Use `?locale=vi|en` for localized values.

2. **Scope every content query to that id:**

   ```bash
   curl 'https://cms.example.com/api/posts?where[tenant][equals]=1&where[status][equals]=published&locale=vi'
   ```

   Anonymous reads return published, non-trashed, already-live documents of **all** sites unless you add `where[tenant][equals]=<id>`. The access rules do not add it for you (see [roles-and-permissions.md](roles-and-permissions.md#public-versus-authenticated-reads)). This applies to `pages`, `posts`, `products`, `landings`, `taxonomies`, `authors`, `menus`, `faqs`, `shortcodes`, `redirects` and approved `comments`.

3. **Public write endpoints take the key**, not the id: `POST /api/comments/create` and `POST /api/ratings/submit` require `tenantSiteKey`, and reject a parent document that belongs to another site.

4. **System pages:** `GET /api/sites/<siteKey>/env-page?key=BLOG` returns the page the site mapped to that key in `pageGroup` (rendered HTML in `content`), scoped to that site.

5. **Authenticated server-to-server access:** create a Users record, assign it the site in `tenants[]` and use its API key (`Authorization: users API-Key <key>`). It sees drafts of that site only. Include `tenant` explicitly when creating documents.

The Sites field `siteKey` description in the admin refers to the frontend environment variable that holds this key; the variable name is up to your frontend.

### Admin site selector

In the admin, a user with several sites picks the active one in the site selector (`payload-tenant` cookie), which narrows lists and sets the default `tenant` for new documents. This is a UI convenience: the server re-validates any site id coming from a cookie, query string or body against the caller's memberships (`src/lib/admin-selected-tenant.ts`).

## Adding a site

1. **Sign in as a super-admin** (only super-admins can create sites and users). On a fresh install the first user created on the admin's "create first user" screen is automatically a `super-admin`. A super-admin can also be created or reset with `node --env-file=.env --import tsx src/scripts/create-admin-user.ts <email> <password>`.
2. **Create the site** (Sites → Create): set `siteKey` (unique), `domain` (bare host) and `defaultLanguage`.
3. **Storage (optional):** leave `r2` empty to store uploads on local disk, or fill `bucket`, `accountId`, `publicBaseUrl` and enter the two keys through the secret fields to use R2 for this site.
4. **Assign users:** Users → open a user → add a row to `tenants` with the site. Non-super-admin users see nothing until they have at least one row.
5. **Configure the site:** theme and branding, homepage, contact/footer, `pageGroup`, `seoTitles`, `knowledgeGraph`, integrations. Create the pages referenced by `pageGroup` (for example an About page for key `ABOUT`).
6. **Content:** create menus, taxonomies, authors, pages and posts; each is stamped with the selected site.
7. **Point the frontend** at the CMS URL with this site's `siteKey`, and implement `POST /api/cms/revalidate` on the site's domain so published changes refresh the cache.

No CMS restart or redeploy is needed. To bring an existing WordPress site into a new CMS site, see [wordpress-migration/README.md](wordpress-migration/README.md).

## Shortcodes per site

Shortcodes (`shortcodes` collection) are reusable Markdown snippets owned by one site. A document expands only the shortcodes of **its own** site: the lookup is `name in <names> AND tenant = <document's site>` (`src/lib/shortcodes/expand-shortcodes.ts`), so two sites can both define `pricing-note` with different content without colliding (the `name` is unique per site among non-trashed rows).

- Syntax in Markdown fields: `[sc name="pricing-note" /]` or `[sc name="pricing-note"][/sc]`.
- Expansion happens when the REST `afterRead` hook renders `contentMd` to HTML (posts, pages, products, landings, taxonomies, FAQ answers, the `env-page` endpoint); the stored Markdown keeps the tag.
- The snippet is resolved in the request's locale, may itself contain shortcodes up to depth 3, and unknown names, cycles and over-deep nesting render as nothing.
- Saving or deleting a shortcode revalidates the frontend of that site.
- Shortcodes are publicly readable (anonymous), so do not store private data in them.

## Isolation: what is advisory and what is enforced

| Mechanism | Role |
| --- | --- |
| Admin list filter and site selector from the plugin | Advisory. Keeps the admin UI focused on one site. |
| Repo access predicates `tenantScopedRead` / `tenantScopedWrite` / `tenantScopedVersionsRead` (`src/access/tenant-scoped.ts`) and the `media` / `payload-folders` rules | **The real boundary.** Explicit `where` constraints on every operation. |
| Plugin-wrapped access (pinned plugin 3.90.2) | Additional membership constraint for non-super-admin users on listed collections, `sites` and `users`. Defence in depth only. |
| Anonymous reads | **Not** scoped to a site. The frontend must add `where[tenant][equals]=<id>`. |

If you add a site-scoped collection, add it to the plugin's `collections` map in `src/payload.config.ts` **and** give it the repo predicates. More in [roles-and-permissions.md](roles-and-permissions.md#plugin-filter-versus-the-real-boundary).

## Per-site state to remember

| Concern | Per site? |
| --- | --- |
| Content, taxonomies, menus, FAQs, shortcodes, redirects, comments, authors | Yes (`tenant`) |
| Media files and folders | Yes (`tenant` on media and `payload-folders`; storage backend per site) |
| Users | Shared; access via `tenants[]` |
| Roles | Global (a user has one role across all of their sites) |
| Locales | Global (`vi`, `en`); `defaultLanguage` is per site |
| Environment variables (database, secret, jobs, AI keys, reCAPTCHA) | Global to the installation |
