'use client'

/**
 * Ordered composition of the Lark-style floating selection toolbar (Lark
 * editor stabilization plan, Phase 4). Every entry is a REFERENCE into the
 * shared command registry (`milkdown-command-registry.ts`) — no label/icon/
 * run duplication lives in this file (see
 * `reports/phase-01-baseline-inventory.md` §2 for the three-way duplication
 * this replaces).
 *
 * This file no longer builds a Crepe `ToolbarFeatureConfig`: Crepe's
 * floating-toolbar feature is disabled entirely in `milkdown-editor-core.tsx`
 * (see that file's Phase 4 comment for why — it cannot express a real
 * keyboard-operable dropdown, selection-safe pointer handling, or viewport
 * collision anchoring without stacking a React portal over hidden Crepe DOM,
 * which the plan explicitly rules out). `milkdown-selection-toolbar.tsx`
 * consumes the three getters below to render one custom surface instead.
 *
 * Toolbar order (Lark parity): [block-type trigger] | Bold Italic
 * Strikethrough Inline-Code | Link.
 *
 * Deliberately excluded, matching the plan's product boundaries:
 *   - Underline: no schema/toggle command exists anywhere in the Milkdown/
 *     ProseMirror preset this editor uses (`milkdown-vendor.ts` has none),
 *     so there is no proven Markdown storage path. Do not add a toolbar
 *     entry for it without first landing a real schema + command.
 *   - Paragraph alignment, color/highlight, comments: non-GFM Lark
 *     affordances with no storage contract — not implemented anywhere in
 *     this editor, not just hidden from the toolbar.
 *   - Image/table insertion: insertion-only actions, not placed on the
 *     selected-text toolbar (they stay in the slash menu / outer Insert
 *     button per the product matrix).
 */

import { getMilkdownCommand } from './milkdown-command-registry'
import type { MilkdownCommandDescriptor } from './milkdown-command-registry'

const BLOCK_TYPE_COMMAND_IDS = [
  'paragraph',
  'heading1',
  'heading2',
  'heading3',
  'heading4',
  'heading5',
  'heading6',
  'quote',
  'bulletList',
  'orderedList',
  'taskList',
  'codeBlock',
  'divider',
] as const

const MARK_COMMAND_IDS = ['bold', 'italic', 'strikethrough', 'inlineCode'] as const

const LINK_COMMAND_ID = 'link'

function resolveCommands(ids: readonly string[]): MilkdownCommandDescriptor[] {
  return ids.map((id) => {
    const command = getMilkdownCommand(id)
    if (!command) {
      throw new Error(`milkdown-toolbar-config: unknown command id "${id}"`)
    }
    return command
  })
}

/** The "Turn into" block-type set, in Lark's structure-menu order. */
export function getBlockTypeMenuCommands(): MilkdownCommandDescriptor[] {
  return resolveCommands(BLOCK_TYPE_COMMAND_IDS)
}

/** Bold / Italic / Strikethrough / Inline Code, in toolbar display order. */
export function getMarkToolbarCommands(): MilkdownCommandDescriptor[] {
  return resolveCommands(MARK_COMMAND_IDS)
}

/** The trailing Link control. */
export function getLinkToolbarCommand(): MilkdownCommandDescriptor {
  return resolveCommands([LINK_COMMAND_ID])[0]
}
