'use client'

/**
 * `@` internal-link picker trigger (phase 8, SP2-5).
 *
 * Same shape as the slash menu (`milkdown-slash-menu-plugin.ts`): a pure detector over plain
 * data, and a thin plugin that re-derives the state from the document on every transaction,
 * so the tracked `@query` range can never point at text the user already deleted.
 *
 * Differences from `/`, each a requirement:
 * - Never inside inline code or a code block (`@` is common in code).
 * - Escape DISMISSES the picker for that `@` and leaves `@query` as typed text: the dismissed
 *   `@` position is mapped through later edits and stays closed until that `@` is gone. (The
 *   slash menu re-opens on the next keystroke — fine for `/`, wrong for an `@handle` in prose.)
 * - Results are async, so the highlighted row lives in the React menu, not here.
 */

import type { EditorState, EditorView } from './milkdown-vendor'
import { $prose, Plugin, PluginKey, TextSelection } from './milkdown-vendor'

const MENTION_CAPABLE_BLOCK_TYPES = new Set(['paragraph', 'heading'])

/** Past this the author is writing prose, not searching. */
export const MENTION_QUERY_MAX_LENGTH = 60

export interface MentionLinkState {
  visible: boolean
  /** Position of the `@`; inserting replaces `[from, to]`. */
  from: number
  to: number
  /** Text typed after the `@`, verbatim. */
  query: string
  /** `@` position the author dismissed with Escape (mapped through edits), if any. */
  dismissedAt: number | null
}

export const INACTIVE_MENTION_LINK: MentionLinkState = {
  visible: false,
  from: 0,
  to: 0,
  query: '',
  dismissedAt: null,
}

export const mentionLinkPluginKey = new PluginKey<MentionLinkState>('kdigi-mention-link')

export interface MentionContext {
  blockStart: number
  blockType: string
  textBefore: string
  cursor: number
  /** The cursor sits in an inline-code mark. */
  inCode: boolean
}

/**
 * Pure trigger detection: the LAST `@` before the cursor that starts a word (block start or
 * after whitespace — so `an@email.com` never opens it), followed by a query that does not start
 * with whitespace and is not absurdly long.
 */
export function detectMentionLink(context: MentionContext): MentionLinkState {
  if (context.inCode || !MENTION_CAPABLE_BLOCK_TYPES.has(context.blockType)) {
    return INACTIVE_MENTION_LINK
  }
  const index = context.textBefore.lastIndexOf('@')
  if (index < 0) return INACTIVE_MENTION_LINK

  const preceding = index === 0 ? '' : context.textBefore[index - 1]
  if (preceding !== '' && !/\s/.test(preceding)) return INACTIVE_MENTION_LINK

  const query = context.textBefore.slice(index + 1)
  if (/^\s/.test(query) || query.length > MENTION_QUERY_MAX_LENGTH || query.includes('\ufffc')) {
    return INACTIVE_MENTION_LINK
  }
  return {
    visible: true,
    from: context.blockStart + index,
    to: context.cursor,
    query,
    dismissedAt: null,
  }
}

type MentionLinkMeta = { type: 'dismiss' }

function readMentionContext(state: EditorState): MentionContext | null {
  const { selection } = state
  if (!selection.empty || !(selection instanceof TextSelection)) return null
  const $from = selection.$from
  const parent = $from.parent
  const codeMark = state.schema.marks.inlineCode
  return {
    blockStart: $from.start(),
    blockType: parent.type.name,
    textBefore: parent.textBetween(0, $from.parentOffset, undefined, '\ufffc'),
    cursor: $from.pos,
    inCode: Boolean(codeMark && codeMark.isInSet(state.storedMarks ?? $from.marks())),
  }
}

export function mentionLinkPlugin(
  onStateChange?: (state: MentionLinkState, view: EditorView) => void,
): Plugin<MentionLinkState> {
  return new Plugin<MentionLinkState>({
    key: mentionLinkPluginKey,
    state: {
      init: () => INACTIVE_MENTION_LINK,
      apply(transaction, previous, _oldState, nextState) {
        const meta = transaction.getMeta(mentionLinkPluginKey) as MentionLinkMeta | undefined
        if (meta?.type === 'dismiss') {
          return { ...INACTIVE_MENTION_LINK, dismissedAt: previous.visible ? previous.from : previous.dismissedAt }
        }

        let dismissedAt = previous.dismissedAt
        if (dismissedAt !== null && transaction.docChanged) {
          // `assoc: 1` keeps the position glued to the `@` when text is inserted before it.
          const mapped = transaction.mapping.mapResult(dismissedAt, 1)
          dismissedAt = mapped.deleted ? null : mapped.pos
        }

        const context = readMentionContext(nextState)
        const detected = context ? detectMentionLink(context) : INACTIVE_MENTION_LINK
        if (!detected.visible) return { ...INACTIVE_MENTION_LINK, dismissedAt }
        if (detected.from === dismissedAt) return { ...INACTIVE_MENTION_LINK, dismissedAt }
        return { ...detected, dismissedAt: null }
      },
    },
    view: (editorView) => {
      onStateChange?.(getMentionLinkState(editorView.state), editorView)
      return {
        update: (view) => {
          onStateChange?.(getMentionLinkState(view.state), view)
        },
      }
    },
  })
}

export function getMentionLinkState(state: EditorState): MentionLinkState {
  return mentionLinkPluginKey.getState(state) ?? INACTIVE_MENTION_LINK
}

export function createMilkdownMentionLinkPlugin(
  onStateChange?: (state: MentionLinkState, view: EditorView) => void,
): ReturnType<typeof $prose> {
  return $prose(() => mentionLinkPlugin(onStateChange))
}

/** Escape: close for this `@`, keep the typed `@query` text. */
export function dismissMentionLink(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(mentionLinkPluginKey, { type: 'dismiss' } satisfies MentionLinkMeta))
}

/**
 * Replaces the tracked `@query` with `title` linked to `href` and leaves the caret right after
 * it with the link mark NOT stored, so the next keystroke is plain text.
 *
 * @returns false when the picker is not open (nothing to replace).
 */
export function insertMentionLink(view: EditorView, link: { title: string; href: string }): boolean {
  const state = getMentionLinkState(view.state)
  const linkType = view.state.schema.marks.link
  if (!state.visible || !linkType || !link.title) return false
  const mark = linkType.create({ href: link.href })
  const tr = view.state.tr.replaceWith(state.from, state.to, view.state.schema.text(link.title, [mark]))
  const caret = state.from + link.title.length
  tr.setSelection(TextSelection.create(tr.doc, caret)).removeStoredMark(linkType)
  view.dispatch(tr.scrollIntoView())
  return true
}
