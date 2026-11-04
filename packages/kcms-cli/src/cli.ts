#!/usr/bin/env node
import { Command } from 'commander'

import { CLI_VERSION } from './client.js'
import { registerContentCommands } from './commands/content.js'
import { registerFrontendCommands } from './commands/frontend.js'
import { registerMiscCommands } from './commands/misc.js'
import { registerSetupCommands } from './commands/setup.js'

const program = new Command()
  .name('kcms')
  .description('KDIGI CMS from the terminal and from AI agents (MCP).')
  .version(CLI_VERSION)
  .option('--profile <name>', 'profile from ~/.config/kcms/config.json')
  .option('--url <url>', 'CMS base URL (overrides KCMS_URL / profile)')
  .option('--site <siteKey>', 'site to work on (overrides KCMS_SITE / profile)')
  .option('--json', 'print raw JSON results')
  .showHelpAfterError()
  .configureOutput({ outputError: (str, write) => write(str) })
  .exitOverride((err) => {
    process.exit(err.exitCode === 0 ? 0 : 2)
  })

registerMiscCommands(program)
registerContentCommands(program, 'posts')
registerContentCommands(program, 'pages')
registerFrontendCommands(program)
registerSetupCommands(program)

await program.parseAsync(process.argv)
