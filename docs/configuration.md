# Configuration

Every environment variable KDIGI CMS reads, what it does, and where it is used. Copy [`.env.example`](../.env.example) to `.env` for local development; in Docker/Coolify set variables on the container ([deploy](deploy.md)). Never commit a real `.env`.

Only three values are required: `DATABASE_URI`, `PAYLOAD_SECRET`, `PAYLOAD_PUBLIC_SERVER_URL`. With `docker compose up` you need none of them (the stack wires the database and generates a secret).

## Core

| Variable | Required | Default | Description | Read in |
| --- | --- | --- | --- | --- |
| `DATABASE_URI` | yes | — | PostgreSQL connection string, e.g. `postgres://kdigi:change-me@db:5432/kdigi`. Pool: max 20 connections, 10 s connect timeout, 120 s idle-in-transaction timeout. | `src/payload.config.ts` |
| `PAYLOAD_SECRET` | yes | — | Signs sessions and API keys. **≥ 32 characters in production** or the server refuses to boot. Changing it logs everyone out. The Docker entrypoint generates one into `DATA_DIR` if unset. | `src/payload.config.ts`, `docker/entrypoint.sh` |
| `PAYLOAD_PUBLIC_SERVER_URL` | yes (prod) | `http://localhost:3000` | Public URL of the CMS as browsers see it (`https://cms.example.com`). It is the admin origin used for CORS/CSRF **and** the prefix of media URLs. A wrong value shows up as 403 / lost login cookies. In development, `localhost:3000/3001/3101` are also accepted. | `src/payload.config.ts` |
| `NODE_ENV` | no | set by Next | `production` enables the secret length check, boot warnings and disables the GraphQL playground. | several |
| `PAYLOAD_CONFIG_PATH` | no | set in `Dockerfile` | Path of `payload.config.ts` for the Payload CLI inside the image (`/app/src/payload.config.ts`). | Payload CLI |

## Media storage

Local disk is the default; see [media and storage](media-storage.md).

| Variable | Default | Description | Read in |
| --- | --- | --- | --- |
| `MEDIA_DIR` | `./media` (Docker: `/app/media`) | Directory for uploads of every site that has no Cloudflare R2 configuration. Mount a persistent volume here. Layout: `<MEDIA_DIR>/<siteId>/<filename>`. | `src/lib/storage/local-media.ts` |
| `R2_OFF` | unset | `true` forces local disk for **all** sites, even those with R2 settings (useful when developing against a copy of production data). | `src/lib/r2-bucket-resolver.ts` |

R2 credentials are **not** environment variables: they are configured per site in the admin (Sites → System → Cloudflare R2), so each site can use its own bucket.

## Frontend integration

| Variable | Default | Description | Read in |
| --- | --- | --- | --- |
| `ENABLE_JOBS_AUTORUN` | unset | `true` starts the job runner that executes queued "revalidate frontend" jobs (every 10 s, up to 25 jobs per pass) and recovers jobs stuck in `processing` for more than 5 minutes after a restart. Set it on **exactly one** instance — Payload has no cross-instance job lock. Without it, jobs are queued but never run and production logs a warning at boot. | `src/payload.config.ts` |
| `FRONTEND_BASE_URL` | unset | Public base URL of a frontend, used to build document URLs for the admin "view on site" links. Fallback chain: this value → `https://<Sites.domain>` → `http://localhost:3002`. It applies to **every** site, so leave it unset on a multi-site install and let each site's `domain` decide. It is **not** the revalidation target; revalidation calls `https://<Sites.domain>/api/cms/revalidate` per site (the manual button falls back to `http://localhost:3002` only outside production). | `src/endpoints/frontend-doc-url.ts`, `src/endpoints/revalidate-frontend.ts` |
| `REVALIDATE_SECRET` | unset | When set, every revalidate ping (job and the editor's manual button) carries the header `x-revalidate-secret: <value>`, so a frontend can reject pings that do not come from this CMS. One value for all sites; unset keeps the ping unauthenticated. | `src/lib/revalidate-headers.ts` |

## AI SEO (optional)

| Variable | Default | Description | Read in |
| --- | --- | --- | --- |
| `DEEPSEEK_API_KEY` | unset | API key for the DeepSeek API (OpenAI-compatible, base URL `https://api.deepseek.com`). Without it the AI SEO buttons return an error; nothing else is affected. | `src/lib/ai/deepseek-client.ts` |
| `DEEPSEEK_MODEL` | unset | Model id to call, e.g. `deepseek-chat`. **There is no built-in default** — both variables are needed to use AI generation. Check a model with `pnpm verify:deepseek`. | `src/lib/ai/deepseek-client.ts` |
| `SEO_AI_RATE_LIMIT` | `20` | Maximum AI SEO generations per user per minute (in-memory, per instance). | `src/endpoints/seo-ai-generate.ts` |

## Public demo accounts (optional)

Run a public sandbox login (for example a read-me-first demo editor) without letting visitors lock each other out. Fully opt-in: with `DEMO_ACCOUNT_EMAILS` unset nothing changes. Role and site boundaries still come from [roles and permissions](roles-and-permissions.md#demo-accounts).

| Variable | Default | Description | Read in |
| --- | --- | --- | --- |
| `DEMO_ACCOUNT_EMAILS` | unset | Comma-separated emails (case-insensitive). These users cannot change their own **email, password, API key or API-key switch** (the request is rejected with a bilingual `403` message) and cannot delete themselves. Other users, including a super-admin, can still manage them. | `src/lib/demo-accounts.ts`, `src/collections/users.ts` |
| `DEMO_ACCOUNT_PASSWORD` | unset | Password that `pnpm demo:reset` sets on every account in `DEMO_ACCOUNT_EMAILS` (min. 8 characters). Required by that command only. | `src/seed/demo-reset.ts` |

`pnpm demo:reset` (in the Docker image it works as is; equivalent: `node --import tsx src/seed/demo-reset.ts`) wipes **only** the site with `siteKey = demo` (all its content, media files and folders, trash included), re-seeds it with the same data as `pnpm seed:demo`, and for each demo account creates it if missing and resets its password, role (`editor`) and sites (`demo` only). Other sites and users are never touched. Schedule it nightly, e.g. as a Coolify scheduled task on the `app` service with cron `0 3 * * *` and timezone `Asia/Ho_Chi_Minh`.

## Comments

| Variable | Default | Description | Read in |
| --- | --- | --- | --- |
| `RECAPTCHA_SECRET` | unset | Google reCAPTCHA secret used to verify the `recaptchaToken` sent to `POST /api/comments/create`. If unset, production logs a `[SECURITY]` warning at boot because the public comment endpoint is then open to spam. | `src/endpoints/create-comment.ts`, `src/payload.config.ts` |
| `MODERATION_WEBHOOK_URL` | unset | Every new pending comment is POSTed here as JSON. Unset = disabled. | `src/collections/comments.ts` |

## Observability

| Variable | Default | Description | Read in |
| --- | --- | --- | --- |
| `OTEL_SERVICE_NAME` | `kdigi-cms` | Service name on OpenTelemetry traces. | `src/instrumentation.ts` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset | OTLP/HTTP collector base URL; traces are sent to `<url>/v1/traces`. Unset = no export. | `src/instrumentation.ts` |

## Docker entrypoint and compose

Read by [`docker/entrypoint.sh`](../docker/entrypoint.sh) and [`docker-compose.yml`](../docker-compose.yml) / [`docker-compose.coolify.yml`](../docker-compose.coolify.yml) only:

| Variable | Default | Description |
| --- | --- | --- |
| `SEED_DEMO` | unset | `true` loads the idempotent demo site and sample content after migrating ([getting started](getting-started.md)). |
| `DEMO_ACCOUNT_EMAILS`, `DEMO_ACCOUNT_PASSWORD`, `REVALIDATE_SECRET` | unset | Forwarded by both compose files to the app container; see above. |
| `SKIP_MIGRATIONS` | unset | `true` skips the automatic `payload migrate` on container start (use when migrations run as a separate release step, see [upgrading](upgrading.md)). |
| `DATA_DIR` | `/app/data` | Where the entrypoint persists a generated `PAYLOAD_SECRET` (`payload-secret`). Mount a volume. |
| `POSTGRES_PASSWORD` | `kdigi` (local compose) | Database password for the bundled PostgreSQL in the local compose file. The Coolify compose uses a generated `SERVICE_PASSWORD_POSTGRES`. |
| `APP_PORT`, `DB_PORT` | `3000`, `5432` | Host ports of the local compose file (PostgreSQL binds to `127.0.0.1`). |

## WordPress migration (optional)

Only used by the importer scripts in `src/importers/` and `src/scripts/`; see [WordPress migration](wordpress-migration/README.md) (Vietnamese) for the full list and behaviour: `WP_URL`, `WP_AUTH_USER`, `WP_AUTH_PASSWORD`, `WP_POST_TYPES`, `WP_USER_AGENT`, `WP_UTC_OFFSET`, `GATE_APPROVER`, `KDIGI_LOCAL_DB_HOSTS`, `BACKUP_DIR`.

## Development and tests only

| Variable | Description |
| --- | --- |
| `PAYLOAD_INTEGRATION=1` | Enables `*.integration.test.ts` (`pnpm test:integration`) against a **local** database. |
| `PW_SKIP_WEB_SERVER=1` | Playwright (`pnpm test:e2e`) reuses an already running dev server. |
| `NEXT_PUBLIC_E2E=1` | Exposes an editor test hook in non-production builds; never set in production. |

## Per-site settings (not environment variables)

Everything that differs between websites lives in the **Sites** collection, editable in the admin: domain, default language, branding, SEO defaults and templates, contact/footer data, Cloudflare R2 storage, Organization identity for JSON-LD. See [multi-site](multi-site.md).

## Checklist for production

- `PAYLOAD_SECRET` ≥ 32 random chars, unique per install.
- `PAYLOAD_PUBLIC_SERVER_URL` = the real `https://` URL of the CMS.
- `ENABLE_JOBS_AUTORUN=true` on one instance if a frontend uses revalidation.
- `RECAPTCHA_SECRET` if the public comment endpoint is exposed.
- Persistent volumes (or R2) for media; database backups ([deploy](deploy.md)).
