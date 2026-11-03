---
phase: 4
title: Agent skill and client setup docs
status: completed
priority: P2
dependencies:
  - 3
effort: 0.5d
---

# Phase 4: Agent skill and client setup docs

## Overview
Make the integration discoverable and correct by default. Two parts: an Agent Skill (`SKILL.md` format, read by Claude Code, Codex, OMP, and Cursor) that teaches the editorial workflow, and operator/user docs. Phase 4 authors only `skills/kcms/**` and the docs; Phase 3 bundles the skill into the CLI package.

## Requirements
- Functional: the skill installs via `kcms setup <client> --with-skill` or by manual copy. Docs cover key creation, every client, the CLI, limits, and troubleshooting.
- Non-functional: docs use `example.com` / `change-me` only (CLAUDE.md rule). Docs stay bilingual where they already are (README.md is vi, README.en.md is en).

## Architecture
```
skills/kcms/SKILL.md                    source of truth
skills/kcms/references/frontmatter.md   CLI file contract (mirrors Phase 3)
docs/ai-integration.md                  new: concepts, keys, MCP, CLI, per-client setup, security, limits, troubleshooting
```

SKILL.md outline:
- Frontmatter: `name: kcms`, `description: Use for creating, editing, scheduling, publishing posts/pages, media, taxonomies or SEO on a KDIGI CMS site via MCP tools or the kcms CLI.`
- Routing: if the MCP tools are available, use them; otherwise run `kcms … --json`.
- Workflow:
  1. `whoami`, then pick the site.
  2. `search_content` to check for existing docs.
  3. `get_content` before any write, keeping its `updatedAt`.
  4. Write Markdown and `create_*` as a draft.
  5. `get_seo_report`.
  6. Share `adminUrl` from `get_content_urls`, since drafts have no public URL.
  7. `set_status published` only on explicit request. A future `publishedAt` schedules the post.
- Content rules:
  - Markdown body; shortcodes come from `list_shortcodes`, syntax from `kcms://guide/content`.
  - Default locale is `vi`; use `en` via `locale`. A read returns `translated:false` when no `en` text exists, so do not copy `vi` text into `en`.
  - Taxonomies are referenced as `{type, slug}`.
  - SEO length targets: use the thresholds from `src/lib/seo-score.ts`, quoted verbatim at implementation.
- Safety:
  - Never trash or publish without an instruction.
  - On `conflict`, re-read and re-apply. On `locked`, report who holds the lock and stop.
  - Legacy bodies need explicit user consent for conversion.
  - Docs have a 30-version history cap per document, so batch edits.
  - Never embed secrets.

## Related Code Files
- Create: `skills/kcms/SKILL.md`, `skills/kcms/references/frontmatter.md`, `docs/ai-integration.md`.
- Modify:
  - `docs/README.md` (index).
  - `docs/rest-api.md`: note that `/api/mcp` is an authenticated admin surface, not part of the frontend contract.
  - `docs/roles-and-permissions.md`: an API key carries its owner's role. Key sessions cannot change credentials or permanently delete. Recommend dedicated author/editor "AI" users and discourage super-admin keys.
  - `docs/deploy.md`: proxy timeout ≥ 30 s, rate-limit `/api/mcp`, set `MCP_ENABLED` in Coolify.
  - `docs/content-markdown.md`: link to the MCP guide.
  - `README.md` + `README.en.md`: short "AI-native: MCP & CLI" section.
  - `CHANGELOG.md` Unreleased: MCP endpoint (enabled by default, `MCP_ENABLED=false` to disable), CLI, hook fixes (partial REST updates no longer clobber excerpt/breadcrumbs), media import hardening, and a **behavior change** note: API-key sessions on all REST/GraphQL routes can no longer change credentials/role/tenants or permanently delete. <!-- Updated: Validation Session 1 - global key hardening + MCP default on -->
  - `CLAUDE.md`: architecture bullet for `src/agent-api`, `src/mcp`, `packages/kcms-cli`, and the `overrideLock:false` rule.

## Implementation Steps
1. `docs/ai-integration.md`:
   - Enabling an API key on a dedicated user (admin → Users → profile → "Enable API Key").
   - Connecting each client: Claude Code, Codex CLI/IDE, Cursor, VS Code, OMP, and generic clients.
   - CLI quickstart, and testing with MCP Inspector.
   - Limits: ChatGPT web and Claude.ai web connectors need OAuth 2.1, which is not supported yet and is tracked as a follow-up plan.
2. Verify each client snippet against current official docs and cite the URLs. OMP format: `.omp/mcp.json` with `${VAR}` expansion, confirmed in OMP `mcp-config.md`.
3. Write SKILL.md and its reference.
4. Update the listed docs, README sections, CHANGELOG, and CLAUDE.md.

## Success Criteria
- [ ] A new user following only `docs/ai-integration.md` connects Claude Code and creates a draft post (validated in Phase 5).
- [ ] The skill loads in Claude Code (`/skills` lists `kcms`) and in OMP.
- [ ] No real domains or keys in any doc (grep).

## Risk Assessment
Client docs drift. Mitigation: each snippet cites its source URL, and `kcms setup` is the maintained path.
