import assert from 'node:assert/strict'
import test from 'node:test'
import type { Payload, PayloadRequest } from 'payload'

import { expandShortcodesInMarkdown } from './expand-shortcodes.js'

type FetchCall = {
  names: string[]
  tenantId: number | string
}

function makeOptions(args: {
  map: Record<string, string>
  calls?: FetchCall[]
  tenantId?: number | string
}) {
  const { map, calls } = args
  const tenantId = Object.prototype.hasOwnProperty.call(args, 'tenantId') ? args.tenantId : 99

  return {
    payload: {} as Payload,
    req: {} as PayloadRequest,
    tenantId,
    fetchShortcodes: async ({ names, tenantId: incomingTenantId }: { names: string[]; tenantId: number | string }) => {
      calls?.push({ names, tenantId: incomingTenantId })
      return new Map(names.flatMap((name) => (map[name] ? [[name, map[name]] as const] : [])))
    },
  }
}

test('returns markdown unchanged when tenant is missing', async () => {
  const out = await expandShortcodesInMarkdown('[sc name="bang-gia"][/sc]', makeOptions({
    map: { 'bang-gia': 'Bang gia' },
    tenantId: undefined,
  }))

  assert.equal(out, '[sc name="bang-gia"][/sc]')
})

test('expands paired shortcode tag', async () => {
  const out = await expandShortcodesInMarkdown(
    'Gia ve:\n[sc name="bang-gia"][/sc]',
    makeOptions({ map: { 'bang-gia': 'Noi dung **bang gia**' } }),
  )

  assert.match(out, /Noi dung \*\*bang gia\*\*/)
  assert.doesNotMatch(out, /\[sc/)
})

test('expands self-closing shortcode tag', async () => {
  const out = await expandShortcodesInMarkdown(
    'Gia ve:\n[sc name="bang-gia" /]',
    makeOptions({ map: { 'bang-gia': 'Noi dung bang gia' } }),
  )

  assert.match(out, /Noi dung bang gia/)
})

test('expands single-quoted shortcode tag', async () => {
  const out = await expandShortcodesInMarkdown(
    "Gia ve:\n[sc name='bang-gia' /]",
    makeOptions({ map: { 'bang-gia': 'Noi dung bang gia' } }),
  )

  assert.match(out, /Noi dung bang gia/)
})

test('expands the Markdown-escaped tag the editor serializer writes (self-closing and paired)', async () => {
  // Milkdown stores a literal `[` in text as a backslash-escaped `[`; the escape must be
  // consumed with the tag, not left in front of the expanded content.
  const out = await expandShortcodesInMarkdown(
    'A \\[sc name="bang-gia"/] B\n\\[sc name="bang-gia"]\\[/sc]',
    makeOptions({ map: { 'bang-gia': 'Noi dung' } }),
  )

  assert.equal(out.match(/Noi dung/g)?.length, 2, out)
  assert.doesNotMatch(out, /\\|\[sc|\[\/sc\]/, 'no escape or tag residue')
})

test('batches repeated shortcode names into one fetch', async () => {
  const calls: FetchCall[] = []
  const out = await expandShortcodesInMarkdown(
    '[sc name="bang-gia"][/sc]\n[sc name="bang-gia"][/sc]',
    makeOptions({ map: { 'bang-gia': 'Noi dung bang gia' }, calls }),
  )

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], { names: ['bang-gia'], tenantId: 99 })
  assert.equal(out.match(/Noi dung bang gia/g)?.length, 2)
})

test('unknown shortcode expands to empty string', async () => {
  const out = await expandShortcodesInMarkdown(
    'Gia ve:\n[sc name="khong-ton-tai"][/sc]',
    makeOptions({ map: {} }),
  )

  assert.equal(out.trim(), 'Gia ve:')
})

test('nested shortcodes expand recursively', async () => {
  const out = await expandShortcodesInMarkdown(
    '[sc name="outer"][/sc]',
    makeOptions({
      map: {
        outer: 'Start\n[sc name="inner"][/sc]\nEnd',
        inner: 'Nested body',
      },
    }),
  )

  assert.match(out, /Start/)
  assert.match(out, /Nested body/)
  assert.match(out, /End/)
})

test('circular references terminate safely', async () => {
  const out = await expandShortcodesInMarkdown(
    '[sc name="a"][/sc]',
    makeOptions({
      map: {
        a: 'A -> [sc name="b"][/sc]',
        b: 'B -> [sc name="a"][/sc]',
      },
    }),
  )

  assert.match(out, /A ->/)
  assert.match(out, /B ->/)
  assert.doesNotMatch(out, /\[sc/)
})

test('depth cap strips level 4 expansion', async () => {
  const out = await expandShortcodesInMarkdown(
    '[sc name="a"][/sc]',
    makeOptions({
      map: {
        a: '[sc name="b"][/sc]',
        b: '[sc name="c"][/sc]',
        c: '[sc name="d"][/sc]',
        d: 'Depth 4 should not appear',
      },
    }),
  )

  assert.doesNotMatch(out, /Depth 4 should not appear/)
  assert.doesNotMatch(out, /\[sc/)
})

test('keeps blank-line wrapping around expanded markdown', async () => {
  const out = await expandShortcodesInMarkdown(
    'Truoc\n[sc name="bang"][/sc]\nSau',
    makeOptions({ map: { bang: '| A |\n|---|\n| 1 |' } }),
  )

  assert.match(out, /Truoc\n{3}\| A \|\n\|---\|\n\| 1 \|\n{3}Sau/)
})

test('empty markdown returns empty string', async () => {
  const out = await expandShortcodesInMarkdown('', makeOptions({ map: { any: 'value' } }))
  assert.equal(out, '')
})
