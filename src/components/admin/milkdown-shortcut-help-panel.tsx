'use client'

import React, { useRef } from 'react'
import { useEditorCopy } from './milkdown-ui-copy'

import { useBodyScrollLock } from './use-body-scroll-lock'
import { usePanelFocusTrap } from './use-panel-focus-trap'
import './milkdown-panel-layers.css'

const shortcuts = [
  ['⌘⌥1…6 / Ctrl+Alt+1…6', 'Heading 1–6'],
  ['⌘⌥0 / Ctrl+Alt+0', 'Body text'],
  ['⌘⇧8 / Ctrl+Shift+8', 'Bulleted list'],
  ['⌘⇧7 / Ctrl+Shift+7', 'Numbered list'],
  ['⌘⌥T / Ctrl+Alt+T', 'To-do list'],
  ['⌘⇧> / Ctrl+Shift+>', 'Quote'],
  ['⌘⌥C / Ctrl+Alt+C', 'Code block'],
  ['⌘⌥S / Ctrl+Alt+S', 'Divider'],
  ['⌘K / Ctrl+K', 'Insert or edit link'],
  ['⌘/ / Ctrl+/', 'Open this help panel'],
  ['⌘F / Ctrl+F', 'Find in editor'],
  ['⌘⇧H / Ctrl+Shift+H', 'Find and replace'],
]

const markdownSyntax = [
  ['# Space', 'Heading 1'],
  ['## Space', 'Heading 2'],
  ['### Space', 'Heading 3'],
  ['#### Space', 'Heading 4'],
  ['##### Space', 'Heading 5'],
  ['###### Space', 'Heading 6'],
  ['- Space', 'Bulleted list'],
  ['* Space', 'Bulleted list'],
  ['1. Space', 'Numbered list'],
  ['[ ] Space', 'To-do list'],
  ['[x] Space', 'Checked to-do'],
  ['> Space', 'Quote'],
  ['`code`', 'Inline code'],
  ['**bold**', 'Bold'],
  ['*italic*', 'Italic'],
  ['~~strike~~', 'Strikethrough'],
  ['---', 'Divider'],
  ['```', 'Code block'],
]

type Props = {
  open: boolean
  onClose: () => void
}

export function MilkdownShortcutHelpPanel({ open, onClose }: Props) {
  const copy = useEditorCopy()
  const containerRef = useRef<HTMLDivElement | null>(null)

  // The sheet has its own backdrop and covers the full viewport, so it
  // locks the external page the same way focus mode does — refcounted, so
  // opening this while focus mode is already open does not fight it.
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
      className="milkdown-side-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={copy('Keyboard shortcuts')}
      onKeyDown={handleKeyDown}
    >
      <div className="milkdown-side-sheet__backdrop" onClick={onClose} />
      <aside className="milkdown-side-sheet__panel">
        <div className="milkdown-side-sheet__header">
          <div>
            <h2>{copy('Keyboard shortcuts')}</h2>
            <p>{copy('Lark-style writing shortcuts for Content Md.')}</p>
          </div>
          <button
            type="button"
            className="milkdown-side-sheet__close"
            onClick={onClose}
            aria-label={copy('Close shortcuts')}
          >
            ×
          </button>
        </div>

        {/* Fixed header above, scrollable body below — the sheet's own
            `max-height` is bounded to the viewport (see
            `milkdown-panel-layers.css`), so on a long shortcuts list this
            scrolls internally to the last item instead of growing past the
            fold. */}
        <div className="milkdown-side-sheet__body">
          <section className="milkdown-side-sheet__section">
            <h3>{copy('Keyboard')}</h3>
            <p>{copy('Available while the editor is focused.')}</p>
            <ul>
              {shortcuts.map(([key, label]) => (
                <li key={key}>
                  <kbd>{key}</kbd>
                  <span>{copy(label)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="milkdown-side-sheet__section">
            <h3>Markdown</h3>
            <ul>
              {markdownSyntax.map(([key, label]) => (
                <li key={key}>
                  <kbd>{key}</kbd>
                  <span>{copy(label)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </aside>
    </div>
  )
}
