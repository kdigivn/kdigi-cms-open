/**
 * Slash-menu item data — the SINGLE source of truth for which commands the "/" menu
 * (and, from phase 5 step 4 on, the block-handle "+" insert path) offers, in which
 * group and order.
 *
 * WHY THIS MODULE EXISTS (phase 5, SP2-2): `milkdown-slash-menu-config.ts` used to own
 * both this data AND Crepe's `BlockEditFeatureConfig` shape. The phase replaces Crepe's
 * `BlockEdit` with our own menu, so the data must outlive that adapter: this file is
 * Crepe-agnostic and is consumed by the Crepe config today and by the owned React menu
 * after the swap. Nothing here imports Crepe.
 *
 * Items are resolved from `milkdown-command-registry.ts` (label / icon / run live
 * there) rather than redeclared, so a registry change cannot drift away from the menu.
 * Unknown ids throw at module load: a menu that silently loses an item is worse than a
 * boot error.
 */

import { getMilkdownCommand, type MilkdownCommandDescriptor } from './milkdown-command-registry'
import { milkdownImageIcon } from './milkdown-lark-icons'

/** Resolve a registry descriptor, failing loudly on an unknown id. */
export function requireSlashMenuCommand(id: string): MilkdownCommandDescriptor {
  const command = getMilkdownCommand(id)
  if (!command) {
    throw new Error(`milkdown-slash-menu-items: unknown command id "${id}"`)
  }
  return command
}

export interface SlashMenuItem {
  /** Stable id — the DOM/ARIA id and the key the menu builder receives. */
  id: string
  label: MilkdownCommandDescriptor['label']
  icon: string
  /**
   * Registry command to run, or `null` when the action is interactive rather than a
   * registry `run` (`image` opens the media modal, which supplies src/alt at runtime).
   * `null` items need an explicit handler at the call site.
   */
  commandId: string | null
  /** Searchable strings from the registry (Markdown syntax / shortcut hints). */
  aliases: readonly string[]
  /** `milkdown-slash-menu-filter.ts` needs this to guard Enter on a non-runnable row. */
  isExecutable: boolean
  /** Literal Markdown inserted at the caret INSTEAD of a command (tenant snippets). */
  insertText?: string
  /** Hover preview (snippet excerpt). */
  description?: string
}

export interface SlashMenuGroup {
  id: string
  /** Bilingual section label, Vietnamese-first (admin convention). */
  label: string
  items: SlashMenuItem[]
}

/**
 * Structural block commands, Lark-parity order (Text → headings → lists → code →
 * quote → divider). One compact "Cơ bản/Basics" section — no "Lists" sub-header, per
 * the no-tabs directive.
 */
const BASICS_COMMAND_IDS = [
  'paragraph',
  'heading1',
  'heading2',
  'heading3',
  'heading4',
  'heading5',
  'heading6',
  'bulletList',
  'orderedList',
  'taskList',
  'codeBlock',
  'quote',
  'divider',
] as const

/** Insert/common commands rendered under the "Chèn/Common" section. */
const INSERT_COMMAND_IDS = ['link', 'table'] as const

function commandItem(id: string): SlashMenuItem {
  const command = requireSlashMenuCommand(id)
  return {
    id,
    label: command.label,
    icon: command.icon,
    commandId: id,
    aliases: command.aliases,
    isExecutable: typeof command.run === 'function',
  }
}

/**
 * Groups in render order. The `image` item keeps its own icon (`milkdownImageIcon`)
 * rather than the registry's, matching the pre-existing rendering.
 */
export const SLASH_MENU_GROUPS: readonly SlashMenuGroup[] = [
  {
    id: 'basics',
    label: 'Cơ bản/Basics',
    items: BASICS_COMMAND_IDS.map(commandItem),
  },
  {
    id: 'insert',
    label: 'Chèn/Common',
    items: [
      ...INSERT_COMMAND_IDS.map(commandItem),
      {
        id: 'image',
        label: requireSlashMenuCommand('image').label,
        icon: milkdownImageIcon,
        commandId: null,
        aliases: requireSlashMenuCommand('image').aliases,
        // The one documented interactive exception: no registry `run`, but the media
        // modal performs the insert, so Enter on this row is legitimate.
        isExecutable: true,
      },
    ],
  },
]

/**
 * The "Turn into" set — the block-type commands (Text → headings → lists → code →
 * quote → divider). Shared by the slash menu's first group and the block handle's `⋮⋮`
 * menu so the two surfaces can never disagree about what a block can become.
 */
export function getBlockTypeMenuItems(): SlashMenuItem[] {
  return [...(SLASH_MENU_GROUPS.find((group) => group.id === 'basics')?.items ?? [])]
}

/**
 * Block operations for the `⋮⋮` menu's second section (phase 6, SP2-3).
 *
 * Kept in the registry's order and resolved through `commandItem`, so the menu, the
 * tooltips and the shortcut help panel cannot disagree about labels or shortcuts.
 * `image`-style interactive entries do not exist here: every one of these is a plain
 * registry `run`.
 */
const BLOCK_ACTION_COMMAND_IDS = ['moveUp', 'moveDown', 'duplicate', 'deleteBlock', 'copyAnchor'] as const

export function getBlockActionMenuItems(): SlashMenuItem[] {
  return BLOCK_ACTION_COMMAND_IDS.map(commandItem)
}

export const SNIPPET_MENU_GROUP_ID = 'snippets'

/**
 * The tenant's shortcodes as a slash-menu group (phase 8, SP2-5), or `null` when the site has
 * none. `snippet`/`shortcode` are aliases of every row, so `/snippet` lists them all through
 * the SAME filter as the static commands; the title and machine name match too.
 */
export function buildSnippetMenuGroup(
  snippets: readonly { name: string; title: string; excerpt: string; tag: string }[],
): SlashMenuGroup | null {
  if (snippets.length === 0) return null
  const icon = requireSlashMenuCommand('codeBlock').icon
  return {
    id: SNIPPET_MENU_GROUP_ID,
    label: 'Đoạn mẫu/Snippets',
    items: snippets.map((snippet) => ({
      id: `snippet-${snippet.name}`,
      label: snippet.title,
      icon,
      commandId: null,
      aliases: ['snippet', 'shortcode', snippet.name],
      isExecutable: true,
      insertText: snippet.tag,
      description: snippet.excerpt,
    })),
  }
}
