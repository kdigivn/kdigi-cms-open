import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

import {
  E2E_EDITOR_FIXTURE_MARKDOWN,
  E2E_EDITOR_FIXTURE_SLUG,
} from '../../src/scripts/e2e-editor-fixture'

/** Shape exposed by the env-gated hook in `milkdown-editor-core.tsx`. */
export interface MilkdownE2EApi {
  getMarkdown: () => string
  getDocJSON: () => Record<string, unknown> | null
}

/**
 * Fails fast when the running server was started WITHOUT `NEXT_PUBLIC_E2E=1`.
 *
 * This is the RT-15 safety net: the specs assert on ProseMirror document
 * JSON, which only exists when the editor exposes `window.__milkdownE2E`. Without
 * this check a reused/uninstrumented server would make every spec fail for a
 * reason unrelated to the code under test — the failure would look like a product
 * regression. `playwright.config.ts` also pins a dedicated port (3101) with
 * `reuseExistingServer: false`, so this message should only ever appear on the
 * documented `PW_SKIP_WEB_SERVER=1` path.
 */
export async function assertE2EHookAvailable(page: Page): Promise<void> {
  const available = await page
    .waitForFunction(
      () => Boolean((window as unknown as { __milkdownE2E?: unknown }).__milkdownE2E),
      undefined, // browser-function argument — the options object must come third
      { timeout: 15_000 },
    )
    .then(() => true)
    .catch(() => false)

  if (!available) {
    throw new Error(
      'window.__milkdownE2E is missing: the server under test was not started with NEXT_PUBLIC_E2E=1. ' +
        'Use `pnpm test:e2e` (dedicated port 3101, instrumented), or for a manual server: ' +
        '`NEXT_PUBLIC_E2E=1 pnpm dev -p 3101` before `PW_SKIP_WEB_SERVER=1 pnpm test:e2e`.',
    )
  }
}

/** Resolve the fixture post id by slug through the admin's own REST session. */
export async function resolveFixturePostId(page: Page): Promise<number> {
  const response = await page.request.get(
    `/api/posts?where[slug][equals]=${encodeURIComponent(E2E_EDITOR_FIXTURE_SLUG)}&limit=1&depth=0`,
  )
  expect(response.ok(), `fixture lookup failed with HTTP ${response.status()}`).toBe(true)
  const body = (await response.json()) as { docs?: Array<{ id: number }>; totalDocs?: number }
  const id = body.docs?.[0]?.id
  expect(
    id,
    `fixture post "${E2E_EDITOR_FIXTURE_SLUG}" not returned by REST (totalDocs=${String(body.totalDocs)}). ` +
      'It must exist AND be published (REST reads are publishedAndLive) — run the e2e seed: ' +
      'node --env-file=.env --import tsx src/scripts/seed-e2e-admin.ts',
  ).toBeTruthy()
  return id as number
}

/**
 * Open the fixture document in the admin editor and wait until the editor (and its
 * test hook) are ready. Callers must have logged in already.
 */
export async function openEditorFixture(
  page: Page,
  options: { repairFixture?: boolean } = {},
): Promise<number> {
  const id = await resolveFixturePostId(page)
  await page.goto(`/admin/collections/posts/${id}`)
  await page.locator('.milkdown-editor-wrapper').first().waitFor({ state: 'visible' })
  await assertE2EHookAvailable(page)
  // The hook exists as soon as the component mounts; the doc is null until
  // `crepe.create()` settles. Fail loudly if it never settles — `.catch(() =>
  // undefined)` here would hand every later assertion a null document.
  await page
    .waitForFunction(
      () => {
        const api = (window as unknown as { __milkdownE2E?: MilkdownTestHook }).__milkdownE2E
        return Boolean(api?.getDocJSON())
      },
      undefined, // browser-function argument — the options object must come third
      { timeout: 20_000 },
    )
    .catch(() => {
      throw new Error(
        'the Milkdown editor never produced a document (window.__milkdownE2E.getDocJSON() ' +
          'stayed null). Check the editor mount path in the admin UI before blaming a row.',
      )
    })
  await ensureFixtureBody(page, { repair: options.repairFixture ?? true })
  return id
}

/**
 * Clear the whole document through a DOM `Range`.
 *
 * A native `Control+A` is NOT a select-all here: Milkdown's virtual cursor
 * (`virtual-cursor-enabled`) clips the native selection to its rendered slice —
 * measured 39 of 454 characters — so `Control+A` + `Backspace` deletes a sliver
 * and leaves the previous content behind.
 */
export async function clearEditor(page: Page): Promise<void> {
  await page.evaluate(() => {
    const editor = document.querySelector(
      '.milkdown-editor-wrapper .ProseMirror',
    ) as HTMLElement | null
    if (!editor) throw new Error('editor is not mounted')
    editor.focus()
    const range = document.createRange()
    range.selectNodeContents(editor)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  })
  await page.keyboard.press('Backspace')
}

/**
 * Replace the editor's content with the clipboard payload. HTML paste support is
 * phase 7; Markdown text paste already converts into real ProseMirror nodes.
 *
 * Reconstructing the fixture this way is faithful: measured against the seeded
 * document it yields the same node types (H1–H6, both lists, task items, quote,
 * code block, divider, table with header cells) — 452 vs 454 serialized chars.
 */
export async function pasteIntoEditor(
  page: Page,
  payload: { text: string; html?: string },
): Promise<void> {
  await page.evaluate((data) => {
    const editor = document.querySelector('.milkdown-editor-wrapper .ProseMirror')
    if (!editor) throw new Error('editor is not mounted')
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/plain', data.text)
    if (data.html !== undefined) clipboardData.setData('text/html', data.html)
    editor.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }),
    )
  }, payload)
}

/**
 * Fragments the seeded fixture body always contains: the first heading and the GFM
 * table header. Used as an identity check — a LENGTH check would accept any unrelated
 * long document (including one a previous row saved) as "the fixture".
 */
const FIXTURE_SIGNATURE = ['# Heading level 1', '| Column A |'] as const

/**
 * Guarantee the editor holds the seeded fixture body.
 *
 * WHY THIS EXISTS: the specs type, clear and convert a fixture whose body is
 * shared state in the database. If anything in a run ends up submitting the admin
 * form, whatever the editor held at that instant is persisted (observed: an emptied
 * `contentMd`), and every later row then starts from a document that is not the
 * fixture. A REST PATCH is not an
 * option (cookie-authenticated PATCH from the page context is rejected: HTTP 403), so
 * the body is rebuilt in-page through the Markdown paste path.
 *
 * Fidelity of that rebuild, measured against the seeded document: 452 vs 454
 * serialized chars and an identical node-type list (H1–H6, both lists, task items,
 * quote, code block, divider, table with header cells).
 *
 * @param options.repair `false` keeps the check read-only and THROWS on a mismatch —
 * use it where the test's whole point is that the stored content loads (the mount
 * smoke test); repairing there would mask exactly the regression under test.
 */
export async function ensureFixtureBody(
  page: Page,
  options: { repair?: boolean } = {},
): Promise<void> {
  const repair = options.repair ?? true
  const looksLikeFixture = async (): Promise<boolean> => {
    const markdown = await readEditorMarkdown(page)
    return FIXTURE_SIGNATURE.every((fragment) => markdown.includes(fragment))
  }
  if (await looksLikeFixture()) return

  if (!repair) {
    const markdown = await readEditorMarkdown(page)
    throw new Error(
      `fixture post "${E2E_EDITOR_FIXTURE_SLUG}" did not load the seeded body ` +
        `(missing ${FIXTURE_SIGNATURE.filter((f) => !markdown.includes(f)).join(', ')}, ` +
        `${markdown.length} chars loaded). Repairing is disabled for this caller on purpose.`,
    )
  }

  await clearEditor(page)
  await pasteIntoEditor(page, { text: E2E_EDITOR_FIXTURE_MARKDOWN })
  try {
    await expect
      .poll(looksLikeFixture, {
        message:
          `the fixture post "${E2E_EDITOR_FIXTURE_SLUG}" did not hold the seeded body and ` +
          'could not be rebuilt in-page',
        timeout: 15_000,
      })
      .toBe(true)
  } catch (error) {
    throw new Error(
      `fixture post "${E2E_EDITOR_FIXTURE_SLUG}" opened without the seeded body and could not be ` +
        `rebuilt. Re-seed: \`node --env-file=.env --import tsx src/scripts/seed-e2e-admin.ts\`. ` +
        `Cause: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/** Structural type used inside `page.waitForFunction` (runs in the browser). */
interface MilkdownTestHook {
  getDocJSON: () => unknown
}

/** Current ProseMirror document JSON (matrix assertions read node types/attrs). */
export async function readDocJSON(page: Page): Promise<Record<string, unknown>> {
  const doc = await page.evaluate(() => {
    const api = (window as unknown as { __milkdownE2E?: MilkdownE2EApi }).__milkdownE2E
    return api ? api.getDocJSON() : null
  })
  expect(doc, 'editor test hook returned no document').not.toBeNull()
  return doc as Record<string, unknown>
}

/** Markdown as the editor last serialized it (what the `contentMd` field holds). */
export async function readEditorMarkdown(page: Page): Promise<string> {
  return page.evaluate(() => {
    const api = (window as unknown as { __milkdownE2E?: MilkdownE2EApi }).__milkdownE2E
    return api ? api.getMarkdown() : ''
  })
}

/** Flatten a ProseMirror doc JSON into the node types it contains, in order. */
export function collectNodeTypes(doc: Record<string, unknown>): string[] {
  const types: string[] = []
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    const record = node as { type?: unknown; content?: unknown }
    if (typeof record.type === 'string') types.push(record.type)
    if (Array.isArray(record.content)) record.content.forEach(walk)
  }
  walk(doc)
  return types
}

/** Direct children of the document node (the blocks the editor shows, in order). */
export function topLevelBlocks(doc: Record<string, unknown>): Array<Record<string, unknown>> {
  const content = (doc as { content?: unknown }).content
  return Array.isArray(content) ? (content as Array<Record<string, unknown>>) : []
}

/** Node types of the document's own children, in document order. */
export function topLevelBlockTypes(doc: Record<string, unknown>): string[] {
  return topLevelBlocks(doc).map((block) => String(block.type))
}

/** Plain text of each top-level block, in document order. */
export function topLevelBlockTexts(doc: Record<string, unknown>): string[] {
  const textOf = (node: unknown): string => {
    if (!node || typeof node !== 'object') return ''
    const record = node as { text?: unknown; content?: unknown }
    if (typeof record.text === 'string') return record.text
    if (Array.isArray(record.content)) return record.content.map(textOf).join('')
    return ''
  }
  return topLevelBlocks(doc).map((block) => textOf(block))
}

/** First node of the given type anywhere in the document, if any. */
export function findFirstNode(
  doc: Record<string, unknown>,
  type: string,
): Record<string, unknown> | undefined {
  let found: Record<string, unknown> | undefined
  const walk = (node: unknown): void => {
    if (found || !node || typeof node !== 'object') return
    const record = node as { type?: unknown; content?: unknown }
    if (record.type === type) {
      found = record
      return
    }
    if (Array.isArray(record.content)) record.content.forEach(walk)
  }
  walk(doc)
  return found
}
