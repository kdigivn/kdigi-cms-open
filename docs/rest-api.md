# REST API

The public API contract for frontends: how to read content for one site over REST (and GraphQL), what shape it comes back in, and which write-style endpoints a public website may call.

KDIGI CMS is built on Payload, so the generic Payload REST conventions apply (`where`, `limit`, `page`, `sort`, `depth`, `select`, `locale`). This page documents what is specific to this project. Implementation lives in `src/collections/*`, `src/access/*`, `src/fields/markdown-html-field.ts` and `src/endpoints/*`; the architecture is in [architecture.md](architecture.md).

All examples use `https://cms.example.com` for the CMS and `example-site` for a site key.

## Ground rules

- **Read anonymously.** Frontends must call the API with **no cookie and no `Authorization` header**. Anonymous reads are filtered to public content. An authenticated request (admin session, or a user API key — `users` has `useAPIKey: true`) switches to tenant-scoped access, which returns **drafts and scheduled content** for the sites that user belongs to.
- **REST is the contract.** Markdown→HTML conversion, shortcode expansion, the menu tree projection and the OG-image fallback only run for REST requests. GraphQL and the Local API return the raw stored shape ([GraphQL](#graphql)).
- **Filter by site yourself.** Public read predicates do not restrict by site; one CMS serves many sites ([multi-site.md](multi-site.md)). Always add a `tenant` filter.
- Responses are Payload's standard paginated list: `docs`, `totalDocs`, `limit`, `page`, `totalPages`, `hasNextPage`, `hasPrevPage`, `nextPage`, `prevPage`, `pagingCounter`.

## Selecting a site

Each site is a `sites` document with a unique `siteKey` and a `domain`. The content collections reference it through a relationship field named `tenant` (the Sites collection is the tenant boundary), whose value is the site's numeric `id`.

1. Resolve the site once and cache it:

```bash
curl -s 'https://cms.example.com/api/sites?where[siteKey][equals]=example-site&depth=1&limit=1'
```

2. Filter every content query by that `id`:

```bash
curl -s 'https://cms.example.com/api/posts?where[tenant][equals]=1&sort=-publishedAt&limit=10&depth=1'
```

`sites` is publicly readable; secret leaf fields (`r2.accessKeyId`, `r2.secretAccessKey`) have `access.read: false` and never appear in REST or GraphQL. Public settings such as branding, contact, footer, `seoDefaults`, `knowledgeGraph`, `seoTitles`, `breadcrumbs`, `pageGroup` and `defaultLanguage` are readable — see [collections.md](collections.md) for the field list.

## What anonymous callers can read

| Collection | Anonymous read | Notes |
| --- | --- | --- |
| `pages`, `posts`, `products`, `landings` | `status = published`, `publishedAt` empty or `<= now`, **not trashed** | Scheduled posts go live automatically when `publishedAt` passes. `?trash=true` does not widen the result: `deletedAt` is part of the access predicate (`src/access/published-and-live.ts`). Do not send `trash` |
| `taxonomies` | all documents | No status/trash. Filter by `type` (`category`, `product-category`, `tag`, `custom`) |
| `authors` | all documents | `email` is never returned |
| `menus` | all documents | Shape is projected, see [Menus](#menus) |
| `faqs`, `shortcodes` | all non-trashed documents | |
| `redirects` | all documents (including disabled) | Filter `where[isEnabled][equals]=true` |
| `comments` | `status = approved` only | Create through [`/api/comments/create`](#comments) |
| `media` | all documents | |
| `sites` | all documents | Secrets hidden, see above |
| `rating-events`, `users` | none | |

Version history (`/api/<collection>/versions`) requires login and is tenant-scoped; anonymous callers get **403**. Frontends must not call it — snapshots contain internal SEO fields.

## Querying

```bash
# list, newest first, one site
curl -s 'https://cms.example.com/api/posts?where[tenant][equals]=1&sort=-publishedAt&limit=12&page=1&depth=1'

# one document by slug (slug is unique per site, not globally)
curl -s 'https://cms.example.com/api/pages?where[tenant][equals]=1&where[slug][equals]=about&limit=1&depth=2'

# only some fields
curl -s 'https://cms.example.com/api/posts?where[tenant][equals]=1&select[title]=true&select[slug]=true&select[publishedAt]=true'
```

```ts
// Node / edge fetch
const res = await fetch(
  'https://cms.example.com/api/posts?' +
    new URLSearchParams({
      'where[tenant][equals]': '1',
      'where[slug][equals]': 'hello-world',
      limit: '1',
      depth: '2',
      locale: 'en',
    }),
)
const { docs } = await res.json()
const post = docs[0]
```

Slugs are unique per site among non-trashed documents (partial unique index on `deletedAt IS NULL`), so always combine a `slug` filter with the `tenant` filter.

### `depth`

`depth` controls how far relationships are populated (`featuredImage`, `categories`, `author`, `seo.openGraph.image`, …). `depth=0` returns bare ids; `depth=1` populates one level (enough for media and taxonomies); Payload's REST default is 2. For listings use `depth=1` or `select` to keep payloads small. The OG-image fallback needs no extra depth: it resolves ids itself.

### Locale and fallback

Content locales are `vi` (default) and `en`, with fallback enabled in `payload.config.ts`.

| Query | Result |
| --- | --- |
| *(none)* | `vi` |
| `locale=en` | `en`; a field with no `en` value falls back to `vi` |
| `locale=en&fallback-locale=none` | `en` only; missing values come back empty |
| `locale=all` | every locale as `{ vi, en }` objects |

Menu item labels also follow `locale`; see [Menus](#menus).

## Content shape: Markdown → HTML

Editors write Markdown in the Milkdown editor ([content-markdown.md](content-markdown.md)). The API gives frontends ready-to-render HTML **at the original field key**:

| Collection | Source field (Markdown) | Field you read (HTML) |
| --- | --- | --- |
| `posts`, `pages`, `products`, `taxonomies`, `shortcodes` | `contentMd` | `content` |
| `products` | `noticeMd` | `notice` |
| `landings` (blocks of `blockType: 'content'` in `layout[]`) | `bodyMd` | `body` |
| `faqs` (`items[].answer`) | the stored answer (Markdown) | the same key, rendered to HTML on REST |

Rules (`src/fields/markdown-html-field.ts`):

1. If `*Md` has text, it wins: shortcodes are expanded, the Markdown is rendered to sanitised HTML, and `<img>` tags get `width`/`height` from the site's media records when known.
2. If `*Md` is the empty string, the field is `null` — the legacy rich-text value is **not** resurrected.
3. If `*Md` is `null`/absent (document never saved since the Markdown migration), the legacy Lexical value is converted to HTML.
4. The `*Md` source field is also present in the response; do not render it directly.

`taxonomies.description` is plain text. Long descriptions with headings or images belong in `contentMd`/`content`.

### Shortcodes

A shortcode is a reusable Markdown snippet in the `shortcodes` collection, referenced from Markdown as `[sc name="my-snippet"/]` (or `[sc name="my-snippet"][/sc]`). Expansion happens on the REST read, before Markdown rendering:

- Looked up by `name` **within the document's own site**, in the request locale.
- Nested expansion up to **3 levels**. A name that is not found, loops back on itself or exceeds the depth is replaced by nothing.
- If the document has no site or the tag does not match the syntax, the text is left as is.

## SEO fields

Every `pages`, `posts`, `products`, `landings` and `taxonomies` document carries a `seo` group. The shape is a stable contract; details and semantics are in [seo.md](seo.md).

| Path | Notes |
| --- | --- |
| `seo.title`, `seo.description` | Often **empty by design**: the CMS stores what the editor typed and the frontend fills the rest from the site's templates (`Sites.seoTitles`) at render time |
| `seo.focusKeywords[]`, `seo.robots[]`, `seo.canonicalOverride`, `seo.breadcrumbTitle` | |
| `seo.breadcrumbs[]` | `{ url, text, isHidden }`; auto-generated on save when empty. Skip entries with `isHidden: true` |
| `seo.openGraph.{title,description,image,imageAlt,siteName,url,type,locale}` | `image` is filled at read time: own OG image → `featuredImage` → `Sites.seoDefaults.ogImage` |
| `seo.openGraph.twitterMeta.{useFacebookData,card,title,description,image}` | Nested inside `openGraph` |
| `seo.articleMeta.{publishedTime,modifiedTime}`, `seo.updatedTime` | |
| `seo.jsonLd.raw` | A complete `<script type="application/ld+json">…</script>` element containing one schema.org `@graph`, to be injected verbatim |

```tsx
const jsonLd = post.seo?.jsonLd?.raw // already includes the <script> tag
// <div dangerouslySetInnerHTML={{ __html: jsonLd ?? '' }} />  (or inject into <head> as-is)
```

Inside the element every `<` of the JSON payload is escaped as `\u003c`, so a `</script>` inside a title cannot break out of the tag. The value is empty until the document has been saved at least once with a resolvable site.

## Menus

`menus` documents are one per `location` per site. Locations: `PRIMARY`, `SECONDARY_MENU`, `MOBILE_MENU`, `FOOTER_MENU`, `LOGGEDIN_ACCOUNT_MENU`.

```bash
curl -s 'https://cms.example.com/api/menus?where[tenant][equals]=1&where[location][equals]=PRIMARY&locale=vi&limit=1'
```

Storage is a canonical `tree` field, but REST **never returns `tree`**: it returns `items`, projected from the tree for the requested locale (`src/lib/menu-tree-to-rest.ts`). Each item:

```json
{
  "id": "6f1c…",
  "label": "Services",
  "url": "/services",
  "path": "/services",
  "uri": "/services",
  "order": 0,
  "parentId": null,
  "children": [ { "id": "…", "label": "Web design", "url": "/services/web", "path": "/services/web", "uri": "/services/web", "order": 0, "parentId": "6f1c…", "children": [], "childItems": { "nodes": [] } } ],
  "childItems": { "nodes": [ /* same objects as children */ ] }
}
```

- `url`, `path` and `uri` carry the same value; `children` and `childItems.nodes` carry the same array. Read whichever suits your frontend.
- `label`: requested locale → the other locale → the node id (never empty).
- Nesting is capped at 10 levels. An empty or corrupt tree yields the legacy stored `items` (usually `[]`) instead of an error.

## Comments

Reading: `GET /api/comments?where[tenant][equals]=1&where[post][equals]=42&sort=createdAt` returns approved comments only; `authorEmail` is never returned. Posts and products expose `commentCount` (approved comments, maintained by the CMS).

Creating — do **not** `POST /api/comments`; use the dedicated public endpoint:

```bash
curl -s -X POST 'https://cms.example.com/api/comments/create' \
  -H 'Content-Type: application/json' \
  -d '{
    "postId": "42",
    "authorName": "Ada",
    "authorEmail": "ada@example.com",
    "content": "Great article!",
    "tenantSiteKey": "example-site",
    "recaptchaToken": "<token from your frontend>"
  }'
```

| Field | Required | Notes |
| --- | --- | --- |
| `postId` **or** `productId` | exactly one | Document id as a string |
| `authorName` | yes | Truncated to 100 characters |
| `content` | yes | HTML-sanitised before storage |
| `tenantSiteKey` | yes | Must equal the parent document's site `siteKey`, otherwise **403** `Tenant mismatch` |
| `authorEmail` | no | Truncated to 200 characters; stored, never exposed |
| `recaptchaToken` | no | See below |

Response `201`: `{ "success": true, "comment": { "id": …, "status": "pending" } }`. Errors: `400` (bad/missing fields or invalid JSON), `403` (site mismatch), `404` (parent not found), `500` (create failed).

Comments are always created `pending` and appear on the API only after a moderator approves them. If `RECAPTCHA_SECRET` is set and a token is sent, the endpoint verifies it with Google (5 s timeout) and **logs** a failing verdict; it never blocks the request. A missing token, a failed verification or a network error only produces a warning. There is no per-IP rate limit on this endpoint, so moderation is the spam control. Setting `MODERATION_WEBHOOK_URL` makes the CMS POST `{ "text": "…" }` to that URL for each new pending comment.

## Ratings

```bash
curl -s -X POST 'https://cms.example.com/api/ratings/submit' \
  -H 'Content-Type: application/json' \
  -H 'X-Client-IP: 203.0.113.7' \
  -d '{ "collection": "posts", "id": "42", "rating": 5, "tenantSiteKey": "example-site" }'
```

| Field | Rules |
| --- | --- |
| `collection` | `posts` or `products` |
| `id` | Document id as an integer-valued string |
| `rating` | Integer 1–5 |
| `tenantSiteKey` | Must match the document's site, else **403** |

Responses: `201 { "success": true, "kkStarRating": { "avg": 4.5, "count": 12 } }` for a new vote, `200` with the unchanged aggregate when this client already voted. The aggregate is also readable on the document as `kkStarRating` (`avg`, `count`, `ratings`).

Deduplication stores only a SHA-256 hash of the client IP in `rating-events`. The IP is taken from `X-Client-IP` (set it from your frontend server so the real browser IP is used), then the **rightmost** `X-Forwarded-For` entry, then `X-Real-IP`. With no resolvable IP, dedup is skipped. No reCAPTCHA is used. Votes do not trigger a frontend revalidate.

## Redirects

```bash
curl -s 'https://cms.example.com/api/redirects?where[tenant][equals]=1&where[isEnabled][equals]=true&limit=1000&depth=0'
```

Fields: `from` (path with leading `/`), `to` (internal path; external URLs are rejected on save), `statusCode` (`'301'` or `'302'`, a string), `isEnabled`. The CMS creates a 301 automatically when a document slug changes (`from` = old public path with trailing slash, `to` = new one). Apply the list in your frontend middleware and cap the number of hops — the CMS only warns about chains.

## Media

`GET /api/media?where[tenant][equals]=1` returns `url`, `alt`, `width`, `height`, `mimeType`, `filesize`, `filename`. Behaviour of `url`:

- When `externalUrl` is set, `url` is replaced by it.
- After an image edit (`version > 1`) the URL gets `?v=<version>` so CDNs refetch.
- Local-disk storage (the default for a site without R2 settings): `url` is absolute, `{PAYLOAD_PUBLIC_SERVER_URL}/api/media/file/<filename>` (plus `?t=<site>` for site-scoped files), served by the CMS itself.
- R2 storage (site has `Sites.r2` settings): `url` is `{Sites.r2.publicBaseUrl}/media/<siteId>/…` when a public base URL is configured.

Details and the cache-bust interaction are in [media-storage.md](media-storage.md). The cloud-storage plugin may add a nullable `_objectKey` field to media documents.

## Page by system key

`GET /api/sites/:siteKey/env-page?key=FRONT_PAGE` returns the `pages` document that the site's `pageGroup` maps to that key (`FRONT_PAGE`, `BLOG`, `PROFILE`, `CONTACT`, `ABOUT`, `SEARCH`, `SIGN_IN`, `SIGN_UP`, `FORGOT_PASSWORD`, `CONFIRM_EMAIL`, `PASSWORD_CHANGE`, `TERM_CONDITION`, `PRIVACY_POLICY`). The page is looked up by slug within that site and read with the caller's access, so anonymous callers get published pages only. `content` is already HTML with shortcodes expanded. Response is `null` for an unknown site, key or page; `400` if `key` is missing.

## Revalidate webhook

When content changes the CMS tells the frontend to refresh its cache. This is a **webhook your frontend must expose**:

```
POST https://{Sites.domain}/api/cms/revalidate
Content-Type: application/json

{ "collection": "posts", "id": "42", "slug": "hello-world" }
```

- Sent by the `revalidateFrontend` job ([architecture.md](architecture.md#jobs)) after a save or delete of `pages`, `posts`, `products`, `landings`, `taxonomies`, `faqs`, `shortcodes`, `menus`, `authors`; after a site settings change; and when a comment on a post becomes (or stops being) approved. A slug rename sends a second request for the old slug. Collections without a slug (`menus`, `faqs`) send the document id as `slug`; treat those as "revalidate the whole site".
- The URL is always `https://` plus the site's `domain` field. A site with no `domain` triggers nothing.
- Timeout 5 s. Any non-2xx response or network error fails the job and is retried (3 attempts, exponential backoff).
- **The request is not authenticated.** Make your handler idempotent and cheap, and rate-limit or verify it at your edge if that matters to you.
- Requires `ENABLE_JOBS_AUTORUN=true` on exactly one instance.

Admins can also trigger the same ping from the editor (`POST /api/revalidate-frontend`, logged-in only; body `{ "manual": true }` is sent to the frontend). Outside production it falls back to `http://localhost:3002/api/cms/revalidate` when the site has no domain.

## Admin-only helper: frontend document URL

`GET /api/frontend-doc-url?collection=posts&slug=hello-world&tenantId=1` (logged-in only) returns `{ "url": "https://example.com/hello-world" }` for the editor's "View on site" link. The base URL is `FRONTEND_BASE_URL`, else `https://{Sites.domain}`, else `http://localhost:3002`. Paths are built by `publicPathFor` in `src/lib/frontend-public-path.ts`: `/product/{slug}` for `products`, `/{slug}` for `posts`, `pages` and `landings`. If your frontend uses different routes, change that one function.

## Not part of this contract: `/api/mcp`

`POST /api/mcp` is the Model Context Protocol endpoint for AI agents and the `kcms` CLI. It is an authenticated **write** surface (API key in `Authorization: Bearer …`), not something a public frontend calls, and its tool shapes are documented separately in [ai-integration.md](ai-integration.md).

## GraphQL

`POST /api/graphql` exposes the same collections and access rules. Production disables the playground (`/api/graphql-playground`) and caps query complexity at 500.

```bash
curl -s https://cms.example.com/api/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ Posts(where: { tenant: { equals: 1 } }, limit: 5) { docs { title slug contentMd } } }"}'
```

Because the Markdown, menu and OG-fallback hooks are REST-only, GraphQL returns the **raw** shape:

| Field | GraphQL gives you | REST gives you |
| --- | --- | --- |
| `content`, `notice`, `body` | hidden legacy rich-text JSON | HTML |
| `contentMd`, `noticeMd`, `bodyMd` | Markdown source — render it yourself | Markdown source |
| `menus.tree` | canonical tree JSON | not returned |
| `menus.items` | stored legacy array | projected from the tree |
| `seo.openGraph.image` | stored value only | with featured-image / site-default fallback |

Shortcodes are **not** expanded over GraphQL. Prefer REST for rendering pages.

## Health

`GET /api/health` → `200 {"status":"ok"}`. It does not query the database, so it stays green during restores and migrations.
