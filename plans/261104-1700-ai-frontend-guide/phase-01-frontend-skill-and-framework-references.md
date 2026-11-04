---
phase: 1
title: "Frontend skill and framework references"
status: completed
priority: P1
dependencies: []
---

# Phase 1: Frontend skill and framework references

## Overview
New agent skill `skills/kcms-frontend/` that makes any AI coding agent build a correct public frontend on the KDIGI CMS REST contract, in Next.js App Router, Astro, SvelteKit, Nuxt, or an Angular/React SPA.

## Requirements
- Functional: agent following the skill produces code that reads anonymously, filters by tenant, renders HTML fields, applies SEO, menus, system pages, redirects, locales, and exposes the revalidate webhook with routes matching `publicPathFor`.
- Non-functional: English; `SKILL.md` ≤ ~120 lines (agents load it whole); references loaded on demand. The skill is installed into a repo with no CMS `docs/`, so it must be self-sufficient: `references/contract.md` carries the essential contract inline; for full detail point to `{CMS base URL from KCMS.md}/llms-full.txt` (matches the deployed CMS version), GitHub `docs/rest-api.md` only as fallback. Never repo-relative links. `example.com` / `change-me` only. <!-- Updated: Review 1 - no dead relative paths -->

## Architecture
```
skills/kcms-frontend/
  SKILL.md                 # frontmatter name/description + rules + workflow
  references/
    contract.md            # compact, code-oriented digest of rest-api.md (query recipes, shapes)
    nextjs.md              # App Router: fetch cache tags, revalidateTag in route handler, generateMetadata, generateStaticParams
    astro.md               # SSG vs SSR adapter; webhook → rebuild hook (SSG) or on-demand cache purge (SSR)
    sveltekit.md           # +page.server.ts load, setHeaders cache, +server.ts webhook
    nuxt.md                # server routes (/server/api) proxy, useFetch keys, routeRules ISR/SWR, webhook
    spa.md                 # Angular/React CSR: SEO caveat, recommend prerender/SSR (Angular SSR, Vite prerender), no webhook needed unless prerendered
    checklist.md           # self-check before "done" (mirrors acceptance in phase 6)
```
Skill frontmatter description must trigger on "build/redesign a website/frontend that uses KDIGI CMS"; must NOT trigger on content editing (that is `kcms`).

SKILL.md sections:
1. **Context first**: read `KCMS.md` in repo root (from `kcms frontend context`); if missing, tell user to run it — or resolve site via `GET /api/sites?where[siteKey][equals]=…`.
2. **Hard rules**: no `Authorization`/cookie on frontend requests (else drafts); API key never in frontend code or `.env` shipped to client; every content query `where[tenant][equals]=<id>`; slug unique per site only; listings `depth=1` + `select`; render `content` etc. as HTML at original key (already sanitised; do not re-parse Markdown; do not read `*Md`); REST not GraphQL for rendered HTML; locale `?locale=en` + `fallback-locale`; SEO from `seo.*`, JSON-LD from `seo.jsonLd.raw` verbatim; menus by `location`; system pages via `/api/sites/:siteKey/env-page?key=…`; redirects from `redirects` collection at edge/middleware; comments via `/api/comments/create`, ratings via `/api/ratings/submit`; never call `/versions` or `/api/mcp` from the site.
3. **Routes** (recommended, not mandatory): match `publicPathFor` in `src/lib/frontend-public-path.ts` — one catch-all `/{slug}` that resolves **landing → page → post** (first published match wins, else 404), and `/product/{slug}` for products. Different routes are allowed only if the agent tells the user to change `publicPathFor` on the CMS (otherwise "View on site", internal-link suggester and `@` link picker point to wrong URLs). <!-- Updated: Validation Session 1 - catch-all resolution order; routes recommended -->
4. **Webhook**: `POST /api/cms/revalidate` body `{collection,id,slug}` (+ `{manual:true}`); idempotent, cheap, 2xx fast (<5 s); `menus`/`faqs`/site settings → revalidate whole site; unauthenticated → rate-limit at edge.
5. **Dev-time CMS access** (if `kdigi` MCP or `kcms` available): read (`whoami`, `get_site`, `search_content`, `get_content`, `list_taxonomies`) and create **drafts** as fixtures; never `set_status` published, never trash; note drafts are invisible to anonymous reads — to see a fixture on the site, ask the user to publish it.
6. **Framework**: pick reference by detected framework (package.json); unknown → apply `contract.md` directly.
7. Finish with `references/checklist.md`.

## Related Code Files
- Create: `skills/kcms-frontend/SKILL.md`, `skills/kcms-frontend/references/{contract,nextjs,astro,sveltekit,nuxt,spa,checklist}.md`
- Read (sources of truth): `docs/rest-api.md`, `docs/seo.md`, `docs/multi-site.md`, `docs/content-markdown.md`, `src/lib/frontend-public-path.ts`, `src/endpoints/get-env-page.ts`, menus projection in rest-api.md §Menus
- Modify: none

## Implementation Steps
1. Re-read `docs/rest-api.md` fully + `docs/seo.md` "frontend" parts; extract every rule a frontend can get wrong into a list; verify each against source (`src/access/published-and-live.ts`, menus `afterRead`, `frontend-public-path.ts`).
2. Write `references/contract.md`: query recipes (site resolve, list, by-slug, taxonomy archive, author, search via `where[title][like]`, pagination fields), response field names used for rendering, menu tree shape, env-page keys, media `url` behaviour (local vs R2), comment/rating payloads.
3. Write `SKILL.md` per Architecture.
4. Write each framework reference: current stable major (record version, e.g. "Next.js 15, verified 2026-11"); show (a) a tiny `cms.ts` fetch helper with base URL + tenant from env, no auth header, (b) post page with metadata + JSON-LD, (c) webhook handler, (d) caching/revalidation strategy, (e) redirects hook-in, (f) locale routing. Code snippets minimal, idiomatic; no external SDK.
5. `spa.md`: state plainly that CSR-only hurts SEO; give Angular SSR / React (Vite) prerender path; webhook only relevant when prerendered/SSR-hosted.
6. `checklist.md`: grep-able checks (no `Authorization` in fetch code, tenant filter present, webhook route exists, routes match, `seo` used, JSON-LD emitted, `lang` attr per locale, 404 for missing slug, redirects applied).

## Success Criteria
- [x] Every rule in SKILL.md traceable to a doc section or source file (reviewer spot-check: 22 rules).
- [x] Each framework reference contains fetch helper, detail page with SEO, webhook (or explicit N/A for pure CSR), caching strategy, locale handling.
- [x] No secrets, no real domains; `example.com` only.
- [x] Frontmatter `name: kcms-frontend`, description distinct from `kcms`.

## Risk Assessment
- Skill drifts from docs → link sections instead of duplicating; phase 4 drift test covers the llms copy, reviewers check SKILL on contract changes (note in CONTRIBUTING via phase 5).
- Framework APIs change (Next caching semantics especially) → record verified version per reference; phase 6 validates against current versions.
- Over-long SKILL.md ignored by agents → keep rules terse, push detail to references.
