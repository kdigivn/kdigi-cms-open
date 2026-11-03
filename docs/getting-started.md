# Getting started

Run KDIGI CMS on your machine in a few minutes, log in, and create your first site.

## Requirements

| Path | You need |
| --- | --- |
| **Docker Compose** (easiest) | Docker with the Compose plugin |
| **`pnpm dev`** (for development) | Node.js ≥ 20.9 (22 recommended), pnpm 10 (`corepack enable`), Docker for PostgreSQL (or your own PostgreSQL; the compose files use 16) |

## Option A — Docker Compose (one command)

```bash
git clone https://github.com/kdigivn/kdigi-cms-open.git
cd kdigi-cms-open
SEED_DEMO=true docker compose up --build
```

Open <http://localhost:3000/admin>. On a fresh database the admin shows a **"Create first user"** form; the first user you create becomes the `super-admin`. Drop `SEED_DEMO=true` if you want an empty install.

What the stack does ([`docker-compose.yml`](../docker-compose.yml)):

- starts PostgreSQL 16 (`db` service) and builds/starts the app (`app` service);
- on every app start the entrypoint ([`docker/entrypoint.sh`](../docker/entrypoint.sh)) generates a `PAYLOAD_SECRET` on first start if you did not set one (kept in the `app_data` volume), applies database migrations (`payload migrate`), optionally loads the demo content (`SEED_DEMO=true`), then runs `next start`;
- keeps data in named volumes: `postgres_data` (database), `media_data` (uploads, served by the app), `app_data` (generated secret). `docker compose down` keeps them; `docker compose down -v` deletes everything.

Useful switches (set in your shell or in a `.env` file next to the compose file):

| Variable | Default | Effect |
| --- | --- | --- |
| `APP_PORT` | `3000` | host port of the CMS |
| `DB_PORT` | `5432` | host port of PostgreSQL (bound to `127.0.0.1` only) |
| `POSTGRES_PASSWORD` | `kdigi` | database password — local use only; change it if you expose the port |
| `PAYLOAD_PUBLIC_SERVER_URL` | `http://localhost:3000` | public URL of the CMS; set it if you change `APP_PORT` or put the stack behind a domain |
| `SEED_DEMO` | empty | `true` loads the demo site and sample content (idempotent) |

All other settings are described in [configuration](configuration.md).

## Option B — `pnpm dev` (hot reload)

```bash
git clone https://github.com/kdigivn/kdigi-cms-open.git
cd kdigi-cms-open
pnpm install --frozen-lockfile
cp .env.example .env            # the defaults match `docker compose up db`; set PAYLOAD_SECRET
docker compose up -d db         # only PostgreSQL, on localhost:5432
pnpm migrate                    # create the database schema (explicit; push is disabled)
pnpm seed:demo                  # optional: demo site + sample content
pnpm dev                        # http://localhost:3000/admin
```

Notes:

- Replace `PAYLOAD_SECRET` in `.env` with a random string of at least 32 characters (`openssl rand -hex 32`).
- The schema is never auto-synchronised: after pulling new code run `pnpm migrate` again ([upgrading](upgrading.md)).
- If port 3000 is busy Next.js picks 3001; development accepts the `localhost` origins 3000, 3001 and 3101, so login keeps working.
- Without a running database the app cannot start; use your own PostgreSQL by editing `DATABASE_URI` in `.env`.

## First steps in the admin

1. **Log in** with the first user you created. Forgot the password in a local install? Reset or create a super-admin from the command line:
   ```bash
   node --env-file=.env --import tsx src/scripts/create-admin-user.ts you@example.com 'a-long-password'
   ```
   (with Docker: `docker compose exec app node --import tsx src/scripts/create-admin-user.ts you@example.com 'a-long-password'`).
2. **Create a site** (Sites → Create new). A site is one website: set a unique `siteKey` (your frontend uses it to ask for its content), the bare `domain` (for example `example.com`) and the default language. The demo seed already creates a site with `siteKey` `demo`. See [multi-site](multi-site.md).
3. **Pick the site** in the admin site selector, then write content: posts, pages, categories/tags, menus, FAQs. The editor is Markdown-first ([content-markdown](content-markdown.md)).
4. **Upload media.** Files go to local disk by default ([media-storage](media-storage.md)); no cloud account is needed.
5. **Invite people** (Users) and assign them a role and one or more sites ([roles and permissions](roles-and-permissions.md)). Only `super-admin` can create users.
6. **Connect a frontend.** Your website fetches published content over REST or GraphQL, for example:
   ```bash
   curl 'http://localhost:3000/api/posts?where[tenant][equals]=1&sort=-publishedAt&limit=5'
   ```
   Anonymous requests only see published content, and `tenant` is the numeric id of your site (look it up by `siteKey` via `/api/sites?where[siteKey][equals]=demo`). See [REST and GraphQL API](rest-api.md) for the exact contract (site selection, locale, SEO fields, revalidation).

## Coming from WordPress?

Use the importer: [WordPress migration](wordpress-migration/README.md).

## Next

- [Configuration](configuration.md) — every environment variable
- [Deploy](deploy.md) — put it on a server
- [Architecture](architecture.md) — how the code is organised
- Having trouble? Check the [troubleshooting table](deploy.md#troubleshooting) or open an [issue](https://github.com/kdigivn/kdigi-cms-open/issues).
