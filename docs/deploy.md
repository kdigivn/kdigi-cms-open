# Deploy

Run KDIGI CMS in production: Docker image, Coolify, any VPS with Docker Compose, plus backups, health checks and troubleshooting.

KDIGI CMS is one Next.js server (admin + API on port 3000) and a PostgreSQL database. Uploaded media is stored on a persistent volume, or in Cloudflare R2 per site ([media and storage](media-storage.md)). Your public websites are separate frontends that call the API ([REST and GraphQL API](rest-api.md)).

## What you deploy

| Piece | Details |
| --- | --- |
| Image | [`Dockerfile`](../Dockerfile): Node 22 Alpine, multi-stage build, runs `next start` on port 3000 as the unprivileged `node` user. The image keeps `src/` and `node_modules` because the entrypoint runs `payload migrate` and the optional demo seed. |
| Entrypoint | [`docker/entrypoint.sh`](../docker/entrypoint.sh): (1) generate/persist `PAYLOAD_SECRET` in `DATA_DIR` if unset, (2) `payload migrate` unless `SKIP_MIGRATIONS=true`, (3) demo seed if `SEED_DEMO=true`, (4) start the server. |
| Database | PostgreSQL (the compose files use `postgres:16-alpine`). Use the bundled `db` service or any managed PostgreSQL via `DATABASE_URI`. |
| Volumes | `postgres_data` (database), `media_data` → `/app/media` (uploads), `app_data` → `/app/data` (generated secret). |
| Health | `GET /api/health` is a liveness probe only: it answers while the process serves HTTP and does **not** query the database. Both compose files use it for the container healthcheck (start period 90 s). |

Minimum production settings: `PAYLOAD_SECRET` (≥ 32 chars), `PAYLOAD_PUBLIC_SERVER_URL` (your `https://` URL), a database. Everything else is in [configuration](configuration.md).

## Option 1 — Coolify

[`docker-compose.coolify.yml`](../docker-compose.coolify.yml) is written for Coolify's "Docker Compose" resource type.

1. In Coolify: **New Resource → Docker Compose**, pick this repository (or your fork), set **Docker Compose Location** to `/docker-compose.coolify.yml`.
2. Add the environment variable `PAYLOAD_SECRET` (`openssl rand -hex 32`). It is the only required one; Coolify generates the domain, TLS certificate and the database password (`SERVICE_URL_APP_3000`, `SERVICE_PASSWORD_POSTGRES`).
3. Attach your domain to the `app` service (port 3000). If you use a custom domain, also set `PAYLOAD_PUBLIC_SERVER_URL=https://cms.example.com` — otherwise admin login and media URLs use the generated Coolify domain.
4. Optional variables the compose file forwards: `R2_OFF`, `ENABLE_JOBS_AUTORUN`, `FRONTEND_BASE_URL`, `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`, `RECAPTCHA_SECRET`, `MODERATION_WEBHOOK_URL`, `OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `SEED_DEMO`, `SKIP_MIGRATIONS`. A variable that is not listed in the compose `environment:` block does not reach the container — add it there if you need another one.
5. Deploy. The first start applies all migrations; open `https://cms.example.com/admin` and create the first user (it becomes `super-admin`).

External database instead of the bundled one: set `DATABASE_URI` and remove the `db` service together with the app's `depends_on` entry.

Coolify tips: enable its scheduled database backups for the `db` volume and keep `media_data` in your server backup (below). Redeploys never touch named volumes.

## Option 2 — Any VPS with Docker Compose

Requirements: a Linux server with Docker + Compose plugin, 2 GB RAM or more (the image build is memory hungry; the build script allows up to 8 GB of heap, so build on a bigger machine or add swap if it runs out of memory), and a domain pointing to the server.

```bash
git clone https://github.com/kdigivn/kdigi-cms-open.git
cd kdigi-cms-open
cat > .env <<'EOF'
POSTGRES_PASSWORD=change-me-to-a-long-random-password
PAYLOAD_SECRET=change-me-to-a-random-string-of-32-chars-or-more
PAYLOAD_PUBLIC_SERVER_URL=https://cms.example.com
ENABLE_JOBS_AUTORUN=true
EOF
docker compose up -d --build
```

[`docker-compose.yml`](../docker-compose.yml) reads that `.env` (`POSTGRES_PASSWORD`, `PAYLOAD_SECRET`, `PAYLOAD_PUBLIC_SERVER_URL`, `ENABLE_JOBS_AUTORUN` and the other optional variables from [configuration](configuration.md)). Use `PAYLOAD_SECRET` explicitly in production so you control and back it up.

The app listens on host port `APP_PORT` (default 3000) on all interfaces. Put a TLS-terminating reverse proxy in front and firewall the port, e.g. with Caddy:

```caddyfile
cms.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

nginx works the same way: proxy to `127.0.0.1:3000`, forward `Host` and `X-Forwarded-Proto`, and allow large request bodies (`client_max_body_size 50m;`) for media uploads.

Update later with `git pull && docker compose up -d --build` (migrations run on start; see [upgrading](upgrading.md)).

> Do not run `SEED_DEMO=true` on a real production install: it creates a demo site and sample content.

## Option 3 — Without Docker

Node.js ≥ 20.9, pnpm 10 and PostgreSQL are required.

```bash
pnpm install --frozen-lockfile
export DATABASE_URI=postgres://kdigi:change-me@127.0.0.1:5432/kdigi
export PAYLOAD_SECRET=... PAYLOAD_PUBLIC_SERVER_URL=https://cms.example.com NODE_ENV=production
pnpm build
pnpm migrate
pnpm start
```

Run it under a process manager (systemd, pm2) and set `MEDIA_DIR` to a persistent directory. `pnpm build` skips lint and type checking by design; run `pnpm typecheck` and `pnpm lint` yourself when you change code.

## Background jobs

Saving content queues a "revalidate frontend" job (the CMS calls `https://<site domain>/api/cms/revalidate` so your frontend refreshes its cache). Jobs only execute when `ENABLE_JOBS_AUTORUN=true`, which must be set on **exactly one** instance. With a single container, simply set it. Failed jobs stay in the `payload_jobs` table with `hasError`/`error` and are not browsable through the REST API; inspect them with SQL. See [architecture](architecture.md#jobs).

## Backups

Back up **both** the database and the media, and keep the `PAYLOAD_SECRET` you use (without it existing sessions and API keys stop working, but data stays readable).

Database (bundled PostgreSQL, run from the directory with the compose file):

```bash
docker compose exec -T db pg_dump -U kdigi --format=custom kdigi > kdigi-$(date +%F).dump
# restore into an empty database:
docker compose exec -T db pg_restore -U kdigi -d kdigi --clean --if-exists < kdigi-2026-01-01.dump
```

Media on local disk:

```bash
docker compose exec -T app tar czf - -C /app/media . > media-$(date +%F).tgz
# restore:
docker compose exec -T app tar xzf - -C /app/media < media-2026-01-01.tgz
```

Sites that use Cloudflare R2 keep their files in the bucket; enable bucket versioning/replication on the Cloudflare side. Test a restore on a scratch machine before you need it. For managed PostgreSQL use the provider's snapshots.

Rollback of a bad release: redeploy the previous image only if it understands the current schema; otherwise restore the database backup taken before the upgrade ([upgrading](upgrading.md)).

## Operations notes

- **Create the first user immediately.** On an empty database anyone who can reach `/admin` can submit the "create first user" form and becomes `super-admin`. Open the admin right after the first deploy (or restrict access at the proxy until you have).
- **Connections:** each instance uses a pool of up to 20 PostgreSQL connections; budget `max_connections` for instances plus CLI runs (`payload migrate`). Connect timeout is 10 s; idle-in-transaction sessions are reaped after 120 s.
- **One schema at a time:** `push` is disabled; the database only changes through migrations ([upgrading](upgrading.md)).
- **Multiple sites** need no redeploy: add a site in the admin, then configure that site's frontend and domain ([multi-site](multi-site.md)).
- **Logs:** application logs go to stdout. Set `OTEL_EXPORTER_OTLP_ENDPOINT` to export traces.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Container restarts at boot with `PAYLOAD_SECRET must be at least 32 characters` | Set `PAYLOAD_SECRET` to ≥ 32 characters (or unset it with Docker and let the entrypoint generate one). |
| Admin login loops, 403 on API calls | `PAYLOAD_PUBLIC_SERVER_URL` must equal the exact origin in the browser address bar (scheme, host, port). |
| App cannot connect to the database | `DATABASE_URI` host/port/password; in Compose use host `db`, not `localhost`. |
| Healthy container but admin errors about missing tables/columns | Migrations did not run or failed: check the container log, run `docker compose exec app node_modules/.bin/payload migrate`. |
| Uploaded images vanish after redeploy | `/app/media` is not on a persistent volume (or set `MEDIA_DIR` to one). |
| Images 404 or point at the wrong host | `PAYLOAD_PUBLIC_SERVER_URL` is the media URL prefix; see [media and storage](media-storage.md). |
| Frontend does not refresh after publishing | `ENABLE_JOBS_AUTORUN=true` on one instance, the site's `domain` is set, and the frontend exposes `/api/cms/revalidate`. |
| Build killed / out of memory | Build on a larger host or add swap; the build needs several GB of memory. |
| Build is green but code is broken | `next build` skips lint and type checking; run `pnpm typecheck` and `pnpm lint`. |
| Comment endpoint receives spam | Set `RECAPTCHA_SECRET` ([configuration](configuration.md)). |
