---
name: kcms-frontend
description: Use when building, redesigning or debugging a public website/frontend (Next.js, Astro, SvelteKit, Nuxt, React, Angular, …) that reads content from KDIGI CMS over its REST API. Not for writing or publishing CMS content (that is the kcms skill).
---

# KDIGI CMS frontend (kcms-frontend)

KDIGI CMS is headless: it has no public site. You build one. The site reads the CMS REST API **anonymously**; the CMS calls back a webhook on the site when content changes. Getting the contract wrong leaks drafts, mixes sites, or breaks the editor's "View on site" links — follow these rules exactly.

## 1. Context first

- Read `KCMS.md` in the repo root. It holds this site's CMS URL, `siteKey`, tenant id, locales, menus, page mapping, sample documents and routes.
- Missing? Ask the user to run `kcms frontend context --url <cms url> --site <siteKey>` (no API key needed). Without the CLI: `GET {CMS}/api/sites?where[siteKey][equals]={siteKey}&limit=1&depth=1` → `docs[0].id` is the tenant id.
- Contract details: [references/contract.md](references/contract.md). Full docs: `{CMS}/llms-full.txt`.
- Put the CMS URL and siteKey in env vars (e.g. `CMS_URL`, `CMS_SITE_KEY`); resolve the tenant id at runtime/build time and cache it, or take it from `KCMS.md` as a fallback.

## 2. Hard rules

1. **Anonymous requests only.** No `Authorization` header, no cookies, no `credentials: 'include'`. Any authenticated read returns drafts and scheduled posts.
2. **No API key in the site.** Not in code, not in `.env*` the site reads, not in client bundles. The site never needs one.
3. **Tenant filter on every content query**: `where[tenant][equals]={tenantId}` on `posts`, `pages`, `products`, `landings`, `taxonomies`, `authors`, `menus`, `faqs`, `redirects`, `comments`, `media`. Slugs are unique per site only.
4. **REST, not GraphQL.** Only REST returns rendered HTML, expanded shortcodes, the menu tree and the OG-image fallback.
5. **Render HTML fields as HTML** at their original key (`content`, `notice`, landing block `body`, FAQ `answer`). They are already sanitised. Never render `contentMd`/`*Md`, never run a Markdown parser on them.
6. **Small payloads**: listings `depth=1` + `select[...]=true`; detail pages `depth=2`.
7. **Landings**: also filter `where[isDisabled][not_equals]=true` (the CMS does not hide disabled landings).
8. **Locales** `vi` (default) and `en`: `?locale=en` (missing fields fall back to `vi`); `&fallback-locale=none` to detect untranslated. Slugs are shared across locales. Set `<html lang>`.
9. **SEO** from `seo.*`: empty `seo.title`/`seo.description` is normal — resolve with `Sites.seoTitles` templates, then title/excerpt. Inject `seo.jsonLd.raw` **verbatim** (it is already a full `<script type="application/ld+json">` element; do not wrap or re-serialise). Canonical, robots, OG and Twitter tags from `seo`.
10. **Menus** by `location` (`PRIMARY`, `FOOTER_MENU`, …) from `items[]`; children in `children`.
11. **System pages** (home, about, contact, blog, …): `GET /api/sites/{siteKey}/env-page?key=FRONT_PAGE` — the site's `pageGroup` maps keys to pages. `null` → fallback/404.
12. **Redirects** from `redirects` (`isEnabled=true`) in middleware/edge before 404; normalise trailing slashes, cap hops.
13. **Comments** via `POST /api/comments/create` (created `pending`), **ratings** via `POST /api/ratings/submit`; both take `tenantSiteKey`. Never `POST /api/comments`.
14. **Never call** `/api/mcp`, `/api/<collection>/versions`, `/api/users`, or send `trash=true`.
15. Missing document → real **404** status, not an empty 200.
16. Only `example.com`-style placeholders in committed examples; no real keys or private URLs.

## 3. Routes (recommended)

Match the CMS's `publicPathFor`, which builds "View on site", internal-link suggestions, the editor's `@` link picker, breadcrumbs and JSON-LD URLs:

- `/{slug}` — one catch-all that resolves **landing → page → post** (first published match wins, else 404);
- `/product/{slug}` — products;
- `/` — the `FRONT_PAGE` system page (plus featured posts/products from the site doc if the design wants them);
- optional, your choice: `/category/{slug}`, `/tag/{slug}`, `/author/{slug}`, `/search`, an `/en` prefix for English.

Serve both `/slug` and `/slug/`. Different routes are allowed only if you tell the user to change `publicPathFor` in `src/lib/frontend-public-path.ts` on the CMS (and `src/fields/slug-url-prefix-map.ts`); otherwise CMS-generated links break.

## 4. Revalidate webhook (required for cached/static sites)

Expose `POST /api/cms/revalidate` on the site. Body `{ "collection", "id", "slug" }` or `{ "manual": true }`.

- Map `collection` + `slug` to the path (`posts`/`pages`/`landings` → `/{slug}`, `products` → `/product/{slug}`) and refresh it plus home/listings. `menus`, `faqs`, `shortcodes`, `authors`, site settings, `manual` or anything unknown → refresh the whole site.
- Return 2xx in under 5 s; idempotent; do not fetch the CMS inside the handler. It is unauthenticated: never trust the body beyond choosing what to purge; rate-limit at the edge if needed.
- The CMS calls `https://{Sites.domain}/api/cms/revalidate`; tell the user the site's `domain` must match and `ENABLE_JOBS_AUTORUN=true` must be set on one CMS instance.

## 5. Dev-time CMS access (optional)

If the `kdigi` MCP tools or the `kcms` CLI are available, you may use them **while developing** to explore content: `whoami`, `get_site`, `search_content`, `get_content`, `list_taxonomies`. You may create **drafts** as fixtures. Never publish (`set_status` published), never trash, never edit documents you did not create. Drafts are invisible to the anonymous site — to see a fixture on the site, ask the user to publish it. Never copy the API key into the site.

## 6. Framework

Detect it from `package.json` (or the user's request) and read the matching reference:

| Framework | Reference |
| --- | --- |
| Next.js (App Router) | [references/nextjs.md](references/nextjs.md) |
| Astro | [references/astro.md](references/astro.md) |
| SvelteKit | [references/sveltekit.md](references/sveltekit.md) |
| Nuxt | [references/nuxt.md](references/nuxt.md) |
| React (Vite) / Angular / other SPA | [references/spa.md](references/spa.md) |

Anything else: apply [references/contract.md](references/contract.md) directly with the same structure (fetch helper → site/menu loaders → catch-all → SEO → webhook).

## 7. Finish

Run through [references/checklist.md](references/checklist.md) and report the result, the routes you chose, and what the user must configure on the CMS (domain, `publicPathFor` if routes differ, jobs).
