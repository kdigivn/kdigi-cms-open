import assert from 'node:assert/strict'
import test from 'node:test'
import type { Field, PayloadRequest } from 'payload'

import { Faqs } from './faqs.js'

const itemsField = Faqs.fields.find((field) => (field as Field & { name?: string }).name === 'items') as
  | (Field & { fields?: Field[] })
  | undefined
const answerField = itemsField?.fields
  ? itemsField.fields.find((field) => (field as Field & { name?: string }).name === 'answer')
  : undefined
const answerAfterRead = (answerField as Field & {
  hooks?: { afterRead?: Array<(args: Record<string, unknown>) => unknown> }
} | undefined)?.hooks?.afterRead?.[0]

test('faq answer afterRead expands shortcodes on REST reads', async () => {
  assert.ok(answerAfterRead, 'FAQ answer afterRead hook should exist')

  const value = await answerAfterRead?.({
    req: {
      payloadAPI: 'REST',
      locale: 'vi',
      payload: {
        find: async () => ({
          docs: [
            {
              name: 'thu-cung',
              contentMd: '**Mang thu cung** duoc phep',
            },
          ],
        }),
      },
    } as unknown as PayloadRequest,
    data: { tenant: 5 },
    value: '[sc name="thu-cung"][/sc]',
    siblingData: {},
    blockData: undefined,
    collection: null,
    context: {},
    field: {} as never,
    global: null,
    indexPath: [],
    path: ['items', 0, 'answer'],
    schemaPath: ['items', 'answer'],
    siblingFields: [],
  })

  assert.equal(typeof value, 'string')
  assert.match(value as string, /<strong>Mang thu cung<\/strong>/)
  assert.doesNotMatch(value as string, /\[sc/)
})
