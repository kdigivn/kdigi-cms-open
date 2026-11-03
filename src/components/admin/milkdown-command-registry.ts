'use client'

/**
 * Shared command descriptor map for every Milkdown Lark-editor surface
 * (Lark editor stabilization plan, Phase 4 — completes the Phase 1 scaffold,
 * Red Team Session 1 F4). This is a LIGHTWEIGHT DESCRIPTOR MAP, not a new
 * execution layer: every `run`/`isActive` reference below points at a
 * function that already exists in `milkdown-lark-commands.ts` — nothing here
 * re-implements command logic.
 *
 * All four consumers read from this registry instead of declaring their own
 * label/icon/run copies (see `reports/phase-01-baseline-inventory.md` §2 for
 * the duplication this replaces):
 *   - `milkdown-toolbar-config.ts` (floating selection toolbar composition)
 *   - `milkdown-slash-menu-config.ts` (Crepe slash menu)
 *   - `milkdown-selection-block-menu.tsx` ("Turn into" dropdown)
 *   - `milkdown-editor-core.tsx` (keyboard-shortcut command dispatch)
 */

import {
  buildHeadingAnchorHash,
  deleteBlock,
  duplicateBlock,
  moveBlockDown,
  moveBlockUp,
  addTableColumnAfter,
  addTableColumnBefore,
  addTableRowAfter,
  addTableRowBefore,
  deleteTableSelection,
  deleteWholeTable,
  GFM_TABLE_ALIGNMENT_DELIMITER,
  insertTableBlock,
  isBoldMarkActive,
  isBulletListSelection,
  isCodeBlockSelection,
  isDividerSelection,
  isHeadingSelection,
  isInlineCodeMarkActive,
  isItalicMarkActive,
  isLinkMarkActive,
  isOrderedListSelection,
  isParagraphSelection,
  isQuoteSelection,
  isStrikethroughMarkActive,
  isTableColumnAlignSelection,
  isTaskListSelection,
  openLinkEditor,
  setBulletListBlock,
  setCodeBlock,
  setDividerBlock,
  setHeadingBlock,
  setOrderedListBlock,
  setParagraphBlock,
  setQuoteBlock,
  setTableColumnAlignment,
  setTaskListBlock,
  toggleBoldMark,
  toggleInlineCodeMark,
  toggleItalicMark,
  toggleStrikethroughMark,
} from './milkdown-lark-commands'
import {
  milkdownBoldIcon,
  milkdownBulletListIcon,
  milkdownCodeBlockIcon,
  milkdownDividerIcon,
  milkdownHeading1Icon,
  milkdownHeading2Icon,
  milkdownHeading3Icon,
  milkdownHeading4Icon,
  milkdownHeading5Icon,
  milkdownHeading6Icon,
  milkdownImageIcon,
  milkdownInlineCodeIcon,
  milkdownItalicIcon,
  milkdownLinkIcon,
  milkdownOrderedListIcon,
  milkdownQuoteIcon,
  milkdownStrikethroughIcon,
  milkdownTableIcon,
  milkdownTaskListIcon,
  milkdownTextIcon,
} from './milkdown-lark-icons'
import type { Ctx } from './milkdown-vendor'

/**
 * `gfm` — the resulting content round-trips through GFM Markdown (the field's
 *   source of truth); safe to persist as-is.
 * `editor-only` — affects editor UX/state but has no Markdown representation
 *   (e.g. a future "find in document" toggle). Never written to the field.
 * `excluded` — a Lark-style affordance intentionally NOT implemented here
 *   because it has no storage contract (e.g. paragraph alignment — see
 *   plan.md "Product Boundaries"). Kept as a documented non-goal, not a bug.
 */
export type MilkdownCommandPersistence = 'gfm' | 'editor-only' | 'excluded'

export interface MilkdownCommandDescriptor {
  /** Stable identifier — matches the `key` used by existing surface configs where one already exists. */
  id: string
  /** Human-readable label shown in menus/tooltips. */
  label: string
  /** Inline SVG markup from `milkdown-lark-icons.ts` — always a rendered icon, never a bare text glyph. */
  icon: string
  /** Grouping used to render Turn-Into / slash-menu / toolbar sections (e.g. `'structure'`, `'list'`, `'mark'`, `'insert'`). */
  group: string
  /** Markdown syntax and/or keyboard-shortcut strings that trigger this command, for docs/search. */
  aliases: string[]
  /** GFM round-trip classification — see `MilkdownCommandPersistence`. */
  persistence: MilkdownCommandPersistence
  /**
   * Executes the command. Always a reference to an existing exported
   * function — never redefined here. Omitted for `image`, whose existing
   * `insertPlainImage(ctx, { src, alt })` needs a payload the plain `(ctx)`
   * signature cannot carry (the media modal supplies it interactively) —
   * see `milkdown-editor-core.tsx#insertImageAtSelection`.
   */
  run?: (ctx: Ctx) => void
  /** Reports whether the current selection already matches this command's state. Omitted only for insert-type commands (image/table) that have no "active" state today. */
  isActive?: (ctx: Ctx) => boolean
}

const HEADING_ICONS = [
  milkdownHeading1Icon,
  milkdownHeading2Icon,
  milkdownHeading3Icon,
  milkdownHeading4Icon,
  milkdownHeading5Icon,
  milkdownHeading6Icon,
] as const

/**
 * Table row/column/align/delete icons (Phase 6). Defined locally instead of
 * in `milkdown-lark-icons.ts` — that file is owned by another concurrent
 * phase (see phase-06's file-ownership note) — but drawn to the same
 * 16x16 viewBox / `currentColor` line-icon convention as every other icon in
 * this registry so they render consistently once a surface adopts them.
 */
const svg16 = (body: string) =>
  `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">${body}</svg>`

const milkdownTableAddRowIcon = svg16(
  '<rect x="2" y="2.5" width="12" height="7.5" rx="1.2" stroke="currentColor" stroke-width="1.1"/><path d="M2 6.3h12M6.2 2.5v7.5" stroke="currentColor" stroke-width="1.1"/><path d="M8 12v2.6M6.7 13.3h2.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
)
const milkdownTableAddColumnIcon = svg16(
  '<rect x="1.4" y="2" width="7.5" height="12" rx="1.2" stroke="currentColor" stroke-width="1.1"/><path d="M5.2 2v12" stroke="currentColor" stroke-width="1.1"/><path d="M12 6.7v2.6M10.7 8h2.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
)
const milkdownTableDeleteIcon = svg16(
  '<rect x="2.5" y="3" width="11" height="10" rx="1.2" stroke="currentColor" stroke-width="1.1"/><path d="m5.8 6 4.4 4M10.2 6l-4.4 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
)
const milkdownTableAlignLeftIcon = svg16(
  '<path d="M2.5 3.5h11M2.5 6.5h7M2.5 9.5h11M2.5 12.5h7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
)
const milkdownTableAlignCenterIcon = svg16(
  '<path d="M2.5 3.5h11M4.5 6.5h7M2.5 9.5h11M4.5 12.5h7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
)
const milkdownTableAlignRightIcon = svg16(
  '<path d="M2.5 3.5h11M6.5 6.5h7M2.5 9.5h11M6.5 12.5h7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
)

const milkdownBlockMoveUpIcon = svg16(
  '<path d="M8 13V3.4M4.4 7 8 3.4 11.6 7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>',
)
const milkdownBlockMoveDownIcon = svg16(
  '<path d="M8 3v9.6M4.4 9 8 12.6 11.6 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>',
)
const milkdownBlockDuplicateIcon = svg16(
  '<rect x="5.6" y="5.6" width="8" height="8" rx="1.3" stroke="currentColor" stroke-width="1.2"/><path d="M10.4 5.6V3.7c0-.7-.6-1.3-1.3-1.3H3.7c-.7 0-1.3.6-1.3 1.3v5.4c0 .7.6 1.3 1.3 1.3h1.9" stroke="currentColor" stroke-width="1.2"/>',
)
const milkdownBlockDeleteIcon = svg16(
  '<path d="M3.2 4.6h9.6M6.4 4.6V3.3c0-.5.4-.8.9-.8h1.4c.5 0 .9.3.9.8v1.3M4.6 4.6l.6 8c0 .6.5 1 1.1 1h3.4c.6 0 1.1-.4 1.1-1l.6-8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
)
const milkdownBlockAnchorIcon = svg16(
  '<path d="M6.6 9.4a2.6 2.6 0 0 0 3.7 0l2.1-2.1a2.6 2.6 0 0 0-3.7-3.7l-.8.8M9.4 6.6a2.6 2.6 0 0 0-3.7 0L3.6 8.7a2.6 2.6 0 0 0 3.7 3.7l.8-.8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
)

/**
 * Tooltip text for a command: `Label (shortcut)` — phase 6's tooltip contract, shared by
 * the floating toolbar, the Turn-into menu and the block handle menu so the three surfaces
 * cannot drift. The alias is the descriptor's own first alias (already the
 * human-readable shortcut, e.g. `⌘B / Ctrl+B`).
 */
/** Accepts anything shaped like a descriptor, including the slash menu's `SlashMenuItem`
 *  (whose `aliases` is `readonly`) — one formatter, no per-surface copies. */
export function formatCommandTitle(command: {
  label: string
  aliases: readonly string[]
}): string {
  return command.aliases[0] ? `${command.label} (${command.aliases[0]})` : command.label
}

export const milkdownCommandRegistry: readonly MilkdownCommandDescriptor[] = [
  {
    id: 'paragraph',
    label: 'Text',
    icon: milkdownTextIcon,
    group: 'structure',
    aliases: ['⌘⌥0 / Ctrl+Alt+0'],
    persistence: 'gfm',
    run: setParagraphBlock,
    isActive: isParagraphSelection,
  },
  ...([1, 2, 3, 4, 5, 6] as const).map(
    (level): MilkdownCommandDescriptor => ({
      id: `heading${level}`,
      label: `Heading ${level}`,
      icon: HEADING_ICONS[level - 1],
      group: 'structure',
      aliases: [`${'#'.repeat(level)} Space`, `⌘⌥${level} / Ctrl+Alt+${level}`],
      persistence: 'gfm',
      run: (ctx) => setHeadingBlock(ctx, level),
      isActive: (ctx) => isHeadingSelection(ctx, level),
    }),
  ),
  {
    id: 'quote',
    label: 'Quote',
    icon: milkdownQuoteIcon,
    group: 'structure',
    aliases: ['> Space', '⌘⇧> / Ctrl+Shift+>'],
    persistence: 'gfm',
    run: setQuoteBlock,
    isActive: isQuoteSelection,
  },
  {
    id: 'bulletList',
    label: 'Bulleted List',
    icon: milkdownBulletListIcon,
    group: 'list',
    aliases: ['- Space', '* Space', '⌘⇧8 / Ctrl+Shift+8'],
    persistence: 'gfm',
    run: setBulletListBlock,
    isActive: isBulletListSelection,
  },
  {
    id: 'orderedList',
    label: 'Numbered List',
    icon: milkdownOrderedListIcon,
    group: 'list',
    aliases: ['1. Space', '⌘⇧7 / Ctrl+Shift+7'],
    persistence: 'gfm',
    run: setOrderedListBlock,
    isActive: isOrderedListSelection,
  },
  {
    id: 'taskList',
    label: 'To-do List',
    icon: milkdownTaskListIcon,
    group: 'list',
    aliases: ['[ ] Space', '⌘⌥T / Ctrl+Alt+T'],
    persistence: 'gfm',
    run: setTaskListBlock,
    isActive: isTaskListSelection,
  },
  {
    id: 'codeBlock',
    label: 'Code Block',
    icon: milkdownCodeBlockIcon,
    group: 'structure',
    aliases: ['```', '⌘⌥C / Ctrl+Alt+C'],
    persistence: 'gfm',
    run: setCodeBlock,
    isActive: isCodeBlockSelection,
  },
  {
    id: 'divider',
    label: 'Divider',
    icon: milkdownDividerIcon,
    group: 'structure',
    aliases: ['---', '⌘⌥S / Ctrl+Alt+S'],
    persistence: 'gfm',
    run: setDividerBlock,
    isActive: isDividerSelection,
  },
  {
    id: 'bold',
    label: 'Bold',
    icon: milkdownBoldIcon,
    group: 'mark',
    aliases: ['**text** / __text__', '⌘B / Ctrl+B'],
    persistence: 'gfm',
    run: toggleBoldMark,
    isActive: isBoldMarkActive,
  },
  {
    id: 'italic',
    label: 'Italic',
    icon: milkdownItalicIcon,
    group: 'mark',
    aliases: ['*text* / _text_', '⌘I / Ctrl+I'],
    persistence: 'gfm',
    run: toggleItalicMark,
    isActive: isItalicMarkActive,
  },
  {
    id: 'strikethrough',
    label: 'Strikethrough',
    icon: milkdownStrikethroughIcon,
    group: 'mark',
    aliases: ['~~text~~', '⌘⇧S / Ctrl+Shift+S'],
    persistence: 'gfm',
    run: toggleStrikethroughMark,
    isActive: isStrikethroughMarkActive,
  },
  {
    id: 'inlineCode',
    label: 'Inline Code',
    icon: milkdownInlineCodeIcon,
    group: 'mark',
    aliases: ['`text`', '⌘E / Ctrl+E'],
    persistence: 'gfm',
    run: toggleInlineCodeMark,
    isActive: isInlineCodeMarkActive,
  },
  {
    id: 'table',
    label: 'Table',
    icon: milkdownTableIcon,
    group: 'insert',
    aliases: [],
    persistence: 'gfm',
    run: insertTableBlock,
  },
  /**
   * Table row/column/align/delete commands (Phase 6). Crepe's own table node
   * view already exposes these via pointer-only cell-handle/line-handle
   * buttons (see `reports/phase-06-table-affordances-report.md`) — these
   * entries are the keyboard/menu-reachable equivalent for a future slash-
   * menu or shortcut binding (out of this phase's file ownership to wire up;
   * see the report). No `isActive`: like `table`/`image` above, add/delete
   * are one-shot actions with no persistent "active" state.
   */
  {
    id: 'tableAddRowBefore',
    label: 'Insert Row Above',
    icon: milkdownTableAddRowIcon,
    group: 'table',
    aliases: [],
    persistence: 'gfm',
    run: addTableRowBefore,
  },
  {
    id: 'tableAddRowAfter',
    label: 'Insert Row Below',
    icon: milkdownTableAddRowIcon,
    group: 'table',
    aliases: [],
    persistence: 'gfm',
    run: addTableRowAfter,
  },
  {
    id: 'tableAddColumnBefore',
    label: 'Insert Column Left',
    icon: milkdownTableAddColumnIcon,
    group: 'table',
    aliases: [],
    persistence: 'gfm',
    run: addTableColumnBefore,
  },
  {
    id: 'tableAddColumnAfter',
    label: 'Insert Column Right',
    icon: milkdownTableAddColumnIcon,
    group: 'table',
    aliases: [],
    persistence: 'gfm',
    run: addTableColumnAfter,
  },
  {
    id: 'tableDeleteSelection',
    label: 'Delete Row/Column/Table',
    icon: milkdownTableDeleteIcon,
    group: 'table',
    aliases: [],
    persistence: 'gfm',
    run: deleteTableSelection,
  },
  {
    id: 'tableDeleteWhole',
    label: 'Delete Table',
    icon: milkdownTableDeleteIcon,
    group: 'table',
    aliases: [],
    persistence: 'gfm',
    run: deleteWholeTable,
  },
  {
    id: 'tableAlignLeft',
    label: 'Align Column Left',
    icon: milkdownTableAlignLeftIcon,
    group: 'table',
    aliases: [GFM_TABLE_ALIGNMENT_DELIMITER.left],
    persistence: 'gfm',
    run: (ctx) => setTableColumnAlignment(ctx, 'left'),
    isActive: (ctx) => isTableColumnAlignSelection(ctx, 'left'),
  },
  {
    id: 'tableAlignCenter',
    label: 'Align Column Center',
    icon: milkdownTableAlignCenterIcon,
    group: 'table',
    aliases: [GFM_TABLE_ALIGNMENT_DELIMITER.center],
    persistence: 'gfm',
    run: (ctx) => setTableColumnAlignment(ctx, 'center'),
    isActive: (ctx) => isTableColumnAlignSelection(ctx, 'center'),
  },
  {
    id: 'tableAlignRight',
    label: 'Align Column Right',
    icon: milkdownTableAlignRightIcon,
    group: 'table',
    aliases: [GFM_TABLE_ALIGNMENT_DELIMITER.right],
    persistence: 'gfm',
    run: (ctx) => setTableColumnAlignment(ctx, 'right'),
    isActive: (ctx) => isTableColumnAlignSelection(ctx, 'right'),
  },
  {
    id: 'image',
    label: 'Image',
    icon: milkdownImageIcon,
    group: 'insert',
    aliases: [],
    persistence: 'gfm',
    // No `run`: insertPlainImage(ctx, { src, alt }) needs a payload the
    // media modal supplies interactively — see the `run` doc comment above.
  },
  {
    id: 'link',
    label: 'Link',
    icon: milkdownLinkIcon,
    group: 'insert',
    aliases: ['⌘K / Ctrl+K'],
    persistence: 'gfm',
    run: openLinkEditor,
    isActive: isLinkMarkActive,
  },
  // ── Block operations (phase 6, SP2-3) ────────────────────────────────────
  {
    id: 'moveUp',
    label: 'Move block up',
    icon: milkdownBlockMoveUpIcon,
    group: 'block',
    // Platform-exact per the verified matrix: the two platforms must NOT share one chord
    // (the other one is each platform's native "extend selection by word" binding).
    aliases: ['Alt+Shift+ArrowUp (Win) / Control+Shift+ArrowUp (Mac)'],
    persistence: 'gfm',
    run: moveBlockUp,
  },
  {
    id: 'moveDown',
    label: 'Move block down',
    icon: milkdownBlockMoveDownIcon,
    group: 'block',
    aliases: ['Alt+Shift+ArrowDown (Win) / Control+Shift+ArrowDown (Mac)'],
    persistence: 'gfm',
    run: moveBlockDown,
  },
  {
    id: 'duplicate',
    label: 'Duplicate',
    icon: milkdownBlockDuplicateIcon,
    group: 'block',
    aliases: ['⌘D / Ctrl+D'],
    persistence: 'gfm',
    run: duplicateBlock,
  },
  {
    id: 'deleteBlock',
    label: 'Delete',
    icon: milkdownBlockDeleteIcon,
    group: 'block',
    // No shortcut: Lark has none, and `Backspace` on a node selection already deletes
    // (ProseMirror default) — declaring a chord here would invent a binding.
    aliases: [],
    persistence: 'gfm',
    run: deleteBlock,
  },
  {
    id: 'copyAnchor',
    label: 'Copy anchor',
    icon: milkdownBlockAnchorIcon,
    group: 'block',
    // Hash-only by design: the admin renders under `/admin/...`, so a full URL cannot be
    // composed here — see `buildHeadingAnchorHash`.
    aliases: [],
    persistence: 'editor-only',
    run: (ctx) => {
      const hash = buildHeadingAnchorHash(ctx)
      if (hash) void navigator.clipboard?.writeText(hash)
    },
  },
] as const

export function getMilkdownCommand(id: string): MilkdownCommandDescriptor | undefined {
  return milkdownCommandRegistry.find((command) => command.id === id)
}
