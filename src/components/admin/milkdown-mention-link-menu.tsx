'use client'

/**
 * `@` internal-link picker surface (phase 8, SP2-5).
 *
 * The trigger state comes from `milkdown-mention-link-plugin.ts`; results from
 * `use-internal-link-search.ts`. Keyboard handling mirrors the slash menu: a `window` capture
 * listener, so ArrowUp/ArrowDown/Enter/Escape never reach the editor while the picker has
 * results — but Enter with NO results is left alone (an `@word` in prose must still be able to
 * end a paragraph). Mousedown is prevented everywhere so the caret stays in the document.
 *
 * [RT-14] Non-live docs (draft/scheduled) are only listed after the author flips the toggle, and
 * inserting one needs an explicit confirm: the link reveals that page's title and slug as soon
 * as the page being edited goes live.
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { PublicPathCollection } from '@/lib/frontend-public-path'

import {
  dismissMentionLink,
  insertMentionLink,
  type MentionLinkState,
} from './milkdown-mention-link-plugin'
import type { EditorView } from './milkdown-vendor'
import { useInternalLinkSearch, type LinkSearchResult } from './use-internal-link-search'

const COLLECTION_LABELS: Record<PublicPathCollection, string> = {
  posts: 'Bài viết',
  pages: 'Trang',
  products: 'Sản phẩm',
  landings: 'Landing',
}

export const NON_LIVE_LINK_CONFIRM =
  'Trang này chưa đăng (nháp hoặc hẹn giờ). Link sẽ lộ tiêu đề/slug khi bài đang sửa được đăng. Vẫn chèn?\n\n' +
  'This page is not live yet (draft or scheduled). The link reveals its title and slug once the page you are editing is published. Insert anyway?'

const VIEWPORT_MARGIN_PX = 12

export interface MilkdownMentionLinkMenuProps {
  container: HTMLElement | null
  /** Position inside `container` (caller already subtracted the container's rect). */
  anchor: { left: number; top: number } | null
  state: MentionLinkState
  /** The edited document's tenant — results are restricted to it. */
  tenantId: string | number | null | undefined
  getEditorView: () => EditorView | null
}

export function MilkdownMentionLinkMenu({
  container,
  anchor,
  state,
  tenantId,
  getEditorView,
}: MilkdownMentionLinkMenuProps): React.ReactElement | null {
  // The opt-in belongs to ONE picker session (identified by its `@` position), so every new
  // `@` starts live-only again [RT-14] without a reset effect.
  const [nonLiveSession, setNonLiveSession] = useState<number | null>(null)
  const includeNonLive = state.visible && nonLiveSession === state.from
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const rootRef = useRef<HTMLDivElement | null>(null)

  const { results, loading } = useInternalLinkSearch({
    query: state.query,
    tenantId,
    includeNonLive,
    enabled: state.visible,
  })

  // The highlight belongs to one result list: a new list starts at the top.
  const [selection, setSelection] = useState<{ list: LinkSearchResult[]; index: number }>({ list: [], index: 0 })
  const selectedIndex = selection.list === results ? selection.index : 0
  const setSelectedIndex = useCallback(
    (index: number) => setSelection({ list: results, index }),
    [results],
  )

  const choose = useCallback(
    (result: LinkSearchResult | undefined) => {
      const view = getEditorView()
      if (!view || !result) return
      if (!result.live && !window.confirm(NON_LIVE_LINK_CONFIRM)) {
        view.focus()
        return
      }
      insertMentionLink(view, { title: result.title, href: result.href })
      view.focus()
    },
    [getEditorView],
  )

  useEffect(() => {
    if (!state.visible) return
    const onKeyDown = (event: KeyboardEvent): void => {
      const claim = (): void => {
        event.preventDefault()
        event.stopPropagation()
      }
      const count = results.length
      switch (event.key) {
        case 'ArrowDown':
          if (count === 0) return
          claim()
          setSelectedIndex((selectedIndex + 1) % count)
          return
        case 'ArrowUp':
          if (count === 0) return
          claim()
          setSelectedIndex((selectedIndex - 1 + count) % count)
          return
        case 'Enter':
        case 'Tab':
          if (count === 0) return
          claim()
          choose(results[Math.min(selectedIndex, count - 1)])
          return
        case 'Escape': {
          claim()
          const view = getEditorView()
          if (view) dismissMentionLink(view)
          return
        }
        default:
          return
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [choose, getEditorView, results, selectedIndex, setSelectedIndex, state.visible])

  // Same collision rule as the slash menu: clamp horizontally, flip above the caret when the
  // list would run off the bottom of the viewport.
  useLayoutEffect(() => {
    if (!state.visible || !anchor) return
    const box = rootRef.current?.getBoundingClientRect()
    const containerRect = container?.getBoundingClientRect()
    const offsetLeft = containerRect?.left ?? 0
    const offsetTop = containerRect?.top ?? 0
    const width = box?.width ?? 320
    const height = box?.height ?? 0
    const viewportLeft = anchor.left + offsetLeft
    const viewportTop = anchor.top + offsetTop
    const left = Math.max(VIEWPORT_MARGIN_PX, Math.min(viewportLeft, window.innerWidth - width - VIEWPORT_MARGIN_PX))
    const top =
      viewportTop + height > window.innerHeight - VIEWPORT_MARGIN_PX
        ? Math.max(VIEWPORT_MARGIN_PX, viewportTop - height - 24)
        : viewportTop
    const next = { left: left - offsetLeft, top: top - offsetTop }
    setPosition((previous) => (previous.left === next.left && previous.top === next.top ? previous : next))
  }, [anchor, container, results, state.visible])

  if (!state.visible || !container) return null

  const trimmedQuery = state.query.trim()
  let status: string | null = null
  if (tenantId === null || tenantId === undefined) status = 'Tài liệu chưa gắn site / This document has no site yet'
  else if (trimmedQuery.length === 0) status = 'Gõ để tìm bài viết, trang, sản phẩm / Type to search'
  else if (loading && results.length === 0) status = 'Đang tìm… / Searching…'
  else if (results.length === 0) status = 'Không có kết quả / No results'

  return createPortal(
    <div
      ref={rootRef}
      className="milkdown-mention-menu"
      role="listbox"
      aria-label="Chèn link nội bộ / Insert internal link"
      style={{ left: `${String(position.left)}px`, top: `${String(position.top)}px` }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="milkdown-mention-menu__header">
        <span>Link nội bộ / Internal link</span>
        <button
          type="button"
          role="switch"
          aria-checked={includeNonLive}
          className="milkdown-mention-menu__toggle"
          onClick={() => setNonLiveSession(includeNonLive ? null : state.from)}
        >
          Gồm nháp/hẹn giờ · Drafts
        </button>
      </div>
      {status ? (
        <div className="milkdown-mention-menu__status">{status}</div>
      ) : (
        <ul>
          {results.map((result, index) => (
            <li
              key={`${result.collection}-${result.id}`}
              role="option"
              aria-selected={index === selectedIndex}
              data-href={result.href}
              data-collection={result.collection}
              data-live={result.live}
              className={index === selectedIndex ? 'active' : undefined}
              onMouseEnter={() => setSelectedIndex(index)}
              onClick={() => choose(result)}
            >
              <span className="milkdown-mention-menu__title">{result.title}</span>
              <span className="milkdown-mention-menu__meta">
                <span className="milkdown-mention-menu__badge">{COLLECTION_LABELS[result.collection]}</span>
                {!result.live && (
                  <span className="milkdown-mention-menu__badge is-warning">Chưa đăng / Not live</span>
                )}
                <span className="milkdown-mention-menu__path">{result.href}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>,
    container,
  )
}
