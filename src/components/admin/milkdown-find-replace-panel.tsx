'use client'

import React, { useEffect, useRef } from 'react'
import { useEditorCopy } from './milkdown-ui-copy'

import { usePanelFocusTrap } from './use-panel-focus-trap'
import './milkdown-panel-layers.css'

type Props = {
  caseSensitive: boolean
  currentIndex: number
  open: boolean
  query: string
  replaceValue: string
  totalMatches: number
  onCaseSensitiveChange: (checked: boolean) => void
  onClose: () => void
  onNext: () => void
  onPrev: () => void
  onQueryChange: (query: string) => void
  onReplaceAll: () => void
  onReplaceOne: () => void
  onReplaceValueChange: (value: string) => void
}

export function MilkdownFindReplacePanel({
  caseSensitive,
  currentIndex,
  open,
  query,
  replaceValue,
  totalMatches,
  onCaseSensitiveChange,
  onClose,
  onNext,
  onPrev,
  onQueryChange,
  onReplaceAll,
  onReplaceOne,
  onReplaceValueChange,
}: Props) {
  const copy = useEditorCopy()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const queryInputRef = useRef<HTMLInputElement | null>(null)

  // More specific than `usePanelFocusTrap`'s generic "focus the first
  // focusable element" default (which also runs and lands on this same
  // input): this additionally selects its text so typing immediately
  // replaces the previous query.
  useEffect(() => {
    if (!open) return
    queryInputRef.current?.focus()
    queryInputRef.current?.select()
  }, [open])

  const { handleKeyDown } = usePanelFocusTrap({
    containerRef,
    onEscape: onClose,
    open,
  })

  if (!open) return null

  const hasMatches = totalMatches > 0

  return (
    <div
      ref={containerRef}
      className="milkdown-find-panel"
      role="dialog"
      aria-label={copy('Find and replace')}
      onKeyDown={handleKeyDown}
    >
      <div className="milkdown-find-panel__row">
        <input
          ref={queryInputRef}
          type="search"
          placeholder={copy('Find in editor')}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()

              if (event.shiftKey) {
                onPrev()
                return
              }

              onNext()
            }
          }}
        />
        <span aria-live="polite">
          {hasMatches ? `${currentIndex + 1}/${totalMatches}` : '0/0'}
        </span>
        <button
          type="button"
          onClick={onPrev}
          disabled={!hasMatches}
          aria-label={copy('Previous match')}
        >
          ↑
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!hasMatches}
          aria-label={copy('Next match')}
        >
          ↓
        </button>
        <button
          type="button"
          className={caseSensitive ? 'is-active' : ''}
          onClick={() => onCaseSensitiveChange(!caseSensitive)}
          aria-label={copy('Toggle case sensitive search')}
          aria-pressed={caseSensitive}
        >
          Aa
        </button>
        <button type="button" onClick={onClose} aria-label={copy('Close find and replace')}>
          ×
        </button>
      </div>
      <div className="milkdown-find-panel__row">
        <input
          type="text"
          placeholder={copy('Replace with')}
          value={replaceValue}
          onChange={(event) => onReplaceValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()

              if (event.shiftKey) {
                onReplaceAll()
                return
              }

              onReplaceOne()
            }
          }}
        />
        <button type="button" onClick={onReplaceOne} disabled={!hasMatches}>
          {copy('Replace')}
        </button>
        <button type="button" onClick={onReplaceAll} disabled={!hasMatches}>
          {copy('Replace all')}
        </button>
      </div>
    </div>
  )
}
