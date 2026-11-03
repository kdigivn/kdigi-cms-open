import { expect, test } from '@playwright/test'

import { openEditorFixture, readEditorMarkdown } from './utils/editor-fixture'
import { loginAsE2eAdmin } from './utils/login-as-e2e-admin'

/**
 * Harness smoke test. Proves the
 * browser-automation harness itself works end to end: dev admin boots, login
 * succeeds, a collection doc with a markdownHtmlField opens, and the Milkdown
 * editor mounts and renders the document's existing content.
 *
 * Opens the fixture with `repairFixture: false` ON PURPOSE: every other spec lets
 * `openEditorFixture` rebuild a missing body, which is right for interaction rows but
 * would mask a regression in the field's stored-content load. Here a missing body must
 * fail the test, not be pasted over.
 *
 * Run: pnpm test:e2e
 */

test('Milkdown editor mounts on an existing post with content', async ({ page }) => {
  await loginAsE2eAdmin(page)
  await openEditorFixture(page, { repairFixture: false })

  const editorWrapper = page.locator('.milkdown-editor-wrapper').first()
  await expect(editorWrapper).toBeVisible({ timeout: 20_000 })

  const proseMirrorRoot = editorWrapper.locator('.ProseMirror')
  await expect(proseMirrorRoot).toBeVisible()

  // Confirms Crepe finished `create()` and rendered the field's existing
  // Markdown as content — not just an empty/placeholder editor shell.
  await expect(proseMirrorRoot).not.toHaveText('')
  await expect
    .poll(() => readEditorMarkdown(page), { timeout: 10_000 })
    .toContain('# Heading level 1')
})
