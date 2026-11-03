# KDIGI CMS documentation

Reference documentation for KDIGI CMS, an open-source headless multi-site CMS (Payload 3 + Next.js 15 + PostgreSQL). Website: <https://opencms.kdigi.vn> · hosted docs: <https://docs.opencms.kdigi.vn> · live demo: <https://app.opencms.kdigi.vn/admin> (credentials in the root [README](../README.en.md#try-it-live)). The reference docs are written in English (the [WordPress migration](wordpress-migration/README.md) guides are in Vietnamese); the root [README](../README.md) is in Vietnamese with an [English version](../README.en.md).

## Start here

| Doc | Read it when you want to… |
| --- | --- |
| [Getting started](getting-started.md) | run KDIGI CMS locally with Docker Compose or `pnpm dev`, log in, and create your first site |
| [Configuration](configuration.md) | look up every environment variable and where each one is read |
| [Deploy](deploy.md) | run in production: Docker, Coolify, a generic VPS, backups, health checks |
| [Upgrading](upgrading.md) | move to a new version and run database migrations safely |

## Using the CMS

| Doc | Topic |
| --- | --- |
| [Multi-site](multi-site.md) | the Sites model: one install, many websites |
| [Roles and permissions](roles-and-permissions.md) | `super-admin`, `admin`, `editor`, `author` and how site isolation is enforced |
| [Content model](collections.md) | every collection, its fields, drafts/versions and localisation |
| [Markdown editor and shortcodes](content-markdown.md) | the Milkdown editor, the HTML your frontend receives, shortcode syntax |
| [SEO](seo.md) | JSON-LD, title/description placeholders, audit, optional AI generation |
| [Media and storage](media-storage.md) | local-disk default, per-site Cloudflare R2, image tools |
| [WordPress migration](wordpress-migration/README.md) | import an existing WordPress site |

## Building a frontend / extending

| Doc | Topic |
| --- | --- |
| [REST and GraphQL API](rest-api.md) | the public contract frontends rely on |
| [Architecture](architecture.md) | stack, source layout, hooks, jobs, custom endpoints |
| [Admin theming](admin-theming.md) | rebrand and restyle the admin panel |

## Project files

[Contributing](../CONTRIBUTING.md) · [Security policy](../SECURITY.md) · [Code of Conduct](../CODE_OF_CONDUCT.md) · [Changelog](../CHANGELOG.md) · [License (MIT)](../LICENSE)
