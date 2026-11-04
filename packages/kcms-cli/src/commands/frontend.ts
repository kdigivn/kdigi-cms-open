import type { Command } from 'commander'

import { CLI_VERSION } from '../client.js'
import { resolveBaseUrlAndSite } from '../config.js'
import { usageError } from '../errors.js'
import { collectSiteFacts, fetchAnonymousJson, renderKcmsMd, writeContextFile } from '../frontend-context.js'
import { action, globals } from '../runtime.js'

interface ContextOptions {
  output: string
  stdout?: boolean
  force?: boolean
}

export function registerFrontendCommands(program: Command): void {
  const frontend = program.command('frontend').description('Context for an AI building the public frontend')

  frontend
    .command('context')
    .description('Write KCMS.md — site facts for an AI frontend agent (anonymous REST, no API key)')
    .option('-o, --output <file>', 'file to write', 'KCMS.md')
    .option('--stdout', 'print to stdout instead of writing a file')
    .option('--force', 'overwrite an existing file')
    .action(
      action(async (o: ContextOptions, c: Command) => {
        const { url, site } = resolveBaseUrlAndSite(globals(c))
        if (!site) throw usageError('Missing site — pass --site <siteKey>, or set KCMS_SITE.')
        const facts = await collectSiteFacts(fetchAnonymousJson, url, site, { cliVersion: CLI_VERSION })
        const markdown = renderKcmsMd(facts)
        if (o.stdout) {
          process.stdout.write(markdown)
        } else {
          writeContextFile(o.output, markdown, o.force)
          process.stderr.write(`wrote ${o.output}\n`)
        }
        process.stderr.write('hint: Add to AGENTS.md / CLAUDE.md: Read KCMS.md before working on CMS data.\n')
      }),
    )
}
