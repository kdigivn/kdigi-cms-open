/**
 * MCP client configuration for each supported AI tool. The API key is NEVER written: every
 * config references the environment variable `KCMS_API_KEY`, expanded by the client at load
 * time. Sources (checked 2026-11): Claude Code `.mcp.json` env expansion, Codex
 * `bearer_token_env_var`, Cursor `${env:…}`, VS Code `inputs` (password prompt), OMP
 * discovery-time `${…}` expansion.
 */
import { join } from 'node:path'

import { mcpUrl } from './client.js'
import { usageError } from './errors.js'

export const SETUP_TARGETS = ['claude-code', 'codex', 'cursor', 'vscode', 'omp', 'json'] as const
export type SetupTarget = (typeof SETUP_TARGETS)[number]
export type SetupScope = 'project' | 'user'

export const SERVER_NAME = 'kdigi'
export const KEY_ENV = 'KCMS_API_KEY'

/** Agent skills shipped in the npm package (repo `skills/<name>`), installable with `--with-skill`. */
export const BUNDLED_SKILLS = ['kcms', 'kcms-frontend'] as const
export type BundledSkill = (typeof BUNDLED_SKILLS)[number]

/**
 * Resolve `--with-skill`: bare flag → `kcms` (the original behaviour), comma-separated list →
 * exactly those skills, absent → none. Unknown or empty names are usage errors.
 */
export function parseSkillNames(value: true | string | undefined): BundledSkill[] {
  if (value === undefined) return []
  if (value === true) return ['kcms']
  const names = [...new Set(value.split(',').map((name) => name.trim()).filter(Boolean))]
  if (names.length === 0) throw usageError(`--with-skill needs at least one skill name. Valid names: ${BUNDLED_SKILLS.join(', ')}.`)
  const unknown = names.filter((name) => !(BUNDLED_SKILLS as readonly string[]).includes(name))
  if (unknown.length) throw usageError(`Unknown skill ${unknown.map((name) => `"${name}"`).join(', ')}. Valid names: ${BUNDLED_SKILLS.join(', ')}.`)
  return names as BundledSkill[]
}

export interface SetupPlan {
  /** File to write with `--write`; absent → print-only target/scope. */
  file?: string
  /** Text shown to the user (the config snippet or the command to run). */
  snippet: string
  /** Produce the new file content from the existing one ('' when absent). */
  merge?: (existing: string) => string
  /** Where `--with-skill` copies bundled skills: the parent of `<name>/`. */
  skillsRoot?: string
  notes: string[]
}

interface SetupInput {
  target: SetupTarget
  scope: SetupScope
  baseUrl: string
  cwd: string
  home: string
}

function mergeJson(rootKey: string, entry: unknown, extra?: (doc: Record<string, unknown>) => void) {
  return (existing: string): string => {
    let doc: Record<string, unknown> = {}
    if (existing.trim()) {
      try {
        doc = JSON.parse(existing) as Record<string, unknown>
      } catch {
        throw usageError('The existing config file is not valid JSON — fix it or remove it first.')
      }
    }
    const servers = (doc[rootKey] ?? {}) as Record<string, unknown>
    doc[rootKey] = { ...servers, [SERVER_NAME]: entry }
    extra?.(doc)
    return `${JSON.stringify(doc, null, 2)}\n`
  }
}

function codexBlock(url: string): string {
  return `[mcp_servers.${SERVER_NAME}]\nurl = "${url}"\nbearer_token_env_var = "${KEY_ENV}"\n`
}

/** Replace an existing `[mcp_servers.kdigi]` table, or append one. */
export function mergeCodexToml(existing: string, url: string): string {
  const block = codexBlock(url)
  const header = `[mcp_servers.${SERVER_NAME}]`
  const lines = existing.split('\n')
  const start = lines.findIndex((l) => l.trim() === header)
  if (start === -1) return `${existing.replace(/\s*$/, '')}${existing.trim() ? '\n\n' : ''}${block}`
  let end = start + 1
  while (end < lines.length && !/^\s*\[/.test(lines[end])) end += 1
  return [...lines.slice(0, start), ...block.trimEnd().split('\n'), '', ...lines.slice(end)].join('\n').replace(/\n{3,}/g, '\n\n')
}

export function planSetup({ target, scope, baseUrl, cwd, home }: SetupInput): SetupPlan {
  const url = mcpUrl(baseUrl).toString()
  const bearer = `Bearer \${${KEY_ENV}}`
  const keyNote = `Export the key in your shell profile: export ${KEY_ENV}=<your API key>  (Admin → Users → your user → API key).`
  const httpEntry = { type: 'http', url, headers: { Authorization: bearer } }
  const at = (projectPath: string, userPath: string) => (scope === 'project' ? join(cwd, projectPath) : join(home, userPath))

  switch (target) {
    case 'claude-code': {
      if (scope === 'user') {
        return {
          snippet: `claude mcp add --transport http --scope user ${SERVER_NAME} ${url} --header "Authorization: Bearer $${KEY_ENV}"`,
          skillsRoot: join(home, '.claude', 'skills'),
          notes: [
            'Run the command above. Warning: your shell expands $KCMS_API_KEY, so the literal key is stored in ~/.claude.json.',
            'Prefer --scope project: .mcp.json keeps only the ${KCMS_API_KEY} reference.',
          ],
        }
      }
      const doc = { mcpServers: { [SERVER_NAME]: httpEntry } }
      return {
        file: join(cwd, '.mcp.json'),
        snippet: JSON.stringify(doc, null, 2),
        merge: mergeJson('mcpServers', httpEntry),
        skillsRoot: join(cwd, '.claude', 'skills'),
        notes: [keyNote, 'Claude Code expands ${KCMS_API_KEY} when it loads .mcp.json; approve the server on first use.'],
      }
    }
    case 'codex': {
      const file = at('.codex/config.toml', '.codex/config.toml')
      return {
        file,
        snippet: codexBlock(url),
        merge: (existing) => mergeCodexToml(existing, url),
        skillsRoot: at('.codex/skills', '.codex/skills'),
        notes: [keyNote, 'Codex reads the bearer token from KCMS_API_KEY at startup.'],
      }
    }
    case 'cursor': {
      const entry = { url, headers: { Authorization: `Bearer \${env:${KEY_ENV}}` } }
      return {
        file: at('.cursor/mcp.json', '.cursor/mcp.json'),
        snippet: JSON.stringify({ mcpServers: { [SERVER_NAME]: entry } }, null, 2),
        merge: mergeJson('mcpServers', entry),
        skillsRoot: at('.cursor/skills', '.cursor/skills'),
        notes: [keyNote, 'Restart Cursor (or toggle the server in Settings → MCP) after writing.'],
      }
    }
    case 'vscode': {
      const input = { type: 'promptString', id: 'kcms-api-key', description: 'KDIGI CMS API key', password: true }
      const entry = { type: 'http', url, headers: { Authorization: 'Bearer ${input:kcms-api-key}' } }
      const addInput = (doc: Record<string, unknown>) => {
        const inputs = Array.isArray(doc.inputs) ? (doc.inputs as Array<{ id?: string }>) : []
        doc.inputs = inputs.some((i) => i.id === input.id) ? inputs : [...inputs, input]
      }
      const snippet = JSON.stringify({ inputs: [input], servers: { [SERVER_NAME]: entry } }, null, 2)
      if (scope === 'user') {
        return { snippet, notes: ['Paste into your user mcp.json (Command Palette → "MCP: Open User Configuration"). VS Code prompts for the key once and stores it securely.'] }
      }
      return {
        file: join(cwd, '.vscode', 'mcp.json'),
        snippet,
        merge: mergeJson('servers', entry, addInput),
        skillsRoot: join(cwd, '.github', 'skills'),
        notes: ['VS Code prompts for the API key on first start and stores it in its secret storage.'],
      }
    }
    case 'omp': {
      return {
        file: at('.omp/mcp.json', '.omp/agent/mcp.json'),
        snippet: JSON.stringify({ mcpServers: { [SERVER_NAME]: httpEntry } }, null, 2),
        merge: mergeJson('mcpServers', httpEntry),
        skillsRoot: at('.omp/skills', '.omp/agent/skills'),
        notes: [keyNote, 'OMP expands ${KCMS_API_KEY} when it discovers the server.'],
      }
    }
    case 'json': {
      const stdio = { command: 'npx', args: ['-y', '@kdigi/kcms-cli', 'mcp'], env: { [KEY_ENV]: `\${${KEY_ENV}}`, KCMS_URL: baseUrl } }
      return {
        snippet: JSON.stringify({ mcpServers: { [SERVER_NAME]: httpEntry, [`${SERVER_NAME}-stdio`]: stdio } }, null, 2),
        notes: [
          'Generic MCP config: use the "http" entry if your client supports remote servers with headers, otherwise the stdio entry (kcms mcp proxies to the CMS).',
          keyNote,
        ],
      }
    }
  }
}
