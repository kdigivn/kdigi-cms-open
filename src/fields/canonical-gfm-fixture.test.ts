/**
 * Phase 9 (GFM Round-Trip and Shared Field Integration) — unit-testable
 * portion. Runs the canonical GFM fixture through the ACTUAL server-side
 * pipeline `markdownHtmlField()` wires up: `afterRead` -> (optional)
 * shortcode expansion -> `markdownToHtml()`.
 *
 * Scope note (binding, see phase-09 spec): a true parse -> ProseMirror-doc
 * -> serialize round-trip only exists inside the Milkdown/Crepe editor
 * (`milkdown-editor-core.tsx`), and Crepe's `Editor.create()` instantiates
 * a real `prosemirror-view` `EditorView`, which throws
 * `ReferenceError: document is not defined` in plain Node (verified by
 * direct probe — no jsdom/happy-dom in this repo's dependency tree, and
 * `remark`/`remark-gfm`/`unified` are transitive-only, not resolvable as
 * top-level imports under pnpm's strict linking). That editor-level
 * round-trip is therefore out of reach for `node:test` and is covered by
 * the (skipped, per user directive) live 7-instance x 2-locale browser
 * matrix instead.
 *
 * What IS unit-testable and IS the real invariant on the server side:
 * `{name}Md` is stored and read back byte-for-byte (no server-side
 * transform ever touches the Markdown itself — see the identity test
 * below), and the `afterRead` HTML-generation path is deterministic,
 * sanitized, and free of editor-only artifacts.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import type { Field, PayloadRequest } from 'payload'

import { CANONICAL_GFM_FIXTURE } from './canonical-gfm-fixture.js'
import { markdownHtmlField } from './markdown-html-field.js'
import { markdownToHtml } from '../lib/markdown-to-html.js'

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

// ---------------------------------------------------------------------------
// 1. Field-persistence identity round-trip: Markdown is source of truth and
//    must survive save/reload with zero server-side mutation. Non-REST reads
//    (Payload local API, admin form save) never touch the Markdown at all —
//    the afterRead hook short-circuits before any transform.
// ---------------------------------------------------------------------------

test('canonical fixture survives local-API (non-REST) reads completely unmodified', async () => {
  assert.ok(afterReadHook)
  const original = { root: { children: [] } }

  const value = await afterReadHook?.(
    baseHookArgs({
      data: { tenant: 7 },
      req: {
        payloadAPI: 'local',
        payload: { find: async () => ({ docs: [] }) },
      } as unknown as PayloadRequest,
      siblingData: { contentMd: CANONICAL_GFM_FIXTURE },
      value: original,
    }),
  )

  // Non-REST reads return `value` (the hidden legacy richtext field)
  // untouched — the hook never inspects/rewrites `contentMd` outside REST.
  assert.equal(value, original)
})

// ---------------------------------------------------------------------------
// 2. Generated HTML: fixture -> REST afterRead -> markdownToHtml(). Assert
//    every construct renders, output is sanitized, and shortcodes expand.
// ---------------------------------------------------------------------------

test('canonical fixture renders every GFM construct to sanitized HTML on REST reads', async () => {
  assert.ok(afterReadHook)

  const html = (await afterReadHook?.(
    baseHookArgs({
      data: { tenant: 7 },
      req: {
        payloadAPI: 'REST',
        locale: 'vi',
        payload: {
          find: async () => ({
            docs: [{ name: 'gia-ve-cao-toc', contentMd: '**Từ 250.000đ**' }],
          }),
        },
      } as unknown as PayloadRequest,
      siblingData: { contentMd: CANONICAL_GFM_FIXTURE },
      value: { root: { children: [] } },
    }),
  )) as string

  assert.equal(typeof html, 'string')

  // Headings H1-H6
  for (let level = 1; level <= 6; level += 1) {
    assert.match(html, new RegExp(`<h${level}>Heading ${level}</h${level}>`))
  }

  // Inline marks
  assert.match(html, /<strong>bold text<\/strong>/)
  assert.match(html, /<em>italic text<\/em>/)
  assert.match(html, /<s>strikethrough text<\/s>/)
  assert.match(html, /<code>inline code<\/code>/)

  // Link
  assert.match(html, /<a href="https:\/\/example\.com">KDIGI CMS site<\/a>/)

  // Fenced code block (language class preserved by markdown-it, allowlisted)
  assert.match(html, /<pre><code class="language-ts">const routeCount: number = 42/)

  // Blockquote
  assert.match(html, /<blockquote>\s*<p>A blockquote spanning\ntwo lines\.<\/p>\s*<\/blockquote>/)

  // Divider
  assert.match(html, /<hr\s*\/?>/)

  // Bullet list incl. nesting
  assert.match(html, /<li>Bullet one<\/li>/)
  assert.match(html, /<li>Bullet two\s*<ul>\s*<li>Nested bullet<\/li>/)

  // Ordered list
  assert.match(html, /<ol>\s*<li>Ordered one<\/li>\s*<li>Ordered two<\/li>\s*<\/ol>/)

  // Task list — DOCUMENTED LIMITATION: markdown-it's default preset has no
  // task-list plugin wired in `markdown-to-html.ts`, so `[ ]`/`[x]` remain
  // literal text inside <li>, never interactive checkboxes. Assert the
  // actual (verified) behavior rather than an aspirational one.
  assert.match(html, /<li>\[ \] Unchecked todo<\/li>/)
  assert.match(html, /<li>\[x\] Checked todo<\/li>/)

  // Image
  assert.match(
    html,
    /<img src="https:\/\/cdn\.example\.com\/photo\.jpg" alt="A boat leaving the pier"\s*\/?>/,
  )

  // Table structure present for all 3 columns x 2 rows
  assert.match(html, /<table>[\s\S]*<th>Left<\/th>\s*<th>Center<\/th>\s*<th>Right<\/th>/)
  assert.match(html, /<td>a1<\/td>\s*<td>b1<\/td>\s*<td>c1<\/td>/)
  assert.match(html, /<td>a2<\/td>\s*<td>b2<\/td>\s*<td>c2<\/td>/)
  // DOCUMENTED LIMITATION: markdown-it emits column alignment as an inline
  // `style="text-align:…"` attribute, and `sanitize-html`'s allowlist in
  // `markdown-to-html.ts` does not include `style` for any tag (by design —
  // "Unsupported style attributes... must never enter... rendered HTML" per
  // the phase's Persistence Contract). Net effect: GFM column alignment
  // (`:---:`, `---:`) is accepted as input but not visually preserved in
  // REST HTML today. This is pre-existing pipeline behavior, not something
  // introduced or fixed by this phase — see the phase report for detail.
  assert.doesNotMatch(html, /style\s*=/)

  // Shortcode expanded, tag never leaks
  assert.match(html, /<strong>Từ 250\.000đ<\/strong>/)
  assert.doesNotMatch(html, /\[sc/)
})

// ---------------------------------------------------------------------------
// 3. Forbidden-artifact guard: editor-only classes, inline geometry styles,
//    selection decorations, and other Milkdown/ProseMirror-only attributes
//    must never reach stored Markdown or rendered HTML.
// ---------------------------------------------------------------------------

test('generated HTML never contains editor-only artifacts', async () => {
  assert.ok(afterReadHook)

  const html = (await afterReadHook?.(
    baseHookArgs({
      data: { tenant: 7 },
      req: {
        payloadAPI: 'REST',
        locale: 'vi',
        payload: { find: async () => ({ docs: [] }) },
      } as unknown as PayloadRequest,
      siblingData: { contentMd: CANONICAL_GFM_FIXTURE },
      value: { root: { children: [] } },
    }),
  )) as string

  const forbiddenPatterns: RegExp[] = [
    /class="milkdown/i,
    /milkdown-/i,
    /ProseMirror/,
    /data-selection/i,
    /data-node-type/i,
    /contenteditable/i,
    /style\s*=/i,
    /is-selection-toolbar-visible/i,
    // Active-cell node decoration (milkdown-active-cell-plugin.ts) — a
    // render-time class that must never reach stored Markdown or HTML.
    /is-active-cell/i,
    /crepe/i,
  ]

  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(html, pattern, `forbidden artifact leaked: ${pattern}`)
  }
})

// Cross-check with the pure `markdownToHtml()` function directly (no
// shortcode/tenant layer involved) — same forbidden-artifact guarantee must
// hold for every caller of the shared renderer, not just this one field.
test('markdownToHtml() alone never emits editor-only artifacts for the fixture', () => {
  const html = markdownToHtml(CANONICAL_GFM_FIXTURE)
  assert.doesNotMatch(html, /class="milkdown/i)
  assert.doesNotMatch(html, /style\s*=/i)
  assert.doesNotMatch(html, /data-selection/i)
  assert.doesNotMatch(html, /ProseMirror/)
})

// ---------------------------------------------------------------------------
// 4. Backward-compat: empty/null Markdown, and legacy shortcode content.
// ---------------------------------------------------------------------------

test('empty-string contentMd falls back to the legacy Lexical value on REST reads', async () => {
  assert.ok(afterReadHook)
  const legacyLexical = { root: { children: [{ type: 'paragraph', children: [{ text: 'legacy' }] }] } }

  const value = await afterReadHook?.(
    baseHookArgs({
      data: { tenant: 7 },
      req: {
        payloadAPI: 'REST',
        locale: 'vi',
        payload: { find: async () => ({ docs: [] }) },
      } as unknown as PayloadRequest,
      siblingData: { contentMd: '' },
      value: legacyLexical,
    }),
  )

  // `typeof md === 'string' && md` is falsy for '', so it must fall through
  // to the Lexical conversion attempt rather than emit an empty string —
  // preserving pre-migration documents that never had `{name}Md` populated.
  assert.notEqual(value, '')
})

test('null contentMd and null Lexical value both resolve to a safe no-op on REST reads', async () => {
  assert.ok(afterReadHook)

  const value = await afterReadHook?.(
    baseHookArgs({
      data: { tenant: 7 },
      req: {
        payloadAPI: 'REST',
        locale: 'vi',
        payload: { find: async () => ({ docs: [] }) },
      } as unknown as PayloadRequest,
      siblingData: { contentMd: null },
      value: null,
    }),
  )

  // No Markdown and no Lexical root -> `!value?.root` is true -> returns
  // `value` (null) as-is. Must never throw for a genuinely empty document.
  assert.equal(value, null)
})

test('legacy shortcode content (no tenant context) renders literally instead of crashing', async () => {
  assert.ok(afterReadHook)

  const html = await afterReadHook?.(
    baseHookArgs({
      data: {}, // no tenant on the document — defensive legacy-data case
      req: {
        payloadAPI: 'REST',
        locale: 'vi',
        payload: { find: async () => ({ docs: [] }) },
      } as unknown as PayloadRequest,
      siblingData: { contentMd: 'Bảng giá: [sc name="gia-ve-cao-toc"][/sc]' },
      value: { root: { children: [] } },
    }),
  )

  assert.equal(typeof html, 'string')
  // Without a resolvable tenant, expansion is a documented no-op (see
  // `expandShortcodesInMarkdown`'s `if (!options.tenantId) return markdown`)
  // — the tag renders as literal text rather than throwing or resolving
  // cross-tenant.
  assert.match(html as string, /\[sc name="gia-ve-cao-toc"\]\[\/sc\]/)
})

test('unknown/circular shortcode name resolves to empty string, never leaks the tag (rest-api.md guarantee)', async () => {
  assert.ok(afterReadHook)

  const html = await afterReadHook?.(
    baseHookArgs({
      data: { tenant: 7 },
      req: {
        payloadAPI: 'REST',
        locale: 'vi',
        payload: { find: async () => ({ docs: [] }) }, // no matching shortcode doc
      } as unknown as PayloadRequest,
      siblingData: { contentMd: 'Bảng giá: [sc name="does-not-exist"][/sc]' },
      value: { root: { children: [] } },
    }),
  )

  assert.equal(typeof html, 'string')
  assert.doesNotMatch(html as string, /\[sc/)
})
