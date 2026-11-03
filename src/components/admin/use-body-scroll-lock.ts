'use client'

import { useEffect } from 'react'

/**
 * Phase 7a (Lark editor stabilization plan): reusable, reference-counted
 * body-scroll lock. Focus mode, the Shortcuts help sheet, and any future
 * full-viewport overlay can all call `useBodyScrollLock(true)` at once —
 * only the FIRST lock takes a snapshot and mutates `document.body`, and only
 * the LAST matching unlock restores it. Without the refcount, closing an
 * inner overlay (e.g. Shortcuts opened on top of Focus mode) would
 * prematurely unlock the page even though the outer overlay is still open
 * (see phase-07 plan Risks: "Multiple overlays can each try to mutate body
 * styles. Use one reference-counted/coordinated owner.").
 *
 * The pure lock/unlock/refcount logic lives in `BodyScrollLockController`
 * and only talks to the DOM through the small `BodyScrollLockAdapter`
 * interface, so it can be unit-tested with a fake adapter — no jsdom
 * required. See `use-body-scroll-lock.test.ts`.
 */

export type BodyScrollLockSnapshot = {
  overflow: string
  paddingRight: string
  position: string
  top: string
  left: string
  width: string
  scrollX: number
  scrollY: number
}

export type BodyScrollLockAdapter = {
  getBodyInlineStyle: (property: string) => string
  setBodyInlineStyle: (property: string, value: string) => void
  getScrollbarWidth: () => number
  getScrollPosition: () => { x: number; y: number }
  scrollTo: (x: number, y: number) => void
}

const LOCK_STYLE_PROPERTIES = ['overflow', 'position', 'top', 'left', 'width'] as const

/**
 * Reference-counted controller: `lock()`/`unlock()` calls must be balanced
 * by the caller (the `useBodyScrollLock` hook guarantees this via its effect
 * cleanup), but `unlock()` is defensively a no-op if called more times than
 * `lock()` — restoration must never throw or under/over-run on unbalanced
 * calls, unmount races, or error paths.
 */
export class BodyScrollLockController {
  private readonly adapter: BodyScrollLockAdapter
  private lockCount = 0
  private snapshot: BodyScrollLockSnapshot | null = null

  constructor(adapter: BodyScrollLockAdapter) {
    this.adapter = adapter
  }

  get activeLockCount(): number {
    return this.lockCount
  }

  get isLocked(): boolean {
    return this.lockCount > 0
  }

  lock(): void {
    this.lockCount += 1
    if (this.lockCount > 1) return // Another overlay already holds the lock.

    const { adapter } = this
    const scrollPosition = adapter.getScrollPosition()

    this.snapshot = {
      overflow: adapter.getBodyInlineStyle('overflow'),
      paddingRight: adapter.getBodyInlineStyle('padding-right'),
      position: adapter.getBodyInlineStyle('position'),
      top: adapter.getBodyInlineStyle('top'),
      left: adapter.getBodyInlineStyle('left'),
      width: adapter.getBodyInlineStyle('width'),
      scrollX: scrollPosition.x,
      scrollY: scrollPosition.y,
    }

    const scrollbarWidth = adapter.getScrollbarWidth()
    const existingPaddingRight = Number.parseFloat(this.snapshot.paddingRight) || 0

    // `position: fixed` (instead of plain `overflow: hidden`) preserves the
    // exact scroll offset across the lock/unlock cycle even on iOS Safari,
    // which otherwise ignores `overflow: hidden` on `<body>` during touch
    // scrolling.
    adapter.setBodyInlineStyle('overflow', 'hidden')
    adapter.setBodyInlineStyle('position', 'fixed')
    adapter.setBodyInlineStyle('top', `-${scrollPosition.y}px`)
    adapter.setBodyInlineStyle('left', `-${scrollPosition.x}px`)
    adapter.setBodyInlineStyle('width', '100%')
    if (scrollbarWidth > 0) {
      adapter.setBodyInlineStyle('padding-right', `${existingPaddingRight + scrollbarWidth}px`)
    }
  }

  unlock(): void {
    if (this.lockCount === 0) return // Unbalanced call — nothing to restore.
    this.lockCount -= 1
    if (this.lockCount > 0) return // Another overlay still holds the lock.

    const snapshot = this.snapshot
    this.snapshot = null
    if (!snapshot) return

    const { adapter } = this
    for (const property of LOCK_STYLE_PROPERTIES) {
      adapter.setBodyInlineStyle(property, snapshot[property])
    }
    adapter.setBodyInlineStyle('padding-right', snapshot.paddingRight)
    adapter.scrollTo(snapshot.scrollX, snapshot.scrollY)
  }
}

function createDomBodyScrollLockAdapter(): BodyScrollLockAdapter {
  return {
    getBodyInlineStyle: (property) => document.body.style.getPropertyValue(property),
    setBodyInlineStyle: (property, value) => {
      if (value) {
        document.body.style.setProperty(property, value)
      } else {
        document.body.style.removeProperty(property)
      }
    },
    getScrollbarWidth: () => Math.max(0, window.innerWidth - document.documentElement.clientWidth),
    getScrollPosition: () => ({ x: window.scrollX, y: window.scrollY }),
    scrollTo: (x, y) => window.scrollTo(x, y),
  }
}

// Lazily created so importing this module has no side effect in
// non-browser environments (SSR, node:test).
let sharedController: BodyScrollLockController | null = null

function getSharedController(): BodyScrollLockController | null {
  if (typeof document === 'undefined') return null
  if (!sharedController) {
    sharedController = new BodyScrollLockController(createDomBodyScrollLockAdapter())
  }
  return sharedController
}

/**
 * Locks the external page scroll while `active` is true. Multiple
 * components may call this concurrently (see the refcount contract above);
 * restoration is guaranteed on `active` flipping back to false AND on
 * unmount, since both go through the same effect-cleanup path.
 */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return

    const controller = getSharedController()
    if (!controller) return

    controller.lock()
    return () => {
      controller.unlock()
    }
  }, [active])
}
