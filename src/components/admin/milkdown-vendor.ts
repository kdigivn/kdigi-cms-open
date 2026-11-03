/**
 * Single import surface for Milkdown/ProseMirror internals used by the custom
 * editor modules. Everything comes from `@milkdown/kit` (a direct dependency
 * pinned to the same version family as `@milkdown/crepe`), so these are the
 * SAME module instances Crepe itself runs on — command keys, ctx slices, and
 * ProseMirror classes stay identity-equal. Never import from raw package paths
 * or node_modules internals here: a second copy of prosemirror-state/model
 * silently breaks plugin keys and selections.
 */
export { commandsCtx, editorViewCtx, parserCtx } from '@milkdown/kit/core'
export type { Ctx } from '@milkdown/kit/ctx'
export { $inputRule, $prose } from '@milkdown/kit/utils'
export {
  addBlockTypeCommand,
  blockquoteSchema,
  bulletListSchema,
  clearTextInCurrentBlockCommand,
  codeBlockSchema,
  emphasisSchema,
  headingSchema,
  hrSchema,
  imageSchema,
  inlineCodeSchema,
  insertImageCommand,
  isMarkSelectedCommand,
  linkSchema,
  listItemSchema,
  orderedListSchema,
  paragraphSchema,
  selectTextNearPosCommand,
  setBlockTypeCommand,
  strongSchema,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
  wrapInBlockTypeCommand,
} from '@milkdown/kit/preset/commonmark'
export {
  addColAfterCommand,
  addColBeforeCommand,
  addRowAfterCommand,
  addRowBeforeCommand,
  createTable,
  deleteSelectedCellsCommand,
  selectTableCommand,
  setAlignCommand,
  strikethroughSchema,
  tableCellSchema,
  tableHeaderSchema,
  toggleStrikethroughCommand,
} from '@milkdown/kit/preset/gfm'
export { InputRule } from '@milkdown/kit/prose/inputrules'
export { linkTooltipAPI } from '@milkdown/kit/component/link-tooltip'
export {
  EditorState,
  NodeSelection,
  Plugin,
  PluginKey,
  TextSelection,
} from '@milkdown/kit/prose/state'
export type { PluginView } from '@milkdown/kit/prose/state'
export { Decoration, DecorationSet, EditorView } from '@milkdown/kit/prose/view'
export { block, blockConfig, BlockProvider, BlockService } from '@milkdown/kit/plugin/block'
export type { DecorationAttrs } from '@milkdown/kit/prose/view'
export { Slice } from '@milkdown/kit/prose/model'
export type { Node as ProseMirrorNode, ResolvedPos } from '@milkdown/kit/prose/model'
export type { Transaction } from '@milkdown/kit/prose/state'
export type { BlockEditFeatureConfig } from '@milkdown/crepe/feature/block-edit'
