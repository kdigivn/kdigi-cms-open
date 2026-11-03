import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from '@playwright/test'

import { openEditorFixture } from './utils/editor-fixture'
import { loginAsE2eAdmin } from './utils/login-as-e2e-admin'

/**
 * Runs once before the whole Playwright suite.
 *
 * 1. Seeds the fixed-credential local e2e admin user + the editor fixture (idempotent
 *    — see src/scripts/seed-e2e-admin.ts, which refuses a non-local DATABASE_URI).
 * 2. PREFLIGHT: logs in with a real browser, opens the fixture and requires a usable
 *    `window.__milkdownE2E` document. Without this, a server started WITHOUT
 *    `NEXT_PUBLIC_E2E=1` (the documented `PW_SKIP_WEB_SERVER=1` path) or a missing
 *    fixture would surface as per-row failures that look like product regressions —
 *    and, because future-phase rows are `test.fail()`, could even be swallowed as the
 *    expected feature failure. This check makes the run fail for the real reason.
 */
export default async function globalSetup() {
  const currentDir = path.dirname(fileURLToPath(import.meta.url))
  const repoRoot = path.resolve(currentDir, '..')
  execFileSync(
    'node',
    ['--env-file=.env', '--import', 'tsx', 'src/scripts/seed-e2e-admin.ts'],
    { cwd: repoRoot, stdio: 'inherit' },
  )

  const baseURL = process.env.PW_BASE_URL ?? 'http://localhost:3101'
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ baseURL })
    await loginAsE2eAdmin(page)
    // `openEditorFixture` already asserts the hook is present and the document is
    // non-null, and reports the fixture's own slug in its error messages.
    const fixtureId = await openEditorFixture(page)
    console.log(`[e2e preflight] hook OK on the fixture document (post ${String(fixtureId)})`)
  } catch (error) {
    throw new Error(
      `[e2e preflight] the server at ${baseURL} is not usable for this suite: ` +
        `${error instanceof Error ? error.message : String(error)}\n` +
        'Most common cause: the server was started without NEXT_PUBLIC_E2E=1 so ' +
        'window.__milkdownE2E does not exist. Either let Playwright start its own ' +
        'instrumented server (port 3101, `reuseExistingServer: false`), or start one ' +
        'manually with `NEXT_PUBLIC_E2E=1 pnpm dev -p 3101`.',
    )
  } finally {
    await browser.close()
  }
}
