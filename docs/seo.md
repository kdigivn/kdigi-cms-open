# SEO

How KDIGI CMS handles SEO: the placeholder-template model, the `seo` field contract, JSON-LD generation, Open Graph fallbacks, the audit and internal-link tools, optional AI suggestions, and slug/redirect handling.

The model is borrowed from Rank Math: **titles and descriptions are templates resolved at render time, not stored**. The CMS stores what editors type, generates breadcrumbs and a JSON-LD graph on save, and leaves the rest to the frontend. The API shape is in [rest-api.md](rest-api.md#seo-fields); the hook plumbing is in [architecture.md](architecture.md).

## Three tiers

| Tier | Where | Who writes it |
| --- | --- | --- |
| 1. Site templates | `Sites.seoTitles.<subgroup>.{titleTemplate, descriptionTemplate}` and `Sites.seoTitles.separator` | Admin, once per site |
| 2. Document override | `seo.title` / `seo.description` on each document | Editor. **Empty = use the template** |
| 3. Resolution | Frontend, at render time | Your frontend, using the same rules |

The CMS deliberately does **not** persist resolved values. `makeApplySeoTemplatesHook` (`src/hooks/apply-seo-templates.ts`) runs on every save of `pages`, `posts`, `products`, `landings` and `taxonomies`, but the only thing it writes is `seo.breadcrumbs`. Consequences:

- An empty `seo.title` in the API is correct, not missing data.
- Changing a template in `Sites.seoTitles` affects every document that has no override immediately — no re-save, no re-import.
- Do not write scripts that "fill `seo.title` for every post": they freeze values that should follow the template.

The site-form help text mentions that templates apply "on save"; the code does not do that — resolution is the frontend's job.

### Resolving on the frontend

The effective values follow this cascade (reference implementation: `resolveSeoFields` in `src/hooks/apply-seo-templates.ts`, `resolveSeoTemplate` in `src/lib/seo/resolve-variables.ts`):

```
title              = seo.title           || template(titleTemplate)       || doc title
description        = seo.description     || template(descriptionTemplate) || excerpt
og:title           = seo.openGraph.title || title
og:description     = seo.openGraph.description || description
twitter:title      = seo.openGraph.twitterMeta.title || (useFacebookData ? og:title : '')
twitter:description= seo.openGraph.twitterMeta.description || (useFacebookData ? og:description : '')
```

`useFacebookData` defaults to `true`.

### Templates and variables

`Sites.seoTitles` has a `separator` (one of `|`, `-`, `·`, `»`, `~`, `—`; default `|`) and six subgroups, each with a `titleTemplate` and a `descriptionTemplate` (not localized — they only contain variables, which resolve per locale):

| Subgroup | Default title | Default description | Used for |
| --- | --- | --- | --- |
| `homepage` | `%sitename%` | `%excerpt%` | The front page |
| `posts` | `%title% %sep% %sitename%` | `%excerpt%` | `posts` |
| `pages` | `%title% %sep% %sitename%` | `%excerpt%` | `pages` |
| `products` | `%title% %sep% %sitename%` | `%excerpt%` | `products` |
| `landings` | `%title% %sep% %sitename%` | `%excerpt%` | `landings` |
| `taxonomies` | `%term% %sep% %sitename%` | `%excerpt%` | `taxonomies` |

Variables (case-insensitive; an unknown or empty variable is dropped and the doubled/dangling separators it leaves are cleaned up):

| Variable | Value |
| --- | --- |
| `%title%` | Document title |
| `%sitename%` | `Sites.knowledgeGraph.name` → `Sites.manifest.name` → `Sites.domain` |
| `%sep%` | The site's separator |
| `%excerpt%` | Excerpt, HTML stripped |
| `%category%` | First category title |
| `%focuskw%` | First focus keyword |
| `%pt_single%`, `%pt_plural%` | Post-type labels |
| `%date%`, `%modified%` | `YYYY-MM-DD` of publish / modify date |
| `%term%` | Taxonomy term name |
| `%currentyear%` | Current year (supplied by the caller) |
| `%price%` | Document price, when the caller supplies it |

## The `seo` field group

Defined once in `src/fields/seo-field-group.ts` and reused by `pages`, `posts`, `products`, `landings` and `taxonomies`. **Field paths are a contract with frontends: renaming one, or changing the shape of `jsonLd`, breaks every consumer.**

| Path | Type | Notes |
| --- | --- | --- |
| `seo.title` | text, localized | Empty → template |
| `seo.description` | textarea, localized | Empty → template |
| `seo.focusKeywords` | text, many | First one drives the score |
| `seo.openGraph.title`, `.description`, `.imageAlt` | localized | |
| `seo.openGraph.image` | upload → `media` | Filled at read time when empty, see [OG image cascade](#og-image-cascade) |
| `seo.openGraph.siteName`, `.url`, `.type`, `.locale` | text, hidden | `type` defaults to `website` |
| `seo.openGraph.twitterMeta.{useFacebookData, card, title, description, image}` | group | **Nested inside `openGraph`**; `card` is `summary` or `summary_large_image` (default) |
| `seo.breadcrumbs[]` | array `{ url, text (localized), isHidden }` | Hidden in the admin UI but present in REST. Auto-generated, see below |
| `seo.breadcrumbTitle` | text, localized, hidden | |
| `seo.canonicalOverride` | text | Also used as the URL in the JSON-LD `WebPage` |
| `seo.robots` | select, many | Default `['index','follow']`; also allows `max-snippet:-1`, `max-image-preview:large`, `max-video-preview:-1` |
| `seo.articleMeta.{publishedTime, modifiedTime}` | dates, hidden | **Top-level sibling** of `openGraph`; written by the JSON-LD hook |
| `seo.updatedTime` | date, hidden | Written by the JSON-LD hook |
| `seo.jsonLd.raw` | textarea, read-only, hidden | An object with one string; see below |
| `seo.aiTitleBtn`, `aiDescBtn`, `openGraph.aiOgAltBtn`, `aiFaqBtn` | ui | Buttons calling [`/api/seo/ai-generate`](#ai-seo-generation-optional) |
| `seo.internalLinkSuggester`, `seo.seoAnalysis` | ui | Client-side panels. **The SEO score is never stored** |

## Breadcrumbs

`seo.breadcrumbs` is generated on save only when it is empty (a blank-only guard: editor-entered or imported breadcrumbs are never overwritten). Documents mapped as the front page (`Sites.pageGroup` key `FRONT_PAGE`) and documents without a slug are skipped.

The trail is `[site name] + [primary taxonomy term and its parent chain] + [current document]`, all with `isHidden: false`. The first crumb's URL is `https://{Sites.domain}` and its text is the site name (falling back to "Trang chủ"). The leaf URL is `https://{domain}/{slug}/`, `https://{domain}/product/{slug}/` for products, or `seo.canonicalOverride` when set. Which taxonomy supplies the middle crumb is set in `Sites.breadcrumbs`:

| Field | Default | Options |
| --- | --- | --- |
| `primaryTaxonomyProduct` | `product-category` | `none`, `product-category`, `category`, `tag` |
| `primaryTaxonomyPost` | `category` | same |

The hook looks in the document's `categories` for a term whose `type` matches, then walks `parent`. Only `posts` and `products` get a middle crumb; `pages`, `landings` and taxonomy terms are flat.

## JSON-LD

`makeGenerateJsonLdHook(docType)` (`src/hooks/generate-jsonld.ts`) runs as `afterChange` on `pages`, `posts`, `products`, `landings` and `taxonomies`. It builds one schema.org `@graph` and stores it in `seo.jsonLd.raw`.

What it persists: `seo.jsonLd.raw`, `seo.articleMeta.{publishedTime, modifiedTime}` and `seo.updatedTime`, in a single parameterised `UPDATE` of those four scalar columns (`persistJsonLdRaw`). It does not call `payload.update`, so there is no second version row and the other locale is untouched ([architecture.md](architecture.md#versioned-collections-must-not-re-save-their-own-document)).

`seo.jsonLd.raw` is the full `<script type="application/ld+json">…</script>` element (`serializeJsonLdScript` in `src/lib/jsonld/serialize.ts`) that the frontend injects verbatim. Every `<` inside the payload is escaped as `\u003c`, so a `</script>` in a title cannot break out. Both the hook and any bulk regeneration must serialise through that module.

### Graph contents

All nodes live in a single `@graph` with stable `@id`s (`{siteUrl}/#organization`, `{siteUrl}/#website`, `{pageUrl}#webpage`, `{pageUrl}#breadcrumb`). `siteUrl` is `https://{Sites.domain}`; `pageUrl` is `siteUrl/slug/` or `seo.canonicalOverride`.

| Document | Nodes (assembler in `src/lib/jsonld/graph-assembler.ts`) |
| --- | --- |
| `posts` | `BlogPosting`, `Person` (author), `WebPage`, `ImageObject`, `BreadcrumbList`, `WebSite`, `Organization`, `Place`. FAQs from the document's `faqs` are nested in the `BlogPosting` as `subjectOf` |
| `pages` | `WebPage` (`ContactPage` for slugs `lien-he`, `contact`, `contact-us`; `AboutPage` for `gioi-thieu`, `about`, `about-us`), `ImageObject`, `BreadcrumbList`, standalone `FAQPage`, site nodes, plus a `LocalBusiness` per `Sites.knowledgeGraph.additionalOffices[]` |
| `products` | `Product` (with `Offer` and optional `AggregateRating`), `ItemPage`, `ImageObject`, `BreadcrumbList`, `FAQPage`, site nodes. URL is `/product/{slug}/` |
| `landings` | Same assembler as products |
| `taxonomies` | `CollectionPage`, `ImageObject`, `BreadcrumbList`, site nodes |

Site nodes come from `Sites` (`src/lib/jsonld/site-config-loader.ts`), explicit fields first, legacy heuristics (`contact`, `footer`, `branding`) only when the explicit ones are blank:

| JSON-LD | Source |
| --- | --- |
| `Organization` name / legal name / description | `knowledgeGraph.name`, `.legalName`, `.description` (name falls back to `manifest.name`, then the domain) |
| Extra `@type` before `Organization` | `knowledgeGraph.businessType`: `Organization`, `LocalBusiness`, `ProfessionalService`, `Store`, `Restaurant` |
| Logo | `knowledgeGraph.logo`, else `branding.logo` |
| `telephone` | `knowledgeGraph.telephoneE164` (normalised on save by `normalizeTelephoneE164`), else `telephone` |
| Address, geo, opening hours | `knowledgeGraph.address`, `.geo`, `.openingHours[]` (emitted as `OpeningHoursSpecification`) |
| `foundingDate`, `founders`, `areaServed`, `knowsLanguage`, `contactPoint`, `priceRange`, `email` | same-named `knowledgeGraph` fields |
| `sameAs` | `Sites.socialProfiles[].url`, plus `knowledgeGraph.wikidataId` (as a Wikidata URL), `wikipediaUrl`, `youtubeChannelUrl`, `tiktokUrl` |
| `WebSite` `SearchAction` | `knowledgeGraph.searchActionUrl` |
| Aggregate-rating threshold | `knowledgeGraph.minReviewsForAggregate` (default 10) |

If the site cannot be loaded the hook skips persisting rather than wiping an existing graph.

### URL segments

Public paths used in the graph, in breadcrumbs and in redirects come from `src/fields/slug-url-prefix-map.ts`: `products` live under `/product/`, taxonomy type `product-category` under `/product-category/`, everything else (`posts`, `pages`, `landings`, taxonomy types `category`, `tag`, `custom`) at the site root. That map is a display/URL-building convention only — edit its tables if your frontend routes differently, and keep `publicPathFor` in `src/lib/frontend-public-path.ts` in step.

### Product details

- `offers` is emitted only when `prices[0].currentPrice > 0`; a missing or zero price logs a warning and omits the offer (no "free" offers). `priceValidUntil` comes from `prices[0].validUntil`; the seller is `{siteUrl}/#organization`.
- `aggregateRating` is emitted only when the rating is not perfect (`avg < 5`) **and** either `aggregateRatingOverride` is on, or `count >= minReviewsForAggregate` **and** at least one approved local comment exists (`commentCount > 0`). Imported star ratings alone never produce it (`src/lib/jsonld/product.ts`).
- `FAQPage` entries need both a question and an answer; incomplete ones are dropped, and with none left the node is omitted.
- `buildProduct` writes `priceCurrency` from the first price row's `prices[].currency` select (default `VND`).

## OG image cascade

Order: `seo.openGraph.image` → the document's `featuredImage` → `Sites.seoDefaults.ogImage`.

`makeResolveOgImageFallbackHook` (`src/hooks/resolve-og-image-fallback.ts`) applies this as an `afterRead` hook **for REST reads only** and never writes the fallback back, so the value always follows the current featured image and site default. A stored OG image that is merely a stale copy of the site default is replaced by the document's own featured image. Taxonomies have no `featuredImage` and fall back straight to the site default. The JSON-LD hook uses the same order, so `<meta property="og:image">` and the graph agree.

## Slugs and redirects

- `slug` is auto-generated from the title when blank (lower-case, `đ`→`d`, diacritics stripped, non-alphanumerics → `-`). It is **not localized** and unique per site among non-trashed documents; a trashed document keeps its slug, and restoring it onto a slug now taken by another document fails with a bilingual field error (`makeGuardRestoreSlugConflict`).
- Changing the slug of an existing document makes `autoRedirectOnSlugChange` create a `redirects` row (`301`, `isEnabled: true`) from the old public path to the new one: `/{slug}/` for posts, pages and landings; `/{segment}/{slug}/` when the collection has a URL segment (`products` → `product`, from `src/fields/slug-url-prefix-map.ts`). It skips if a redirect from that path already exists for the site, never blocks the save, and logs failures. Scripts that rename slugs outside the admin must create redirects themselves.
- Redirect rules (`redirects` collection): `from` is normalised to start with `/`, `to` must be an internal path, `from` and `to` cannot be equal; chains are only warned about. Your frontend applies them ([rest-api.md](rest-api.md#redirects)).
- The same save also queues a revalidate job for the **old** slug so its cached page is refreshed.

## SEO audit

`GET /api/seo/audit` (logged-in) scans `posts`, `pages`, `products` and `landings` of one site and returns the deficient documents, worst first.

| Param | Notes |
| --- | --- |
| `tenantId` | Optional; honoured only for a super-admin or a member of that site |
| `limit` | Documents inspected per collection; default 50, max 200 |

Site resolution: `tenantId` param → `payload-tenant` cookie (the admin's selected site, validated against membership) → the user's first site; none → `400`. Response: `{ tenantId, total, deficient: [{ id, collection, title, score, reasons, adminUrl }] }` (`401` when not logged in, `500` on query failure).

A document is deficient when its **stored** `seo.title` or `seo.description` is blank, `seo.robots` contains `noindex`, or its score is below 50. `reasons` can contain `missing-title`, `missing-desc`, `noindex`, `broken-canonical` (a canonical override that does not start with `http`) and `low-score:<n>`. Because titles are normally left blank under the placeholder model, most documents will report `missing-title`/`missing-desc` unless editors set explicit values; read that as "no explicit override", not as "no title on the page".

The same audit powers the dashboard widget (`src/components/admin/seo-audit-widget.tsx`, via `src/lib/seo-audit-core.ts`).

### Score

`computeSeoScore` (`src/lib/seo-score.ts`) returns 0–100 plus a traffic-light checklist: focus keyword set / in title / in description / in slug / in the first 10% of the text / density (1–1.5% is good), title ≤ 60 characters, description ≤ 160, URL ≤ 75 characters, at least one internal Markdown link, and content-length tiers tuned for Vietnamese syllables. It runs in the editor and in the audit; it is not persisted.

## Internal link suggestions

`GET /api/seo/internal-link-suggest` (logged-in) powers the editor's link suggester.

| Param | Notes |
| --- | --- |
| `docId`, `collection` | Required; the current document is excluded |
| `keyword` | Preferred token source |
| `title` | Fallback token source |
| `limit` | Default 5, max 10 |

It tokenises the keyword (or title) — lower-cased, diacritics stripped, tokens of 3+ characters — and scores up to 100 recent documents per collection (`posts`, `pages`, `products`, `landings`) of the caller's site: 2 points per title token match, 1 per slug token match. Results are `{ suggestions: [{ id, collection, title, slug, score, adminUrl, frontendSlug }] }`, with `frontendSlug` built by `publicPathFor` (`/product/{slug}` for products, `/{slug}` otherwise). The site is the validated `payload-tenant` cookie or the user's first site (`400` otherwise), and the query runs with the caller's own access rights.

## AI SEO generation (optional)

`POST /api/seo/ai-generate` (logged-in) returns a suggestion for one SEO field from an OpenAI-compatible chat API. It is optional: with no key configured the admin buttons still render, and the endpoint answers `502 {"error":"AI generation failed. Please try again."}` and logs the configuration error.

| Env var | Meaning |
| --- | --- |
| `DEEPSEEK_API_KEY` | API key. **Required to enable** |
| `DEEPSEEK_MODEL` | Model id. Required, no default — `pnpm verify:deepseek` (`src/scripts/verify-deepseek-model.ts`) checks that a model answers in JSON mode |
| `SEO_AI_RATE_LIMIT` | Calls per user per 60 s, default `20` |

The client uses the `openai` SDK with `baseURL: 'https://api.deepseek.com'` hard-coded in `src/lib/ai/deepseek-client.ts` (timeout 90 s, 3 SDK retries, JSON-object responses with one retry on a parse failure). There is no env var for the base URL; to use another OpenAI-compatible provider, change that file. The key never leaves the server. There is no boot warning for a missing key — the failure only shows up when someone clicks a generate button.

Request body:

| Field | Notes |
| --- | --- |
| `field` | `title`, `description`, `faq` or `alt` |
| `docTitle` | Required |
| `docContent` | Optional plain-text excerpt, truncated to 600 characters |
| `focusKeyword` | Optional |
| `imageContext` | `alt` only |
| `count` | `faq` only: 1–10, default 3 |

Response `200`: `{ "suggestion": "…" }`; for `faq` the suggestion is a JSON-stringified array of `{ question, answer }`. Errors: `401` not logged in, `400` bad `field`/`docTitle`/JSON, `429` rate limit, `502` provider error or malformed answer. Prompts (`src/lib/ai/seo-prompts.ts`) are written in Vietnamese and target 40–65 characters for titles, 100–165 for descriptions and ≤ 125 for alt text.

Rate limiting is a per-process, in-memory rolling window keyed by the logged-in user id (never by anything in the request body); it resets on restart and is not shared between instances. The "Generate FAQ" button is **preview-only**: FAQs live in their own collection and the button cannot write there.

## Stability contract and WordPress-migrated sites

Sites migrated from WordPress often rank on the strength of their existing markup, so the SEO surface is kept stable on purpose: the `seoFieldGroup` field paths, the `seo.jsonLd.raw` format, and the structure rules above (`twitterMeta` inside `openGraph`, `articleMeta` beside it, `breadcrumbs` with `isHidden`). The robots options include Rank Math's `max-*` directives so migrated values carry over verbatim, and the graph includes a `Place` node and per-office `LocalBusiness` nodes like Rank Math output. Treat any change to these as a breaking API change and roll it out together with your frontends. For the migration pipeline itself see [wordpress-migration/README.md](wordpress-migration/README.md).
