'use client'

import React, { useRef } from 'react'
import { useEditorCopy } from './milkdown-ui-copy'

import { useBodyScrollLock } from './use-body-scroll-lock'
import type { OutlineHeading } from './use-milkdown-outline'
import { usePanelFocusTrap } from './use-panel-focus-trap'
import './milkdown-panel-layers.css'

type Props = {
  activeHeadingId: string | null
  characterCount: number
  headings: OutlineHeading[]
  onClose: () => void
  onJumpToHeading: (headingId: string) => void
  open: boolean
  wordCount: number
}

export function MilkdownFocusPanel({
  activeHeadingId,
  characterCount,
  headings,
  onClose,
  onJumpToHeading,
  open,
  wordCount,
}: Props) {
  const copy = useEditorCopy()
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Scroll Contract (phase-07 plan): entering focus mode locks only the
  // EXTERNAL page — the shell itself, and the editor/TOC inside it, keep
  // their own independent scroll containers untouched by this lock.
  useBodyScrollLock(open)

  const { handleKeyDown } = usePanelFocusTrap({
    containerRef,
    onEscape: onClose,
    open,
  })

  if (!open) return null

  return (
    <div
      ref={containerRef}
      className="milkdown-focus-shell is-open"
      role="dialog"
      aria-label={copy('Focus mode')}
      aria-modal="true"
      onKeyDown={handleKeyDown}
    >
      {/* Also returns focus to the "Focus mode" toggle button in
          `milkdown-editor-core.tsx` on close/unmount via `usePanelFocusTrap`. */}
      <div className="milkdown-focus-shell__toolbar">
        <div>
          <strong>{copy('Focus mode')}</strong>
          <span>{copy('Write without the Payload form chrome. Press Esc to exit.')}</span>
        </div>
        <button type="button" onClick={onClose}>
          {copy('Exit')}
        </button>
      </div>

      <aside className="milkdown-focus-shell__toc">
        <h3>{copy('Table of contents')}</h3>
        <span>{headings.length} {copy('headings')}</span>
        <nav aria-label={copy('Document outline')}>
          <ul>
            {headings.length === 0 ? (
              <li className="is-empty">{copy('No headings yet')}</li>
            ) : (
              headings.map((heading) => (
                <li key={heading.id}>
                  <button
                    type="button"
                    className={heading.id === activeHeadingId ? 'is-active' : ''}
                    data-level={heading.level}
                    aria-current={heading.id === activeHeadingId ? 'location' : undefined}
                    aria-label={`${copy('Jump to')} ${heading.text}`}
                    title={heading.text}
                    onClick={() => onJumpToHeading(heading.id)}
                  >
                    {heading.text}
                  </button>
                </li>
              ))
            )}
          </ul>
        </nav>
      </aside>

      <div className="milkdown-focus-shell__footer">
        <span>{headings.length} {copy('headings')}</span>
        <span>{wordCount} {copy('words')}</span>
        <span>{characterCount} {copy('characters')}</span>
      </div>
    </div>
  )
}
