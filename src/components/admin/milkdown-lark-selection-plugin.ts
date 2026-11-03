'use client'

import type { EditorState } from './milkdown-vendor'
import { $prose, NodeSelection, Plugin, TextSelection } from './milkdown-vendor'
import type { EditorView } from './milkdown-vendor'

// Keyboard-driven selection reveal (Shift+Arrow, repeated Cmd/Ctrl+A) uses its
// own short idle delay — deliberately NOT the old shared 500ms mouse timer.
// Mouse selection now opens the toolbar ONLY via pointer-release + first
// meaningful pointer-move (see `transitionSelectionPhase`); there is no timer
// fallback left to race it. Keyboard input has no equivalent "release" event,
// so a short debounce (reset on every qualifying keystroke) prevents the
// toolbar from flashing while the user holds Shift+Arrow to extend a
// selection character-by-character, without reusing pointer state or timing.
const DEFAULT_KEYBOARD_IDLE_DELAY_MS = 150
// Below this pixel distance from the pointer-release position, a pointermove
// is treated as synthetic/duplicate jitter (common on touch-emulated pointer
// events) rather than a real user gesture, and does not open the toolbar.
const POINTER_MOVE_JITTER_THRESHOLD_PX = 3
const TOOLBAR_VISIBLE_CLASS = 'is-selection-toolbar-visible'
const MENU_OPEN_CLASS = 'is-selection-menu-open'
// Custom event dispatched on the `.milkdown-editor-wrapper` element whenever
// the phase changes, so React (Phase 4's toolbar/menu work) can consume the
// state machine without importing plugin internals. Exported so consumers
// don't have to hardcode/duplicate the event-name string literal.
export const LARK_SELECTION_PHASE_EVENT = 'lark-selection-phase-change'

/**
 * Selection state machine. `idle`: nothing selected/shown. `pointer-selecting`:
 * mouse button down, actively dragging — toolbar stays hidden. `awaiting-pointer-move`:
 * button released with an expanded selection; waiting for the first
 * above-threshold pointer move before revealing anything. `visible`: toolbar
 * shown. `menu-open`: a toolbar-anchored menu (e.g. the "Turn into" dropdown)
 * is open — the toolbar/selection must be held open until the menu closes.
 */
export type SelectionPhase =
  | 'awaiting-pointer-move'
  | 'idle'
  | 'menu-open'
  | 'pointer-selecting'
  | 'visible'

export type SelectionPhaseEvent =
  | { type: 'blur' }
  | { type: 'escape' }
  | { type: 'keyboard-idle-elapsed'; hasSelection: boolean }
  | { type: 'menu-close'; hasSelection: boolean }
  | { type: 'menu-open' }
  | { type: 'pointer-down' }
  | { type: 'pointer-move'; hasSelection: boolean; pastThreshold: boolean }
  | { type: 'pointer-up' }
  | { type: 'selection-collapsed' }

/**
 * Pure state-transition table. No DOM/window/timer access — every input
 * needed to decide the next phase is passed in the event. Kept exported and
 * side-effect-free so the full transition matrix is unit-testable without a
 * ProseMirror view or fake `window`.
 */
export function transitionSelectionPhase(
  phase: SelectionPhase,
  event: SelectionPhaseEvent,
): SelectionPhase {
  switch (event.type) {
    case 'pointer-down':
      // A new drag always takes over: hide any open toolbar/menu and start
      // a fresh pointer sequence, regardless of the previous phase.
      return 'pointer-selecting'

    case 'pointer-up':
      // Deliberately does NOT check the selection here: ProseMirror's model
      // selection can lag the browser's native (DOM) selection by one async
      // flush (its DOMObserver syncs off `selectionchange`, not synchronously
      // with `pointerup`), so a real drag can still read as collapsed at this
      // exact instant. Always wait for the first subsequent pointer-move and
      // resample there instead, once the model has had time to catch up — a
      // plain click (never expanded) just harmlessly resolves to `idle` on
      // that same next move.
      if (phase !== 'pointer-selecting') return phase
      return 'awaiting-pointer-move'

    case 'pointer-move':
      if (phase !== 'awaiting-pointer-move') return phase
      if (!event.pastThreshold) return phase // synthetic/duplicate jitter — ignore
      return event.hasSelection ? 'visible' : 'idle'

    case 'selection-collapsed':
      // Mid-drag collapses (a click with no drag) and menu-open collapses
      // (a click inside the menu chrome landing back in the doc) are not
      // "the selection went away" in the sense this event models — pointer-up
      // and menu-close own those transitions instead.
      if (phase === 'pointer-selecting' || phase === 'menu-open') return phase
      return 'idle'

    case 'keyboard-idle-elapsed':
      // Only ever promotes an already-idle selection. Must never fire while
      // a pointer sequence or menu interaction is active — this is what
      // keeps keyboard state from leaking into pointer/menu modality.
      if (phase !== 'idle') return phase
      return event.hasSelection ? 'visible' : 'idle'

    case 'menu-open':
      return 'menu-open'

    case 'menu-close':
      if (phase !== 'menu-open') return phase
      return event.hasSelection ? 'visible' : 'idle'

    case 'blur':
      // Clicking a toolbar/menu control moves DOM focus off the editor
      // transiently; that must not collapse a held selection.
      if (phase === 'menu-open') return phase
      return 'idle'

    case 'escape':
      return 'idle'

    default:
      return phase
  }
}

type SelectionController = {
  blur: () => void
  destroy: () => void
  escape: () => void
  getPhase: () => SelectionPhase
  keyboardReveal: () => void
  menuClose: () => void
  menuOpen: () => void
  pointerDown: () => void
  update: (view: EditorView, previousState: EditorState) => void
}

type Point = { x: number; y: number }

function hasExpandedTextSelection(state: EditorState) {
  const { doc, selection } = state
  return selection instanceof TextSelection
    && !selection.empty
    && doc.textBetween(selection.from, selection.to).trim().length > 0
}

function isPlainSelectCurrentBlockShortcut(event: KeyboardEvent) {
  return (event.metaKey || event.ctrlKey)
    && !event.altKey
    && !event.shiftKey
    && !event.isComposing
    && (event.code === 'KeyA' || event.key.toLowerCase() === 'a')
}

function selectCurrentTextBlock(view: EditorView) {
  const { doc, selection } = view.state
  let from: number
  let to: number

  if (selection instanceof NodeSelection) {
    // A non-text node is already the current block. Keep that NodeSelection
    // instead of falling through to ProseMirror's document-wide Mod-a.
    if (!selection.node.isTextblock) return true
    from = selection.from + 1
    to = selection.to - 1
  } else if (selection.$from.parent.isTextblock) {
    from = selection.$from.start()
    to = selection.$from.end()
  } else {
    return true
  }

  if (from >= to) return true

  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.create(doc, from, to))
      .scrollIntoView(),
  )
  return true
}

/** Extracts pointer coordinates when available; bare/synthetic `Event`
 * instances (including the ones used in this file's unit tests) have none —
 * treated as "no reliable signal", so the move is never silently swallowed. */
function getPointerPoint(event: Event): Point | null {
  const pointerEvent = event as PointerEvent
  if (typeof pointerEvent.clientX !== 'number' || typeof pointerEvent.clientY !== 'number') {
    return null
  }
  return { x: pointerEvent.clientX, y: pointerEvent.clientY }
}

function exceedsJitterThreshold(anchor: Point | null, next: Point | null): boolean {
  if (!anchor || !next) return true
  const dx = next.x - anchor.x
  const dy = next.y - anchor.y
  return Math.sqrt((dx * dx) + (dy * dy)) > POINTER_MOVE_JITTER_THRESHOLD_PX
}

function createSelectionController(
  view: EditorView,
  keyboardIdleDelayMs: number,
): SelectionController {
  let currentView = view
  let phase: SelectionPhase = 'idle'
  let pointerReleaseAnchor: Point | null = null
  let keyboardTimer: number | null = null
  const wrapper = view.dom.closest<HTMLElement>('.milkdown-editor-wrapper')

  const clearKeyboardTimer = () => {
    if (keyboardTimer == null) return
    window.clearTimeout(keyboardTimer)
    keyboardTimer = null
  }

  const applyPhase = (next: SelectionPhase) => {
    if (next === phase) return
    phase = next
    wrapper?.classList.toggle(TOOLBAR_VISIBLE_CLASS, phase === 'visible' || phase === 'menu-open')
    wrapper?.classList.toggle(MENU_OPEN_CLASS, phase === 'menu-open')
    wrapper?.dispatchEvent(new CustomEvent(LARK_SELECTION_PHASE_EVENT, { detail: { phase } }))
  }

  const send = (event: SelectionPhaseEvent) => {
    applyPhase(transitionSelectionPhase(phase, event))
  }

  const scheduleKeyboardReveal = () => {
    clearKeyboardTimer()
    keyboardTimer = window.setTimeout(() => {
      keyboardTimer = null
      send({
        type: 'keyboard-idle-elapsed',
        hasSelection: currentView.hasFocus() && hasExpandedTextSelection(currentView.state),
      })
    }, keyboardIdleDelayMs)
  }

  const onWindowPointerUp = (event: Event) => {
    if (phase !== 'pointer-selecting') return
    // Anchor from the release point regardless of the (possibly still-stale)
    // selection state — see the reducer's 'pointer-up' comment for why.
    pointerReleaseAnchor = getPointerPoint(event)
    send({ type: 'pointer-up' })
  }

  const onWindowPointerMove = (event: Event) => {
    if (phase !== 'awaiting-pointer-move') return
    const pastThreshold = exceedsJitterThreshold(pointerReleaseAnchor, getPointerPoint(event))
    const hasSelection = currentView.hasFocus() && hasExpandedTextSelection(currentView.state)
    send({ type: 'pointer-move', hasSelection, pastThreshold })
  }

  window.addEventListener('pointerup', onWindowPointerUp)
  window.addEventListener('pointermove', onWindowPointerMove)

  return {
    blur() {
      send({ type: 'blur' })
    },
    destroy() {
      clearKeyboardTimer()
      window.removeEventListener('pointerup', onWindowPointerUp)
      window.removeEventListener('pointermove', onWindowPointerMove)
      pointerReleaseAnchor = null
      applyPhase('idle')
    },
    escape() {
      clearKeyboardTimer()
      send({ type: 'escape' })
    },
    getPhase() {
      return phase
    },
    keyboardReveal() {
      // Cmd/Ctrl+A re-selecting the SAME block produces no ProseMirror
      // selection change (`view.state.selection.eq(previousState.selection)`
      // is true), so `update()` below never fires for a repeat press — this
      // explicit call is what still reveals/re-arms the toolbar every time.
      scheduleKeyboardReveal()
    },
    menuClose() {
      send({ type: 'menu-close', hasSelection: hasExpandedTextSelection(currentView.state) })
    },
    menuOpen() {
      clearKeyboardTimer()
      send({ type: 'menu-open' })
    },
    pointerDown() {
      clearKeyboardTimer()
      pointerReleaseAnchor = null
      send({ type: 'pointer-down' })
    },
    update(nextView, previousState) {
      currentView = nextView
      if (nextView.state.selection.eq(previousState.selection)) return

      if (phase === 'pointer-selecting' || phase === 'awaiting-pointer-move' || phase === 'menu-open') {
        // Pointer sequence in progress, or a menu is deliberately holding the
        // toolbar open — the pointer handlers / explicit menu-close own the
        // next transition, not a generic selection-changed transaction.
        return
      }

      if (!hasExpandedTextSelection(nextView.state)) {
        send({ type: 'selection-collapsed' })
        return
      }

      if (phase === 'idle') {
        // Non-pointer cause: typing extended a selection, Shift+Arrow,
        // repeated Cmd/Ctrl+A landing on a different block, undo/redo, or a
        // programmatic dispatch. Reveal after the keyboard-only idle delay.
        scheduleKeyboardReveal()
      }
      // phase === 'visible': already shown — the toolbar re-reads the live
      // DOM selection on every render, nothing to do here.
    },
  }
}

// Module-scoped so the exported helpers below (used by React to read/drive
// the menu-open phase) can look up a controller by `EditorView` regardless
// of how many times `createLarkSelectionPlugin` itself was invoked.
const controllers = new WeakMap<EditorView, SelectionController>()

export function createLarkSelectionPlugin(keyboardIdleDelayMs = DEFAULT_KEYBOARD_IDLE_DELAY_MS) {
  return new Plugin({
    props: {
      handleDOMEvents: {
        blur(view) {
          controllers.get(view)?.blur()
          return false
        },
        keydown(view, rawEvent) {
          const event = rawEvent as KeyboardEvent

          if (event.key === 'Escape') {
            controllers.get(view)?.escape()
            return false // let editor-core.tsx's own Escape handling still run
          }

          if (!isPlainSelectCurrentBlockShortcut(event)) return false

          event.preventDefault()
          event.stopPropagation()
          selectCurrentTextBlock(view)
          controllers.get(view)?.keyboardReveal()
          return true
        },
        pointerdown(view) {
          controllers.get(view)?.pointerDown()
          return false
        },
      },
    },
    view(view) {
      const controller = createSelectionController(view, keyboardIdleDelayMs)
      controllers.set(view, controller)

      return {
        update: controller.update,
        destroy() {
          controllers.delete(view)
          controller.destroy()
        },
      }
    },
  })
}

/** Current selection phase for the given view, for consumers (e.g. Phase 4's
 * toolbar) that need a synchronous read instead of listening for the
 * `lark-selection-phase-change` custom event on `.milkdown-editor-wrapper`. */
export function getLarkSelectionPhase(view: EditorView): SelectionPhase {
  return controllers.get(view)?.getPhase() ?? 'idle'
}

/** Call when a toolbar-anchored menu (e.g. the "Turn into" dropdown) opens,
 * so the plugin holds the toolbar/selection open instead of hiding it on the
 * next selection-changing transaction or DOM blur caused by the click. */
export function notifyLarkSelectionMenuOpened(view: EditorView): void {
  controllers.get(view)?.menuOpen()
}

/** Call when that menu closes. Resumes normal visible/idle behavior based on
 * the current selection; callers are still responsible for restoring DOM
 * focus to the editor (this only manages the plugin's own phase/class). */
export function notifyLarkSelectionMenuClosed(view: EditorView): void {
  controllers.get(view)?.menuClose()
}

export const milkdownLarkSelectionPlugin = $prose(() => createLarkSelectionPlugin())
