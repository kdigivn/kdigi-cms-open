import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from '../../src/scripts/e2e-admin-fixture'

/**
 * Logs into the Payload admin UI as the fixed-credential local e2e user
 * (seeded by globalSetup → src/scripts/seed-e2e-admin.ts). There is no
 * autoLogin in this repo, so every spec that needs an authenticated admin
 * session should call this first.
 *
 * Retries the whole navigate-fill-submit flow: against the dev server, a
 * concurrent Next.js Fast Refresh (from an unrelated file save elsewhere in
 * the repo while the harness runs) can reset this client component's local
 * state and silently wipe an already-filled input before submit — observed
 * empirically while building this harness, not specific to this form's code.
 */
export async function loginAsE2eAdmin(page: Page): Promise<void> {
  const maxAttempts = 3

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await page.goto('/admin/login')
    // Field labels are localized (admin defaults to `vi` — "Mật khẩu" not
    // "Password"), so target the input `type` rather than label text.
    const emailInput = page.locator('input[type="email"]')
    const passwordInput = page.locator('input[type="password"]')
    await emailInput.waitFor({ state: 'visible' })
    await page.waitForLoadState('networkidle')

    await emailInput.fill(E2E_ADMIN_EMAIL)
    await passwordInput.fill(E2E_ADMIN_PASSWORD)

    // Re-check immediately before submit (minimizes the window for a reset
    // landing between fill and submit) instead of trusting the fill alone.
    const [emailValue, passwordValue] = await Promise.all([
      emailInput.inputValue(),
      passwordInput.inputValue(),
    ])
    if (emailValue !== E2E_ADMIN_EMAIL || passwordValue !== E2E_ADMIN_PASSWORD) {
      continue
    }

    await page.locator('button[type="submit"]').click()

    try {
      // Successful login redirects off /admin/login onto the dashboard/collection view.
      await expect(page).not.toHaveURL(/\/admin\/login/, { timeout: 8_000 })
      return
    } catch {
      if (attempt === maxAttempts) throw new Error('loginAsE2eAdmin: still on /admin/login after retries')
    }
  }
}
