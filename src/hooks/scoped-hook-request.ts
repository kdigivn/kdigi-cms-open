import type { PayloadRequest } from 'payload'

/**
 * Builds the request a hook hands to its own nested write.
 *
 * Nested operations take `req` so they join the caller's transaction instead of checking
 * out a second pool connection. The catch: Payload's local API assigns the merged context
 * straight onto the request object it is given (`createLocalReq`: `req.context =
 * getRequestContext(req, context)`). Passing the live request plus a `context` argument
 * therefore writes the re-entry flag into the context the OUTER hook chain is still using,
 * and every later hook guarding on that flag skips itself — silently.
 *
 * Handing over a shallow copy keeps both properties: `transactionID` (and the rest of the
 * request) carries over so the write stays inside the same transaction, while the flag is
 * confined to the nested call. Pass the flags here rather than as a separate `context`
 * argument — that argument lands on the same shared object.
 */
export function withScopedHookContext(
  req: PayloadRequest,
  flags: Record<string, unknown>,
): PayloadRequest {
  return {
    ...req,
    context: { ...(req.context ?? {}), ...flags },
  } as PayloadRequest
}
