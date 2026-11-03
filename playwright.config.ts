import { defineConfig, devices } from '@playwright/test'

/**
 * Browser-automation harness for the Markdown editor smoke tests.
 *
 * Run:
 *   pnpm test:e2e
 *
 * That starts `pnpm dev -p 3101` with `NEXT_PUBLIC_E2E=1` (webServer below), seeds the
 * fixed-credential local super-admin plus the editor fixture document
 * (globalSetup → src/scripts/seed-e2e-admin.ts), then runs every spec in `e2e/` at
 * both deviceScaleFactor 1 and 2.
 *
 * The server is DEDICATED and INSTRUMENTED.
 *   - port 3101 is reserved for this runner, so it never collides with a normal dev
 *     server on 3000/3001;
 *   - `reuseExistingServer: false` means Playwright refuses to run against a server it
 *     did not start (a reused uninstrumented server would make every spec fail for a
 *     reason unrelated to the code);
 *   - `NEXT_PUBLIC_E2E=1` makes the editor expose `window.__milkdownE2E`, and
 *     `e2e/global-setup.ts` fails fast when that hook is missing (covers the
 *     `PW_SKIP_WEB_SERVER=1` path too).
 *
 * To run against a server you started yourself (it MUST be instrumented):
 *   NEXT_PUBLIC_E2E=1 pnpm dev -p 3101     # separate terminal
 *   PW_SKIP_WEB_SERVER=1 pnpm test:e2e
 */
const skipWebServer = process.env.PW_SKIP_WEB_SERVER === '1'
const PORT = 3101
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  // Playwright's own webServer readiness probe already retries; disable test
  // retries so a real regression doesn't get silently swallowed by a rerun.
  retries: 0,
  workers: 1,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium-dpr1',
      use: { ...devices['Desktop Chrome'], deviceScaleFactor: 1 },
    },
    {
      name: 'chromium-dpr2',
      use: { ...devices['Desktop Chrome'], deviceScaleFactor: 2 },
    },
  ],
  webServer: skipWebServer
    ? undefined
    : {
        command: `pnpm dev -p ${PORT}`,
        url: `${BASE_URL}/admin/login`,
        env: { NEXT_PUBLIC_E2E: '1' },
        reuseExistingServer: false,
        timeout: 180_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
})
