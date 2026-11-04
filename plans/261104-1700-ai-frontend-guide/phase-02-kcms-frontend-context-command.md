---
phase: 2
title: "kcms frontend context command"
status: completed
priority: P1
dependencies: [1]
---

# Phase 2: kcms frontend context command

## Overview
`kcms frontend context` writes `KCMS.md` into the frontend repo: the facts an AI cannot guess about one site, fetched with **anonymous** REST.

## Requirements
- Functional:
  - Usage: `kcms frontend context [--url <cms>] [--site <siteKey>] [-o KCMS.md] [--stdout] [--force]`. Reuse global `--url`/`--site`/`--profile` (`packages/kcms-cli/src/cli.ts`) and profile/env resolution from `config.ts`; **no API key required, and never sent** even if configured.
  - Content of `KCMS.md`: CMS base URL; siteKey, tenant id, domain, defaultLanguage, available locales (`vi`, `en`) with per-locale "has content" hint; menu locations that exist; `pageGroup` keys → slugs; per-collection published counts (`pages`, `posts`, `products`, `landings`, `taxonomies` by type, `authors`, `faqs`, `redirects` enabled); one trimmed sample JSON per non-empty content type (`depth=1`, long HTML truncated to ~400 chars, arrays to 2 items); public route rules (from `publicPathFor` logic, stated as text); webhook URL `https://{domain}/api/cms/revalidate`; pointer to skill `kcms-frontend` and `<cms>/llms.txt`; generated-at timestamp + CLI version.
  - Refuses to overwrite an existing file without `--force`; `--stdout` prints instead.
  - Prints one hint line to stderr: add `Read KCMS.md before working on CMS data.` to AGENTS.md/CLAUDE.md. Does not touch those files.
- Non-functional: errors via existing `errors.ts` exit codes (2 usage, not-found → usage-style message `Site "x" not found at <url>`); network failure message names the URL; no insecure-http warning (that warning in `runtime.ts` protects the API key; this command sends none); no new dependency. <!-- Updated: Validation Session 1 - dropped http warning -->

## Architecture
- `packages/kcms-cli/src/commands/frontend.ts` → `registerFrontendCommands(program)`; registered in `cli.ts`.
- `packages/kcms-cli/src/frontend-context.ts`: pure functions
  - `collectSiteFacts(fetchJson, baseUrl, siteKey)` → `SiteFacts` (fetchJson injected → unit-testable without network).
  - `renderKcmsMd(facts)` → string (deterministic order).
- Anonymous fetch helper: plain `fetch` with `Accept: application/json` only — **must not** go through `client.ts` (which attaches Bearer).
- REST calls: `GET /api/sites?where[siteKey][equals]=…&depth=1&limit=1`; `GET /api/<c>?where[tenant][equals]=<id>&limit=1&depth=1` (gives `totalDocs` + sample in one call); `GET /api/menus?where[tenant][equals]=<id>&depth=0&limit=20&select[location]=true`; `en` hint via `?locale=en&fallback-locale=none&limit=1` on posts/pages.
- Field names must be verified against `src/collections/*` and `src/payload-types.ts` before coding (e.g. `products`/`landings` existence, taxonomy `type` values).

## Related Code Files
- Create: `packages/kcms-cli/src/commands/frontend.ts`, `packages/kcms-cli/src/frontend-context.ts`, `packages/kcms-cli/src/frontend-context.test.ts`
- Modify: `packages/kcms-cli/src/cli.ts` (register), `packages/kcms-cli/src/config.ts` only if a URL/site resolver without key is missing (add `resolveBaseUrlAndSite` — no key requirement)
- Read: `packages/kcms-cli/src/{config,client,errors,runtime}.ts`, `src/lib/frontend-public-path.ts`

## Implementation Steps
1. Read `config.ts` `resolveConnection`; if it throws without a key, add a key-less resolver returning `{ baseUrl, siteKey }`.
2. Implement `collectSiteFacts` with injected `fetchJson`; tolerate 404 collections (e.g. disabled) by skipping.
3. Implement `renderKcmsMd`; truncation helpers.
4. Wire command; write file / stdout / `--force`; stderr hint.
5. Tests (`node:test`, fake `fetchJson`):
   - output never contains the configured key even when `KCMS_API_KEY` is set and fake fetch records no `Authorization` header;
   - unknown siteKey → usage error with message;
   - empty collection omitted from samples, counted as 0;
   - existing file without `--force` → error, file untouched.
6. Manual: `pnpm kcms frontend context --url http://localhost:3000 --site <demo siteKey> --stdout` against `pnpm seed:demo`.

## Success Criteria
- [x] Command works with no key configured.
- [x] `KCMS.md` for demo site contains tenant id, locales, menu locations, pageGroup, counts, samples, routes, webhook URL.
- [x] Tests above pass in `pnpm test`; `pnpm typecheck` covers `packages/kcms-cli`.

## Risk Assessment
- Sample JSON leaks something sensitive → only anonymous reads (same as public site); `sites` secrets are `access.read:false`. Do not include the `sites` doc wholesale — whitelist fields.
- Huge HTML samples bloat agent context → truncation + `select`.
- Payload query-string encoding → build with `qs`-style encoder already used in CLI if any, else `URLSearchParams` with bracket keys (test one encoded URL).
