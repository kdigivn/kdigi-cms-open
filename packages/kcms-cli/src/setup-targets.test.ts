import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { BUNDLED_SKILLS, mergeCodexToml, parseSkillNames, planSetup, SETUP_TARGETS } from './setup-targets.js'

const BASE = { baseUrl: 'https://cms.example.com', cwd: '/work/site', home: '/home/me' }
const SECRET = 'change-me-real-key-value'

describe('kcms setup', () => {
  it('never embeds a key — every written config references the env var or a prompt', () => {
    process.env.KCMS_API_KEY = SECRET
    for (const target of SETUP_TARGETS) {
      for (const scope of ['project', 'user'] as const) {
        const plan = planSetup({ target, scope, ...BASE })
        const written = plan.merge ? plan.merge('') : plan.snippet
        assert.doesNotMatch(written, new RegExp(SECRET), `${target}/${scope} leaked the key`)
        assert.match(written, /KCMS_API_KEY|\$\{input:kcms-api-key\}/, `${target}/${scope} has no key reference`)
      }
    }
    delete process.env.KCMS_API_KEY
  })

  it('merges into an existing JSON config without dropping other servers', () => {
    const plan = planSetup({ target: 'omp', scope: 'project', ...BASE })
    const merged = JSON.parse(plan.merge!(JSON.stringify({ mcpServers: { other: { command: 'x' } }, extra: 1 })))
    assert.deepEqual(Object.keys(merged.mcpServers).sort(), ['kdigi', 'other'])
    assert.equal(merged.extra, 1)
    assert.equal(merged.mcpServers.kdigi.url, 'https://cms.example.com/api/mcp')
  })

  it('replaces only the kdigi table in a Codex config', () => {
    const existing = 'model = "x"\n\n[mcp_servers.kdigi]\nurl = "https://old.example.com/api/mcp"\n\n[mcp_servers.other]\ncommand = "y"\n'
    const merged = mergeCodexToml(existing, 'https://cms.example.com/api/mcp')
    assert.doesNotMatch(merged, /old\.example\.com/)
    assert.match(merged, /\[mcp_servers\.other\]\ncommand = "y"/)
    assert.equal(merged.match(/\[mcp_servers\.kdigi\]/g)?.length, 1)
    assert.equal(mergeCodexToml(merged, 'https://cms.example.com/api/mcp'), merged)
  })

  it('puts OMP user config and skills under ~/.omp/agent', () => {
    const plan = planSetup({ target: 'omp', scope: 'user', ...BASE })
    assert.equal(plan.file, '/home/me/.omp/agent/mcp.json')
    assert.equal(plan.skillsRoot, '/home/me/.omp/agent/skills')
  })

  it('resolves --with-skill: absent, bare, and comma-separated lists', () => {
    assert.deepEqual(parseSkillNames(undefined), [])
    assert.deepEqual(parseSkillNames(true), ['kcms'])
    assert.deepEqual(parseSkillNames('kcms-frontend'), ['kcms-frontend'])
    assert.deepEqual(parseSkillNames(' kcms , kcms-frontend '), ['kcms', 'kcms-frontend'])
    assert.deepEqual(parseSkillNames('kcms,kcms'), ['kcms'])
    assert.deepEqual(parseSkillNames('kcms,'), ['kcms'])
  })

  it('rejects unknown or empty --with-skill values listing the valid names', () => {
    for (const value of ['nope', 'kcms,terms', '']) {
      assert.throws(
        () => parseSkillNames(value),
        (err: unknown) => err instanceof Error && BUNDLED_SKILLS.every((name) => err.message.includes(name)),
        `"${value}" should be rejected`,
      )
    }
  })

  it('exposes the skills root per target/scope', () => {
    const roots = SETUP_TARGETS.map((target) => [target, planSetup({ target, scope: 'project', ...BASE }).skillsRoot])
    assert.deepEqual(roots, [
      ['claude-code', '/work/site/.claude/skills'],
      ['codex', '/work/site/.codex/skills'],
      ['cursor', '/work/site/.cursor/skills'],
      ['vscode', '/work/site/.github/skills'],
      ['omp', '/work/site/.omp/skills'],
      ['json', undefined],
    ])
    assert.equal(planSetup({ target: 'vscode', scope: 'user', ...BASE }).skillsRoot, undefined)
  })
})
