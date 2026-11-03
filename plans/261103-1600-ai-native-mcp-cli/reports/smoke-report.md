# Smoke report — AI-native MCP + kcms CLI

Date: 2026-11-03 · branch `develop` · local Postgres (`kdigi-open-pg`), dev server `next dev -p 3123`, smoke user `agent-smoke@example.com` (editor, site `demo`) with an API key.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | curl: no key / GET / batch / initialize / tools/list | ✅ 401 + Bearer challenge / 405 / 400 / server info + instructions / 23 tools | `/tmp/mcp-smoke.sh` |
| 2 | curl: full tool tour (get, stale update → conflict, update, seo report, urls draft→live, publish, versions, trash, restore, taxonomies + duplicate → conflict, shortcodes, media search, SSRF 127.0.0.1 → invalid, seo audit, foreign site) | ✅ | `/tmp/mcp-smoke2.sh`; one bug found + fixed (`withRowLock` selected `deleted_at`, which `media` lacks → `update_media_alt` 500) |
| 3 | Media: import PNG (agent), import HTML / redirect-to-HTML → invalid, alt update, REST `/api/media/from-url` with API key → raster-only | ✅ | `/tmp/mcp-smoke3.sh` |
| 4 | REST permanent delete with an API key (`DELETE /api/media/:id`, `/api/posts/:id`) | ✅ 403 both | curl |
| 5 | MCP Inspector CLI (HTTP): `tools/call list_sites`, `resources/read kcms://guide/content`, `prompts/list` | ✅ | `npx @modelcontextprotocol/inspector --cli … --transport http` |
| 6 | CLI round trip: `login` (config mode 600) → `whoami` → `posts create` → `get -o` → unchanged update ("nothing changed") → edit → `update` (file `updatedAt` rewritten) → concurrent edit → exit 4 `conflict`, other change kept → `publish` → `urls` → `trash -y` → `untrash` → `versions` → `media upload` (ico refused exit 2, png ok) → `media alt` → `taxonomies` → `seo report/audit` → unknown frontmatter key exit 2 → wrong key exit 3 → `setup omp` → `tools list` (23) | ✅ | `/tmp/kcms-smoke.sh` |
| 7 | `kcms mcp` stdio proxy under MCP Inspector (`tools/call whoami`, `tools/list`) | ✅ | Inspector `--cli -e KCMS_CONFIG=… node … mcp` |
| 8 | Claude Code 2.1.316: `kcms setup claude-code --write --with-skill` → `.mcp.json` with `${KCMS_API_KEY}`; `claude mcp list` (isolated HOME, user scope) → **Connected**; wrong key → "HTTP 401 … Invalid or disabled API key" | ⚠️ partial | Handshake verified. `claude -p` prompt run **not verified**: account hit its 5-hour usage limit. |
| 9 | Codex CLI 0.166.0: `kcms setup codex --write` → `codex mcp list` shows `kdigi`, Bearer from `KCMS_API_KEY`; `codex exec`: whoami → list_sites → search_content; second run: whoami → search_content → create_post → get_content → update_post (with expectedUpdatedAt) → get_content_urls | ✅ | post #142 "Codex MCP smoke" created as draft, excerpt edited |
| 10 | OMP 18.12.4: `kcms setup omp --write --with-skill` → `omp -p`: whoami + list_shortcodes via `kdigi`; skill `kcms` listed | ✅ | |
| 11 | Cursor | ⛔ not verified | Cursor not installed on this host. Config format checked against <https://cursor.com/docs/mcp> (`${env:NAME}`). |
| 12 | VS Code | ⛔ not verified live | GUI-only on this host. Config format (`inputs` + `${input:…}`) per <https://code.visualstudio.com/docs/copilot/chat/mcp-servers>. |
| 13 | `docker build .` (workspace lockfile, CLI manifest copied in deps stage) → container on :3124 → `/api/mcp` 401 without key, 200 `whoami` with key | ✅ | image `kdigi-cms:mcp-smoke` |
| 14 | `pnpm --filter @kdigi/kcms-cli build` + `npm pack --dry-run` → 17 files incl. `dist/`, `skills/kcms/SKILL.md`, no tests | ✅ | |
| 15 | Integration suite `src/mcp/mcp.integration.test.ts` — 27 scenarios | ✅ 27/27 | see test file; foreign site/doc pins `not_found` (invisible), foreign media alt pins `forbidden` |

Follow-ups for a human:
- Re-run row 8 with an un-throttled Claude account: `claude -p "…create a draft post…"` in a project with the generated `.mcp.json`.
- Load the Cursor and VS Code configs once on a desktop and confirm the 23 tools appear.
