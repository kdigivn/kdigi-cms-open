# Changelog

All notable changes to KDIGI CMS are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.1] - 2026-11-03

### Fixed

- **WordPress migration, media phase:** `Media` gained the hidden `sourceMediaId` idempotency key (migration `20261103_052647_media_source_media_id`). Without it every media lookup failed, so featured images, sliders and inline images were not imported.
- **WordPress migration, re-runs:** media referenced only by URL (site logo, OG images) is keyed by a hash of its source URL and no longer re-uploaded on each run.
- **WordPress migration, source hosts with a port** (e.g. `127.0.0.1:8080`) are now matched when rewriting canonicals, menus and internal links.
- `--dry-run` on an empty database no longer reports missing inline-image targets as errors.

## [1.0.0] - 2026-11-03

First public release of KDIGI CMS (MIT), a headless multi-site CMS on Payload 3.90, Next.js 15 and PostgreSQL. It is extracted from a production multi-site system and generalised for agencies, bloggers, small businesses and people migrating off WordPress.

### Added

- **Multi-site:** one install serves many websites. Each `Sites` document holds branding, SEO defaults, contact/footer data, domain and optional storage credentials; content is scoped per site with explicit access predicates.
- **Roles:** `super-admin`, `admin`, `editor`, `author` with site assignment. Only a super-admin can change a user's `role` or site assignments; users editing their own account cannot escalate themselves.
- **Content model:** pages, posts, products (generic product/service pages), landings (block layouts), taxonomies, authors, menus (tree), FAQs, shortcodes, redirects, comments (with reCAPTCHA) and rating events. Content collections are versioned and localised (`vi` default, `en` with fallback).
- **Markdown-first editor** (Milkdown) with slash menu, media/link pickers, shortcodes, sanitised HTML output at the original REST field keys.
- **Media library** with folders, image editor, import from URL (SSRF-guarded), WebP conversion on upload for R2 sites. **Local-disk storage by default**; optional per-site Cloudflare R2 storage.
- **SEO subsystem:** JSON-LD graph generation, RankMath-style title/description placeholders, SEO audit, internal-link suggestions, optional AI SEO generation (DeepSeek API, enabled by `DEEPSEEK_API_KEY` and `DEEPSEEK_MODEL`).
- **Editorial tools:** content calendar / editorial dashboard, content trash and restore.
- **Frontend integration:** REST and GraphQL APIs, ISR revalidation job, frontend document URL resolver.
- **WordPress migration pipeline** (raw → staged → import) with runbook in [`docs/wordpress-migration/`](docs/wordpress-migration/README.md).
- **One-command local start** with Docker Compose (PostgreSQL + app) and a demo site with sample content.
- Documentation set under [`docs/`](docs/README.md), community files (Code of Conduct, Contributing, Security policy, issue/PR templates), CI workflow.

### Removed (relative to the private origin)

Domain-specific modules, optional CDN tooling, cloning pipelines and all site-specific one-off importers and fixtures from the private origin were not carried over to the open-source product.

[Unreleased]: https://github.com/kdigivn/kdigi-cms-open/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/kdigivn/kdigi-cms-open/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/kdigivn/kdigi-cms-open/releases/tag/v1.0.0
