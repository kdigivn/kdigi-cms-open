/**
 * Typed failures for the agent surface. Every op throws `AgentError`; transports (MCP) render
 * `code: message` so a model can self-correct instead of seeing an opaque 500.
 */
import { APIError, ValidationError } from 'payload'
import { ZodError } from 'zod'

export type AgentErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'locked'
  | 'invalid'
  | 'internal'

export class AgentError extends Error {
  readonly code: AgentErrorCode
  readonly details?: Record<string, unknown>

  constructor(code: AgentErrorCode, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'AgentError'
    this.code = code
    this.details = details
  }
}

const STATUS_CODES: Record<number, AgentErrorCode> = {
  400: 'invalid',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  423: 'locked',
}

/** Postgres unique_violation, raw or wrapped by drizzle in `cause`. */
function isUniqueViolation(err: unknown): boolean {
  for (let cur: unknown = err, depth = 0; cur && depth < 4; depth += 1) {
    if (typeof cur !== 'object') return false
    if ('code' in cur && cur.code === '23505') return true
    cur = 'cause' in cur ? cur.cause : undefined
  }
  return false
}

/**
 * `@payloadcms/drizzle` (`handleUpsertError`) re-throws a unique_violation as a ValidationError.
 * Its message is translated (`vi`: "…không được trùng lặp"), but it is the only validation error
 * that carries `tableName` — field validators never set it.
 */
function isUniqueValidationError(err: ValidationError): boolean {
  return (err.data?.errors ?? []).some((e) => 'tableName' in e && Boolean(e.tableName))
}

/** Error text safe for the server log: drizzle's "Failed query … params:" carries whole bodies. */
function logLine(err: unknown): string {
  if (!(err instanceof Error)) return String(err)
  const message = err.message.split(/\nparams:/)[0]
  const frames = (err.stack ?? '').split('\n').filter((l) => /^\s+at /.test(l)).slice(0, 8)
  return [`${err.name}: ${message}`, ...frames].join('\n')
}

/**
 * Map anything thrown by an op (zod, Payload, Postgres) to an `AgentError`. Unknown failures
 * become `internal` with a generic message; the real error goes to `log` only.
 */
export function toAgentError(err: unknown, log?: (msg: string) => void): AgentError {
  if (err instanceof AgentError) return err
  if (err instanceof ZodError) {
    const issues = err.issues.map((i) => `${i.path.join('.') || '(input)'}: ${i.message}`)
    return new AgentError('invalid', issues.join('; '), { issues })
  }
  if (err instanceof ValidationError && isUniqueValidationError(err)) {
    return new AgentError('conflict', 'A document with the same unique value (usually the slug) already exists on this site.')
  }
  if (err instanceof ValidationError) {
    const fields = (err.data?.errors ?? []).map((e) => ({ path: e.path, message: e.message }))
    return new AgentError('invalid', err.message, { fields })
  }
  if (isUniqueViolation(err)) {
    return new AgentError('conflict', 'A document with the same unique value (usually the slug) already exists on this site.')
  }
  if (err instanceof APIError) {
    const code = STATUS_CODES[err.status]
    if (code) return new AgentError(code, err.message)
  }
  log?.(logLine(err))
  return new AgentError('internal', 'Internal error — the server log has the details.')
}
