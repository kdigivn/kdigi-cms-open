/** Exit codes: 1 operation error, 2 usage, 3 auth, 4 conflict/locked (re-read and retry). */
export const EXIT = { op: 1, usage: 2, auth: 3, conflict: 4 } as const

export class CliError extends Error {
  readonly exitCode: number
  /** Server error code (`conflict`, `invalid`, …) when the failure came from a tool. */
  readonly code?: string

  constructor(message: string, exitCode: number = EXIT.op, code?: string) {
    super(message)
    this.name = 'CliError'
    this.exitCode = exitCode
    this.code = code
  }
}

export const usageError = (message: string) => new CliError(message, EXIT.usage, 'usage')

/** Tool errors arrive as text `"<code>: <message>"` (see the server's `src/mcp/tools.ts`). */
export function toolError(text: string): CliError {
  const match = /^([a-z_]+): ([\s\S]*)$/.exec(text)
  const code = match?.[1]
  const message = match?.[2] ?? text
  if (code === 'unauthorized') return new CliError(message, EXIT.auth, code)
  if (code === 'conflict' || code === 'locked') return new CliError(message, EXIT.conflict, code)
  return new CliError(message, EXIT.op, code)
}
