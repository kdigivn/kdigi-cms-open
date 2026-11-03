import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { buildLinkSearchUrl } from '../src/components/admin/use-internal-link-search'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from '../src/scripts/e2e-admin-fixture'
import { E2E_FIXTURE_SITE_KEY } from '../src/scripts/e2e-editor-fixture'
import {
  E2E_AUTHOR_EMAIL,
  E2E_AUTHOR_PASSWORD,
  E2E_PICKER_DRAFT_SLUG,
  E2E_PICKER_DRAFT_TITLE,
  E2E_PICKER_LIVE_SLUG,
  E2E_PICKER_LIVE_TITLE,
  E2E_PICKER_QUERY,
  E2E_PICKER_SCHEDULED_SLUG,
  E2E_PICKER_TENANT_B_SITE_KEY,
  E2E_PICKER_TENANT_B_SLUG,
  E2E_SNIPPET_NAME,
} from '../src/scripts/e2e-picker-fixture'
import { clearEditor, openEditorFixture, readEditorMarkdown } from './utils/editor-fixture'
import { loginAsE2eAdmin } from './utils/login-as-e2e-admin'

/**
 * Link / snippet pickers against the seeded fixtures (`src/scripts/e2e-picker-fixture.ts`):
 * site A owns a live, a scheduled and a draft post plus a shortcode; site B owns one live
 * post with the same search token. This file owns the site-scoping / embargo security cases and the REST render.
 */

const menu = (page: Page) => page.locator('.milkdown-mention-menu')
const option = (page: Page, slug: string) => menu(page).locator(`li[data-href="/${slug}"]`)

async function openEmptyEditor(page: Page): Promise<void> {
  await loginAsE2eAdmin(page)
  await openEditorFixture(page)
  await clearEditor(page)
  await expect.poll(async () => (await readEditorMarkdown(page)).trim(), { timeout: 8_000 }).toBe('')
}

async function restToken(request: APIRequestContext, email: string, password: string): Promise<string> {
  const response = await request.post('/api/users/login', { data: { email, password } })
  expect(response.ok(), `login as ${email}`).toBe(true)
  const { token } = (await response.json()) as { token?: string }
  if (!token) throw new Error(`no token for ${email}`)
  return token
}

async function siteIdByKey(request: APIRequestContext, token: string, siteKey: string): Promise<number> {
  const response = await request.get(
    `/api/sites?where[siteKey][equals]=${encodeURIComponent(siteKey)}&limit=1&depth=0`,
    { headers: { Authorization: `JWT ${token}` } },
  )
  const { docs } = (await response.json()) as { docs: Array<{ id: number }> }
  if (!docs[0]) throw new Error(`site ${siteKey} not seeded`)
  return docs[0].id
}

test('@ lists only live docs of the document\u2019s own tenant; Escape keeps the typed text', async ({ page }) => {
  await openEmptyEditor(page)
  await page.keyboard.type(`@${E2E_PICKER_QUERY}`)

  await expect(option(page, E2E_PICKER_LIVE_SLUG)).toBeVisible({ timeout: 10_000 })
  await expect(option(page, E2E_PICKER_SCHEDULED_SLUG), '[RT-14] scheduled doc hidden by default').toHaveCount(0)
  await expect(option(page, E2E_PICKER_DRAFT_SLUG), '[RT-14] draft hidden by default').toHaveCount(0)
  await expect(option(page, E2E_PICKER_TENANT_B_SLUG), 'another tenant\u2019s doc is never offered').toHaveCount(0)

  await page.keyboard.press('Escape')
  await expect(menu(page)).toHaveCount(0)
  await page.keyboard.type(' tiếp')
  await expect(menu(page), 'a dismissed @ stays closed while typing on').toHaveCount(0)
  await expect.poll(() => readEditorMarkdown(page)).toContain(`@${E2E_PICKER_QUERY} tiếp`)
})

test('[RT-14] drafts/scheduled appear only after opting in, and inserting one needs a confirm', async ({ page }) => {
  await openEmptyEditor(page)
  await page.keyboard.type(`@${E2E_PICKER_QUERY}`)
  await expect(option(page, E2E_PICKER_LIVE_SLUG)).toBeVisible({ timeout: 10_000 })

  await menu(page).locator('.milkdown-mention-menu__toggle').click()
  const draft = option(page, E2E_PICKER_DRAFT_SLUG)
  await expect(draft).toBeVisible({ timeout: 10_000 })
  await expect(draft).toHaveAttribute('data-live', 'false')
  await expect(option(page, E2E_PICKER_SCHEDULED_SLUG)).toHaveAttribute('data-live', 'false')
  await expect(option(page, E2E_PICKER_TENANT_B_SLUG), 'the toggle never widens the tenant').toHaveCount(0)

  const dialogs: string[] = []
  page.once('dialog', (dialog) => {
    dialogs.push(dialog.type())
    void dialog.dismiss()
  })
  await draft.click()
  expect(dialogs, 'a non-live doc must ask first').toEqual(['confirm'])
  expect(await readEditorMarkdown(page), 'declining inserts nothing').not.toContain(`(/${E2E_PICKER_DRAFT_SLUG})`)

  page.once('dialog', (dialog) => void dialog.accept())
  await draft.click()
  await expect
    .poll(() => readEditorMarkdown(page), { timeout: 10_000 })
    .toContain(`[${E2E_PICKER_DRAFT_TITLE}](/${E2E_PICKER_DRAFT_SLUG})`)
})

test('[RT-7] a tenant-A author with a forged payload-tenant=<B> cookie gets no tenant-B results', async ({ request }) => {
  const adminToken = await restToken(request, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD)
  const tenantA = await siteIdByKey(request, adminToken, E2E_FIXTURE_SITE_KEY)
  const tenantB = await siteIdByKey(request, adminToken, E2E_PICKER_TENANT_B_SITE_KEY)
  const authorToken = await restToken(request, E2E_AUTHOR_EMAIL, E2E_AUTHOR_PASSWORD)
  const now = new Date()

  // The exact request the picker makes, with the widest filter (drafts included).
  const search = async (tenantId: number): Promise<string[]> => {
    const response = await request.get(
      buildLinkSearchUrl('posts', { query: E2E_PICKER_QUERY, tenantId, includeNonLive: true, now }),
      { headers: { Authorization: `JWT ${authorToken}`, Cookie: `payload-tenant=${String(tenantB)}` } },
    )
    expect(response.ok()).toBe(true)
    const { docs } = (await response.json()) as { docs: Array<{ slug: string }> }
    return docs.map((doc) => doc.slug)
  }

  expect(await search(tenantB), 'access predicates must win over the forged cookie').toEqual([])
  expect(await search(tenantA), 'sanity: the same author does see its own tenant').toContain(E2E_PICKER_LIVE_SLUG)
})

test('inserted link and snippet serialize to Markdown the REST render turns into <a> and expanded content', async ({
  page,
}) => {
  await openEmptyEditor(page)
  await page.keyboard.type(`@${E2E_PICKER_QUERY}`)
  await expect(option(page, E2E_PICKER_LIVE_SLUG)).toBeVisible({ timeout: 10_000 })
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.type('/snippet')
  await expect(page.locator(`.milkdown-slash-menu li[data-item-id="snippet-${E2E_SNIPPET_NAME}"]`)).toBeVisible({
    timeout: 10_000,
  })
  await page.keyboard.press('Enter')

  await expect.poll(() => readEditorMarkdown(page), { timeout: 10_000 }).toContain(E2E_SNIPPET_NAME)
  const markdown = await readEditorMarkdown(page)
  expect(markdown).toContain(`[${E2E_PICKER_LIVE_TITLE}](/${E2E_PICKER_LIVE_SLUG})`)
  // Whatever escaping the editor's serializer applies, the stored tag must still be one the
  // renderer expands (`expand-shortcodes.ts` accepts the backslash-escaped form).
  expect(markdown).toMatch(new RegExp(`\\\\?\\[sc name="${E2E_SNIPPET_NAME}"/\\]`))

  const token = await restToken(page.request, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD)
  const headers = { Authorization: `JWT ${token}` }
  const tenantA = await siteIdByKey(page.request, token, E2E_FIXTURE_SITE_KEY)
  const created = await page.request.post('/api/posts', {
    headers,
    data: {
      title: 'E2E picker render check',
      slug: `e2e-picker-render-check-${String(Date.now())}`,
      type: 'blog',
      status: 'draft',
      tenant: tenantA,
      contentMd: markdown,
    },
  })
  expect(created.ok(), await created.text()).toBe(true)
  const { doc } = (await created.json()) as { doc: { id: number } }
  try {
    const response = await page.request.get(`/api/posts/${String(doc.id)}?depth=0`, { headers })
    const { content } = (await response.json()) as { content: string }
    expect(content).toContain(`href="/${E2E_PICKER_LIVE_SLUG}"`)
    expect(content).toContain('Giá vé E2E')
    expect(content, 'the tag (or its escape) must not leak into the page').not.toMatch(/\[sc|\\\[/)
  } finally {
    await page.request.delete(`/api/posts/${String(doc.id)}`, { headers })
  }
})
