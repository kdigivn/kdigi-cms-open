---
phase: 3
title: kcms CLI package
status: completed
priority: P1
dependencies:
  - 2
effort: 2d
---

# Phase 3: kcms CLI package (`@kdigi/kcms-cli`)

## Overview
Publishable npm package `@kdigi/kcms-cli`, binary `kcms`, in a new pnpm workspace `packages/kcms-cli`. It is a **thin MCP client** of `/api/mcp`, so no business logic is duplicated and every content command maps 1:1 to an MCP tool. It adds what MCP cannot do well: local-file workflows (Markdown + frontmatter round-trip, binary upload), client setup, and a stdio proxy. Phase 3 owns every file under `packages/kcms-cli/` (README, build scripts, skill bundling); Phase 4 only authors `skills/kcms/**` and the docs.

## Key Insights
- Repo is single-package today. Root `pnpm` settings (`package.json:127-135`) are still honored at a pnpm 10 workspace root.
- Root `tsconfig.json:37-47` includes `**/*.ts`. Root `test` glob is `src/**/*.test.ts`. `eslint.config.mjs:45-51` `globalIgnores` has no `packages/**/dist`, and flat config does not read `.gitignore` (`.gitignore:41` already ignores `dist/`).
- Dockerfile `deps` stage copies only `package.json pnpm-lock.yaml patches` (`Dockerfile:10-12`), so `--frozen-lockfile` fails on a workspace lockfile unless the workspace files are copied.
- CI: `.github/workflows/ci.yml` runs lint/typecheck/test. It must also build and pack the CLI.
- Shell-expanded `${KCMS_API_KEY}` in `claude mcp add --header …` puts the literal key in argv and `~/.claude.json`. Only file-level env expansion keeps it out.

## Requirements
- Functional: commands below; profiles; `--json` on every command; exit codes `1` op error, `2` usage, `3` auth, `4` conflict/locked.
- Non-functional: Node ≥ 20; ESM; deps `@modelcontextprotocol/sdk`, `commander`, `gray-matter`. The key is never printed and never written into project files (env-var references only). Config file mode `0600`.

## Architecture

```
packages/kcms-cli/
  package.json         @kdigi/kcms-cli, bin {kcms: dist/cli.js}, files [dist, skills], publishConfig.access public, MIT
                       scripts: build = copy ../../skills/kcms → skills/ && tsc ; typecheck ; test
  tsconfig.json        outDir dist, module NodeNext
  README.md            npm page (quickstart, links to docs/ai-integration.md)
  src/cli.ts           commander root; global --profile --url --site --json
  src/config.ts        ~/.config/kcms/config.json {profiles:{name:{url,apiKey?}}, default}; precedence flags > env > profile
  src/client.ts        Client + StreamableHTTPClientTransport(url/api/mcp, Authorization: Bearer)
  src/markdown-doc.ts  frontmatter ⇄ tool args (round-trip)
  src/commands/*.ts    login, whoami, sites, content (posts|pages), media, taxonomies, shortcodes, seo, urls, tools, mcp, setup
  src/setup-targets.ts claude-code | codex | cursor | vscode | omp | json
```

Command map:

| Command | MCP tool / transport |
|---|---|
| `kcms login [--url] [--profile]` | hidden key prompt → `whoami` → save profile |
| `kcms whoami`, `kcms sites [get <siteKey>]` | `whoami`, `list_sites`, `get_site` |
| `kcms posts list [-q] [--status] [--taxonomy type:slug]` (`pages` same, minus taxonomy) | `search_content` |
| `kcms posts get <id\|slug> [-o file.md]` | `get_content` → frontmatter + Markdown (incl. `id`, `updatedAt`, `bodySource`) |
| `kcms posts create <file.md>` | `create_post` |
| `kcms posts update <file.md> [--ack-legacy]` | `update_post` with `expectedUpdatedAt` from frontmatter; rewrites `updatedAt` in the file on success; an empty body is refused unless `--clear-body` |
| `kcms posts publish\|unpublish <id> [--at ISO]` | `get_content` → `set_status` |
| `kcms posts trash <id>` (confirm unless `--yes`) / `untrash <id>` | `trash_content` / `restore_from_trash` |
| `kcms posts versions <id>` / `restore <versionId>` | `list_versions` / `restore_version` |
| `kcms media upload <file> [--alt] [--site]` | **REST** `POST /api/media` multipart (`Authorization: users API-Key`, `_payload` with `tenant`, `alt`); client-side check for image MIME |
| `kcms media import <url>` / `list` / `alt <id> <text>` | `import_media_from_url` / `search_media` / `update_media_alt` |
| `kcms taxonomies list\|create`, `kcms shortcodes` | `list_taxonomies` / `create_taxonomy` / `list_shortcodes` |
| `kcms seo audit` / `kcms seo report <collection> <id>` / `kcms urls <collection> <id>` | `seo_audit` / `get_seo_report` / `get_content_urls` |
| `kcms tools list` / `kcms tools call <name> --args '<json>'` | raw escape hatch |
| `kcms mcp` | stdio ↔ HTTP proxy (raw JSON-RPC forwarding `StdioServerTransport` ⇄ `StreamableHTTPClientTransport`, auth header injected) |
| `kcms setup <target> [--write] [--scope user\|project] [--with-skill]` | print (default) or write client config; `--with-skill` copies the bundled skill |

Frontmatter contract (round-trip with `get`; unknown keys → usage error):
```markdown
---
id: 123                       # absent on create
collection: posts
site: example
title: "Hello"
slug: hello
status: draft
publishedAt: 2026-11-10T02:00:00.000Z   # optional; future = scheduled
locale: vi
excerpt: "…"                  # posts only
categories:                   # posts only; {type, slug} round-trips unambiguously
  - { type: category, slug: news }
  - { type: tag, slug: ai }
featuredImage: ./cover.webp   # local path → `media upload` first, replaced by id; or numeric id
seo: { title: "…", description: "…", focusKeywords: [a, b] }
updatedAt: 2026-11-03T10:00:00.000Z     # sent as expectedUpdatedAt
bodySource: markdown          # informational; legacy-converted requires --ack-legacy on update
---
# Markdown body…
```

`setup` targets (the key always comes from env var `KCMS_API_KEY`; formats re-verified against client docs at implementation, URLs cited in docs):
- `claude-code`: project `.mcp.json` `{ mcpServers: { kdigi: { type: 'http', url, headers: { Authorization: 'Bearer ${KCMS_API_KEY}' } } } }` (Claude Code expands it at load time). For user scope, print `claude mcp add-json` with an explicit warning that the literal key is stored in `~/.claude.json`.
- `codex`: `~/.codex/config.toml` → `[mcp_servers.kdigi] url = "<url>/api/mcp"`, `bearer_token_env_var = "KCMS_API_KEY"`.
- `cursor`: `.cursor/mcp.json` / `~/.cursor/mcp.json` → `{ url, headers: { Authorization: "Bearer ${env:KCMS_API_KEY}" } }`.
- `vscode`: `.vscode/mcp.json` with an `inputs` password prompt.
- `omp`: `.omp/mcp.json` (project) or `~/.omp/agent/mcp.json` (user) → `{ mcpServers: { kdigi: { type: 'http', url, headers: { Authorization: 'Bearer ${KCMS_API_KEY}' } } } }`. OMP expands `${VAR}` at discovery (OMP docs `mcp-config.md` "Discovery-time `${...}` expansion"). Skill → `.omp/skills/kcms/` or `~/.omp/agent/skills/kcms/`.
- `json`: generic http entry plus a stdio entry `{ command: 'npx', args: ['-y','@kdigi/kcms-cli','mcp'], env: { KCMS_API_KEY: '${KCMS_API_KEY}' } }`.

## Related Code Files
- Create: `pnpm-workspace.yaml` (`packages: ['packages/*']`), `packages/kcms-cli/**` (above) + tests `config.test.ts`, `markdown-doc.test.ts`, `setup-targets.test.ts`, `proxy.test.ts`.
- Modify: root `package.json` scripts: `test` adds `"packages/*/src/**/*.test.ts"`; `typecheck` = `tsc --noEmit && tsc -p packages/kcms-cli --noEmit`; add `kcms` = `node --import tsx packages/kcms-cli/src/cli.ts`.
- Modify: root `tsconfig.json` `exclude` += `packages`; `eslint.config.mjs` `globalIgnores` += `'packages/**/dist/**'`.
- Modify: `Dockerfile` deps stage: `COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./` + `COPY packages/kcms-cli/package.json ./packages/kcms-cli/`.
- Modify: `.github/workflows/ci.yml`: add `pnpm --filter @kdigi/kcms-cli build && npm pack --dry-run` step.

## Implementation Steps
1. Workspace scaffold, Dockerfile, tsconfig, eslint, CI. Run `pnpm install` and `docker build --target deps .`.
2. `config.ts`: precedence flags > env `KCMS_URL`/`KCMS_API_KEY`/`KCMS_SITE` > profile > error hinting `kcms login`. Warn on a non-localhost `http://` URL.
3. `client.ts` + error→exit-code mapping.
4. `markdown-doc.ts` round-trip. Unit tests: parse→serialize is idempotent; unknown keys rejected; `{type, slug}` categories preserved.
5. Commands; `--json` prints `structuredContent` verbatim.
6. `kcms mcp` proxy. Unit test: forwards initialize/tools/list against an in-process fake HTTP MCP server.
7. `setup-targets.ts`. Unit test: no generated file contains a literal key, and each contains the env reference.
8. Build script bundles `skills/kcms` (authored in Phase 4) and runs `npm pack --dry-run`. Publishing is **manual** (Validation S1): `packages/kcms-cli/README.md` "Releasing" section documents `pnpm --filter @kdigi/kcms-cli build && pnpm --filter @kdigi/kcms-cli publish --access public` from a maintainer machine logged into the `@kdigi` npm scope; version bump + CHANGELOG entry first. No publish workflow in CI. <!-- Updated: Validation Session 1 - manual npm publish -->

## Success Criteria
- [ ] Against local dev: `pnpm kcms login` → `whoami` → `posts create demo.md` → `posts get <slug> -o demo.md` → edit → `posts update demo.md` → `publish` → `trash` → `untrash` all work.
- [ ] An admin save between `get` and `update` → exit 4 with the `conflict` message, and the admin's change survives.
- [ ] `kcms posts get` on a legacy Lexical-only post, then `update` without `--ack-legacy`, is refused and the body is unchanged.
- [ ] `kcms mcp` works as a stdio server in MCP Inspector.
- [ ] `kcms setup claude-code|codex|cursor|omp` output never contains the key.
- [ ] `docker build .` succeeds; root `pnpm lint && pnpm typecheck && pnpm test` green with `packages/kcms-cli/dist` present; CI green.

## Risk Assessment
| Risk | Mitigation |
|---|---|
| Workspace conversion breaks Docker/Coolify/CI | Step 1 first, verified with `docker build` and CI before any feature code |
| Client config formats drift | Print by default; source URLs in docs; `json` target as fallback |
| Plaintext key in the profile file | `0600`, env var preferred, documented; OS keychain deferred |

## Security Considerations
Hidden key prompt; the key only travels in the `Authorization` header; never in argv or project files; `trash` confirmation; HTTP (non-TLS) warning.
