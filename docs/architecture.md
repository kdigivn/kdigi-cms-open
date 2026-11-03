# Architecture

How KDIGI CMS is put together: the stack, how a request travels through it, what lives where under `src/`, and the hook, job and migration rules you must respect when changing code.

For field tables see [collections.md](collections.md); for the public API see [rest-api.md](rest-api.md); for tenancy and roles see [multi-site.md](multi-site.md) and [roles-and-permissions.md](roles-and-permissions.md). To run it locally see [getting-started.md](getting-started.md); to deploy it see [deploy.md](deploy.md).

## Stack

| Layer | Technology |
| --- | --- |
| CMS core | Payload 3.90.2 (`payload`, `@payloadcms/*` pinned to the same version) |
| App runtime | Next.js 15 App Router, React 19 |
| Database | PostgreSQL via `@payloadcms/db-postgres` (Drizzle); `push: false`, schema changes ship as migrations |
| Admin editor | Milkdown Crepe/Kit (Markdown), Lexical kept only as a hidden legacy fallback |
| Storage | Hybrid adapter on `@payloadcms/plugin-cloud-storage`: Cloudflare R2 for sites that have `Sites.r2` configured, local disk (`./media` or `MEDIA_DIR`) for every other site; `R2_OFF=true` forces local disk — see [media-storage.md](media-storage.md) |
| Observability | OpenTelemetry NodeSDK (`src/instrumentation.ts`) |
| Language / tooling | TypeScript, pnpm, tests with `node --import tsx --test` (colocated `*.test.ts`) |

## System boundary

KDIGI CMS is **admin + API only**. It stores content and site settings and serves them over REST/GraphQL. Public websites are separate frontends that read the API anonymously and are told to refresh via a [revalidate webhook](rest-api.md#revalidate-webhook).

- One **site** = one document in the `sites` collection. There are no Payload globals.
- The Sites collection is the tenant boundary: the multi-tenant plugin is configured with `tenantsSlug: 'sites'`, so content collections get a `tenant` relationship field and users get a `tenants[]` array. Prose in these docs says "site"; code and API fields say `tenant`.

## Request flow

1. **HTTP.** Next.js App Router. Payload REST is mounted at `/api` by `src/app/(payload)/api/[...slug]/route.ts`; GraphQL at `/api/graphql` (`src/app/(payload)/api/graphql/route.ts`, playground route `graphql-playground` — disabled in production); liveness at `/api/health` (`src/app/(payload)/api/health/route.ts`, answers `{"status":"ok"}` without touching the database). `next.config.ts` redirects `/` to `/admin`.
2. **Config.** `src/payload.config.ts` registers the collections, config-level endpoints, the multi-tenant plugin, the optional cloud-storage plugin, localization (`vi` default, `en`, fallback on), admin i18n, the Postgres adapter, the `jobs` queue and `onInit`.
3. **Access predicates.** `src/access/*` is the real security boundary: `published-and-live.ts` (anonymous reads), `tenant-scoped.ts` (authenticated reads/writes per site), `role-matrix.ts`, `content-delete-access.ts`. The multi-tenant plugin's list filters are advisory only. Details: [roles-and-permissions.md](roles-and-permissions.md).
4. **Collection hooks.** `src/hooks/*`, wired per collection in `src/collections/*.ts`.
5. **Storage.** The cloud-storage plugin is always registered with the hybrid adapter in `src/lib/r2-storage-adapter.ts` (R2 per site, local disk fallback in `src/lib/storage/local-media.ts`). See [media-storage.md](media-storage.md).

### Content write lifecycle

A save on a content collection (`posts`, `pages`, `products`, `landings`, `taxonomies`) runs, in order:

```
access (create/update)
  → beforeChange   enforceAuthorPermissions      authors cannot publish
  → beforeChange   makeGuardRestoreSlugConflict  restore-from-trash slug check
  → beforeChange   collection-specific derivations (author, excerpt, word count)
  → beforeChange   makeApplySeoTemplatesHook     breadcrumbs only (see seo.md)
  → beforeChange   autoRedirectOnSlugChange      creates a 301 redirect, never blocks
  → INSERT/UPDATE row + exactly one version row
  → afterChange    makeGenerateJsonLdHook        writes seo.jsonLd.raw via raw SQL
  → afterChange    triggerRevalidate             queues a revalidateFrontend job
  → afterRead      makeResolveOgImageFallbackHook (REST only)
```

The exact chain per collection is in `src/collections/<name>.ts` (`hooks:` block); `pages`, `landings` and `taxonomies` use subsets. Notable behaviours:

- `enforceAuthorPermissions` throws when the **effective** status (`data.status ?? originalDoc.status`) is `published` for a user with role `author`, so partial updates and trash restores cannot bypass it. Moving one's own document to the trash is allowed.
- `autoRedirectOnSlugChange` never blocks a save: failures are logged. Under a Local API script with no `req.user`, the redirect insert can be rejected by the tenant plugin and the failure vanishes into the log — scripts that rename slugs must create their own redirects.
- `triggerRevalidate` only decides and queues; the network call lives in the job.
- Anonymous reads never see trashed documents (`deletedAt` is part of the access predicate itself, so `?trash=true` does not widen it).

## Directory map

| Path | Contents |
| --- | --- |
| `src/payload.config.ts` | Root config (see above) |
| `src/instrumentation.ts` | OpenTelemetry bootstrap (Next.js instrumentation hook) |
| `src/collections/` | One file per collection (`sites`, `users`, `media`, `pages`, `posts`, `products`, `landings`, `taxonomies`, `authors`, `menus`, `faqs`, `shortcodes`, `redirects`, `comments`, `rating-events`) plus `payload-folders-tenant-scope.ts` (tenant scoping for Payload folders) |
| `src/access/` | Access predicates and the role matrix |
| `src/fields/` | Reusable field factories: `markdown-html-field.ts`, `seo-field-group.ts`, `slug-field.ts`, `sidebar-meta-fields.ts`, `sitemap-priority-field.ts`, `slug-url-prefix-map.ts` |
| `src/hooks/` | Collection hooks (SEO templates, JSON-LD, slug redirect, revalidate, comment counts, author guard) |
| `src/endpoints/` | Custom HTTP endpoints (list below) |
| `src/jobs/` | Payload job tasks (`revalidate-frontend-task.ts`) |
| `src/lib/` | Pure/shared logic: `jsonld/` (graph builders), `seo/` (placeholder resolver, OG fallback), `shortcodes/`, `ai/` (optional AI SEO generation), `content-calendar/`, `storage/` (local-disk media), Markdown/HTML conversion, SSRF guard, R2 adapter and bucket resolver, tenant resolution helpers |
| `src/importers/` | WordPress migration pipeline (`run-wp-migration.ts`, `wp-migration/`) and shared HTML→Markdown converters — see [wordpress-migration/README.md](wordpress-migration/README.md) |
| `src/seed/` | `seed-demo.ts`, run with `pnpm seed:demo` (demo site with sample content) |
| `src/components/admin/` | Custom admin UI: Milkdown editor, dashboard, content calendar, media grid/image editor, menu tree builder, SEO widgets |
| `src/components/ui/` | Shared UI primitives for the admin |
| `src/app/(payload)/` | Next.js routes for Payload (admin pages, REST, GraphQL, health) and the admin CSS (`custom.css`, `tailwind-admin.css`) |
| `src/migrations/` | Database migrations and the `index.ts` registry |
| `src/scripts/` | Operational scripts (`create-admin-user.ts`, `verify-deepseek-model.ts`, WordPress archive helpers) |
| `src/test-utils/` | Integration-test helpers |
| `src/payload-types.ts` | Generated by `pnpm generate:types` |
| `e2e/`, `fixtures/` | Playwright editor specs and fixtures |
| `docs/` | This documentation |

## Hook self-guard rules

These rules exist because each one has caused real bugs. Preserve them when editing hooks.

### Versioned collections must not re-save their own document

`posts`, `pages`, `products`, `landings`, `faqs`, `shortcodes` and `taxonomies` have `versions: { maxPerDoc: 30 }` (no drafts). Every `payload.update()` on them writes another version row. Therefore a hook **must not** call `payload.update()` on the document it is running for:

- Compute derived values in `beforeChange` so they land in the editor's own write (`postsWordCount`, `autoFillExcerpt`).
- For values only available after the write, write scalar columns with raw SQL on the request's transaction: `generate-jsonld` uses `persistJsonLdRaw` (`src/hooks/persist-jsonld-raw.ts`), which updates exactly four non-localized columns (`seo_json_ld_raw`, `seo_article_meta_published_time`, `seo_article_meta_modified_time`, `seo_updated_time`). `sync-comment-count.ts` and the rating endpoint do the same for `comment_count` and the rating columns. Use `requestDb(req)` from `src/lib/request-db-session.ts` so the statement runs in the open transaction instead of checking out a second pool connection.
- Never spread the whole localized `seo` group back through a nested update: the Drizzle upsert rebuilds locale and array storage and can overwrite the other locale.
- If a hook ever must write back to its own document, return `withPersistedUpdatedAt(doc, persisted)` (`src/hooks/with-persisted-updated-at.ts`). Otherwise the stored `updatedAt` is one write ahead of the API response and the admin editor shows a "document was changed" modal that discards unsaved edits.

### Context flags and `withScopedHookContext`

Hooks that nest a Local API call, and importers, communicate through `req.context` flags:

| Flag | Meaning | Honoured by |
| --- | --- | --- |
| `__generatingJsonLd` | Skip JSON-LD generation, SEO templates and revalidate for this write. Importers set it to manage JSON-LD themselves | `generate-jsonld.ts`, `apply-seo-templates.ts`, `publish-hook-guards.ts` |
| `__suppressExternalPublishHooks` | Bulk-write phase: do not queue frontend revalidation | `publish-hook-guards.ts`, `revalidate-on-comment-approval.ts` |
| `__preserveSourcePublishedAt` | Keep the source `publishedAt`/modified dates (imports) instead of stamping "now" | `sidebar-meta-fields.ts`, `generate-jsonld.ts` |
| `__siteDefaultOgImage` | Per-request memo of the site default OG image | `src/lib/seo/og-image-fallback.ts` |

**Always set flags with `withScopedHookContext(req, { ... })`** (`src/hooks/scoped-hook-request.ts`) and pass the returned object as `req`. Payload's `createLocalReq` assigns the merged context straight onto the request object it is given. Passing the live `req` plus a separate `context:` argument writes your flag into the context the outer hook chain is still using, and every later hook that checks that flag silently skips itself — revalidation or JSON-LD simply stops with no error. `withScopedHookContext` returns a shallow copy that keeps `transactionID` (same transaction) but confines the flag to the nested call.

### REST-only afterRead hooks

Three things change shape only when `req.payloadAPI === 'REST'`: the Markdown field hook (`markdown-html-field.ts`), `menus` (`projectTreeToItems`) and the FAQ answer field. The OG-image fallback hook is REST-only too. This is load-bearing: a read-time value must never leak into a Local API read-back, because a later write would persist it. Consequences for API users are in [rest-api.md](rest-api.md#graphql).

## Jobs

Frontend refreshes are Payload jobs, not awaited requests, so a slow or unreachable frontend never blocks a save.

| Item | Value |
| --- | --- |
| Task | `revalidateFrontend` (`src/jobs/revalidate-frontend-task.ts`) |
| Queue | `default` |
| Input | `{ tenantId, collection, id, slug }` — never carries secrets |
| Behaviour | Re-reads the site (`overrideAccess: true`), then `POST https://{Sites.domain}/api/cms/revalidate`, timeout 5 s. A site with no `domain` succeeds with `skipped` |
| Retries | 3 attempts, exponential backoff starting at 1 s; failures show up on the `payload_jobs` row |
| Queued by | `triggerRevalidate` / `triggerRevalidateAfterDelete` (and `revalidate-on-comment-approval.ts`, `triggerSiteRevalidate` for site settings) — queued on the caller's `req`, so a rolled-back save leaves no orphan job. A slug rename queues a second job for the old slug |
| Config | `jobs.deleteJobOnComplete: true`; `jobs.access.run` allows only `super-admin` to call `/api/payload-jobs/run` |

### `ENABLE_JOBS_AUTORUN` — run it on exactly one instance

The scheduler (`jobs.autoRun`, cron `*/10 * * * * *`, queue `default`, limit 25) only starts when `ENABLE_JOBS_AUTORUN=true`.

- **Unset:** jobs are queued but never executed. In production `payload.config.ts` logs a `[CONFIG]` warning at boot.
- **Set on more than one replica:** Payload has no cross-instance job lock, so every replica polls the same queue and runs jobs concurrently. Enable it on a single instance.
- The same flag gates the stale-claim recovery in `onInit`: rows left `processing = true` for more than 5 minutes (a container replaced mid-job) are reset so they run again.

## Custom endpoints

Config-level endpoints are registered in `payload.config.ts` (`endpoints: [...]`). Collection-level endpoints live on their collection because Payload's collection router owns the `/api/<collection>/*` namespace — a config-level endpoint under a collection slug never matches.

| Endpoint | Registered on | Auth | Purpose |
| --- | --- | --- | --- |
| `POST /api/ratings/submit` | config | public | Star rating for a post/product, IP-hash dedup |
| `POST /api/comments/create` | `comments` | public | Create a pending comment (reCAPTCHA optional) |
| `GET /api/sites/:siteKey/env-page?key=` | `sites` | public (read access enforced) | Page mapped to a system key in `Sites.pageGroup` |
| `GET\|POST /api/sites/:id/secret` | `sites` | `super-admin` | Presence check / write for `r2.accessKeyId`, `r2.secretAccessKey`; values are never returned |
| `POST /api/revalidate-frontend` | config | logged-in | Manual "revalidate cache" ping to the site's frontend |
| `GET /api/frontend-doc-url` | config | logged-in | "View on site" URL for a document |
| `POST /api/seo/ai-generate` | config | logged-in | Optional AI suggestion for a SEO field — [seo.md](seo.md#ai-seo-generation-optional) |
| `GET /api/seo/audit` | config | logged-in | Site SEO audit — [seo.md](seo.md#seo-audit) |
| `GET /api/seo/internal-link-suggest` | config | logged-in | Internal link suggestions — [seo.md](seo.md#internal-link-suggestions) |
| `POST /api/media/from-url` | `media` | logged-in | Import an image from a URL (SSRF-guarded by `src/lib/ssrf-guard.ts`: http/https only, DNS + private/loopback/link-local range block, manual redirects re-validated, size and time caps) |
| `POST /api/media/:id/edit-image` | `media` | logged-in | Rotate/flip/crop/resize in place |
| `POST /api/media/fetch-from-r2` | `media` | logged-in | Reconcile out-of-band R2 objects into media rows |

Request/response contracts for the public ones are in [rest-api.md](rest-api.md). Built-in Payload routes also exist (`/api/<collection>`, `/api/<collection>/versions`, `/api/graphql`, `/api/payload-jobs/run`); version routes require login and are tenant-scoped.

## Database, migrations and crash guard

`src/payload.config.ts` configures the pool:

| Setting | Value | Why |
| --- | --- | --- |
| `max` | 20 | Media upload holds a connection through transcoding and storage write; the default of 10 let an upload burst starve the admin |
| `connectionTimeoutMillis` | 10 000 | Turns starvation into a visible error instead of a silent hang |
| `options` | `-c idle_in_transaction_session_timeout=120000` | Hooks do external I/O (frontend, storage) while a transaction is open; managed Postgres defaults (30 s) kill the session |
| `push` | `false` | Schema is never pushed, in dev or production |

**Migrations.** Because `push` is `false`, every schema change needs a migration in `src/migrations/`, registered in the array exported by `src/migrations/index.ts` (Payload reads that array, not the directory — an unregistered migration runs locally with `--file` and silently never runs in production). The baseline migration (`20261103_042515_initial.ts`) creates the whole schema on an empty database; later migrations (e.g. `20261103_052647_media_source_media_id`, 1.0.1) follow it. Commands: `pnpm migrate` (runs `payload migrate`), `pnpm migrate:down`, `pnpm payload migrate:create <name>`, then `pnpm generate:types`. `CREATE TYPE` is not idempotent; a new collection needs FK columns in `payload_locked_documents_rels` (generated migrations include them); `migrate:down` rolls back by batch, not by newest migration. Upgrade guidance: [upgrading.md](upgrading.md).

**`onInit`** (in `payload.config.ts`):

1. In production, `PAYLOAD_SECRET` shorter than 32 characters throws (done in `onInit`, not at module top level, because `next build` runs with `NODE_ENV=production` and no secret).
2. With `ENABLE_JOBS_AUTORUN=true`, reset stranded `processing` job rows.
3. Pool error handler (`[pg-pool]` log) and a process-level guard (`[pg-guard]`, installed once via `globalThis.__pgCrashGuard`) that swallows only Postgres connection-drop errors (`25P03`, "terminating connection…", "Connection terminated…"); every other uncaught error is re-thrown. Without it one dropped connection takes down the whole Next server.

**CORS/CSRF.** `serverURL` (`PAYLOAD_PUBLIC_SERVER_URL`, default `http://localhost:3000`) locks the CORS and CSRF origin lists. Outside production `localhost:3000`, `:3001` and `:3101` are added. An origin missing from the list makes Payload silently drop the auth cookie, which shows up as "admin API returns 403 while the page still renders".

**Boot warnings** (production, never fatal): `[SECURITY]` when `RECAPTCHA_SECRET` is missing, `[CONFIG]` when `ENABLE_JOBS_AUTORUN` is not `true`. Variables are listed in [configuration.md](configuration.md).

## Observability

`src/instrumentation.ts` starts the OpenTelemetry NodeSDK on the Node.js runtime with auto-instrumentations (pg, http, fetch). The service is named `OTEL_SERVICE_NAME` (default `kdigi-cms`, namespace `kdigi`). Without `OTEL_EXPORTER_OTLP_ENDPOINT` traces are collected but not exported; with it, spans go to `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`. Application logs use `req.payload.logger` with prefixes such as `[pg-pool]`, `[pg-guard]`, `[CONFIG]`, `[jobs]`.

## Build notes

`next build` is configured with `eslint.ignoreDuringBuilds` and `typescript.ignoreBuildErrors` (a memory workaround for small build hosts), so a green build proves nothing about types or lint. Run `pnpm typecheck` and `pnpm lint` separately.
