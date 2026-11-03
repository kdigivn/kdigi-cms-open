/**
 * Shared constants for the Playwright e2e harness's fixed local admin user.
 * Split out of `seed-e2e-admin.ts` so importing these values (e.g. from
 * `e2e/utils/login-as-e2e-admin.ts`) never re-triggers that script's
 * `main()` side effect.
 *
 * Intentionally fixed, dev-only, non-secret values — this account only ever
 * exists in a local Postgres instance guarded by `isRemoteDatabase()` in
 * `seed-e2e-admin.ts`.
 */
export const E2E_ADMIN_EMAIL = 'e2e-admin@local.test'
export const E2E_ADMIN_PASSWORD = 'E2ePlaywrightLocal!1'
