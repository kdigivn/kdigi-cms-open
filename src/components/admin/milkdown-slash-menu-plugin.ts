'use client'

/**
 * Slash-menu state machine (phase 5, SP2-2). Replaces Crepe's `SlashProvider`
 * trigger detection with OWNED state, so the menu can support an inline trigger
 * (`Keep this paragraph /ta`) instead of Crepe's "cursor must be at the end of the
 * block" rule — and so the trigger text can be deleted precisely.
 *
 * [RT-10] Why a plugin: the old execution seam
 * (`clearTextInCurrentBlockCommand`, see `milkdown-slash-menu-config.ts`) deletes from
 * the BLOCK START to the cursor. That is only safe while the trigger sits on an
 * otherwise-empty block. Here the state tracks the exact `[from, to]` range of the
 * typed `/query` and `deleteSlashTriggerRange` removes ONLY it, mapping through every
 * transaction in between — text before and after the cursor survives.
 *
 * The detection/matching logic is a pure function (`detectSlashMenu`) over plain data
 * (`SlashContext`), unit-tested without an editor instance; the plugin is a thin shell
 * that reads that data off the real state. Matching/index/clamping of the *item list*
 * is deliberately NOT here — `milkdown-slash-menu-filter.ts` already owns it, tested.
 */

import type { EditorState, EditorView } from './milkdown-vendor'
import { $prose, Plugin, PluginKey, TextSelection } from './milkdown-vendor'

/** Textblock types where a `/` can start a command menu. Mirrors Crepe's own set. */
const SLASH_CAPABLE_BLOCK_TYPES = new Set(['paragraph', 'heading'])

export interface SlashMenuState {
  visible: boolean
  /**
   * `text` — the user typed `/query`; `from` is the `/` position and executing the
   * menu deletes `[from, to]`.
   * `programmatic` — the block handle's `+` opened the menu on a fresh empty block;
   * `from === to` (nothing to delete).
   */
  trigger: 'text' | 'programmatic'
  from: number
  to: number
  /** Text typed after the `/`, verbatim (diacritic folding is the consumer's job). */
  query: string
  selectedIndex: number
  /**
   * True when the trigger block holds text besides the trigger itself — the caller
   * must then INSERT the new block below instead of converting this one in place.
   */
  blockHasOtherContent: boolean
}

export const INACTIVE_SLASH_MENU: SlashMenuState = {
  visible: false,
  trigger: 'text',
  from: 0,
  to: 0,
  query: '',
  selectedIndex: 0,
  blockHasOtherContent: false,
}

export const slashMenuPluginKey = new PluginKey<SlashMenuState>('kdigi-slash-menu')

/** Everything the pure detector needs, read off a resolved cursor position. */
export interface SlashContext {
  /** Doc position where the textblock's text starts (`$from.start()`). */
  blockStart: number
  /** Textblock type name (`paragraph`, `heading`, `code_block`, …). */
  blockType: string
  /** Text of the block before the cursor (leaf text, emoji placeholders folded). */
  textBefore: string
  /** Characters in the block after the cursor. */
  textAfterLength: number
  /** Doc position of the cursor. */
  cursor: number
}

/**
 * Pure trigger detection.
 *
 * A trigger is the LAST `/` in the text before the cursor that starts a word (block
 * start, or preceded by whitespace). Requiring a word boundary is what keeps a URL or
 * a path (`docs/2609`) from opening the menu.
 *
 * @returns the menu state, or `INACTIVE_SLASH_MENU` when this is not a trigger.
 */
export function detectSlashMenu(context: SlashContext): SlashMenuState {
  if (!SLASH_CAPABLE_BLOCK_TYPES.has(context.blockType)) return INACTIVE_SLASH_MENU

  const index = context.textBefore.lastIndexOf('/')
  if (index < 0) return INACTIVE_SLASH_MENU

  const preceding = index === 0 ? '' : context.textBefore[index - 1]
  if (preceding !== '' && !/\s/.test(preceding)) return INACTIVE_SLASH_MENU

  const query = context.textBefore.slice(index + 1)
  return {
    visible: true,
    trigger: 'text',
    from: context.blockStart + index,
    to: context.cursor,
    query,
    selectedIndex: 0,
    blockHasOtherContent:
      context.textBefore.slice(0, index).trim().length > 0 || context.textAfterLength > 0,
  }
}

type SlashMenuMeta =
  | { type: 'close' }
  | { type: 'open-programmatic' }
  | { type: 'select'; index: number; count: number }

function readSlashContext(state: EditorState): SlashContext | null {
  const { selection } = state
  if (!selection.empty || !(selection instanceof TextSelection)) return null
  const $from = selection.$from
  const parent = $from.parent
  return {
    blockStart: $from.start(),
    blockType: parent.type.name,
    textBefore: parent.textBetween(0, $from.parentOffset, undefined, '\ufffc'),
    textAfterLength: parent.content.size - $from.parentOffset,
    cursor: $from.pos,
  }
}

/** Keep the highlighted row while the query is unchanged, reset it when it changes. */
function withPreservedIndex(next: SlashMenuState, previous: SlashMenuState): SlashMenuState {
  return next.query === previous.query ? { ...next, selectedIndex: previous.selectedIndex } : next
}

/**
 * Owns `SlashMenuState`. Every transaction re-derives the state from the document, so
 * the tracked range can never point at text the user deleted; the programmatic
 * (`+`-opened) menu survives unrelated transactions and closes as soon as the block is
 * no longer an empty paragraph.
 */
export function slashMenuPlugin(
  onStateChange?: (state: SlashMenuState, view: EditorView) => void,
): Plugin<SlashMenuState> {
  return new Plugin<SlashMenuState>({
    key: slashMenuPluginKey,
    state: {
      init: () => INACTIVE_SLASH_MENU,
      apply(transaction, previous, _oldState, nextState) {
        const meta = transaction.getMeta(slashMenuPluginKey) as SlashMenuMeta | undefined
        if (meta?.type === 'close') return INACTIVE_SLASH_MENU
        if (meta?.type === 'open-programmatic') {
          const caret = nextState.selection.from
          return {
            visible: true,
            trigger: 'programmatic',
            from: caret,
            to: caret,
            query: '',
            selectedIndex: 0,
            blockHasOtherContent: false,
          }
        }
        if (meta?.type === 'select') {
          const count = Math.max(1, meta.count)
          return {
            ...previous,
            selectedIndex: Math.min(Math.max(meta.index, 0), count - 1),
          }
        }

        const context = readSlashContext(nextState)
        if (!context) return INACTIVE_SLASH_MENU
        const detected = detectSlashMenu(context)
        if (detected.visible) return withPreservedIndex(detected, previous)

        if (previous.visible && previous.trigger === 'programmatic') {
          // The `+` flow opens the menu on a freshly inserted empty paragraph; keep it
          // until that block stops being empty (typing takes over via `detected`).
          const blockIsEmpty = context.textBefore.length === 0 && context.textAfterLength === 0
          if (blockIsEmpty) return { ...previous, from: context.cursor, to: context.cursor }
        }
        return INACTIVE_SLASH_MENU
      },
    },
    // React cannot read a ProseMirror plugin's state on its own; the view hook is the
    // idiomatic place to push every state change (and the view, for `coordsAtPos`)
    // into the component that renders the menu.
    view: (editorView) => {
      onStateChange?.(getSlashMenuState(editorView.state), editorView)
      return {
        update: (view) => {
          onStateChange?.(getSlashMenuState(view.state), view)
        },
      }
    },
  })
}

export function getSlashMenuState(state: EditorState): SlashMenuState {
  return slashMenuPluginKey.getState(state) ?? INACTIVE_SLASH_MENU
}

/**
 * Milkdown slice for `crepe.editor.use(...)` — same `$prose` shape as the other custom
 * plugins (`milkdownLarkSelectionPlugin`, `milkdownFindReplacePlugin`, …), but built
 * per editor so the React surface can subscribe to every state change.
 */
export function createMilkdownSlashMenuPlugin(
  onStateChange?: (state: SlashMenuState, view: EditorView) => void,
): ReturnType<typeof $prose> {
  return $prose(() => slashMenuPlugin(onStateChange))
}

export function closeSlashMenu(view: EditorView): void {
  if (!getSlashMenuState(view.state).visible) return
  view.dispatch(view.state.tr.setMeta(slashMenuPluginKey, { type: 'close' }))
}

export function setSlashMenuIndex(view: EditorView, index: number, count: number): void {
  view.dispatch(view.state.tr.setMeta(slashMenuPluginKey, { type: 'select', index, count }))
}

/** Opens the menu on the current (empty) block — the block handle's `+` affordance. */
export function openSlashMenuProgrammatically(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(slashMenuPluginKey, { type: 'open-programmatic' }))
}

/**
 * [RT-10] Delete exactly the tracked `/query` range, then close.
 *
 * @returns `true` when text was removed (the caller may then run the command at the
 * resulting cursor), `false` for a programmatic menu (nothing to delete) or an
 * inactive one.
 */
export function deleteSlashTriggerRange(view: EditorView): boolean {
  const state = getSlashMenuState(view.state)
  if (!state.visible || state.trigger !== 'text' || state.from >= state.to) {
    closeSlashMenu(view)
    return false
  }
  view.dispatch(
    view.state.tr.delete(state.from, state.to).setMeta(slashMenuPluginKey, { type: 'close' }),
  )
  return true
}
