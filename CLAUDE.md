# CLAUDE.md

Guidance for AI coding agents (Claude Code, Codex, Cursor, …) working on KDIGI CMS. Read [README.en.md](README.en.md) and [docs/architecture.md](docs/architecture.md) for context, and [CONTRIBUTING.md](CONTRIBUTING.md) for the human workflow.

## What this repo is

**KDIGI CMS** — open-source (MIT) headless multi-site CMS: Payload 3 + Next.js 15 App Router + PostgreSQL. **Admin + API only**; public websites are separate frontends that consume REST/GraphQL. One site = one `Sites` document; there are no Payload globals. Media goes to local disk by default, optionally per-site Cloudflare R2 ([docs/media-storage.md](docs/media-storage.md)).

## Commands

```bash
pnpm dev                    # dev server → http://localhost:3000/admin
pnpm test                   # node --test + tsx over src/**/*.test.ts and packages/*/src/**/*.test.ts (colocated)
pnpm lint && pnpm typecheck # REQUIRED before considering work done — see gotcha below
pnpm test:integration       # real-Postgres tests (*.integration.test.ts); needs DATABASE_URI
pnpm migrate               # apply DB migrations (= payload migrate; push:false — always explicit)
pnpm payload migrate:create <name>   # generate a migration, then review the SQL
pnpm seed:demo             # demo site + sample content (idempotent; needs migrations applied)
pnpm generate:types         # after any schema change → src/payload-types.ts
pnpm generate:importmap     # after adding admin components
pnpm test:e2e               # Playwright editor specs (see e2e/README.md)
pnpm kcms <command>         # run the kcms CLI from source (packages/kcms-cli)
```

Run a single test file: `node --import tsx --test src/path/to/file.test.ts`

## Critical gotchas

- **`next build` skips lint AND typecheck** (`ignoreDuringBuilds` / `ignoreBuildErrors` in `next.config.ts`, an out-of-memory workaround for small build hosts). A passing build proves nothing — always run `pnpm typecheck` and `pnpm lint` yourself.
- **Migrations** (`src/migrations/`, timestamp-prefixed, registered in `index.ts`; 1.0.0 shipped a single baseline `20261103_042515_initial`; later releases add files after it): idempotent and reversible. `CREATE TYPE` is NOT idempotent. A new collection needs FK columns in `payload_locked_documents_rels` or the admin 500s — generated migrations handle this, hand-written ones often forget. Adding a `select` option (e.g. a `Sites.theme` value) or a job task slug needs an `ALTER TYPE … ADD VALUE` migration. Don't use `pnpm migrate:down` to test a freshly added migration on real data (it rolls back by batch). See [docs/upgrading.md](docs/upgrading.md).
- **Storage plugin is always registered**: `@payloadcms/plugin-cloud-storage` adds `media._objectkey`, and the hybrid adapter (`src/lib/r2-storage-adapter.ts`) routes each upload to local disk or per-site R2 at runtime; `R2_OFF=true` only forces local routing, it does not change the schema (see [docs/media-storage.md](docs/media-storage.md)).
- **Env files hold real credentials** for whatever database they point at. Never commit `.env*` (only `.env.example`), never run importers/scripts against a production database casually. WordPress import write phases against a remote DB require the `pg_dump` backup gate (`src/importers/wp-migration/prod-backup-gate.ts`) — never bypass it.
- **Never commit secrets.** Per-site secrets (storage keys) live in the `Sites` document with `access.read:false`; never log or return them. `get-env-page.ts` uses `overrideAccess` internally — changes there can leak field-level-hidden secrets (it has regressed before).
- **No private or real-domain data.** Fixtures, tests and docs use `example.com` / `change-me` only.
- **Docs drift**: trust `package.json` and source over prose. When behavior or public contracts change, update the matching file in `docs/` (especially [docs/rest-api.md](docs/rest-api.md)) and `.env.example`.

## Architecture essentials

- **Tenancy is two-layer**: `@payloadcms/plugin-multi-tenant` (`tenantsSlug:'sites'`) provides advisory admin filters; the real security boundary is `src/access/tenant-scoped.ts` predicates in every collection's `access.*`. Public reads use `publishedAndLive()`. Role hierarchy in `src/access/role-matrix.ts`: `super-admin > admin > editor > author`. See [docs/roles-and-permissions.md](docs/roles-and-permissions.md).
- **Content field pattern**: `markdownHtmlField(name)` (`src/fields/markdown-html-field.ts`) produces `{name}Md` (Milkdown editor, source of truth) + hidden legacy Lexical `{name}` (fallback). `afterRead` renders Markdown → sanitised HTML with shortcode expansion (`src/lib/shortcodes/expand-shortcodes.ts`, depth cap 3). REST returns HTML at the original field key — do not change that shape; `docs/rest-api.md` is the public contract for frontends.
- **Hooks self-guard**: content collections are **versioned** — every `payload.update()` writes a version row, so hooks must NOT re-save their own document: derive in `beforeChange` (e.g. wordCount) or write scalar columns directly (`persistJsonLdRaw`; never spread the localized `seo` group). Context flags (set with `req: withScopedHookContext(req, …)`, never a bare `context:` argument — see `src/hooks/scoped-hook-request.ts`): `__generatingJsonLd` is the importers' opt-out of JSON-LD/SEO side effects (it also suppresses revalidation); `__suppressExternalPublishHooks` suppresses frontend revalidation during importer write phases (`src/hooks/publish-hook-guards.ts`). Preserve these guards when editing hooks.
- **SEO subsystem**: `generate-jsonld.ts` writes the authoritative `@graph` to `seo.jsonLd.raw`. SEO titles/descriptions use RankMath-style placeholders resolved at render time by the frontend, not persisted. See [docs/seo.md](docs/seo.md).
- **Custom endpoints** live in `src/endpoints/` and register in `payload.config.ts` or on collections (comments `/create`, sites `/:siteKey/env-page`, media `/from-url` — SSRF-guarded via `src/lib/ssrf-guard.ts`). Admin endpoints check `req.user`; the few public ones (comments, ratings) are intentionally so. Comment creation is protected by reCAPTCHA (`RECAPTCHA_SECRET`) and field bounding; ratings by a collection whitelist and bounded fields. There is no built-in rate limiting on them — operators add it at the reverse proxy.
- **Jobs**: revalidate-frontend is a Payload job queued from `afterChange`. The runner is gated by `ENABLE_JOBS_AUTORUN=true` and must run on exactly ONE instance.
- **AI agent surface**: `src/agent-api/` holds transport-agnostic ops (strict zod schemas in `schemas.ts`); `src/mcp/` registers them as MCP tools; `src/endpoints/mcp.ts` serves `POST /api/mcp` (API-key header auth only, stateless). Ops run on a fresh Local-API request per call (`agentReq`), with `overrideAccess: false` and **`overrideLock: false` on every update** (the Local API default `true` skips the admin edit lock and deletes the editor's lock row), and writes to existing documents go through `withRowLock` (`expectedUpdatedAt`). `src/agent-api/agent-api-guards.test.ts` enforces these. API-key sessions are restricted globally (`src/lib/api-key-session.ts`: no account changes, no permanent deletes). The CLI `packages/kcms-cli` (pnpm workspace, `@kdigi/kcms-cli`) is a thin MCP client; the agent skill lives in `skills/kcms`. See [docs/ai-integration.md](docs/ai-integration.md).
- **WordPress migration**: generic multi-phase pipeline `src/importers/run-wp-migration.ts` (raw → staged → import, `.gate-lock` co-edit gate); runbook in [docs/wordpress-migration/README.md](docs/wordpress-migration/README.md).
- **Admin theming**: single re-theme surface `src/app/(payload)/custom.css`; Tailwind/shadcn utilities only inside `.twp` wrappers — never on bare Payload elements (breaks list tables). See [docs/admin-theming.md](docs/admin-theming.md).

## Conventions

- Kebab-case, descriptive file names; colocated `*.test.ts` using `node:test`.
- Vietnamese is the default locale (`vi`, fallback-enabled `en`); keep bilingual labels on admin fields.
- Env vars: [.env.example](.env.example) and the table in [docs/configuration.md](docs/configuration.md). `PAYLOAD_SECRET` must be ≥ 32 chars in production or boot hard-fails; most other missing optional settings only warn.
- Keep changes scoped; update tests and docs with behavior changes; add a line under "Unreleased" in [CHANGELOG.md](CHANGELOG.md) for user-visible changes.
