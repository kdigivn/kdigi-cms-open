/**
 * Level-A block fixture unit test (SP2-1 / phase 4).
 *
 * Proves that every block the Level-A editor UI can create (headings 1-6,
 * paragraph, bold, italic, link, bullet list, ordered list, task list,
 * blockquote, code block, horizontal rule, GFM table, image) renders through
 * the same REST conversion path used in production (`markdownHtmlField`'s
 * `afterRead` hook and `markdownToHtml()`).
 *
 * Reuses `E2E_EDITOR_FIXTURE_MARKDOWN` from `src/scripts/e2e-editor-fixture.ts`
 * as the primary input so the e2e fixture and the unit-test pin remain aligned.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import type { Field, PayloadRequest } from 'payload'

import { markdownHtmlField } from './markdown-html-field.js'
import { markdownToHtml } from '../lib/markdown-to-html.js'
import { E2E_EDITOR_FIXTURE_MARKDOWN } from '../scripts/e2e-editor-fixture.js'

const richTextField = markdownHtmlField('content', { localized: true })[1] as Field & {
  hooks?: { afterRead?: Array<(args: Record<string, unknown>) => unknown> }
}
const afterReadHook = richTextField.hooks?.afterRead?.[0]

function baseHookArgs(overrides: Record<string, unknown>) {
  return {
    blockData: undefined,
    collection: null,
    context: {},
    field: {} as never,
    global: null,
    indexPath: [],
    path: ['content'],
    schemaPath: ['content'],
    siblingFields: [],
    ...overrides,
  }
}

// Level-A fixture markdown with an image block appended to cover all editor-creatable blocks
const LEVEL_A_FIXTURE_WITH_IMAGE = `${E2E_EDITOR_FIXTURE_MARKDOWN}\n\n![Example image](https://images.example.com/photo.jpg)\n`

test('Level-A fixture survives local-API (non-REST) reads completely unmodified', async () => {
  assert.ok(afterReadHook)
  const original = { root: { children: [] } }

  const value = await afterReadHook?.(
    baseHookArgs({
      data: { tenant: 1 },
      req: {
        payloadAPI: 'local',
        payload: { find: async () => ({ docs: [] }) },
      } as unknown as PayloadRequest,
      siblingData: { contentMd: LEVEL_A_FIXTURE_WITH_IMAGE },
      value: original,
    }),
  )

  // Non-REST reads return value untouched — Markdown is preserved as-is
  assert.equal(value, original)
})

test('Level-A fixture renders every editor-creatable block to sanitized HTML on REST reads', async () => {
  assert.ok(afterReadHook)

  const html = (await afterReadHook?.(
    baseHookArgs({
      data: { tenant: 1 },
      req: {
        payloadAPI: 'REST',
        locale: 'vi',
        payload: { find: async () => ({ docs: [] }) },
      } as unknown as PayloadRequest,
      siblingData: { contentMd: LEVEL_A_FIXTURE_WITH_IMAGE },
      value: { root: { children: [] } },
    }),
  )) as string

  assert.equal(typeof html, 'string')

  // 1. Headings H1 through H6
  for (let level = 1; level <= 6; level += 1) {
    assert.match(
      html,
      new RegExp(`<h${level}>Heading level ${level}</h${level}>`),
      `H${level} should render correctly`,
    )
  }

  // 2. Paragraph with inline marks (bold, italic) and link
  assert.match(html, /<strong>bold<\/strong>/, 'Bold mark should render <strong>')
  assert.match(html, /<em>italic<\/em>/, 'Italic mark should render <em>')
  assert.match(
    html,
    /<a href="https:\/\/example\.com\/">link<\/a>/,
    'Link should render <a> with valid href',
  )

  // 3. Bullet list (unordered)
  assert.match(html, /<ul>[\s\S]*<li>Bullet item one<\/li>[\s\S]*<li>Bullet item two<\/li>[\s\S]*<\/ul>/)

  // 4. Ordered list
  assert.match(html, /<ol>[\s\S]*<li>Ordered item one<\/li>[\s\S]*<li>Ordered item two<\/li>[\s\S]*<\/ol>/)

  // 5. Task list (GFM checkboxes in <li>)
  assert.match(html, /<li>\[ \] Task item not done<\/li>/)
  assert.match(html, /<li>\[x\] Task item done<\/li>/)

  // 6. Blockquote
  assert.match(html, /<blockquote>\s*<p>Blockquote line\.<\/p>\s*<\/blockquote>/)

  // 7. Fenced code block with language class
  assert.match(html, /<pre><code class="language-ts">const answer = 42\n<\/code><\/pre>/)

  // 8. Divider (horizontal rule)
  assert.match(html, /<hr\s*\/?>/)

  // 9. GFM table
  assert.match(html, /<table>[\s\S]*<th>Column A<\/th>\s*<th>Column B<\/th>/)
  assert.match(html, /<td>A1<\/td>\s*<td>B1<\/td>/)

  // 10. Image block
  assert.match(
    html,
    /<img src="https:\/\/images\.example\.com\/photo\.jpg" alt="Example image"\s*\/?>/,
  )
})

test('Level-A fixture generated HTML never contains editor-only artifacts or forbidden attributes', async () => {
  assert.ok(afterReadHook)

  const html = (await afterReadHook?.(
    baseHookArgs({
      data: { tenant: 1 },
      req: {
        payloadAPI: 'REST',
        locale: 'vi',
        payload: { find: async () => ({ docs: [] }) },
      } as unknown as PayloadRequest,
      siblingData: { contentMd: LEVEL_A_FIXTURE_WITH_IMAGE },
      value: { root: { children: [] } },
    }),
  )) as string

  // No ProseMirror or Milkdown wrapper elements or classes
  assert.doesNotMatch(html, /ProseMirror/i)
  assert.doesNotMatch(html, /milkdown/i)
  assert.doesNotMatch(html, /crepe/i)

  // No data-command-group, contenteditable, or interaction flags
  assert.doesNotMatch(html, /contenteditable/i)
  assert.doesNotMatch(html, /data-command-group/i)
  assert.doesNotMatch(html, /data-role/i)
  assert.doesNotMatch(html, /is-selection-toolbar-visible/i)

  // No inline styles permitted (sanitizer strips style attributes)
  assert.doesNotMatch(html, /style\s*=/i)
})

test('markdownToHtml() directly produces clean sanitized HTML for E2E_EDITOR_FIXTURE_MARKDOWN', () => {
  const html = markdownToHtml(E2E_EDITOR_FIXTURE_MARKDOWN)

  assert.equal(typeof html, 'string')
  assert.match(html, /<h1>Heading level 1<\/h1>/)
  assert.match(html, /<h6>Heading level 6<\/h6>/)
  assert.match(html, /<strong>bold<\/strong>/)
  assert.match(html, /<em>italic<\/em>/)
  assert.match(html, /<a href="https:\/\/example\.com\/">link<\/a>/)
  assert.match(html, /<li>Bullet item one<\/li>/)
  assert.match(html, /<li>Ordered item one<\/li>/)
  assert.match(html, /<blockquote>\s*<p>Blockquote line\.<\/p>\s*<\/blockquote>/)
  assert.match(html, /<pre><code class="language-ts">const answer = 42\n<\/code><\/pre>/)
  assert.match(html, /<hr\s*\/?>/)
  assert.match(html, /<table>[\s\S]*<th>Column A<\/th>/)

  // Guard against forbidden artifacts
  assert.doesNotMatch(html, /ProseMirror/i)
  assert.doesNotMatch(html, /milkdown/i)
  assert.doesNotMatch(html, /style\s*=/i)
})
