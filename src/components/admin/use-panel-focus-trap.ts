'use client'

import { useEffect, useRef } from 'react'
import type { KeyboardEvent, RefObject } from 'react'

/**
 * Phase 7a (Lark editor stabilization plan): shared focus trap + focus
 * return for the focus/help/find overlay panels. Not one of the two new
 * files the phase brief named explicitly (`use-body-scroll-lock.ts`,
 * `milkdown-panel-layers.css`), but added anyway rather than duplicating
 * this ~40-line trap in all three panel components (`milkdown-focus-
 * panel.tsx`, `milkdown-shortcut-help-panel.tsx`,
 * `milkdown-find-replace-panel.tsx`) — it is a brand-new file with no
 * pre-existing owner, so it carries no file-ownership conflict risk.
 *
 * Contract this fulfils (phase-07 Implementation Steps #6 and #7):
 * - On open: remember `document.activeElement`, then move focus inside the
 *   panel if focus is not already there (a caller may already focus a
 *   specific element itself, e.g. the find input — this hook only steps in
 *   when nothing inside got focus).
 * - While open: Tab/Shift+Tab cycle within the panel's focusable elements
 *   only (never escaping to the Payload page or a sibling panel).
 * - Escape: calls `onEscape` and — critically — calls
 *   `event.stopPropagation()` on the React SyntheticEvent, which prevents
 *   `milkdown-editor-core.tsx`'s wrapper-level `onKeyDown` from ALSO seeing
 *   this keypress. That wrapper handler (out of this phase's file
 *   ownership) checks every open-panel flag unconditionally with no early
 *   return — the confirmed "Escape closes ALL layers at once" defect
 *   recorded in reports/phase-01-baseline-evidence.md. Stopping propagation
 *   here means: as long as the topmost open panel holds DOM focus (which
 *   the focus-trap-on-open behavior above guarantees), only that panel's own
 *   handler runs and the wrapper's cascading handler never fires for this
 *   keystroke.
 * - On close/unmount: returns focus to whatever element had it before the
 *   panel opened (the invoking toolbar button, in every current caller).
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/**
 * `querySelectorAll` does not know about CSS visibility — a container can
 * legitimately contain `display: none` descendants (the focus panel ships
 * one: `.milkdown-focus-shell__toolbar` is unconditionally hidden in
 * `milkdown-editor-core.css`, out of this phase's file ownership). Calling
 * `.focus()` on a `display: none` element is a silent no-op per spec, so
 * left unfiltered the trap could "focus" a hidden node first and leave
 * `document.activeElement` unchanged. `getClientRects().length === 0`
 * reliably detects `display: none` (unlike `offsetParent`, which is also
 * `null` for `position: fixed` elements — every panel this hook serves is
 * `position: fixed`, so that check would wrongly exclude everything).
 */
function queryFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getClientRects().length > 0,
  )
}

type UsePanelFocusTrapOptions = {
  containerRef: RefObject<HTMLElement | null>
  onEscape: () => void
  open: boolean
}

export function usePanelFocusTrap({ containerRef, onEscape, open }: UsePanelFocusTrapOptions): {
  handleKeyDown: (event: KeyboardEvent<HTMLElement>) => void
} {
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const restoreFrameRef = useRef<number | null>(null)
  useEffect(() => {
    if (!open) return
    if (restoreFrameRef.current !== null) {
      cancelAnimationFrame(restoreFrameRef.current)
      restoreFrameRef.current = null
    }

    const container = containerRef.current
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (container && !container.contains(focused)) {
      returnFocusRef.current = focused
      queryFocusable(container)[0]?.focus()
    }

    return () => {
      const previouslyFocused = returnFocusRef.current
      if (!previouslyFocused) return
      // Deferred a frame: the panel's own unmount/DOM removal is still
      // resolving this same tick in some callers (conditional `if (!open)
      // return null` renders), and focusing during that can be a no-op.
      restoreFrameRef.current = requestAnimationFrame(() => {
        restoreFrameRef.current = null
        // A handoff to another dialog owns focus; the closing panel must
        // not steal it back while its deferred cleanup runs.
        const focusedDialog = document.activeElement?.closest('[role="dialog"]')
        if (focusedDialog && focusedDialog !== container) return
        try {
          previouslyFocused.focus()
        } catch {
          // Element may no longer be attached to the DOM by the time this runs.
        }
      })
    }
  }, [open, containerRef])

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onEscape()
      return
    }

    if (event.key !== 'Tab') return

    const container = containerRef.current
    if (!container) return

    const focusable = queryFocusable(container)
    if (focusable.length === 0) return

    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return { handleKeyDown }
}
