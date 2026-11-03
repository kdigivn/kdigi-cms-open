'use client'

/**
 * Marks the table cell containing the caret with an `is-active-cell` node
 * decoration, so the user can always see which cell they are typing in
 * (Lark-style active-cell affordance — user request 2026-07-16).
 *
 * Decoration-only: the class never enters the document, stored Markdown, or
 * generated HTML (locked by the forbidden-artifact assertions in
 * `src/fields/canonical-gfm-fixture.test.ts`). Styling lives in
 * `milkdown-editor-core.css` and must never change border-width or any
 * metric — the selection-geometry invariant applies (box-shadow/tint only).
 *
 * Because this is a `decorations` prop computed from the current state, it
 * updates on every selection change (pointer, arrow keys, Tab between
 * cells) and disappears automatically on destroy — no listeners, timers, or
 * classes to clean up.
 */

import type { EditorState } from './milkdown-vendor'
import { $prose, Decoration, DecorationSet, Plugin, PluginKey } from './milkdown-vendor'

const larkActiveCellPluginKey = new PluginKey('lark-active-cell')

/**
 * Resolves the nearest ancestor of the selection head whose node type is a
 * table cell (via the schema's `tableRole`, so it works for both `td` and
 * `th` without hardcoding node-type names). Exported for unit tests.
 */
export function findActiveCellRange(state: EditorState): { from: number; to: number } | null {
  const { $head } = state.selection
  for (let depth = $head.depth; depth > 0; depth--) {
    const node = $head.node(depth)
    const tableRole = (node.type.spec as { tableRole?: string }).tableRole
    if (tableRole === 'cell' || tableRole === 'header_cell') {
      const from = $head.before(depth)
      return { from, to: from + node.nodeSize }
    }
  }
  return null
}

export function createLarkActiveCellPlugin() {
  return new Plugin({
    key: larkActiveCellPluginKey,
    props: {
      decorations(state) {
        const range = findActiveCellRange(state)
        if (!range) return DecorationSet.empty
        return DecorationSet.create(state.doc, [
          Decoration.node(range.from, range.to, { class: 'is-active-cell' }),
        ])
      },
    },
  })
}

export const milkdownLarkActiveCellPlugin = $prose(() => createLarkActiveCellPlugin())
