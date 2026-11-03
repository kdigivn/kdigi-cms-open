import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { Command } from 'commander'

import { httpTransport } from '../client.js'
import { normalizeBaseUrl, readConfig, resolveConnection } from '../config.js'
import { usageError } from '../errors.js'
import { runProxy } from '../proxy.js'
import { action, globals } from '../runtime.js'
import { planSetup, SETUP_TARGETS, type SetupScope, type SetupTarget } from '../setup-targets.js'

/** The skill shipped inside the npm package (`skills/kcms`, bundled at build time). */
function bundledSkillDir(): string {
  const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const candidates = [join(pkgRoot, 'skills', 'kcms'), join(pkgRoot, '..', '..', 'skills', 'kcms')]
  const found = candidates.find((dir) => existsSync(join(dir, 'SKILL.md')))
  if (!found) throw usageError('The bundled kcms skill was not found in this installation.')
  return found
}

export function registerSetupCommands(program: Command): void {
  program
    .command('setup <target>')
    .description(`Configure an AI tool to use this CMS over MCP (${SETUP_TARGETS.join(' | ')})`)
    .option('--write', 'write/merge the config file instead of printing it')
    .option('--scope <scope>', 'project | user', 'project')
    .option('--with-skill', 'also install the kcms agent skill for that tool')
    .action(
      action(async (target: string, o: { write?: boolean; scope: string; withSkill?: boolean }, c: Command) => {
        if (!SETUP_TARGETS.includes(target as SetupTarget)) throw usageError(`Unknown target "${target}". Use one of: ${SETUP_TARGETS.join(', ')}.`)
        if (o.scope !== 'project' && o.scope !== 'user') throw usageError('--scope must be project or user')
        const g = globals(c)
        const config = readConfig()
        const profile = config.profiles[g.profile ?? config.default ?? 'default']
        const rawUrl = g.url ?? process.env.KCMS_URL ?? profile?.url
        if (!rawUrl) throw usageError('Pass --url <cms url> (or run `kcms login` first).')
        const plan = planSetup({ target: target as SetupTarget, scope: o.scope as SetupScope, baseUrl: normalizeBaseUrl(rawUrl), cwd: process.cwd(), home: homedir() })

        if (o.write && plan.file && plan.merge) {
          const existing = existsSync(plan.file) ? readFileSync(plan.file, 'utf8') : ''
          mkdirSync(dirname(plan.file), { recursive: true })
          writeFileSync(plan.file, plan.merge(existing))
          process.stdout.write(`wrote ${plan.file}\n`)
        } else {
          if (o.write) process.stderr.write(`note: ${target} --scope ${o.scope} has no config file to write; showing what to do instead.\n`)
          process.stdout.write(`${plan.file ? `# ${plan.file}\n` : ''}${plan.snippet}\n`)
        }
        if (o.withSkill) {
          if (!plan.skillDir) throw usageError(`No skills folder is known for ${target} --scope ${o.scope}.`)
          cpSync(bundledSkillDir(), plan.skillDir, { recursive: true })
          process.stdout.write(`installed skill → ${plan.skillDir}\n`)
        }
        for (const note of plan.notes) process.stderr.write(`• ${note}\n`)
      }),
    )

  program
    .command('mcp')
    .description('Run as a stdio MCP server that forwards to the CMS (for stdio-only clients)')
    .action(
      action(async (_o: unknown, c: Command) => {
        const conn = resolveConnection(globals(c))
        // stdout is the protocol channel: diagnostics go to stderr only.
        await runProxy(new StdioServerTransport(), httpTransport(conn), (err) => process.stderr.write(`kcms mcp: ${err.message}\n`))
      }),
    )
}
