# KDIGI CMS frontend contract (digest)

Everything a public website needs from the CMS REST API. Full detail: `{CMS}/llms-full.txt` (served by the CMS you are using, so it matches its version), or `docs/rest-api.md` and `docs/seo.md` in https://github.com/kdigivn/kdigi-cms-open as a fallback.

Placeholders: `{CMS}` = CMS base URL (e.g. `https://cms.example.com`), `{SITE}` = siteKey, `{TENANT}` = numeric site id. `KCMS.md` gives you the real values.

## 1. Request rules

- **Anonymous only.** No `Authorization` header, no cookies, no `credentials: 'include'`. An authenticated read returns drafts and scheduled content.
- **REST, not GraphQL.** HTML rendering, shortcode expansion, the menu projection and the OG-image fallback only run on REST.
- **Always** `where[tenant][equals]={TENANT}`: anonymous reads return every site's public content otherwise.
- Query syntax is Payload's: `where[field][op]=value` (`equals`, `not_equals`, `in`, `like`, `exists`, `less_than_equal`, …), `limit`, `page`, `sort` (`-field` = descending), `depth`, `select[field]=true`, `locale`, `fallback-locale`.
- Build query strings with `URLSearchParams` (bracket keys are fine); never string-concatenate user input.
- Lists return `{ docs, totalDocs, limit, page, totalPages, hasNextPage, hasPrevPage, nextPage, prevPage, pagingCounter }`.

## 2. Recipes

```text
# site (once, cache it): id, domain, defaultLanguage, pageGroup, seoTitles, branding, …
GET {CMS}/api/sites?where[siteKey][equals]={SITE}&limit=1&depth=1

# post listing (cards)
GET {CMS}/api/posts?where[tenant][equals]={TENANT}&sort=-publishedAt&limit=12&page=1&depth=1
    &select[title]=true&select[slug]=true&select[excerpt]=true&select[featuredImage]=true&select[publishedAt]=true&select[categories]=true

# one document by slug (slug is unique per site only → keep the tenant filter)
GET {CMS}/api/posts?where[tenant][equals]={TENANT}&where[slug][equals]={slug}&limit=1&depth=2
# same for pages, products; landings add: &where[isDisabled][not_equals]=true

# taxonomy archive
GET {CMS}/api/taxonomies?where[tenant][equals]={TENANT}&where[type][equals]=category&where[slug][equals]={slug}&limit=1
GET {CMS}/api/posts?where[tenant][equals]={TENANT}&where[categories][in]={taxonomyId}&sort=-publishedAt&depth=1

# author page
GET {CMS}/api/authors?where[tenant][equals]={TENANT}&where[slug][equals]={slug}&limit=1
GET {CMS}/api/posts?where[tenant][equals]={TENANT}&where[author][equals]={authorId}&sort=-publishedAt&depth=1

# search (title contains, case-insensitive)
GET {CMS}/api/posts?where[tenant][equals]={TENANT}&where[title][like]={q}&limit=10&depth=1

# menu for one location
GET {CMS}/api/menus?where[tenant][equals]={TENANT}&where[location][equals]=PRIMARY&limit=1&locale={locale}

# system page (home, about, contact, …) mapped in Sites.pageGroup
GET {CMS}/api/sites/{SITE}/env-page?key=FRONT_PAGE&locale={locale}

# redirects (all enabled rules for the site)
GET {CMS}/api/redirects?where[tenant][equals]={TENANT}&where[isEnabled][equals]=true&limit=1000&depth=0

# FAQ groups
GET {CMS}/api/faqs?where[tenant][equals]={TENANT}&where[group][equals]={group}&limit=1

# approved comments of a post
GET {CMS}/api/comments?where[tenant][equals]={TENANT}&where[post][equals]={postId}&sort=createdAt
```

Anonymous visibility: `pages`, `posts`, `products`, `landings` → only `status=published`, `publishedAt` empty or past, not trashed (scheduled posts appear by themselves when the time passes — do not cache "not found" forever). `landings.isDisabled` is **not** enforced by the CMS: filter it yourself. `taxonomies`, `authors`, `menus`, `faqs`, `shortcodes`, `media`, `sites` → all documents. `redirects` → all, including disabled: filter `isEnabled`. `comments` → approved only. Never send `trash=true`; never call `/api/<collection>/versions` (403 anonymously).

## 3. Collections and fields you render

| Collection | Key fields |
| --- | --- |
| `posts` | `id`, `title`, `slug`, `type` (`blog`/`news`/`guide`), `excerpt`, `content` (HTML), `featuredImage` (media), `categories[]` (taxonomies), `author` (authors), `publishedAt`, `modified`, `commentCount`, `kkStarRating {avg,count}`, `seo` |
| `pages` | `title`, `slug`, `pageType` (`default`/`blog`/`landing`), `featuredImage`, `content` (HTML), `seo` |
| `products` | `title`, `slug`, `excerpt`, `content` (HTML), `notice` (HTML), `featuredImage`, `hero.slider[].image`, `hero.slideVideo`, `prices[]`, `categories[]`, `author`, `commentCount`, `kkStarRating`, `seo` |
| `landings` | `title`, `slug`, `excerpt`, `featuredImage`, `template` (`default`/`wide`/`fullscreen`), `layout[]` blocks by `blockType`: `hero` (`title`, `subtitle`, `backgroundImage`, `ctaText`, `ctaUrl`), `content` (`body` = HTML), `imageGallery` (`images[].image`), `testimonials` (`items[]`), `cta`, `faq` (`items[] { question, answer }`), `stats`, `pricingTable`, `blogFeed` (`category`, `limit`), `offerCards`, `embed` (`code` = raw HTML/iframe from editors), `divider`; `seo`. Render unknown block types as nothing |
| `taxonomies` | `name`, `slug`, `type` (`category`/`product-category`/`tag`/`custom`), `description` (plain text), `content` (HTML), `parent`, `seo` |
| `authors` | `name`, `slug`, `avatar`, `bio`, `sameAs[].url` (never `email`) |
| `faqs` | `group`, `items[] { question, answer (HTML) }` |
| `media` | `url` (absolute), `alt`, `width`, `height`, `mimeType`, `filename` |

HTML fields (`content`, `notice`, landing `body`, FAQ `answer`) are rendered from Markdown by the CMS, sanitised, shortcodes expanded, `<img>` with `width`/`height`. **Insert them as HTML** (`dangerouslySetInnerHTML`, `set:html`, `{@html}`, `v-html`, `[innerHTML]`). Do not render `contentMd`/`noticeMd`/`bodyMd`, do not run a Markdown parser, do not re-sanitise into plain text. `null` means empty.

`depth`: `0` ids only, `1` populates media/taxonomies/author (enough for listings), REST default `2`. With `depth=0` a relationship is a number — type it as `number | Doc`.

## 4. Locales

Locales `vi` (default) and `en`. `Sites.defaultLanguage` says which one the site leads with.

| Query | Result |
| --- | --- |
| none | `vi` |
| `locale=en` | `en`, missing fields fall back to `vi` |
| `locale=en&fallback-locale=none` | `en` only, missing fields empty (use to detect "not translated") |

`slug` is **not** localized: the same slug serves both languages. Typical routing: default language at `/`, the other under a prefix (`/en/{slug}`). Set `<html lang>` to the page locale. Menu labels and `pageGroup` follow `locale` too.

## 5. SEO

Every `pages`/`posts`/`products`/`landings`/`taxonomies` doc has `seo`:

- `seo.title`, `seo.description` are **often empty by design** — resolve at render time:
  - `title = seo.title || template(Sites.seoTitles.<group>.titleTemplate) || doc.title`
  - `description = seo.description || template(descriptionTemplate) || excerpt`
  - groups: `homepage`, `posts`, `pages`, `products`, `landings`, `taxonomies`; separator `Sites.seoTitles.separator` (default `|`).
  - variables: `%title%`, `%sitename%` (`knowledgeGraph.name` → `manifest.name` → `domain`), `%sep%`, `%excerpt%` (HTML stripped), `%category%`, `%focuskw%`, `%date%`, `%modified%`, `%term%`, `%currentyear%`, `%price%`; unknown/empty variables vanish and leftover doubled separators are collapsed. Empty template → defaults `%title% %sep% %sitename%` (`homepage`: `%sitename%`; `taxonomies`: `%term% %sep% %sitename%`), description `%excerpt%`.
- Open Graph: `og:title = seo.openGraph.title || title`, `og:description = seo.openGraph.description || description`, `og:image = seo.openGraph.image.url` (REST already falls back to featured image → site default). Twitter: `seo.openGraph.twitterMeta.{useFacebookData,card,title,description,image}`; when `useFacebookData` is true (default) reuse the OG values for empty Twitter fields.
- `seo.robots[]` (e.g. `['index','follow']`, or `['noindex','follow']`) → `<meta name="robots" content="…">` joined with `,`; empty → omit the tag. `seo.canonicalOverride` is an absolute URL → canonical; empty → your own absolute URL for the page.
- `seo.breadcrumbs[] { url, text, isHidden }` — skip `isHidden`.
- `seo.jsonLd.raw` is a **complete** `<script type="application/ld+json">…</script>` element. Inject it verbatim into `<head>` (or body). Do not wrap it in another `<script>`, do not `JSON.parse`/re-serialise it. Empty until the doc was saved once.
- If `seo.openGraph.image` is still empty (e.g. a page from `env-page`), fall back to `featuredImage`, then `Sites.seoDefaults.ogImage`.

## 6. Site settings (`sites` doc)

Read once per request/build and cache: `id`, `siteKey`, `domain`, `defaultLanguage`, `branding { primaryColor, fontFamily, logo, favicon, notFoundImage }`, `landing { heroTitle, heroNotice1/2, slider[] }`, `featuredPosts`, `featuredProducts`, `homePageHighlight[]`, `contact { rightSide[], headerIcons[] }`, `footer { address[], subfooter, ecosystemLinks[], partners[] }`, `pageGroup[] { key, pageSlug }`, `seoDefaults.ogImage`, `seoTitles`, `knowledgeGraph`, `socialProfiles[]`, `integration { ga4Id, gtmId, clarityId }`, `manifest`. Secrets are never returned.

`pageGroup` keys: `FRONT_PAGE`, `BLOG`, `PROFILE`, `CONTACT`, `ABOUT`, `SEARCH`, `SIGN_IN`, `SIGN_UP`, `FORGOT_PASSWORD`, `CONFIRM_EMAIL`, `PASSWORD_CHANGE`, `TERM_CONDITION`, `PRIVACY_POLICY`. `env-page` returns the mapped published `pages` document itself (no `docs` wrapper) with `content` as HTML, or `null` (unknown key / unpublished) → 404 or fallback UI.

## 7. Menus

One `menus` doc per `location`: `PRIMARY`, `SECONDARY_MENU`, `MOBILE_MENU`, `FOOTER_MENU`, `LOGGEDIN_ACCOUNT_MENU`. REST returns `items[]` (never `tree`):

```json
{ "id": "…", "label": "Services", "url": "/services", "path": "/services", "uri": "/services",
  "order": 0, "parentId": null, "children": [ /* same shape, nested up to 10 levels */ ],
  "childItems": { "nodes": [ /* same array as children */ ] } }
```

`url` may be relative (internal) or absolute (external, open normally). Labels follow `locale`. A missing location → no menu doc → render nothing.

## 8. Routes

`publicPathFor` in the CMS (`src/lib/frontend-public-path.ts`) decides the links the CMS generates ("View on site", internal-link suggester, `@` link picker in the editor, breadcrumbs, JSON-LD URLs, auto-redirects):

| Collection | Public path |
| --- | --- |
| `posts`, `pages`, `landings` | `/{slug}` |
| `products` | `/product/{slug}` |

Recommended: one catch-all route `/{slug}` that tries **landing → page → post** (first published match wins, else 404) and `/product/{slug}`. Taxonomy archives (`/category/{slug}`, `/tag/{slug}`) are not generated by the CMS — pick any path. Editors write internal links in content as `/slug`. If you choose different routes, tell the user to change `publicPathFor` on the CMS (and `src/fields/slug-url-prefix-map.ts`), otherwise CMS-generated links break.

Trailing slash: CMS-generated URLs in breadcrumbs/JSON-LD and auto-redirect `from` paths end with `/`; serve both `/slug` and `/slug/` (normalise one to the other).

## 9. Redirects

Rules: `from` (path starting `/`, auto-created ones end with `/`), `to` (internal path), `statusCode` (`'301'`/`'302'` as string), `isEnabled`. Apply them in middleware/edge before rendering 404: normalise trailing slash on both sides, cap hops (e.g. 5) to break chains/loops, cache the list and refresh it on the webhook.

## 10. Media

`media.url` is absolute and ready to use: CMS-served `{CMS}/api/media/file/…` (local disk) or the site's R2/CDN public URL. `?v=<n>` cache-busters may be appended — keep them. Allow the CMS host and any R2/CDN host in your image optimiser config (e.g. Next `images.remotePatterns`). Use `alt`, `width`, `height`.

## 11. Public write endpoints

```text
POST {CMS}/api/comments/create      (never POST /api/comments)
{ "postId": "42" | "productId": "7", "authorName": "Ada", "authorEmail": "ada@example.com",
  "content": "…", "tenantSiteKey": "{SITE}", "recaptchaToken": "<optional>" }
→ 201 { success: true, comment: { id, status: "pending" } }   400 | 403 tenant mismatch | 404

POST {CMS}/api/ratings/submit
{ "collection": "posts" | "products", "id": "42", "rating": 1-5, "tenantSiteKey": "{SITE}" }
header X-Client-IP: <browser IP> when called from your server
→ 201 { success: true, kkStarRating: { avg, count } } (new vote) | 200 (already voted)
```

New comments are `pending` until a moderator approves them: show "awaiting moderation", not the comment.

## 12. Revalidate webhook (the frontend exposes it)

```text
POST https://{Sites.domain}/api/cms/revalidate
Content-Type: application/json
{ "collection": "posts", "id": "42", "slug": "hello-world" }     # or { "manual": true }
```

- Sent after saves/deletes of `pages`, `posts`, `products`, `landings`, `taxonomies`, `faqs`, `shortcodes`, `menus`, `authors`, site settings, and comment approval. A slug rename sends a second call for the old slug.
- `menus`, `faqs`, `shortcodes`, `authors`, site settings, `manual: true`, a missing `slug`, or anything you cannot map → revalidate the whole site. Otherwise revalidate `publicPathFor(collection, slug)` plus listings/home.
- Respond 2xx within 5 s (non-2xx is retried 3×). Idempotent, cheap, no CMS fetch inside the handler. Unauthenticated: rate-limit at the edge if needed.
- The CMS only calls `https://{domain}`; a site with no `domain` gets no calls. Production needs `ENABLE_JOBS_AUTORUN=true` on one CMS instance.

## 13. Never

- `/api/mcp`, API keys, `users` endpoints, `/versions`, `trash=true`, GraphQL for rendered pages, `contentMd` rendering.
