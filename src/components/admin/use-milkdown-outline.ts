'use client'

/**
 * Outline (headings + active tracking) for the editor — phase 7, SP2-4.
 *
 * Extracted from `milkdown-editor-core.tsx`, which used to hold the extraction, the DOM
 * anchoring and the active-heading scroll listener inline and had it only wired into Focus
 * mode. The rail and the Focus panel now share this one source, so the two surfaces cannot
 * disagree about which heading is current (the phase's DRY requirement).
 *
 * Headings are resolved by POSITION (the Nth rendered H1–H4 is the Nth extracted heading),
 * never by DOM id: Milkdown's `syncHeadingIdPlugin` owns the heading `id` attribute and
 * rewrites it on every doc change, so ids stamped onto ProseMirror-managed DOM are overwritten
 * (and writing them makes ProseMirror re-read the node). `milkdown-heading-N` is therefore
 * only the outline's own stable key, not a DOM anchor.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export interface OutlineHeading {
  id: string
  level: number
  text: string
}

/** ATX headings H1–H4 outside fenced code blocks, in document order. */
export function extractOutlineHeadings(markdown: string): OutlineHeading[] {
  const headings: OutlineHeading[] = []
  let inFence = false

  markdown.split('\n').forEach((line) => {
    if (/^```/.test(line.trim())) {
      inFence = !inFence
      return
    }
    if (inFence) return

    const match = /^(#{1,4})\s+(.+?)\s*$/.exec(line)
    if (!match) return

    const text = match[2].trim()
    if (!text) return

    headings.push({
      id: `milkdown-heading-${headings.length + 1}`,
      level: match[1].length,
      text,
    })
  })

  return headings
}

const HEADING_SELECTOR = ['h1', 'h2', 'h3', 'h4']
  .map((tag) => `.milkdown .ProseMirror ${tag}`)
  .join(', ')

/** Rendered heading elements in document order — index-aligned with `extractOutlineHeadings`. */
function headingElements(wrapper: HTMLElement | null): HTMLElement[] {
  return Array.from(wrapper?.querySelectorAll<HTMLElement>(HEADING_SELECTOR) ?? [])
}

/**
 * `140px` is the threshold the Focus-mode TOC already used: the first heading whose top edge
 * is at or below it is "current", falling back to the last heading past the end of the
 * document. Kept identical on purpose — the rail must show what Focus mode showed.
 */
const ACTIVE_HEADING_THRESHOLD_PX = 140

function findActiveHeadingIndex(wrapper: HTMLElement | null): number {
  const nodes = headingElements(wrapper)
  const index = nodes.findIndex((node) => node.getBoundingClientRect().top >= ACTIVE_HEADING_THRESHOLD_PX)
  return index === -1 ? nodes.length - 1 : index
}

export interface UseMilkdownOutlineOptions {
  markdown: string
  /** The editor wrapper; the rail and the anchors both live inside it. */
  wrapperRef: React.RefObject<HTMLElement | null>
  /** Set to false to skip the scroll listener (nothing is rendering the outline). */
  trackActive?: boolean
}

export interface UseMilkdownOutlineResult {
  headings: OutlineHeading[]
  activeId: string | null
  /** Scrolls the rendered heading for an outline id into view. */
  jumpToHeading: (headingId: string) => void
}

export function useMilkdownOutline({
  markdown,
  wrapperRef,
  trackActive = true,
}: UseMilkdownOutlineOptions): UseMilkdownOutlineResult {
  const headings = useMemo(() => extractOutlineHeadings(markdown), [markdown])
  const [activeIndex, setActiveIndex] = useState(-1)
  // Scroll events fire per frame; keeping the recompute behind rAF avoids a layout read storm
  // (each pass calls `getBoundingClientRect` on every heading).
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    if (!trackActive) return
    const wrapper = wrapperRef.current
    if (!wrapper) return

    const schedule = (): void => {
      if (frameRef.current !== null) return
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null
        setActiveIndex(findActiveHeadingIndex(wrapper))
      })
    }

    // Two scrollers exist: `.milkdown` scrolls in Focus mode, the page scrolls otherwise.
    const scroller = wrapper.querySelector<HTMLElement>('.milkdown')
    scroller?.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    schedule()

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
      scroller?.removeEventListener('scroll', schedule)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
    // `markdown` re-runs the measurement after every document change (headings move).
  }, [trackActive, wrapperRef, markdown])

  const jumpToHeading = useCallback(
    (headingId: string) => {
      const index = headings.findIndex((heading) => heading.id === headingId)
      if (index === -1) return
      headingElements(wrapperRef.current)[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    },
    [headings, wrapperRef],
  )

  return { headings, activeId: headings[activeIndex]?.id ?? null, jumpToHeading }
}
