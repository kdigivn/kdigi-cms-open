---
phase: 5
title: Integration tests and real-client smoke
status: completed
priority: P1
dependencies:
  - 1
  - 2
  - 3
  - 4
effort: 1.5d
---

# Phase 5: Integration tests and real-client smoke

## Overview
Prove the security boundary, concurrency safety, and end-to-end UX against a real Postgres and real AI clients. Phases 1–3 already have colocated unit tests. This phase extends the harness, adds the integration suite, and runs the smoke.

## Key Insights
- Harness `src/test-utils/payload-integration.ts`:
  - Gated by `PAYLOAD_INTEGRATION=1`; refuses non-localhost DBs.
  - `setupTwoTenants` creates 2 sites, an editor and an author per site, a super-admin, and a zero-tenant user (`:142-265`). All users have a password only: no API key, and no user is in two sites.
  - Cleanup tracks posts, media, folders, users, and sites only (`:125-139`).
- The endpoint needs a `PayloadRequest` built from a Web `Request`. There is no helper for that today.
- Run with `pnpm test:integration` (needs `DATABASE_URI` and applied migrations).

## Harness extensions (`src/test-utils/payload-integration.ts`)
- Every fixture user gets `enableAPIKey: true, apiKey: randomUUID()`; expose the keys on the fixture.
- Add a multi-site editor (member of A and B).
- Cleanup tracking for pages, taxonomies, shortcodes, `payload-locked-documents` rows, and media created by imports.
- `callMcp(fixture, { key?, cookie?, body, headers? })` builds a `Request` and invokes the endpoint handler through Payload's request pipeline (`createPayloadRequest`), so `req.user` population matches production.

## Test Scenario Matrix (`src/mcp/mcp.integration.test.ts`)

| # | Scenario | Expect |
|---|---|---|
| 1 | No `Authorization`; cookie-only session | 401 + `WWW-Authenticate` |
| 2 | Bearer valid / `users API-Key` valid / disabled key | same user ×2 / 401 |
| 3 | Editor A: `get_content`, `update_post` on a site-B doc | exact code `forbidden` (or `not_found`, pinned once); doc unchanged |
| 4 | Editor A: `list_sites`, `search_media`, `search_content` with `site=B` | only A listed / `forbidden` / `forbidden` |
| 5 | Editor A: `featuredImage` = B's media id; `categories` = B's taxonomy id; `parent` = B's taxonomy | `invalid`, nothing linked |
| 6 | Multi-site editor omits `site` | `invalid` listing siteKeys |
| 7 | Zero-tenant user `create_post` | `forbidden` |
| 8 | Author: `set_status published`; `restore_version` of a published version | `forbidden` with author message; status stays `draft` |
| 9 | Editor `set_status published` (past `publishedAt`) / future `publishedAt` | `live:true`, revalidate job queued / `live:false, scheduledFor` |
| 10 | `update_post` `seo.title` in `en` | `vi` seo + other `en` seo sub-fields unchanged |
| 11 | `update_post` markdown-only on a post with a curated excerpt; `set_status` on a doc with custom breadcrumbs | excerpt and breadcrumbs (incl. `isHidden`) unchanged |
| 12 | `update_post` without `expectedUpdatedAt` / stale value | `invalid` / `conflict` with current `updatedAt`; no version row added |
| 13 | Two concurrent `update_post` calls with the same `expectedUpdatedAt` | exactly one succeeds, the other gets `conflict` |
| 14 | Doc locked by another user (lock row) → `update_post`, `restore_version` | `locked` naming the holder's email; lock row still present |
| 15 | `update_post` with `tenant` / an unknown key; `create_page` with `excerpt` | `invalid` (strict schema) |
| 16 | `create_post` markdown → `get_content` | `markdown` round-trips; `wordCount` and `seo.jsonLd.raw` derived; `bodySource:'markdown'` |
| 17 | Legacy Lexical-only post: `get_content` → `update_post` without/with `acknowledgeLegacyConversion` | `legacy-converted`; refused / converted |
| 18 | Duplicate slug on create; restore_version into a slug taken meanwhile | `conflict` (not `internal`) |
| 19 | `trash_content` (editor and admin keys) → `restore_from_trash` | soft-deleted (row exists, `deletedAt` set) → restored |
| 20 | `get_content locale=en` on a `vi`-only post | `translated:false`, no `vi` text in `en` fields |
| 21 | `{type:'tag',slug:'news'}` vs `{type:'category',slug:'news'}`; bare slug ambiguous on filter | correct ids; ambiguity → `invalid` with candidates |
| 22 | `import_media_from_url`: `http://169.254.169.254/`; host resolving public then private (stub lookup); `text/html` and SVG payloads | blocked / blocked at connect / `invalid` MIME |
| 23 | REST abuse with api-key: `PATCH /api/users/<self>` password; admin key `DELETE /api/posts/<id>` | 403; 403 (trash via update still works) |
| 24 | `get_site` / `whoami` responses | no storage secrets, no hash/salt fields |
| 25 | JSON-RPC batch; 3 MB chunked body | 400; 413 |
| 26 | `MCP_ENABLED=false` | 404 |
| 27 | Pages: `create_page` with `pageType`, `update_page` `en` locale | persisted; `vi` untouched |

## Real-client smoke (scripted where possible; results recorded in `reports/smoke-report.md`)
1. `pnpm migrate && pnpm seed:demo && pnpm dev`; create a dedicated editor user and enable its API key.
2. Inspector CLI: `tools/list` (23 tools), `whoami`, `create_post`, `get_content`, `update_post`, `trash_content`.
3. Claude Code: `kcms setup claude-code --write --scope project`, then `claude -p "Using the kdigi MCP server, list my sites and create a draft post titled 'MCP smoke' on site demo"`. Verify the draft in admin.
4. Codex CLI: `kcms setup codex --write`, then `codex exec "list kdigi sites via MCP"`.
5. OMP: `kcms setup omp --write --with-skill`, then call `whoami` from an OMP session; confirm the skill is listed.
6. Cursor / VS Code: manual. The config from `kcms setup cursor|vscode` loads and the tools are listed (screenshot).
7. CLI round trip from the Phase 3 success criteria, and `kcms mcp` stdio in Inspector.
8. `docker build .`, boot the container, then `/api/mcp` responds with 401 without a key and 200 with one.

## Related Code Files
- Modify: `src/test-utils/payload-integration.ts` (harness extensions above).
- Create: `src/mcp/mcp.integration.test.ts`, `plans/261103-1600-ai-native-mcp-cli/reports/smoke-report.md`.

## Success Criteria
- [ ] All 27 scenarios green in `pnpm test:integration`; existing integration tests still green (hook and error-type changes).
- [ ] Claude Code, Codex, and OMP smoke pass; Cursor and VS Code configs verified.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` green; the Docker image builds and serves `/api/mcp`.

## Risk Assessment
Client CLIs need accounts and network access. If a client cannot run in the environment, record it as unverified in the smoke report instead of claiming success.
