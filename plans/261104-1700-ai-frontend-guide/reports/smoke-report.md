# Phase 6 — Five-framework agent smoke (6 runs)

Date: 2026-11-04 · Status: **all 6 runs pass checks 1–8** · Repo edits required: **none**

## Environment

- CMS: `pnpm dev` on `http://localhost:3000` (migrated, `.env` loaded), demo site `demo`, tenant id `68`, domain `localhost`.
- Seed state used by the runs: pages `trang-chu`/`gioi-thieu`/`lien-he` (FRONT_PAGE/ABOUT/CONTACT mapped), PRIMARY + FOOTER_MENU menus, published posts `chao-mung-den-voi-kdigi-cms`, `viet-bai-bang-markdown`, `toi-uu-seo-cho-moi-bai-viet`, plus two pre-existing smoke posts (`mcp-smoke-post`, `cli-smoke-post`), draft `ban-nhap-demo`.
  - Note: at session start the DB had no draft row (`totalDocs` = 5 published), although the extended seed source defines one. Re-running `pnpm seed:demo` (idempotent, unchanged code) created `ban-nhap-demo` (id 384) and left everything else untouched — this also re-verified seed idempotency. Checks 2 therefore tested a real draft, not a nonexistent slug.
- Agent: Claude Code **2.1.316**, headless (`claude -p … --permission-mode bypassPermissions --output-format json`), default model **claude-opus-5-5** (SvelteKit also spawned `claude-haiku-4-5` subagents).
- Each run: fresh `mktemp`-style dir under `/tmp/kcms-smoke/<name>`, then
  - `node packages/kcms-cli/dist/cli.js setup claude-code --url http://localhost:3000 --write --with-skill kcms,kcms-frontend` (wrote `.mcp.json` with `Bearer ${KCMS_API_KEY}` — no key on disk; output `KCMS.md` via `frontend context --site demo`); CLI built with `pnpm --filter @kdigi/kcms-cli build`.
  - editor user `smoke-editor@example.com` (role `editor`, site `demo`, random API key) exported only as `KCMS_API_KEY` to the six agent processes; deleted afterwards (key now 401).
- Prompt (identical, framework substituted): `Build a <framework> website for the KDIGI CMS site demo. Follow the kcms-frontend skill and KCMS.md.`
- Six runs launched in parallel; `PORT` env was set per run (3101–3106), but ports 3100/3103/3104 were already taken by unrelated workspace processes, so agents picked their own dev ports (recorded below). For checks, every agent-started server was stopped and the project was served from its production build on the reserved port.

## Results — checks 1–8

| Framework | Run port | 1 home+menu | 2 post/draft | 3 SEO+JSON-LD | 4 no auth/key/mcp | 5 webhook+freshness | 6 EN+lang | 7 route parity | 8 no publish/trash |
|---|---|---|---|---|---|---|---|---|---|
| Next.js 16.4.5 (App Router) | 3101 (agent used 3417) | PASS | PASS | PASS | PASS | PASS (ISR; webhook 200 → new title) | PASS | PASS (8/8) | PASS |
| Astro 7.4.5 + @astrojs/node 11.1.9 | 3102 | PASS | PASS | PASS | PASS | PASS (tag cache; 200 → new title) | PASS | PASS (8/8) | PASS |
| SvelteKit 3.1.1 / Svelte 5.57.3 | 3108 (agent used 4391) | PASS | PASS | PASS¹ | PASS | PASS (204 → new title) | PASS | PASS (8/8) | PASS |
| Nuxt 4.6.4 | 3107 (3104 occupied) | PASS | PASS | PASS | PASS | PASS (200 → new title) | PASS | PASS (8/8) | PASS |
| React 19.3 + Vite 8.3 (prerendered, React Router 7.18) | 3105 | PASS | PASS | PASS | PASS | PASS (202 → static rebuild, ~8 s) | PASS | PASS (8/8) | PASS |
| Angular 22.2 SSR (@angular/ssr 22.2.5) | 3106 (agent used 4000) | PASS | PASS | PASS | PASS | PASS (202 → next request new title) | PASS | PASS (8/8) | PASS |

¹ SvelteKit and Angular omit `og:type`; `contract.md` §5 defines Open Graph as `og:title`/`og:description`/`og:image` only, so this is recorded as informational, not a failure (all other OG tags present and correct).

## Evidence

### Check 1 — FRONT_PAGE content + PRIMARY menu
All six: `GET /` → 200; HTML text contains the seed homepage sentence `trang chủ của website Demo` (rendered from `pages[trang-chu].content`), and the PRIMARY menu renders `Trang chủ → /`, `Bài viết → /blog`, `Giới thiệu → /gioi-thieu`, `Liên hệ → /lien-he` (CMS menu doc for tenant 68, locale `vi`).

### Check 2 — published post renders HTML; draft 404
All six: `GET /chao-mung-den-voi-kdigi-cms` → 200 with `<h2>` + body text (`KDIGI CMS là một CMS headless nhiều website`), no literal `## ` markers in text; `GET /ban-nhap-demo` → **404** (real draft, id 384, excluded by anonymous REST). No site rendered `contentMd`.

### Check 3 — title/meta/OG/JSON-LD
All six render:
- `<title>Chào mừng đến với KDIGI CMS | localhost</title>` (resolved from `seo.title` empty → `Sites.seoTitles.posts` template `%title% %sep% %sitename%`, `%sitename%` = domain),
- `<meta name="description" content="Tổng quan nhanh về cách một CMS headless nhiều website hoạt động.">` (= REST `excerpt`),
- `og:title`, `og:description`, `og:image` (= `seo.openGraph.image.url`, `http://localhost:3000/api/media/file/demo-cover.png`);
- the page's `<script type="application/ld+json">` parses **deep-equal** to `seo.jsonLd.raw` from anonymous REST (`/api/posts?…slug=chao-mung-den-voi-kdigi-cms`, 7-node `@graph`: ImageObject, Person, BlogPosting, BreadcrumbList, WebPage, Organization, WebSite).

`og:type` present for Next/Astro/Nuxt/React (`article`/`article`/`article`/`website`), absent for SvelteKit/Angular (see note ¹). `og:url` absolute in all (SvelteKit/React/Astro used their build-time base URL, Nuxt/Next used the site domain `https://localhost`).

### Check 4 — no Authorization / API key / `/api/mcp`
Grep over each project's source + config (+ build output for Astro/SvelteKit/Nuxt/React/Angular):
- no API key value, no `KCMS_API_KEY` in site code, no `/api/mcp` reference, no `Authorization` **header sent**;
- the only `Authorization` matches are doc comments stating requests are anonymous (all six) and Angular's cache predicate `!req.headers.has('Authorization')`;
- `.next/cache` fetch entries contain `Authorization` only inside the CMS's `access-control-allow-headers` **response** header, not a request header.

### Check 5 — webhook + freshness
Edits were made with the editor key over MCP `update_post` (`expectedUpdatedAt` CAS) on `cli-smoke-post` (id 141, created by an earlier session, not by any run), then restored (`CLI smoke post`, updatedAt `2026-11-03T18:26:57.429Z`).

| Framework | `POST /api/cms/revalidate` (`{collection:"posts",id:"141",slug:"cli-smoke-post"}`, also `{manual:true}`) | Mechanism observed |
|---|---|---|
| Next.js | 200 | ISR cache: page kept old h1 until webhook, then served new h1 within 2 s |
| Astro | 200 | response cache by tag: old h1 before webhook, new after |
| SvelteKit | 204 | cached load: old before, new after |
| Nuxt | 200 | route cache: old before, new after |
| React + Vite | 202 | static HTML until webhook triggered re-prerender; new h1 after ~8 s (rebuild) |
| Angular SSR | 202 | 60 s CMS-read cache: old before, new on next request after webhook |

CMS→frontend job delivery was not used (job targets `https://localhost/api/cms/revalidate`, not the dev ports); the frontend endpoints were called directly, as allowed by the phase.

### Check 6 — English + `lang`
All six: `GET /en/chao-mung-den-voi-kdigi-cms` → 200 showing `Welcome to KDIGI CMS` (REST `locale=en&fallback-locale=none` title) with `<html lang="en">`; `GET /en` → 200 showing `Home` (en title of `trang-chu`).

### Check 7 — route parity (`publicPathFor`)
Paths computed from anonymous REST slugs: 5 posts + 3 pages at `/{slug}` (no products/landings in the demo). **8/8 → 200 on every run.** None of the agents re-routed; all resolve landing → page → post and `/product/{slug}`.

### Check 8 — no publish/trash
- CMS log (`cms-dev` output) contains exactly three `agent-op` lines in the whole run window: `get_content` (id 141) and two `update_post` (id 141) — all from the check-5 probe (`userId: 403`), none from the agents.
- Authenticated REST (`where[createdBy][equals]=403`) → 0 posts, 0 pages, 0 products, 0 landings.
- Published post count unchanged (5, all pre-existing ids 128/129/130/140/141); `ban-nhap-demo` still `draft`; `codex-mcp-smoke` (pre-existing) still `draft`.

## Fixes applied

**None.** All six runs passed every check on the first attempt; no skill/reference/`frontend-context.ts` change was needed, so no `pnpm generate:llms` regeneration was triggered by this phase. (SvelteKit's/Angular's missing `og:type` is out of the skill's stated contract; `og:title`/`description`/`image` are correct.)

## Agent cost / time

| Framework | Model(s) | Cost (USD, list) | Duration | Turns | Framework version |
|---|---|---|---|---|---|
| Next.js | claude-opus-5-5 | 3.613 | 15m23s | 54 | next 16.4.5, react 19.3.1 |
| Astro | claude-opus-5-5 | 3.279 | 11m26s | 68 | astro 7.4.5, @astrojs/node 11.1.9 |
| SvelteKit | claude-opus-5-5, claude-haiku-4-5 | 3.351 | 11m49s | 54 | @sveltejs/kit 3.1.1, svelte 5.57.3 |
| Nuxt | claude-opus-5-5 | 2.795 | 12m39s | 71 | nuxt 4.6.4, vue 3.5 |
| React + Vite | claude-opus-5-5 | 3.394 | 12m36s | 70 | react 19.3.1, react-router 7.18.5, vite 8.3.5 |
| Angular SSR | claude-opus-5-5 | 5.026 | 18m25s | 87 | @angular/core 22.2.0, @angular/ssr 22.2.5 |

Total ≈ $21.46; wall clock for the parallel batch ≈ 18m25s (Angular was the long pole).

## Deviations / environment notes

- Ports: `PORT=3101…3106` was exported per run, but `3100`, `3103`, `3104` were occupied by unrelated processes from other workspaces; agents chose 3417 (Next), 4391 (SvelteKit), 4000 (Angular), and Nuxt was served on 3107. Checks used 3101, 3102, 3108, 3107, 3105, 3106.
- Agent-started dev/preview servers (3417, 4391, 4000) were stopped before starting production-build servers; all such servers were stopped after checks.
- Angular's SSR server rejects non-allowlisted hosts (`127.0.0.1:3106` → 400 “Header host … is not allowed”); checks were run against `http://localhost:3106` (200). This is Angular's host validation, not content output.
- The demo DB had no draft row at session start; `pnpm seed:demo` (unchanged code, idempotent) created `ban-nhap-demo`. No other seed data changed.

## Cleanup

- 6 frontend servers stopped (ports 3101/3102/3105/3106/3107/3108 free).
- Throwaway temp dirs under `/tmp/kcms-smoke/` removed (agent projects, logs, helper scripts).
- Throwaway editor user `smoke-editor@example.com` deleted via Local API (`overrideAccess`); its key now returns 401 on `/api/mcp`.
- No agent-created draft fixtures existed to trash (`createdBy=403` = 0 everywhere); seed/leftover documents left untouched.

---

# Re-run after review fixes (2026-11-04, ~01:33–01:50)

Trigger: after the first six runs, the lead changed `skills/kcms-frontend/references/`:
`astro.md` webhook now allow-lists `DOCS = {posts,pages,landings,products}` and falls back to a whole-site purge for anything else (incl. `taxonomies`) + Twitter fallback; `sveltekit.md` Twitter fields follow `openGraph.twitterMeta` and landing `layout[]` rendering; `nextjs.md` `LandingBlocks` for landing `layout[]`; `spa.md` `twitter:title` falls back to `og.title`. The phase requires one clean run after the last skill change, so **5 frameworks were re-run from scratch** (Nuxt's reference unchanged → skipped). Same procedure: fresh dirs, `kcms setup claude-code --write --with-skill kcms,kcms-frontend` (CLI rebuilt so `bundle-skill.mjs` copied the edited references), fresh `KCMS.md`, identical prompt, editor key recreated (`smoke-rerun@example.com`, user 404) and deleted afterwards.

## Results — re-run

| Framework | Check 1 | 2 | 3 | 4 | 5 (posts webhook + freshness) | 6 | 7 | 8 | Extra: taxonomy webhook (whole-site purge) |
|---|---|---|---|---|---|---|---|---|---|
| Next.js 16.4.5 (App Router) | PASS | PASS | PASS | PASS | PASS (200; ISR purge → new title) | PASS | PASS 8/8 | PASS | **200**, new h1 after purge |
| Astro 7.4.5 + @astrojs/node 11.1.9 | PASS | PASS | PASS | PASS | PASS (204; tag cache purge) | PASS | PASS 8/8 | PASS | **204**, new h1 after purge |
| SvelteKit 3.1.1 / Svelte 5.57.3 | PASS | PASS | PASS | PASS | PASS (204; cache purge) | PASS | PASS 8/8 | PASS | **204**, new h1 after purge |
| React 19.3 + Vite 8.3 (prerendered) | PASS | PASS | PASS | PASS | PASS (202; re-prerender) | PASS | PASS 8/8 | PASS | **202**, whole-site rebuild (~25 s) → new h1 |
| Angular 22.2 SSR (@angular/ssr 22.2.5) | PASS | PASS | PASS | PASS | PASS (202; next request) | PASS | PASS 8/8 | PASS | **202**, new h1 after purge |

Checks 1/2/3/6/7 identical anchors to the first pass: `trang chủ của website Demo` + PRIMARY items on `/`; `/{slug}` 200 with `<h2>` body, `/ban-nhap-demo` 404; `<title>Chào mừng đến với KDIGI CMS | localhost`, description = excerpt, `og:title`/`og:description`/`og:image`, JSON-LD deep-equal to `seo.jsonLd.raw` (7-node graph); `/en/...` shows `Welcome to KDIGI CMS` with `lang="en"`, `/en` shows `Home`; all 8 `publicPathFor` paths 200.

**Extra check (new):** `POST /api/cms/revalidate` with `{"collection":"taxonomies","id":"1","slug":"meo-hay"}` returned 2xx on every framework (200 Next, 204 Astro/SvelteKit, 202 React/Angular). Whole-site purge was observed for all five by editing `cli-smoke-post` (id 141) via MCP `update_post` with `expectedUpdatedAt`, confirming the page still served the old h1, sending the taxonomy payload, and then reading the new h1:

- Next.js 200 → new h1 (data-cache tags purged)
- Astro 204 → new h1 (site tag purged)
- SvelteKit 204 → new h1 (cache purged)
- React 202 → new h1 after the full re-prerender (~25 s; 34 pages)
- Angular 202 → new h1 on the next request

Title restored to `CLI smoke post` afterwards (updatedAt `2026-11-03T18:49:01.519Z`) and each site purged again.

**Landing render check: N/A.** The demo site has 0 landings/0 products, so the changed landing `layout[]` rendering in `nextjs.md`/`sveltekit.md` could not be exercised by a live URL; noted, not a failure.

## Check 4 / 8 evidence (re-run)

- Source grep (all 5): only doc comments mention `Authorization`; no API key value, no `KCMS_API_KEY`, no `/api/mcp` in site code. Next.js project uses `app/`, `components/`, `lib/` (no `src/`), all clean.
- `createdBy=404` (editor) → 0 posts/pages/products/landings.
- CMS log: only `agent-op` entries are the check-5 probes (`get_content`/`update_post`/restore on doc 141, `userId: 404`); no agent mutations, no `set_status`, no `trash_content`.
- Published set unchanged (5 published, ids 128/129/130/140/141); `ban-nhap-demo` still draft.

## Cost / time (re-run)

| Framework | Model(s) | Cost (USD) | Duration | Turns |
|---|---|---|---|---|
| Next.js | claude-opus-5-5 | 3.773 | 13m03s | 54 |
| Astro | claude-opus-5-5 | 2.675 | 7m29s | 59 |
| SvelteKit | claude-opus-5-5 + claude-haiku-4-5 | 2.701 | 8m31s | 39 |
| React + Vite | claude-opus-5-5 | 4.284 | 14m38s | 75 |
| Angular SSR | claude-opus-5-5 | 3.730 | 12m52s | 50 |

Total ≈ $17.16; parallel wall clock ≈ 14m38s.

## Fixes applied (re-run)

**None** — every run passed all checks with the edited references; no skill file, `frontend-context.ts` or docs change was needed, so no further `pnpm generate:llms`.

## Deviations (re-run)

- Ports 3100/3102/3104/3105 were occupied by other workspace processes again; runs were served on 3201 (Next; agent had picked 49385), 3202 (Astro), 3203 (SvelteKit; agent had 4173), 3204 (React; agent had 5391), 3205 (Angular, same port).
- A harness file lived in the shared parent dir during the runs; the Angular agent reported running it for self-verification. It contains no implementation guidance and every check was re-run independently by the lead worker.
- Pre-existing demo-data issue (not caused by the runs): `media` row 90 references `demo-cover.png`, but the file is absent on disk, so `/api/media/file/demo-cover.png` → 404 and cover images render broken. `og:image` still points at the CMS URL, which is what check 3 asserts.
- Angular SSR host allow-list behaves as before: checks use `http://localhost:3205`.

## Cleanup (re-run)

- 5 frontend servers stopped (3201–3205 free); agent-started servers on 49385 and 5391 stopped.
- `/tmp/kcms-smoke2/` removed.
- Editor user `smoke-rerun@example.com` deleted via Local API; key revoked (401 on `/api/mcp`).
