'use client'

/**
 * Outline rail (phase 7, SP2-4) — a thin strip of heading ticks at the editor's left edge
 * that expands into a jump list on hover/focus, so the outline is "one hover away" without
 * the Focus-mode takeover.
 *
 * Layout contract: the rail is absolutely positioned INSIDE the editor wrapper and never
 * participates in the wrapper's flow (the repo's geometry spec asserts box metrics), so the
 * canvas keeps its exact width and the rail borrows the wrapper's own left padding.
 *
 * Visibility: nothing renders below 2 headings or in a narrow viewport (<1024px) — the
 * threshold comes from the phase's requirement, and returning `null` (rather than hiding with
 * CSS) keeps the tab order free of unreachable ticks.
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useEditorCopy } from './milkdown-ui-copy'

import type { OutlineHeading } from './use-milkdown-outline'

export interface MilkdownOutlineRailProps {
  headings: OutlineHeading[]
  activeId: string | null
  onJumpToHeading: (headingId: string) => void
  /** Escape inside the rail: hand focus back (the editor), which also collapses the list. */
  onDismiss?: () => void
  /** Optional class for the enclosing layout to tweak placement. */
  className?: string
}

/** Below this viewport width the rail is not rendered (the canvas needs the room). */
export const OUTLINE_RAIL_MIN_VIEWPORT_PX = 1024

export function MilkdownOutlineRail({
  headings,
  activeId,
  onJumpToHeading,
  onDismiss,
  className,
}: MilkdownOutlineRailProps): React.ReactElement | null {
  const copy = useEditorCopy()
  const [wideEnough, setWideEnough] = useState(true)
  const navRef = useRef<HTMLElement | null>(null)
  const [contentTop, setContentTop] = useState<number | null>(null)
  const visible = wideEnough && headings.length >= 2

  useEffect(() => {
    const query = window.matchMedia(`(min-width: ${OUTLINE_RAIL_MIN_VIEWPORT_PX}px)`)
    const apply = (): void => setWideEnough(query.matches)
    apply()
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [])

  // Start the rail where the document starts. A fixed offset collided with Crepe's formatting
  // bar (`.milkdown-top-bar`, sticky, z-index 10), whose height changes when it wraps — the
  // bar sat on top of the first tick and swallowed its clicks (measured in the matrix row).
  useLayoutEffect(() => {
    if (!visible) return
    const host = navRef.current?.offsetParent as HTMLElement | null | undefined
    const content = host?.querySelector<HTMLElement>('.ProseMirror')
    if (!host || !content) return
    const measure = (): void =>
      setContentTop(content.getBoundingClientRect().top - host.getBoundingClientRect().top)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(host)
    const topBar = host.querySelector('.milkdown-top-bar')
    if (topBar) observer.observe(topBar)
    return () => observer.disconnect()
  }, [visible])

  if (!visible) return null

  return (
    <nav
      ref={navRef}
      style={contentTop === null ? undefined : { top: contentTop }}
      className={`milkdown-outline-rail${className ? ` ${className}` : ''}`}
      aria-label={copy('Document outline')}
      data-heading-count={headings.length}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        // Stop here: the wrapper's Escape handler walks the editor's own layer stack
        // (menus, find panel), none of which is open because focus is in the rail.
        event.stopPropagation()
        event.preventDefault()
        if (onDismiss) onDismiss()
        else (event.target as HTMLElement).blur()
      }}
    >
      <ul>
        {headings.map((heading) => (
          <li key={heading.id} data-level={heading.level}>
            <button
              type="button"
              onClick={() => onJumpToHeading(heading.id)}
              // `aria-current` is what a screen reader announces as "current section"; the CSS
              // keys its highlight off the same attribute, so there is one source of truth.
              aria-current={heading.id === activeId ? 'true' : undefined}
              // Collapsed, the label is `display: none` (only ticks show); the name must not
              // depend on it.
              aria-label={heading.text}
              title={`H${heading.level} — ${heading.text}`}
            >
              <span className="milkdown-outline-rail__tick" aria-hidden />
              <span className="milkdown-outline-rail__label">{heading.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
