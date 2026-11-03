// Liveness probe for the compose/Coolify healthcheck.
// Intentionally does NO database query: it must return 200 even while the schema is
// empty or being restored (Phase 3 restore window), so Coolify keeps the container
// healthy and does not abort the stack mid-restore.
export const GET = () => Response.json({ status: 'ok' })
