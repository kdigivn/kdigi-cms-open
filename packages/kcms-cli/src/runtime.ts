import type { Command } from 'commander'

import { connect, type Kcms } from './client.js'
import { isInsecureRemote, resolveConnection, type ConnectionFlags } from './config.js'
import { CliError, EXIT } from './errors.js'

export interface GlobalOptions extends ConnectionFlags {
  json?: boolean
}

export const globals = (cmd: Command): GlobalOptions => cmd.optsWithGlobals<GlobalOptions>()

let warnedInsecure = false

/** Connect with the resolved profile, run `fn`, always close. */
export async function withKcms<T>(cmd: Command, fn: (kcms: Kcms, opts: GlobalOptions) => Promise<T>): Promise<T> {
  const opts = globals(cmd)
  const conn = resolveConnection(opts)
  if (isInsecureRemote(conn.url) && !warnedInsecure) {
    warnedInsecure = true
    process.stderr.write(`warning: ${conn.url} is plain http — the API key crosses the network unencrypted.\n`)
  }
  const kcms = await connect(conn)
  try {
    return await fn(kcms, opts)
  } finally {
    await kcms.close().catch(() => undefined)
  }
}

/** `--json` prints the tool result verbatim; otherwise the human renderer. */
export function print(opts: GlobalOptions, data: unknown, human: () => string): void {
  process.stdout.write(opts.json ? `${JSON.stringify(data, null, 2)}\n` : `${human()}\n`)
}

/** Wrap a commander action: CliError → message on stderr + exit code; anything else → exit 1. */
export function action<A extends unknown[]>(fn: (...args: A) => Promise<void>) {
  return async (...args: A): Promise<void> => {
    try {
      await fn(...args)
    } catch (err) {
      const cliError = err instanceof CliError ? err : new CliError(err instanceof Error ? err.message : String(err), EXIT.op)
      process.stderr.write(`error${cliError.code && cliError.code !== 'usage' ? ` (${cliError.code})` : ''}: ${cliError.message}\n`)
      if (cliError.code === 'conflict') process.stderr.write('hint: fetch the document again (`get -o`), re-apply your edit, and retry.\n')
      process.exitCode = cliError.exitCode
    }
  }
}

export function table(rows: Array<Record<string, unknown>>, columns: string[]): string {
  if (rows.length === 0) return '(none)'
  const cell = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v))
  const widths = columns.map((c) => Math.min(60, Math.max(c.length, ...rows.map((r) => cell(r[c]).length))))
  const line = (values: string[]) => values.map((v, i) => v.slice(0, widths[i]).padEnd(widths[i])).join('  ').trimEnd()
  return [line(columns), line(widths.map((w) => '-'.repeat(w))), ...rows.map((r) => line(columns.map((c) => cell(r[c]))))].join('\n')
}
