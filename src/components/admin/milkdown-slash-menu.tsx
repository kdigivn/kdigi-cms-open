'use client'

/**
 * Slash menu surface (phase 5, SP2-2) — replaces Crepe's Vue menu. Presentational
 * only: the ProseMirror side owns `{ visible, query, selectedIndex }`
 * (`milkdown-slash-menu-plugin.ts`) and this component renders what it is given.
 *
 * DOM deliberately replicates Crepe's markup (`.milkdown-slash-menu` → `.menu-groups`
 * → `.menu-group` → `h6` + `ul/li`, with `li.hover` / `li.active`), because
 * `milkdown-lark-theme.css` already styles exactly those selectors — a new class
 * vocabulary would mean re-deriving Lark's menu styling for no gain.
 *
 * Keyboard handling mirrors Crepe's menu too: a `window` listener with
 * `{ capture: true }`, so ArrowUp/ArrowDown/Enter/Tab/Escape never reach the editor
 * while the menu is open. Mousedown is prevented so the caret stays in the document —
 * executing a command must act on the editor's selection, not on a blurred editor.
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEditorCopy } from './milkdown-ui-copy'

export interface SlashMenuViewItem {
  id: string
  label: string
  /** Raw SVG markup (the registry ships icons as strings). */
  icon: string
  /** Native tooltip (snippet preview). */
  description?: string
}

export interface SlashMenuViewGroup {
  id: string
  label: string
  items: SlashMenuViewItem[]
}

export interface MilkdownSlashMenuProps {
  /** Portal target; the menu must live inside the editor DOM for the theme + e2e selectors. */
  container: HTMLElement | null
  visible: boolean
  /** Position inside `container` (the caller already subtracted the container's rect). */
  anchor: { left: number; top: number } | null
  groups: SlashMenuViewGroup[]
  /** Flat index across all groups, in order. */
  selectedIndex: number
  onSelectedIndexChange: (index: number) => void
  onSelect: (index: number) => void
  onClose: () => void
}

/** Distance kept between the menu and the viewport edge when flipping/clamping. */
const VIEWPORT_MARGIN_PX = 12
/** Fallback box used before the first measurement (matches the theme's max-width). */
const FALLBACK_WIDTH_PX = 280

export function MilkdownSlashMenu(props: MilkdownSlashMenuProps): React.ReactElement | null {
  const copy = useEditorCopy()
  const {
    container,
    visible,
    anchor,
    groups,
    selectedIndex,
    onSelectedIndexChange,
    onSelect,
    onClose,
  } = props

  const rootRef = useRef<HTMLDivElement | null>(null)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [position, setPosition] = useState({ left: 0, top: 0 })

  const flatItems = useMemo(() => groups.flatMap((group) => group.items), [groups])
  const itemCount = flatItems.length

  useEffect(() => {
    if (!visible) return
    const onKeyDown = (event: KeyboardEvent): void => {
      const claim = (): void => {
        event.preventDefault()
        event.stopPropagation()
      }
      switch (event.key) {
        case 'ArrowDown':
          claim()
          if (itemCount > 0) onSelectedIndexChange((selectedIndex + 1) % itemCount)
          return
        case 'ArrowUp':
          claim()
          if (itemCount > 0) onSelectedIndexChange((selectedIndex - 1 + itemCount) % itemCount)
          return
        case 'Home':
          claim()
          onSelectedIndexChange(0)
          return
        case 'End':
          claim()
          onSelectedIndexChange(Math.max(0, itemCount - 1))
          return
        case 'Enter':
        case 'Tab':
          claim()
          if (itemCount > 0) onSelect(selectedIndex)
          else onClose()
          return
        case 'Escape':
          claim()
          onClose()
          return
        default:
          return
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [visible, itemCount, selectedIndex, onSelect, onSelectedIndexChange, onClose])

  // Keep the highlighted row in view while arrowing through a long list.
  useLayoutEffect(() => {
    if (!visible) return
    rootRef.current?.querySelector<HTMLElement>('li.active')?.scrollIntoView({ block: 'nearest' })
  }, [visible, selectedIndex])

  // Viewport collision: the anchor is container-relative, so add the container rect
  // back to clamp against the window, then convert to container coordinates again.
  useLayoutEffect(() => {
    if (!visible || !anchor) return
    const box = rootRef.current?.getBoundingClientRect()
    const containerRect = container?.getBoundingClientRect()
    const offsetLeft = containerRect?.left ?? 0
    const offsetTop = containerRect?.top ?? 0
    const width = box?.width ?? FALLBACK_WIDTH_PX
    const height = box?.height ?? 0
    const viewportLeft = anchor.left + offsetLeft
    const viewportTop = anchor.top + offsetTop
    const clampedLeft = Math.max(
      VIEWPORT_MARGIN_PX,
      Math.min(viewportLeft, window.innerWidth - width - VIEWPORT_MARGIN_PX),
    )
    const clampedTop =
      viewportTop + height > window.innerHeight - VIEWPORT_MARGIN_PX
        ? Math.max(VIEWPORT_MARGIN_PX, viewportTop - height - 24)
        : viewportTop
    setPosition({ left: clampedLeft - offsetLeft, top: clampedTop - offsetTop })
  }, [visible, anchor, groups, container])

  const rememberHover = useCallback((index: number): void => {
    setHoveredIndex(index)
    // Hover moves the ACTIVE row (Lark/Notion behaviour): keyboard then continues
    // from where the pointer left off.
    onSelectedIndexChange(index)
  }, [onSelectedIndexChange])

  if (!visible || !container) return null

  let flatIndex = -1
  return createPortal(
    <div
      ref={rootRef}
      className="milkdown-slash-menu"
      role="listbox"
      aria-label={copy('Insert block')}
      aria-activedescendant={itemCount > 0 ? `slash-item-${String(selectedIndex)}` : undefined}
      style={{ left: `${String(position.left)}px`, top: `${String(position.top)}px` }}
    >
      <div className="menu-groups">
        {itemCount === 0 ? (
          <div className="menu-group">
            <h6>{copy('No results')}</h6>
          </div>
        ) : (
          groups.map((group) => (
            <div className="menu-group" key={group.id} data-group-id={group.id}>
              <h6>{copy(group.label)}</h6>
              <ul>
                {group.items.map((item) => {
                  flatIndex += 1
                  const index = flatIndex
                  const isActive = index === selectedIndex
                  return (
                    <li
                      key={item.id}
                      id={`slash-item-${String(index)}`}
                      role="option"
                      aria-selected={isActive}
                      data-item-id={item.id}
                      title={item.description || undefined}
                      className={isActive ? 'active' : hoveredIndex === index ? 'hover' : undefined}
                      onMouseEnter={() => rememberHover(index)}
                      onMouseLeave={() =>
                        setHoveredIndex((current) => (current === index ? null : current))
                      }
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => onSelect(index)}
                    >
                      <span className="item-icon" aria-hidden dangerouslySetInnerHTML={{ __html: item.icon }} />
                      <span>{item.id.startsWith('snippet-') ? item.label : copy(item.label)}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>,
    container,
  )
}
