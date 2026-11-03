import assert from 'node:assert/strict'
import test from 'node:test'
import type { Field, PayloadRequest } from 'payload'

import { markdownHtmlField } from './markdown-html-field.js'

const richTextField = markdownHtmlField('content', { localized: true })[1] as Field & {
  hooks?: { afterRead?: Array<(args: Record<string, unknown>) => unknown> }
}
const afterReadHook = richTextField.hooks?.afterRead?.[0]

// Narrow, test-local view of the two concrete field shapes markdownHtmlField()
// returns (a plain `textarea` and a `richText`) — `Field` is a broad union
// (incl. `collapsible`/`row`/etc. that have no `name`), so this cast documents
// exactly which shape these tests rely on.
type NamedField = Field & { admin?: { hidden?: boolean }; localized?: boolean; name: string; type: string }

// ---------------------------------------------------------------------------
// REST-shape guard (docs/rest-api.md is a LOCKED contract with
// frontend): `markdownHtmlField(name)` must keep returning HTML at the
// original field key (`name`) and raw Markdown at `{name}Md` — never the
// reverse, never a third key, never a renamed pair.
// ---------------------------------------------------------------------------

test('markdownHtmlField keeps the locked REST shape: HTML at {name}, Markdown at {name}Md', () => {
  for (const name of ['content', 'body', 'notice']) {
    const fields = markdownHtmlField(name, { localized: true })
    assert.equal(fields.length, 2, `${name}: expected exactly 2 fields`)

    const [mdField, htmlField] = fields as [NamedField, NamedField]

    assert.equal(mdField.name, `${name}Md`)
    assert.equal(mdField.type, 'textarea')

    assert.equal(htmlField.name, name)
    assert.equal(htmlField.type, 'richText')
    // The Lexical field is a hidden fallback — REST consumers must only
    // ever see the afterRead-derived HTML string at this key, never a raw
    // Lexical AST leaking through the admin UI or REST.
    assert.equal(htmlField.admin?.hidden, true)
  }
})

test('markdownHtmlField propagates the localized option identically to both fields', () => {
  const localized = markdownHtmlField('content', { localized: true }) as [NamedField, NamedField]
  assert.equal(localized[0].localized, true)
  assert.equal(localized[1].localized, true)

  const notLocalized = markdownHtmlField('content', {}) as [NamedField, NamedField]
  assert.equal(notLocalized[0].localized, false)
  assert.equal(notLocalized[1].localized, false)
})

test('markdownHtmlField expands shortcodes on REST reads before html conversion', async () => {
  assert.ok(afterReadHook, 'afterRead hook should exist')

  const value = await afterReadHook?.({
    req: {
      payloadAPI: 'REST',
      locale: 'vi',
      payload: {
        find: async () => ({
          docs: [
            {
              name: 'bang-gia',
              contentMd: '**Tau cao toc**',
            },
          ],
        }),
      },
    } as unknown as PayloadRequest,
    siblingData: {
      contentMd: 'Bang gia:\n[sc name="bang-gia"][/sc]',
    },
    data: { tenant: 7 },
    value: { root: { children: [] } },
    blockData: undefined,
    collection: null,
    context: {},
    field: {} as never,
    global: null,
    indexPath: [],
    path: ['content'],
    schemaPath: ['content'],
    siblingFields: [],
  })

  assert.equal(typeof value, 'string')
  assert.match(value as string, /<strong>Tau cao toc<\/strong>/)
  assert.doesNotMatch(value as string, /\[sc/)
})

test('markdownHtmlField falls back to legacy Lexical HTML when {name}Md was never touched (null)', async () => {
  assert.ok(afterReadHook, 'afterRead hook should exist')

  const value = await afterReadHook?.({
    req: { payloadAPI: 'REST', locale: 'vi', payload: { find: async () => ({ docs: [] }) } } as unknown as PayloadRequest,
    siblingData: { contentMd: null },
    data: { tenant: 7 },
    value: { root: { children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Legacy notice' }] }] } },
    blockData: undefined,
    collection: null,
    context: {},
    field: {} as never,
    global: null,
    indexPath: [],
    path: ['content'],
    schemaPath: ['content'],
    siblingFields: [],
  })

  assert.equal(typeof value, 'string')
  assert.match(value as string, /Legacy notice/)
})

test('markdownHtmlField does NOT fall back to legacy Lexical HTML when {name}Md was explicitly cleared', async () => {
  assert.ok(afterReadHook, 'afterRead hook should exist')

  const value = await afterReadHook?.({
    req: { payloadAPI: 'REST', locale: 'vi', payload: { find: async () => ({ docs: [] }) } } as unknown as PayloadRequest,
    siblingData: { contentMd: '' },
    data: { tenant: 7 },
    // Stale legacy Lexical content still sitting in the DB — must NOT leak through.
    value: { root: { children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Legacy notice' }] }] } },
    blockData: undefined,
    collection: null,
    context: {},
    field: {} as never,
    global: null,
    indexPath: [],
    path: ['content'],
    schemaPath: ['content'],
    siblingFields: [],
  })

  assert.equal(value, null)
})

test('markdownHtmlField leaves non-REST reads untouched', async () => {
  assert.ok(afterReadHook, 'afterRead hook should exist')

  const original = { root: { children: [] } }
  const value = await afterReadHook?.({
    req: {
      payloadAPI: 'local',
      payload: { find: async () => ({ docs: [] }) },
    } as unknown as PayloadRequest,
    siblingData: {
      contentMd: '[sc name="bang-gia"][/sc]',
    },
    data: { tenant: 7 },
    value: original,
    blockData: undefined,
    collection: null,
    context: {},
    field: {} as never,
    global: null,
    indexPath: [],
    path: ['content'],
    schemaPath: ['content'],
    siblingFields: [],
  })

  assert.equal(value, original)
})
