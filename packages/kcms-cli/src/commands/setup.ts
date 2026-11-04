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
import { BUNDLED_SKILLS, planSetup, parseSkillNames, SETUP_TARGETS, type BundledSkill, type SetupScope, type SetupTarget } from '../setup-targets.js'

/** A skill shipped inside the npm package (`skills/<name>`, bundled at build time). */
function bundledSkillDir(name: BundledSkill): string {
  const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const candidates = [join(pkgRoot, 'skills', name), join(pkgRoot, '..', '..', 'skills', name)]
  const found = candidates.find((dir) => existsSync(join(dir, 'SKILL.md')))
  if (!found) throw usageError(`The bundled "${name}" skill was not found in this installation.`)
  return found
}

export interface SetupOptions {
  write?: boolean
  scope: SetupScope
  /** `true` for a bare `--with-skill`, otherwise the comma-separated value. */
  withSkill?: true | string
}

/** Register the `setup` options; separate so tests can exercise this exact definition. */
export function setupOptions(command: Command): Command {
  return command
    .option('--write', 'write/merge the config file instead of printing it')
    .option('--scope <scope>', 'project | user', 'project')
    .option('--with-skill [names]', `also install bundled agent skills (${BUNDLED_SKILLS.join(' | ')}); bare flag installs kcms`)
}

export function registerSetupCommands(program: Command): void {
  setupOptions(program.command('setup <target>').description(`Configure an AI tool to use this CMS over MCP (${SETUP_TARGETS.join(' | ')})`))
    .action(
      action(async (target: string, o: SetupOptions, c: Command) => {
        if (!SETUP_TARGETS.includes(target as SetupTarget)) throw usageError(`Unknown target "${target}". Use one of: ${SETUP_TARGETS.join(', ')}.`)
        if (o.scope !== 'project' && o.scope !== 'user') throw usageError('--scope must be project or user')
        const skills = parseSkillNames(o.withSkill)
        const g = globals(c)
        const config = readConfig()
        const profile = config.profiles[g.profile ?? config.default ?? 'default']
        const rawUrl = g.url ?? process.env.KCMS_URL ?? profile?.url
        if (!rawUrl) throw usageError('Pass --url <cms url> (or run `kcms login` first).')
        const plan = planSetup({ target: target as SetupTarget, scope: o.scope, baseUrl: normalizeBaseUrl(rawUrl), cwd: process.cwd(), home: homedir() })

        if (o.write && plan.file && plan.merge) {
          const existing = existsSync(plan.file) ? readFileSync(plan.file, 'utf8') : ''
          mkdirSync(dirname(plan.file), { recursive: true })
          writeFileSync(plan.file, plan.merge(existing))
          process.stdout.write(`wrote ${plan.file}\n`)
        } else {
          if (o.write) process.stderr.write(`note: ${target} --scope ${o.scope} has no config file to write; showing what to do instead.\n`)
          process.stdout.write(`${plan.file ? `# ${plan.file}\n` : ''}${plan.snippet}\n`)
        }
        if (skills.length) {
          if (!plan.skillsRoot) throw usageError(`No skills folder is known for ${target} --scope ${o.scope}.`)
          for (const name of skills) {
            const dest = join(plan.skillsRoot, name)
            cpSync(bundledSkillDir(name), dest, { recursive: true })
            process.stdout.write(`installed skill ${name} → ${dest}\n`)
          }
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
