# Done checklist

Run every check before telling the user the site is finished. Report each as pass/fail with the evidence (command output or URL). Replace `src/` with your source folders.

## Static checks (grep)

| # | Check | How |
| --- | --- | --- |
| 1 | No auth on CMS requests | `grep -rnE "Authorization|credentials: *'include'|API-Key|Bearer" src/` → no hits in CMS fetch code |
| 2 | No API key anywhere | `grep -rn "KCMS_API_KEY" .` → only absent or in docs telling people not to use it; no `.env*` in the site holds a key |
| 3 | No MCP / versions calls | `grep -rnE "/api/mcp|/versions|trash=true|graphql" src/` → no hits |
| 4 | Tenant filter everywhere | every CMS list/detail query goes through one helper that adds `where[tenant][equals]` (`grep -rn "where\[tenant\]" src/` shows the helper) |
| 5 | HTML, not Markdown | `grep -rnE "contentMd|bodyMd|noticeMd|marked|markdown-it|remark" src/` → no hits |
| 6 | Landings filter | landing lookup includes `isDisabled` filter |
| 7 | Webhook exists | a `POST` handler at `/api/cms/revalidate` (or an explicit, documented N/A for a pure CSR site) |
| 8 | JSON-LD verbatim | `seo.jsonLd.raw` is emitted as-is, not wrapped in another `<script>` and not `JSON.parse`d |

## Runtime checks (dev server running, CMS reachable)

| # | Check | How |
| --- | --- | --- |
| 9 | Home renders the `FRONT_PAGE` page and the `PRIMARY` menu | open `/` |
| 10 | Published post renders HTML | open `/{slug}` of a published post from `KCMS.md`; headings/lists render, no raw `##` or `**` |
| 11 | Draft / unknown slug → 404 | `curl -s -o /dev/null -w '%{http_code}' http://localhost:PORT/does-not-exist-123` → `404` |
| 12 | SEO tags | `curl -s http://localhost:PORT/{slug} \| grep -E "<title>|og:title|name=\"description\"|application/ld\+json"` → all present |
| 13 | `lang` attribute | `/` has `<html lang="vi">` (or the site's default); `/en/...` has `lang="en"` |
| 14 | Webhook answers 2xx fast | `curl -s -o /dev/null -w '%{http_code} %{time_total}\n' -X POST http://localhost:PORT/api/cms/revalidate -H 'Content-Type: application/json' -d '{"collection":"posts","id":"1","slug":"<slug>"}'` → `2xx`, < 5 s |
| 15 | Freshness | after a webhook call (or rebuild for static sites) the page reflects the CMS change; state the mechanism |
| 16 | Route parity | each published post/page/landing is reachable at `/{slug}`, each product at `/product/{slug}`; `/slug/` works too |
| 17 | Redirects | an enabled `redirects` rule (if any exist) answers with its `statusCode` and `Location` |
| 18 | Build | the production build command succeeds (`npm run build` or equivalent) |

## Tell the user

- Routes you implemented, and whether they match `publicPathFor` (if not: which CMS function to change).
- Env vars to set in production (`CMS_URL`, `CMS_SITE_KEY`, …) — never an API key.
- CMS side: `Sites.domain` must be the site's real host (the CMS calls `https://{domain}/api/cms/revalidate`), and `ENABLE_JOBS_AUTORUN=true` on exactly one CMS instance.
- Any draft fixtures you created in the CMS, so they can publish or trash them.
