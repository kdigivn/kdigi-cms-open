---
phase: 1
title: Agent operations core and API-key auth
status: completed
priority: P1
dependencies: []
effort: 3d
---

# Phase 1: Agent operations core and API-key auth

## Overview
Transport-agnostic operations layer `src/agent-api/` that every AI surface (MCP now, anything later) calls. Each op = `(ctx: AgentContext, input) => Promise<CompactResult>`, runs as the API-key owner on an **isolated Local-API request** with `overrideAccess: false` and `overrideLock: false`. Also: API-key hardening on the existing REST surface, and two hook fixes so partial (non-admin-form) updates stop clobbering curated data.

## Key Insights (grounded; red-team verified)
- `users.auth.useAPIKey: true` already (`src/collections/users.ts:72-78`); Payload's api-key strategy marks `user._strategy = 'api-key'` (`node_modules/payload/dist/auth/strategies/apiKey.js:55`) and runs on **every** REST/GraphQL route (`createPayloadRequest.js:80-87`). A key is therefore a full-account credential unless we restrict it — see "API-key hardening".
- **Locks**: Local API defaults `overrideLock = true` → lock check skipped AND the editor's lock row deleted (`node_modules/payload/dist/utilities/checkDocumentLockStatus.js:3,42,66-72`). `restoreVersion` never checks locks. `Locked` carries no holder info.
- **Partial updates**: collection `beforeChange` hooks receive the partial `data` (`…/operations/utilities/update.js:155-170`). `autoFillExcerpt` overwrites a stored excerpt whenever `contentMd` arrives without `excerpt` (`src/hooks/auto-fill-excerpt.ts:46-49`); `apply-seo-templates` regenerates `seo.breadcrumbs` when absent from `data` (`src/hooks/apply-seo-templates.ts:323,349,359-362,433`). The admin form hides this by always posting everything.
- **Public reads**: `sites.read` and `media.read` are `() => true` (`src/collections/sites.ts:92-93`, `src/collections/media.ts:58-59`); media is not a multi-tenant plugin collection and `tenant` is optional on legacy media. `overrideAccess:false` alone does NOT tenant-scope these.
- **Trash**: soft delete = `update({ data: { deletedAt } })`; `payload.delete` without `deletedAt` = permanent delete (admin-only) (`src/access/content-delete-access.ts:5-34`, `src/collections/content-trash.integration.test.ts:60-63,132-136`). Untrash = `update({ data: { deletedAt: null }, trash: true })`. `restoreVersion` refuses trashed docs.
- **Posts vs pages differ**: posts have `type, excerpt, categories, author, wordCount, tier, cluster`; pages have `pageType, isPillarPage, faqs` and none of the post-only fields/hooks (`src/collections/pages.ts:56-58,95-200`, `posts.ts:114-330`).
- **Body**: `markdownHtmlField('content', { localized: true })` → `contentMd` source of truth. If `contentMd` is null/undefined the legacy Lexical `content` is served; if `''` the body is authoritatively empty (`src/fields/markdown-html-field.ts:13-15,57-58`). Its `afterRead` render (md→HTML, shortcode DB lookups, image sizes) runs only when `req.payloadAPI === 'REST'` (`:36-52`), as does `resolve-og-image-fallback` (`src/hooks/resolve-og-image-fallback.ts:63-67`).
- **Taxonomies**: slug unique per `(tenant, type)` (`src/migrations/20261103_042515_initial.ts:2937-2938`); `posts.categories` holds categories AND tags (`posts.ts:189-197`).
- **Scheduling**: status is only `draft|published`; `publishedAndLive()` also hides future `publishedAt` (`src/access/published-and-live.ts:28-40`, `src/fields/sidebar-meta-fields.ts:49-65`).
- **Sites**: identity `siteKey` (unique free text, `sites.ts:120-123`), `domain` (`:131`), `defaultLanguage` (`:146`); locales are global `['vi','en']` with `fallback: true` (`src/payload.config.ts:244-247`).
- **Errors**: author publish ban throws a plain `Error(AUTHOR_PUBLISH_FORBIDDEN_MESSAGE)` (`src/hooks/enforce-author-permissions.ts:17-19,33-34`); slug uniqueness is only a partial DB index → raw `23505` (`src/fields/slug-field.ts:1-8`, `src/hooks/guard-restore-slug-conflict.ts:7-9`).
- **Reusable**: `computeSeoScoreFromDoc` (`src/lib/seo-score-server.ts:38`), `runSeoAudit` (`src/lib/seo-audit-core.ts:49`, uses `overrideAccess:true`, default locale, metadata only), media-from-URL pipeline (`src/endpoints/create-media-from-url.ts:37-246`, `overrideAccess:true` at `:217`, remote `content-type` trusted at `:198`, rebinding window accepted at `:124-130`), shortcodes are per-tenant rows (`src/lib/shortcodes/expand-shortcodes.ts:66-69`).

## Requirements
- Functional: ops table below; strict per-collection input schemas (unknown keys → `invalid`).
- Non-functional: compact outputs via explicit `select`; no REST render cost; never log keys/bodies; each op = one transaction on its own request.

## Architecture

```
src/agent-api/
  context.ts      AgentContext = { payload, user, req } ; makeAgentReq(payload, user, locale)
                  → createLocalReq({ user, locale, fallbackLocale: false }, payload)  (payloadAPI 'local', own transaction)
  auth.ts         resolveAgentUser(httpReq): header-only; `users API-Key` → reuse req.user populated by Payload;
                  `Bearer` → payload.auth({ headers: users API-Key … }); cookie-only / JWT → unauthorized
  errors.ts       AgentError {code: unauthorized|forbidden|not_found|conflict|locked|invalid|internal, message, details?}
  site.ts         resolveSite(ctx, site?) ; assertSameTenant(ctx, collection, ids[], siteId)
  locks.ts        assertNotLocked(ctx, collection, id) → `locked` with holder email (query payload-locked-documents)
  concurrency.ts  withRowLock(ctx, table, id, expectedUpdatedAt, fn) — explicit tx + SELECT … FOR UPDATE + compare
  schemas.ts      zod 4 strict schemas: PostCreate, PostUpdate, PageCreate, PageUpdate, … (shared with MCP)
  shape.ts        whitelist mappers (never blacklist)
  content.ts  taxonomies.ts  media.ts  seo.ts  sites.ts  shortcodes.ts  index.ts
src/lib/import-media-from-url.ts   extracted pipeline, mode 'system' | 'user'
src/lib/pinned-fetch.ts            undici Agent with lookup that re-runs ssrf-guard on the resolved IP
```

### Ops (23 → one MCP tool each)

| Op / tool | Input (strict) | Behavior |
|---|---|---|
| `whoami` | – | `{id,email,role,strategy,sites:[{id,siteKey}]}` |
| `list_sites` | – | **filtered to `userTenantIds`** (all for super-admin); `{id,siteKey,domain,defaultLanguage,locales:['vi','en']}` |
| `get_site` | `site?` | + taxonomy counts by type |
| `search_content` | `collection: posts\|pages, site?, query?, status?, limit≤50=20, page, locale?` + posts-only `type?, taxonomy? {type,slug}\|id` | `select` excludes `content`/`contentMd`; summaries `{id,title,slug,status,live,publishedAt,updatedAt}` + `totalDocs` |
| `get_content` | `collection, id \| (site + slug), locale?` | detail incl. `markdown`, `bodySource: 'markdown'\|'legacy-converted'\|'empty'`, `translated: boolean`, seo subset `{title,description,focusKeywords,canonicalOverride}`, `updatedAt`; posts add `excerpt,categories:[{id,type,slug,name}],author,wordCount`; pages add `pageType,isPillarPage` |
| `create_post` / `create_page` | `site?, title, markdown, slug?, status?=draft, publishedAt?, featuredImage? (media id), seo?, locale?` + post: `type?, excerpt?, categories? (ids or {type,slug}), author? (authors id)` / page: `pageType?, isPillarPage?` | tenant set from resolved site; all refs tenant-checked |
| `update_post` / `update_page` | `id, expectedUpdatedAt (required), …partial same fields, acknowledgeLegacyConversion?` | row-locked CAS; patch only provided keys; `tenant` not accepted |
| `set_status` | `collection, id, status, publishedAt?, expectedUpdatedAt` | returns `{status, live, scheduledFor?}` |
| `trash_content` | `collection, id, expectedUpdatedAt` | `update({deletedAt: now})`; **never** `payload.delete` |
| `restore_from_trash` | `collection, id` | `update({deletedAt:null}, trash:true)` |
| `list_versions` / `restore_version` | `collection, id` / `collection, versionId, expectedUpdatedAt` | restore: lock + slug-conflict pre-check |
| `list_taxonomies` / `create_taxonomy` | `site?, type?` / `site?, type: category\|tag\|product-category\|custom, name, slug?, parent?` | parent tenant-checked |
| `search_media` / `import_media_from_url` / `update_media_alt` | `site?, query?` / `url, alt?, site?` / `id, alt, expectedUpdatedAt` | search forces `tenant = site`; import uses mode `user` |
| `list_shortcodes` | `site?` | names + short usage, from the tenant's `shortcodes` rows |
| `seo_audit` | `site?, limit≤50, locale?` | posts+pages only; after membership check |
| `get_seo_report` | `collection, id, locale?` | `computeSeoScoreFromDoc` on the full doc → score + checks |
| `get_content_urls` | `collection, id` | `{adminUrl, publicUrl?, live}`; base URL = site `domain` first, `FRONTEND_BASE_URL` fallback; publicUrl only when live |

### Correctness rules (all write ops)
1. **Isolated request** per op via `makeAgentReq` → own transaction; never reuse the HTTP request object.
2. `overrideAccess: false`, `overrideLock: false` on every `create/update`; `assertNotLocked` before `restoreVersion`.
3. **CAS**: `withRowLock` begins a transaction (`payload.db.beginTransaction()` → `req.transactionID`), `SELECT updated_at … FOR UPDATE` on the row via the adapter session, compares to `expectedUpdatedAt` (`conflict` with current value on mismatch), runs the write in the same transaction, commits. Missing `expectedUpdatedAt` → `invalid` ("call get_content first").
4. **Minimal data**: build `data` only from provided keys; `markdown → contentMd`; nested `seo` only provided sub-keys; never `tenant` on update.
5. **Tenant integrity**: every referenced id (categories, featuredImage, author, parent, seo images) loaded with `{ id: { in }, tenant: { equals: siteId } }`; mismatch/missing → `invalid` naming the ids. Media without tenant is not referenceable.
6. **Taxonomy refs**: ids or `{type, slug}`; bare slug defaults `type: 'category'`; ambiguity → `invalid` listing candidates.
7. **Legacy body**: `get_content` converts legacy Lexical → HTML (existing renderer) → Markdown (`turndown`, already a dep) and reports `bodySource: 'legacy-converted'`; `update_*` that sends `markdown` to a legacy doc requires `acknowledgeLegacyConversion: true`; empty `markdown` is rejected (use explicit `markdown: ''` + `clearBody: true`).
8. **Slug**: pre-check `(tenant, slug)` among non-trashed docs before create/update/restore → `conflict`; also map PG `23505` → `conflict`.
9. **Locale**: reads use `fallbackLocale: false` and return `translated`; writes default `locale: 'vi'`.

### Site resolution
`site` string: exact `siteKey` match first; if no match and value is all digits → id. Non-super-admin must be a member → else `forbidden`. Omitted + exactly one membership → that site; else `invalid` listing siteKeys.

### API-key hardening (existing REST surface)
- `users`: `beforeValidate` guard (pattern of `lockDemoAccountSelfChange`, `src/lib/demo-accounts.ts:18`) rejects changes to `password, email, apiKey, enableAPIKey, role, tenants` when `req.user?._strategy === 'api-key'`.
- `makeContentDeleteAccess`: deny permanent delete when `_strategy === 'api-key'` (trash still allowed).
- Super-admin keys: **allowed** (Validation S1). `whoami` returns `warning: 'super-admin key bypasses tenant isolation; prefer a dedicated editor/author user'` and `/api/mcp` logs `warn` once per request for super-admin keys. Docs recommend dedicated low-role users. <!-- Updated: Validation Session 1 - super-admin allowed + warning -->

### Hook fixes (benefit REST partial updates too)
- `auto-fill-excerpt.ts`: skip when `originalDoc.excerpt` (same locale) is filled and `data.excerpt` is undefined.
- `apply-seo-templates.ts`: when `data.seo?.breadcrumbs` is undefined on update, keep `originalDoc.seo.breadcrumbs` (incl. `isHidden`).
- `enforce-author-permissions.ts`: throw `APIError(AUTHOR_PUBLISH_FORBIDDEN_MESSAGE, 403)` (existing tests match `/Author/` → still pass).

### Media import hardening
- `importMediaFromUrl(ctx, input, { mode })`: `system` = current endpoint behavior (after its own membership check); `user` = `req` + `overrideAccess:false` (`hasAnyTenantOrSuperAdmin` applies).
- Both modes: `pinnedFetch` (undici `Agent` `connect.lookup` pinned to the IP `assertUrlSafe` vetted, re-run on every redirect hop, 25 MB streaming cap), closing the rebinding window documented at `create-media-from-url.ts:124-130`.
- Mode `user` only: MIME from magic bytes via `sharp(buffer).metadata()`; allow-list `jpeg, png, webp, gif, avif` (SVG and non-images rejected). Mode `system` keeps the admin paste-URL contract (any file type, remote `content-type`) — *implementation note: narrowed from "both modes" to avoid breaking non-image paste-URL imports in the admin.*
- `seo_audit` does NOT wrap `runSeoAudit` (overrideAccess + also scans products/landings); it queries posts/pages as the user with a tenant filter and reuses `isSeoDeficient` / `computeSeoScoreFromDoc` / `seoDeficiencyReasons`.

## Related Code Files
- Create: `src/agent-api/{context,auth,errors,site,locks,concurrency,schemas,shape,content,taxonomies,media,seo,sites,shortcodes,index}.ts` + unit tests (`auth`, `errors`, `schemas`, `shape`, `site`); `src/lib/import-media-from-url.ts`, `src/lib/pinned-fetch.ts` (+ tests).
- Modify: `src/endpoints/create-media-from-url.ts` (thin wrapper, `system` mode, same status codes), `src/hooks/auto-fill-excerpt.ts`, `src/hooks/apply-seo-templates.ts`, `src/hooks/enforce-author-permissions.ts` (+ their tests), `src/collections/users.ts` (api-key guard), `src/access/content-delete-access.ts` (+ test).
- Modify: `package.json` — add `undici` (pinned fetch).

## Implementation Steps
1. Hook fixes + api-key guards first, each with a failing-before/passing-after unit test.
2. `context.ts`, `errors.ts` (map `Forbidden`, `NotFound`, `ValidationError` with paths, `Locked`, `APIError` by status, PG `23505`), `auth.ts`.
3. `site.ts`, `locks.ts`, `concurrency.ts` (verify adapter session API for raw `FOR UPDATE` against `@payloadcms/db-postgres@3.90.2`).
4. `schemas.ts` (zod 4 `.strict()`), `shape.ts`.
5. Ops; media extraction + pinned fetch + MIME allow-list; existing `/from-url` tests stay green.
6. Audit log per op: `payload.logger.info({ msg: 'agent-op', op, userId, site, docId, ok, ms })`.

## Success Criteria
- [ ] `overrideAccess: true` absent from `src/agent-api/**` except `locks.ts` (reads `payload-locked-documents`, which editors cannot read); `src/lib/import-media-from-url.ts` uses it only in mode `system`. Enforced by `src/agent-api/agent-api-guards.test.ts`.
- [ ] Every `payload.update` in `src/agent-api` passes `overrideLock: false` (same source-scan test).
- [ ] Hook fixes: markdown-only update keeps excerpt; status-only update keeps breadcrumbs (unit + integration).
- [ ] Api-key user cannot PATCH own password/apiKey; admin api-key cannot permanently delete via REST.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` green.

## Risk Assessment
| Risk | Mitigation |
|---|---|
| Raw `FOR UPDATE` depends on adapter internals | Isolated in `concurrency.ts`; integration test with two concurrent writers |
| Hook behavior change affects admin | Admin always sends the fields, so the new branches are only hit by partial updates; tests cover both |
| Legacy conversion lossy (Lexical → MD) | Explicit `acknowledgeLegacyConversion`; versions keep the original |
| 30-version cap evicts human history during long agent sessions | Documented in skill/docs; CAS reduces churn |

## Security Considerations
Header-only auth; api-key cannot change credentials or hard-delete anywhere; tenant integrity on every reference; public-read collections explicitly filtered; SSRF rebinding closed; image-only MIME; whitelist shapes (no site secrets, no user hashes).
