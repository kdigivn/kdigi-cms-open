---
phase: 2
title: MCP endpoint at /api/mcp
status: completed
priority: P1
dependencies:
  - 1
effort: 1d
---

# Phase 2: MCP endpoint at /api/mcp

## Overview
Expose the 23 Phase-1 ops as an MCP server over stateless Streamable HTTP at `POST /api/mcp`, a root Payload endpoint served by the existing `src/app/(payload)/api/[...slug]/route.ts`. Works directly with Claude Code, Codex CLI, Cursor, VS Code, OMP, MCP Inspector.

## Key Insights
- `@modelcontextprotocol/sdk@1.32.2` ships `server/webStandardStreamableHttp.js` (`WebStandardStreamableHTTPServerTransport`): Web `Request` in, Web `Response` out. Peer zod `^3.25 || ^4` → reuse Phase-1 zod 4 schemas.
- The transport accepts JSON-RPC batch arrays and dispatches messages without awaiting (`webStandardStreamableHttp.js:511-513,599-606`) → tool calls can run concurrently. Phase 1 gives each op its own Local-API request/transaction, and this endpoint rejects batches anyway.
- `createPayloadRequest` does not read the body; the endpoint reads it once with a streaming byte cap.
- Stateless mode (`sessionIdGenerator: undefined`, `enableJsonResponse: true`): new `McpServer` per HTTP request, no session store → safe on multiple replicas.
- Why not `@payloadcms/plugin-mcp`: auto-CRUD exposes raw schemas (Lexical `content`, localized `seo`, hidden derived fields), adds a second key collection + migration (decision in plan.md).

## Requirements
- Functional: `initialize`, `tools/list`, `tools/call`, `resources/list|read`, `prompts/list|get`; GET/DELETE → 405 `Allow: POST`; JSON-RPC batch → 400.
- Non-functional: body cap 2 MB enforced while streaming (no `Content-Length` trust) → 413; tool failures are `isError: true` results; `MCP_ENABLED=false` → 404.

## Architecture

```
src/mcp/
  server.ts          buildMcpServer(user): McpServer ('kdigi-cms', version from package.json, instructions)
  tools.ts           registerTools(server, user) — one registerTool per op; handler builds AgentContext per call
  resources.ts       kcms://guide/content  (static Markdown syntax guide; shortcodes discovered via list_shortcodes)
  prompts.ts         write-post(site, topic, keyword), refresh-seo(collection, id)
  instructions.ts    server instructions string
src/endpoints/mcp.ts mcpEndpoint (post) + mcpMethodNotAllowed (get, delete)
```

```mermaid
sequenceDiagram
  participant C as MCP client
  participant E as /api/mcp endpoint
  participant A as agent-api/auth
  participant T as Transport + McpServer
  participant O as agent-api op (own local req + tx)
  C->>E: POST JSON-RPC + Authorization: Bearer key
  E->>A: resolveAgentUser(req)
  A-->>E: user | 401 (WWW-Authenticate: Bearer)
  E->>E: stream-read body ≤ 2 MB, parse, reject arrays
  E->>T: server.connect(transport); handleRequest(req, {parsedBody})
  T->>O: tool handler(args) → op(makeAgentReq(user), args)
  O-->>T: compact JSON | AgentError
  T-->>C: JSON response (structuredContent + text)
```

Tool annotations:

| Tools | Annotations |
|---|---|
| `whoami`, `list_sites`, `get_site`, `search_content`, `get_content`, `list_versions`, `list_taxonomies`, `search_media`, `list_shortcodes`, `seo_audit`, `get_seo_report`, `get_content_urls` | `readOnlyHint: true` |
| `create_post`, `create_page`, `create_taxonomy`, `import_media_from_url` | `readOnlyHint: false, destructiveHint: false` |
| `update_post`, `update_page`, `update_media_alt`, `set_status`, `restore_version`, `restore_from_trash` | `destructiveHint: false, idempotentHint: true` |
| `trash_content` | `destructiveHint: true` |

Result: `{ content: [{ type:'text', text: JSON.stringify(result) }], structuredContent: result }`; errors `{ isError: true, content: [{ type:'text', text: '<code>: <message>' }] }` (+ `details` e.g. current `updatedAt` on `conflict`, candidates on ambiguity).

Server `instructions` (short):
- Call `whoami` first; pass `site` (siteKey) when the user has more than one site.
- `search_content` before creating to avoid duplicate slugs. Body is Markdown in `markdown`; syntax in `kcms://guide/content`; available shortcodes via `list_shortcodes`.
- Always `get_content` before `update_*`/`set_status`/`trash_content` and pass its `updatedAt` as `expectedUpdatedAt`; on `conflict` re-read and re-apply.
- Create as `draft`. Drafts are not publicly viewable — share `adminUrl` from `get_content_urls`. Publish (`set_status`) only on explicit user request; a future `publishedAt` schedules (`live:false`).
- On `locked`: tell the user who is editing; do not retry in a loop.
- Never put secrets in content.

## Related Code Files
- Create: `src/mcp/{server,tools,resources,prompts,instructions}.ts`, `src/endpoints/mcp.ts`, `src/endpoints/mcp.test.ts`, `src/mcp/tools.test.ts`.
- Modify: `src/payload.config.ts` (`endpoints` += `mcpEndpoint`, `mcpMethodNotAllowed`), `package.json` + lockfile (`@modelcontextprotocol/sdk@^1.32.2`), `.env.example` + `docs/configuration.md` (`MCP_ENABLED`, default `true`), `docker-compose.coolify.yml` + `docker-compose.yml` (`MCP_ENABLED=${MCP_ENABLED:-}` in the explicit env pass-through list, `docker-compose.coolify.yml:39-42`).

## Implementation Steps
1. Add SDK; confirm ESM imports resolve in the Next 15 server bundle (`serverExternalPackages` only if bundling breaks).
2. `instructions.ts`, `resources.ts`, `prompts.ts`.
3. `tools.ts`: `registerTool(name, { description, inputSchema, annotations }, handler)`; handler = `wrap(op)` → `toAgentError` → `isError`. Unit test: all 23 tools register and list with expected annotations.
4. `server.ts`.
5. `endpoints/mcp.ts`: kill switch → `resolveAgentUser` (401 + `WWW-Authenticate: Bearer realm="kdigi-cms"`) → stream-read body with byte counter (413) → `JSON.parse` (400 parse error) → array → 400 → transport `handleRequest(req as unknown as Request, { parsedBody })`. Spec-required `Accept` handling stays in the SDK (406).
6. Register endpoints; confirm no `mcp` collection slug collision.
7. Smoke: `curl` `tools/list` with Bearer; `npx @modelcontextprotocol/inspector --cli http://localhost:3000/api/mcp --transport http --header 'Authorization: Bearer <key>' --method tools/call --tool-name whoami`.

## Success Criteria
- [ ] Inspector CLI lists 23 tools with annotations; `whoami` returns the key owner with `strategy: 'api-key'`.
- [ ] No/invalid key → 401 + `WWW-Authenticate`; cookie-only session → 401; batch → 400; 3 MB chunked body without `Content-Length` → 413.
- [ ] `trash_content` triggers client approval in Claude Code.
- [ ] `MCP_ENABLED=false` (set via Coolify env) → 404.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` green; `next build` succeeds (bundle check only — it skips lint/typecheck).

## Risk Assessment
| Risk | Mitigation |
|---|---|
| SDK zod v4 edge cases in `registerTool` | Registration unit test lists all tools and validates one call per schema |
| Long tool calls (media import ≤ 15 s) vs proxy timeouts | JSON response mode; `docs/deploy.md` proxy timeout ≥ 30 s |
| DNS rebinding / CSRF | Header-only Bearer auth; cookie sessions rejected; no CORS opened for `/api/mcp` |

## Security Considerations
No unauthenticated tools; per-op audit log; destructive annotation on trash; streaming body cap; batch rejection; whitelist shapes.
