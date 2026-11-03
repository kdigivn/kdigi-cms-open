'use client'

import type { Ctx, ProseMirrorNode, Transaction } from './milkdown-vendor'
import {
  addBlockTypeCommand,
  addColAfterCommand,
  addColBeforeCommand,
  addRowAfterCommand,
  addRowBeforeCommand,
  blockquoteSchema,
  bulletListSchema,
  codeBlockSchema,
  commandsCtx,
  createTable,
  deleteSelectedCellsCommand,
  editorViewCtx,
  emphasisSchema,
  headingSchema,
  hrSchema,
  imageSchema,
  inlineCodeSchema,
  insertImageCommand,
  isMarkSelectedCommand,
  linkSchema,
  linkTooltipAPI,
  NodeSelection,
  listItemSchema,
  orderedListSchema,
  paragraphSchema,
  selectTableCommand,
  setAlignCommand,
  setBlockTypeCommand,
  strikethroughSchema,
  strongSchema,
  tableCellSchema,
  TextSelection,
  tableHeaderSchema,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrikethroughCommand,
  toggleStrongCommand,
  wrapInBlockTypeCommand,
} from './milkdown-vendor'

export function setParagraphBlock(ctx: Ctx) {
  const commands = ctx.get(commandsCtx)
  commands.call(setBlockTypeCommand.key, { nodeType: paragraphSchema.type(ctx) })
}

export function setHeadingBlock(ctx: Ctx, level: 1 | 2 | 3 | 4 | 5 | 6) {
  const commands = ctx.get(commandsCtx)
  commands.call(setBlockTypeCommand.key, {
    nodeType: headingSchema.type(ctx),
    attrs: { level },
  })
}

export function setQuoteBlock(ctx: Ctx) {
  const commands = ctx.get(commandsCtx)
  commands.call(wrapInBlockTypeCommand.key, { nodeType: blockquoteSchema.type(ctx) })
}

export function setBulletListBlock(ctx: Ctx) {
  const commands = ctx.get(commandsCtx)
  commands.call(wrapInBlockTypeCommand.key, { nodeType: bulletListSchema.type(ctx) })
}

export function setOrderedListBlock(ctx: Ctx) {
  const commands = ctx.get(commandsCtx)
  commands.call(wrapInBlockTypeCommand.key, { nodeType: orderedListSchema.type(ctx) })
}

export function setTaskListBlock(ctx: Ctx) {
  const commands = ctx.get(commandsCtx)
  commands.call(wrapInBlockTypeCommand.key, {
    nodeType: listItemSchema.type(ctx),
    attrs: { checked: false },
  })
}

export function setDividerBlock(ctx: Ctx) {
  const commands = ctx.get(commandsCtx)
  commands.call(addBlockTypeCommand.key, { nodeType: hrSchema.type(ctx) })
}

export function setCodeBlock(ctx: Ctx) {
  const commands = ctx.get(commandsCtx)
  commands.call(setBlockTypeCommand.key, { nodeType: codeBlockSchema.type(ctx) })
}

/**
 * Inserts a 3x3 GFM table and places the caret at the first (header) cell's
 * content start, then focuses the view — shared by every insertion surface
 * (slash menu, and any future toolbar/block-handle entry point), since they
 * all call this same function through the command registry's `table` entry.
 *
 * Dispatches its own transaction directly (rather than going through two
 * separate `commands.call` steps) so the "where did the table land" position
 * math is exact: `replaceSelectionWith` only ever touches the (possibly
 * empty) selected range, so everything before `state.selection.from` is
 * untouched and that same numeric position is where the new table node
 * starts in the resulting doc. From there the table's schema is fixed
 * (`table > table_header_row > table_header > paragraph`, see
 * `@milkdown/preset-gfm`'s `cellContent: 'paragraph'`), so `+4` is always
 * the first header cell's paragraph content start — no heuristic "nearest
 * text position" search needed (that was the pre-fix `selectTextNearPosCommand`
 * approach, which only approximated cell (0,0) and never called
 * `view.focus()`, leaving no visible caret after a menu-click insert).
 */
export function insertTableBlock(ctx: Ctx) {
  const view = ctx.get(editorViewCtx)
  const { state } = view
  const tablePos = state.selection.from
  const tr = state.tr.replaceSelectionWith(createTable(ctx, 3, 3))
  const firstCellContentPos = Math.min(tablePos + 4, tr.doc.content.size)
  tr.setSelection(TextSelection.near(tr.doc.resolve(firstCellContentPos), 1))
  view.dispatch(tr.scrollIntoView())
  view.focus()
}

export function insertPlainImage(ctx: Ctx, payload: { src: string; alt: string }) {
  const commands = ctx.get(commandsCtx)
  commands.call(insertImageCommand.key, { src: payload.src, alt: payload.alt, title: '' })
}

export function openLinkEditor(ctx: Ctx) {
  const view = ctx.get(editorViewCtx)
  const { from, to } = view.state.selection
  ctx.get(linkTooltipAPI.key).addLink(from, to)
}

/**
 * Inline-mark commands (Phase 4, Lark editor stabilization plan — these had
 * no reusable named export before this phase; see
 * `reports/phase-01-baseline-inventory.md` §2). Each pair mirrors the
 * block-type `set*Block`/`is*Selection` shape above so the command registry
 * can reference them uniformly.
 *
 * Underline is intentionally NOT here: `milkdown-vendor.ts` does not export
 * an underline schema or toggle command anywhere in the Milkdown/ProseMirror
 * preset this editor uses (CommonMark/GFM has no underline syntax), so there
 * is no proven Markdown storage path — see phase-04's "Risks" and the
 * command registry's module doc comment.
 */
export function toggleBoldMark(ctx: Ctx) {
  ctx.get(commandsCtx).call(toggleStrongCommand.key)
}

export function isBoldMarkActive(ctx: Ctx) {
  return ctx.get(commandsCtx).call(isMarkSelectedCommand.key, strongSchema.type(ctx))
}

export function toggleItalicMark(ctx: Ctx) {
  ctx.get(commandsCtx).call(toggleEmphasisCommand.key)
}

export function isItalicMarkActive(ctx: Ctx) {
  return ctx.get(commandsCtx).call(isMarkSelectedCommand.key, emphasisSchema.type(ctx))
}

export function toggleStrikethroughMark(ctx: Ctx) {
  ctx.get(commandsCtx).call(toggleStrikethroughCommand.key)
}

export function isStrikethroughMarkActive(ctx: Ctx) {
  return ctx.get(commandsCtx).call(isMarkSelectedCommand.key, strikethroughSchema.type(ctx))
}

export function toggleInlineCodeMark(ctx: Ctx) {
  ctx.get(commandsCtx).call(toggleInlineCodeCommand.key)
}

export function isInlineCodeMarkActive(ctx: Ctx) {
  return ctx.get(commandsCtx).call(isMarkSelectedCommand.key, inlineCodeSchema.type(ctx))
}

export function isLinkMarkActive(ctx: Ctx) {
  return ctx.get(commandsCtx).call(isMarkSelectedCommand.key, linkSchema.type(ctx))
}

export function getSelectionParent(ctx: Ctx): ProseMirrorNode {
  return ctx.get(editorViewCtx).state.selection.$from.parent
}

export function getSelectionAncestor(ctx: Ctx, typeName: string): ProseMirrorNode | null {
  const { $from } = ctx.get(editorViewCtx).state.selection
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name === typeName) return node
  }
  return null
}

export function selectionHasAncestor(ctx: Ctx, typeName: string) {
  return getSelectionAncestor(ctx, typeName) !== null
}

function selectionMatchesLeafNodeType(ctx: Ctx, typeName: string) {
  const { selection } = ctx.get(editorViewCtx).state
  const selectedNode = (selection as { node?: ProseMirrorNode }).node
  if (selectedNode?.type.name === typeName) return true

  const parent = selection.$from.parent
  if (parent.type.name === typeName) return true

  return selection.$from.nodeAfter?.type.name === typeName
}

export function isParagraphSelection(ctx: Ctx) {
  if (getSelectionParent(ctx).type !== paragraphSchema.type(ctx)) return false
  if (getSelectionAncestor(ctx, listItemSchema.type(ctx).name)) return false
  return !getSelectionAncestor(ctx, blockquoteSchema.type(ctx).name)
}

export function isHeadingSelection(ctx: Ctx, level: number) {
  const parent = getSelectionParent(ctx)
  return parent.type === headingSchema.type(ctx) && parent.attrs.level === level
}

export function isQuoteSelection(ctx: Ctx) {
  return selectionHasAncestor(ctx, blockquoteSchema.type(ctx).name)
}

export function isBulletListSelection(ctx: Ctx) {
  return selectionHasAncestor(ctx, bulletListSchema.type(ctx).name) && !isTaskListSelection(ctx)
}

export function isOrderedListSelection(ctx: Ctx) {
  return selectionHasAncestor(ctx, orderedListSchema.type(ctx).name)
}

export function isTaskListSelection(ctx: Ctx) {
  const listItem = getSelectionAncestor(ctx, listItemSchema.type(ctx).name)
  return listItem?.attrs.checked != null
}

export function isCodeBlockSelection(ctx: Ctx) {
  return getSelectionParent(ctx).type === codeBlockSchema.type(ctx)
}

export function isDividerSelection(ctx: Ctx) {
  return selectionMatchesLeafNodeType(ctx, hrSchema.type(ctx).name)
}

export function isImageSelection(ctx: Ctx) {
  return selectionMatchesLeafNodeType(ctx, imageSchema.type(ctx).name)
}

/**
 * Table row/column/alignment commands (Phase 6, Lark editor stabilization
 * plan — `reports/phase-06-table-affordances-report.md`). Crepe's own
 * table node view (`@milkdown/components/table-block`) already calls these
 * SAME underlying `@milkdown/preset-gfm` commands from its pointer-driven
 * cell-handle/line-handle button group — see the report for the verified
 * upstream source. These wrappers exist so a keyboard-reachable surface
 * (slash menu / future shortcut) can reach the identical behavior, since
 * Crepe's handles are pointer-only (also documented in the report).
 */

export type TableColumnAlignment = 'left' | 'center' | 'right'

/**
 * GFM delimiter-row syntax for each alignment (`:---`, `:---:`, `---:`) —
 * verified against `@milkdown/preset-gfm@7.21.2`'s table `toMarkdown`
 * runner, which reads each header cell's `alignment` attr into the mdast
 * `align` array that `remark-gfm` renders as this delimiter syntax. Real
 * production use: sourced by the command registry's `aliases` so tooltips/
 * docs show the exact Markdown a click produces, matching the convention
 * already used for heading/list aliases in `milkdown-command-registry.ts`.
 */
export const GFM_TABLE_ALIGNMENT_DELIMITER: Record<TableColumnAlignment, string> = {
  left: ':---',
  center: ':---:',
  right: '---:',
}

export type TableDeletionScope = 'row' | 'column' | 'table'

/**
 * Mirrors `@milkdown/preset-gfm`'s own `deleteSelectedCellsCommand` branching
 * (verified source: a `CellSelection` that is both a row selection AND a
 * column selection deletes the whole table; a column-only selection deletes
 * that column; anything else deletes the selected row(s)). Exposed as a pure
 * function so a tooltip/announcer can describe what a delete action is about
 * to do without re-deriving Milkdown's own deletion rule.
 */
export function describeTableDeletionScope(
  isRowSelection: boolean,
  isColSelection: boolean,
): TableDeletionScope {
  if (isRowSelection && isColSelection) return 'table'
  if (isColSelection) return 'column'
  return 'row'
}

export function addTableRowBefore(ctx: Ctx) {
  ctx.get(commandsCtx).call(addRowBeforeCommand.key)
}

export function addTableRowAfter(ctx: Ctx) {
  ctx.get(commandsCtx).call(addRowAfterCommand.key)
}

export function addTableColumnBefore(ctx: Ctx) {
  ctx.get(commandsCtx).call(addColBeforeCommand.key)
}

export function addTableColumnAfter(ctx: Ctx) {
  ctx.get(commandsCtx).call(addColAfterCommand.key)
}

/**
 * Deletes whatever the current table selection covers — a row, a column, or
 * (when the selection spans every row and every column) the whole table.
 * Identical to what Crepe's built-in per-row/per-column delete button calls.
 */
export function deleteTableSelection(ctx: Ctx) {
  ctx.get(commandsCtx).call(deleteSelectedCellsCommand.key)
}

/**
 * Selects the whole table, then deletes it — the keyboard-reachable
 * equivalent of using Crepe's row/column delete buttons across every row and
 * column. `selectTableCommand` produces a selection spanning every row and
 * column, so the immediately-following `deleteSelectedCellsCommand` call
 * routes to `describeTableDeletionScope`'s `'table'` branch.
 */
export function deleteWholeTable(ctx: Ctx) {
  const commands = ctx.get(commandsCtx)
  commands.call(selectTableCommand.key)
  commands.call(deleteSelectedCellsCommand.key)
}

export function setTableColumnAlignment(ctx: Ctx, alignment: TableColumnAlignment) {
  ctx.get(commandsCtx).call(setAlignCommand.key, alignment)
}

export function isTableColumnAlignSelection(ctx: Ctx, alignment: TableColumnAlignment) {
  const parent = getSelectionParent(ctx)
  if (parent.type !== tableCellSchema.type(ctx) && parent.type !== tableHeaderSchema.type(ctx)) {
    return false
  }
  return parent.attrs.alignment === alignment
}

/* ============================================================================
 * Block operations (phase 6, SP2-3) — move up/down, duplicate, delete, select.
 * ============================================================================
 *
 * Lark's block menu acts on the unit the caret sits in: a top-level block, or the list
 * ITEM when the caret is inside a list (moving the whole list would be a different,
 * destructive operation). Every function below therefore resolves the same target — see
 * `resolveBlockTarget` — and then edits only that node's range.
 */

/** What a block operation acts on: the node's range and its siblings' parent. */
export interface BlockTarget {
  /** Position immediately before the target node. */
  from: number
  /** Position immediately after it (`from + node.nodeSize`). */
  to: number
  /** Size of the previous sibling, or `null` when the node is first. */
  previousSize: number | null
  /** Size of the next sibling, or `null` when the node is last. */
  nextSize: number | null
}

/**
 * Pure range arithmetic for a block move — kept separate from the transaction so the
 * tricky part (positions after a delete) is unit-testable without a ProseMirror schema.
 *
 * `move up`: delete the node, then insert it before where the previous sibling starts.
 * `move down`: delete the node, then insert it after the next sibling — which, once the
 * node is gone, sits exactly where the node used to start.
 */
export function planBlockMove(
  target: BlockTarget,
  direction: 'up' | 'down',
): { deleteFrom: number; deleteTo: number; insertAt: number } | null {
  if (direction === 'up') {
    if (target.previousSize === null) return null
    return {
      deleteFrom: target.from,
      deleteTo: target.to,
      insertAt: target.from - target.previousSize,
    }
  }
  if (target.nextSize === null) return null
  return { deleteFrom: target.from, deleteTo: target.to, insertAt: target.from + target.nextSize }
}

/**
 * Resolves the block the caret acts on: the enclosing `list_item` when there is one,
 * otherwise the top-level block. Returns `null` for selections that are not inside a
 * text block (e.g. an existing node selection spanning several blocks).
 */
export function resolveBlockTarget(ctx: Ctx): BlockTarget | null {
  const { doc, selection } = ctx.get(editorViewCtx).state
  const $from = selection.$from
  if ($from.depth < 1) return null

  // Nearest `list_item` ancestor (the list item is the movable unit inside a list).
  let listItemDepth = $from.depth
  while (listItemDepth > 0 && $from.node(listItemDepth).type.name !== 'list_item') {
    listItemDepth -= 1
  }
  const from = listItemDepth > 0 ? $from.before(listItemDepth) : $from.before(1)
  const $pos = doc.resolve(from)
  const node = $pos.nodeAfter
  if (!node) return null

  const index = $pos.index()
  const parent = $pos.parent
  return {
    from,
    to: from + node.nodeSize,
    previousSize: index > 0 ? parent.child(index - 1).nodeSize : null,
    nextSize: index < parent.childCount - 1 ? parent.child(index + 1).nodeSize : null,
  }
}

/** Moves the caret into the node now starting at `from`, keeping the same offset. */
function selectInside(tr: Transaction, from: number, offset: number): Transaction {
  return tr.setSelection(TextSelection.near(tr.doc.resolve(from + 1 + offset), 1))
}

export function moveBlockUp(ctx: Ctx) {
  moveBlock(ctx, 'up')
}

export function moveBlockDown(ctx: Ctx) {
  moveBlock(ctx, 'down')
}

function moveBlock(ctx: Ctx, direction: 'up' | 'down') {
  const view = ctx.get(editorViewCtx)
  const target = resolveBlockTarget(ctx)
  if (!target) return
  const plan = planBlockMove(target, direction)
  if (!plan) return

  const { selection } = view.state
  const node = view.state.doc.resolve(target.from).nodeAfter
  if (!node) return
  const offset = Math.max(0, selection.from - target.from - 1)

  let tr = view.state.tr.delete(plan.deleteFrom, plan.deleteTo)
  tr = tr.insert(plan.insertAt, node)
  tr = selectInside(tr, plan.insertAt, Math.min(offset, node.content.size))
  view.dispatch(tr.scrollIntoView())
  view.focus()
}

export function duplicateBlock(ctx: Ctx) {
  const view = ctx.get(editorViewCtx)
  const target = resolveBlockTarget(ctx)
  if (!target) return
  const node = view.state.doc.resolve(target.from).nodeAfter
  if (!node) return

  // The copy goes directly below and the caret moves into it (Lark's behaviour), so the
  // next keystroke edits the duplicate rather than the original.
  let tr = view.state.tr.insert(target.to, node.copy(node.content))
  tr = selectInside(tr, target.to, 0)
  view.dispatch(tr.scrollIntoView())
  view.focus()
}

export function deleteBlock(ctx: Ctx) {
  const view = ctx.get(editorViewCtx)
  const target = resolveBlockTarget(ctx)
  if (!target) return

  // Never leave the document empty: deleting the only block clears its content instead.
  if (view.state.doc.childCount === 1) {
    const tr = view.state.tr.delete(target.from + 1, target.to - 1)
    view.dispatch(tr)
    view.focus()
    return
  }

  const caretAt = target.previousSize === null ? target.from : target.from - 1
  const tr = view.state.tr.delete(target.from, target.to)
  view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(caretAt), -1)))
  view.focus()
}

export function selectBlock(ctx: Ctx) {
  const view = ctx.get(editorViewCtx)
  const target = resolveBlockTarget(ctx)
  if (!target) return
  const node = view.state.doc.resolve(target.from).nodeAfter
  if (!node) return
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, target.from)))
  view.focus()
}

/**
 * Anchor hash of the heading the caret sits in (`#heading-id`), or `null` elsewhere.
 *
 * The admin cannot build a public URL: it renders under `/admin/...` while the anchor id
 * is only meaningful in the frontend's URL space. The hash is what the frontend resolves
 * (the frontend renders the same ids), so that is what gets copied.
 */
export function buildHeadingAnchorHash(ctx: Ctx): string | null {
  const parent = getSelectionParent(ctx)
  if (parent.type !== headingSchema.type(ctx)) return null
  const id = parent.attrs.id
  return typeof id === 'string' && id.length > 0 ? `#${id}` : null
}
