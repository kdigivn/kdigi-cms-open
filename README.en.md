# KDIGI CMS

**An open-source headless CMS that runs many websites from one install.**
Payload 3 · Next.js 15 · PostgreSQL · Markdown editor · Built-in SEO · MIT license

🇻🇳 [Phiên bản tiếng Việt](README.md) · 🌐 [Website: opencms.kdigi.vn](https://opencms.kdigi.vn) · 📚 [Documentation: docs.opencms.kdigi.vn](https://docs.opencms.kdigi.vn) · 🧪 [Live demo](https://app.opencms.kdigi.vn/admin)

KDIGI CMS is an admin panel plus REST and GraphQL API for managing the content of several websites at once. Your public sites (Next.js, Astro, Nuxt, a mobile app…) read content over the API; the CMS handles editing, SEO, media, permissions and moving off WordPress. It suits agencies, bloggers, small businesses and anyone leaving WordPress.

## Try it live

Open <https://app.opencms.kdigi.vn/admin> and sign in with the public demo account:

| Email | Password | Role |
| --- | --- | --- |
| `demo@opencms.kdigi.vn` | `Demo@2026` | `editor`, sees the `demo` site only |

This is a shared sandbox: the demo account cannot change its own email, password or API key, and the `demo` site is reset every night (03:00, Vietnam time). Do not enter real data. To enable the same protection on your own install see [configuration](docs/configuration.md#public-demo-accounts-optional).

> **Origin:** KDIGI CMS was extracted from a multi-site CMS that ran in production, then generalised for everyone.

## Features

- **Multi-site:** one install serves many domains; each site has its own branding, SEO defaults, contact/footer data, menus, content and (optionally) its own storage. Data is isolated per site by explicit access control.
- **Roles:** `super-admin` › `admin` › `editor` › `author`, with users assigned to specific sites.
- **Content model:** Pages, Posts, Products (product/service pages), Landings (block layouts), Categories/Tags, Authors, tree Menus, FAQs, Shortcodes, Redirects, Comments (with reCAPTCHA) and star Ratings. Version history, trash and scheduled publishing.
- **Vietnamese + English:** `vi` (default) and `en` content with fallback; admin UI in both languages.
- **Markdown editor (Milkdown):** slash menu, media and internal-link pickers, shortcodes, find & replace, rich paste; the API returns sanitised HTML.
- **Media:** library with folders, image editor, WebP on upload (R2 sites), import from URL (SSRF-guarded). **Local disk by default — no cloud account needed**; optional Cloudflare R2 storage per site.
- **SEO:** JSON-LD `@graph`, RankMath-style title/description templates, SEO audit and scoring, internal-link suggestions, automatic redirects on slug change, optional AI-assisted SEO text.
- **Editorial tools:** content calendar / editorial dashboard.
- **Frontend integration:** REST/GraphQL, revalidate webhook (ISR) on content changes, "view on site" links.
- **WordPress migration:** multi-phase importer (raw → staged → import) with an approval gate and backups. See the [guide](docs/wordpress-migration/README.md).
- **Easy to deploy:** `docker compose up` and you are running; Coolify compose file included; a demo site with sample content.

## Quick start

Requirement: Docker with Compose.

```bash
git clone https://github.com/kdigivn/kdigi-cms-open.git
cd kdigi-cms-open
SEED_DEMO=true docker compose up --build
```

Open <http://localhost:3000/admin>, create the first user (it automatically becomes `super-admin`) and pick the **demo** site to see sample content. Drop `SEED_DEMO=true` for an empty install. Data lives in Docker volumes (`postgres_data`, `media_data`, `app_data`) and survives `docker compose down`.

### Develop with `pnpm dev`

Requirements: Node.js ≥ 20.9, pnpm 10, Docker (for PostgreSQL).

```bash
pnpm install --frozen-lockfile
cp .env.example .env      # set a random PAYLOAD_SECRET of 32+ characters
docker compose up -d db   # PostgreSQL only, on port 5432
pnpm migrate              # create the schema (required; it is never auto-synced)
pnpm seed:demo            # optional: demo site + sample content
pnpm dev                  # http://localhost:3000/admin
```

More: [Getting started](docs/getting-started.md).

## Configuration

Three variables matter: `DATABASE_URI`, `PAYLOAD_SECRET` (≥ 32 characters in production) and `PAYLOAD_PUBLIC_SERVER_URL` (the public URL of the CMS). With `docker compose up` you set none of them. Optional variables (media storage, AI SEO, reCAPTCHA, revalidation jobs, OpenTelemetry…) are listed in [`.env.example`](.env.example) and [docs/configuration.md](docs/configuration.md). Per-website settings (domain, branding, SEO, R2…) live in the admin under **Sites**.

## Multi-site model

Each document in the **Sites** collection is one website, identified by `siteKey` and `domain`. Every piece of content belongs to exactly one site (the `tenant` field); a frontend gets its content by filtering on its site. Adding a site needs no CMS redeploy. See [docs/multi-site.md](docs/multi-site.md).

## Roles

| Role | Can do |
| --- | --- |
| `super-admin` | Everything on every site; creates sites, users and storage settings |
| `admin` | Manages content and settings of the sites they are assigned to |
| `editor` | Edits and publishes content in assigned sites |
| `author` | Writes and edits their own content, cannot publish |

Details: [docs/roles-and-permissions.md](docs/roles-and-permissions.md).

## Using the API from a frontend

```bash
# 1) find the site id from its siteKey
curl 'https://cms.example.com/api/sites?where[siteKey][equals]=my-site&limit=1'
# 2) fetch that site's published posts
curl 'https://cms.example.com/api/posts?where[tenant][equals]=1&sort=-publishedAt&limit=10&depth=1'
```

Anonymous requests only see published content; Markdown body fields come back as HTML under the original field key. GraphQL lives at `/api/graphql`. The full contract (locale, SEO, menus, comments, revalidation): [docs/rest-api.md](docs/rest-api.md).

## Deploy

Docker Compose on any VPS, or [Coolify](https://coolify.io) with [`docker-compose.coolify.yml`](docker-compose.coolify.yml). The container applies migrations on start. Back up both the database and the media directory. See [docs/deploy.md](docs/deploy.md).

## Upgrading

The schema only changes through explicit migrations (`pnpm migrate`; automatic on container start). Read [docs/upgrading.md](docs/upgrading.md) and the [CHANGELOG](CHANGELOG.md) first, and always back up.

## Common commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm start` | Develop / build / run production |
| `pnpm migrate` | Apply PostgreSQL migrations |
| `pnpm seed:demo` | Load the demo site + sample content (idempotent) |
| `pnpm demo:reset` | Wipe and re-seed the `demo` site, reset the password of the accounts in `DEMO_ACCOUNT_EMAILS` |
| `pnpm typecheck` / `pnpm lint` | TypeScript / ESLint checks (`next build` skips both) |
| `pnpm test` / `pnpm test:integration` / `pnpm test:e2e` | Unit tests / real-PostgreSQL tests / Playwright |
| `pnpm generate:types` / `pnpm generate:importmap` | Generate Payload types / admin import map |

## Tech stack

Payload 3.90 · Next.js 15 (App Router) · React 19 · PostgreSQL · Milkdown · Tailwind CSS 4 + shadcn/ui (admin only) · TypeScript · pnpm. Architecture: [docs/architecture.md](docs/architecture.md).

## Contributing

Contributions are welcome! Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). Report security issues via [SECURITY.md](SECURITY.md) — **not** in a public issue.

## License

[MIT](LICENSE) © 2026 [KDIGI](https://kdigi.vn). Project website: <https://opencms.kdigi.vn>.
