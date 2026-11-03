'use client'

/**
 * Lark-form input rules (phase 6, SP2-3) — the triggers Milkdown does not ship.
 *
 * Milkdown's GFM preset turns `[ ] ` / `[x] ` into a to-do only INSIDE an existing list
 * item: its rule (`wrapInTaskListInputRule`, `@milkdown/preset-gfm`) matches
 * `/^\[(?<checked>\s|x)\]\s$/` and merely sets `checked` on the enclosing `list_item` — it
 * cannot create the list. Lark's own trigger is the brackets-only form `[] `, which today
 * produced nothing at all (matrix row `md-task`, flagged `phase-6`).
 *
 * This slice adds exactly that missing trigger. The wrapping is built explicitly instead of
 * reusing `wrappingInputRule`, because that helper can only set attributes on the OUTER
 * node it creates — and `checked` lives on the inner `list_item`.
 */

import type { Ctx } from './milkdown-vendor'
import {
  $inputRule,
  bulletListSchema,
  InputRule,
  listItemSchema,
  paragraphSchema,
  TextSelection,
} from './milkdown-vendor'

/** `[] ` at the very end of a plain paragraph, allowing leading spaces like Milkdown's own rules. */
export const LARK_TASK_TRIGGER = /^\s*\[\]\s$/

/**
 * Builds the `bullet_list > list_item(checked: false) > paragraph` replacement, keeping
 * whatever the paragraph held before the trigger (marks included).
 */
export const larkTaskTriggerInputRule = $inputRule((ctx: Ctx) => {
  return new InputRule(LARK_TASK_TRIGGER, (state, _match, start, end) => {
    const $start = state.doc.resolve(start)
    // Only a top-level paragraph: inside a list item the GFM rule owns `[ ] `, and wrapping
    // a nested paragraph would move content out of the list the user is already editing.
    if ($start.depth !== 1 || $start.parent.type.name !== 'paragraph') return null

    const block = $start.parent
    const localFrom = start - $start.start()
    const localTo = end - $start.start()
    const keptContent = block.content.cut(0, localFrom).append(block.content.cut(localTo))

    const paragraph = paragraphSchema.type(ctx).create(null, keptContent)
    const item = listItemSchema.type(ctx).create({ checked: false, spread: false }, paragraph)
    const list = bulletListSchema.type(ctx).create(null, item)

    const from = $start.before(1)
    const to = $start.after(1)
    const tr = state.tr.replaceWith(from, to, list)
    // One document position per boundary: list → item → paragraph → its text.
    return tr.setSelection(TextSelection.near(tr.doc.resolve(from + 3), 1))
  })
})
