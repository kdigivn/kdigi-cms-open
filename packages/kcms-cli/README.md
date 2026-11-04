# @kdigi/kcms-cli

`kcms` is the command line and MCP bridge for [KDIGI CMS](https://github.com/kdigivn/kdigi-cms-open). Use it to write, edit and publish content from your terminal, or to connect an AI tool (Claude Code, Codex, Cursor, VS Code, OMP, …) to your CMS.

Every command calls the CMS's MCP endpoint (`POST /api/mcp`) as the user who owns the API key. That user's role and sites apply. The one exception is `kcms frontend context`, which reads the public REST API anonymously and needs no key.

## Install

```bash
npm install -g @kdigi/kcms-cli      # or: npx @kdigi/kcms-cli <command>
```

Node.js 20 or newer.

## Log in

Create an API key in the admin: **Users → your user → Enable API key**. Then:

```bash
kcms login --url https://cms.example.com
# API key: ********
```

The key is stored in `~/.config/kcms/config.json` (mode 600). For CI and agents, set environment variables instead:

| Variable | Meaning |
| --- | --- |
| `KCMS_URL` | CMS base URL |
| `KCMS_API_KEY` | API key (overrides the profile's key) |
| `KCMS_SITE` | Default site key |
| `KCMS_PROFILE` | Profile name |
| `KCMS_CONFIG` | Path of the config file |

Precedence: flags (`--url`, `--site`, `--profile`) > environment > profile.

## Write content as Markdown files

```bash
kcms posts list -q "giá vé"
kcms posts get 123 -o post.md        # frontmatter + Markdown body
$EDITOR post.md
kcms posts update post.md            # sends only the fields you changed
kcms posts publish 123               # --at 2026-12-01T02:00:00Z schedules it
kcms posts create new-post.md        # draft unless `status: published`
```

The frontmatter holds `id`, `title`, `slug`, `status`, `publishedAt`, `locale`, `excerpt`, `categories` (`{ type, slug }`), `author`, `featuredImage` (a media id, or a local image path that is uploaded first), `seo` (`title`, `description`, `focusKeywords`, `canonicalOverride`) and `updatedAt`. Unknown keys are refused.

`updatedAt` is the concurrency token. If someone saved the document after you fetched it, `update` fails with exit code 4 and nothing is overwritten: fetch again, re-apply your edit, retry.

Documents whose body is still legacy rich text come back converted to Markdown (`bodySource: legacy-converted`). Review the conversion, then pass `--ack-legacy` to save it.

## Other commands

| Command | What it does |
| --- | --- |
| `kcms whoami`, `kcms sites`, `kcms sites get <key>` | Who the key acts as; sites and content counts |
| `kcms posts\|pages list/get/create/update/publish/unpublish/trash/untrash/versions/restore` | Content |
| `kcms media upload <file>` / `import <url>` / `list` / `alt <id> <text>` | Images (jpg, png, webp, gif, avif) |
| `kcms taxonomies list` / `create <type> <name>` | Categories and tags |
| `kcms shortcodes` | Snippets usable as `[sc name="…"][/sc]` |
| `kcms seo audit` / `seo report <collection> <id>` | SEO checks |
| `kcms urls <collection> <id>` | Admin URL and public URL |
| `kcms tools list` / `tools call <name> --args '{…}'` | Raw MCP tools |

Add `--json` to any command for machine-readable output. Exit codes: `1` error, `2` usage, `3` authentication, `4` conflict or locked document.

## Connect an AI tool

```bash
export KCMS_API_KEY=…                       # in your shell profile
kcms setup claude-code --write --with-skill # .mcp.json + .claude/skills/kcms
kcms setup claude-code --write --with-skill kcms,kcms-frontend   # both skills
kcms setup codex --write --scope user       # ~/.codex/config.toml
kcms setup cursor --write                   # .cursor/mcp.json
kcms setup vscode --write                   # .vscode/mcp.json (prompts for the key)
kcms setup omp --write --with-skill         # .omp/mcp.json + .omp/skills/kcms
kcms setup json                             # generic config to copy
```

Without `--write` the config is only printed. Generated files reference `KCMS_API_KEY` and never contain the key itself. `--with-skill [names]` installs bundled agent skills into the tool's skills folder (`<skills dir>/<name>/`): bare `--with-skill` installs `kcms`, which teaches the agent the safe editorial workflow (read before write, drafts first, `expectedUpdatedAt`); `kcms-frontend` teaches it to build a public website on the REST API. Pass a comma-separated list for several; unknown names are refused.

For clients that only support stdio servers, `kcms mcp` runs a local stdio MCP server that forwards to the CMS:

```json
{ "command": "npx", "args": ["-y", "@kdigi/kcms-cli", "mcp"], "env": { "KCMS_URL": "https://cms.example.com", "KCMS_API_KEY": "${KCMS_API_KEY}" } }
```

Full guide: [docs/ai-integration.md](https://github.com/kdigivn/kdigi-cms-open/blob/main/docs/ai-integration.md).

## Build a website with an AI agent

```bash
cd my-frontend
kcms setup claude-code --write --with-skill kcms,kcms-frontend
kcms frontend context --url https://cms.example.com --site example-site   # writes KCMS.md
```

`kcms frontend context [-o <file>] [--stdout] [--force]` writes `KCMS.md`: the site's tenant id, domain, locales, menus, `pageGroup` mapping, published counts, trimmed sample documents, route rules and webhook URL — the facts an AI cannot guess. It uses anonymous REST only (never sends a key, even if one is configured), so the file is safe to commit. It refuses to overwrite an existing file without `--force`. Add `Read KCMS.md before working on CMS data.` to your `AGENTS.md` / `CLAUDE.md`. Guide: [docs/frontend-with-ai.md](https://github.com/kdigivn/kdigi-cms-open/blob/main/docs/frontend-with-ai.md).

## Releasing (maintainers)

Publishing is manual from a machine logged in to the `@kdigi` npm scope:

1. Bump `version` in `packages/kcms-cli/package.json` and `CLI_VERSION` in `src/client.ts`; add a CHANGELOG entry.
2. `pnpm --filter @kdigi/kcms-cli build` (copies every repo `skills/*` folder that has a `SKILL.md` into the package and compiles to `dist/`).
3. `cd packages/kcms-cli && npm pack --dry-run` and check the file list.
4. `pnpm --filter @kdigi/kcms-cli publish --access public`.

## License

MIT
