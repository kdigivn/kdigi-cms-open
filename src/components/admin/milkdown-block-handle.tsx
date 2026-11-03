'use client'

/**
 * Block handle surface (phase 5, SP2-2) — replaces Crepe's Vue handle component.
 *
 * Scope split, deliberately: POSITIONING and DRAG live in `@milkdown/kit/plugin/block`
 * (`BlockProvider`, `blockConfig`) and are reused unchanged — Crepe's handle only ever
 * *configured* that plugin and drew two buttons around it (see the phase-5 step-1
 * inventory). Reimplementing drag/drop there would duplicate a tested upstream
 * behaviour for nothing. What this file owns is the UI: the `+` affordance (insert a
 * block below and open the slash menu) and the `⋮⋮` menu SHELL.
 *
 * The menu currently lists the block-type ("Turn into") commands, which exist today via
 * `milkdown-command-registry`. Phase 6 (SP2-3) adds Duplicate / Delete / Move up /
 * Move down / Copy-anchor-link when those commands land — this phase ships only
 * actions that actually work, rather than dead menu entries.
 *
 * DOM mirrors Crepe's (`div.milkdown-block-handle` → two `.operation-item`), because
 * `milkdown-lark-theme.css` styles `.milkdown-block-handle .operation-item svg`.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useEditorCopy } from './milkdown-ui-copy'

import { formatCommandTitle } from './milkdown-command-registry'
import { getBlockActionMenuItems, getBlockTypeMenuItems } from './milkdown-slash-menu-items'

export interface MilkdownBlockHandleProps {
  /** Insert an empty paragraph below the hovered block and open the slash menu there. */
  onAdd: () => void
  /** Run a registry command against the hovered block. */
  onRunCommand: (commandId: string) => void
  /**
   * Called whenever the `⋮⋮` menu closes. The button takes DOM focus when it is
   * pressed (a `preventDefault()` there would break the native drag upstream starts
   * from its own `mousedown`), so the caller has to hand focus back to the editor or
   * the next keystroke is lost.
   */
  onMenuClose: () => void
}

/** 14×14 plus — matches the theme's `.operation-item svg` box. */
const PLUS_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden><path d="M8 3.2v9.6M3.2 8h9.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'

/** 14×14 grip (6 dots) — the drag affordance the upstream block plugin makes draggable. */
const GRIP_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden fill="currentColor"><circle cx="5.6" cy="4" r="1.15"/><circle cx="10.4" cy="4" r="1.15"/><circle cx="5.6" cy="8" r="1.15"/><circle cx="10.4" cy="8" r="1.15"/><circle cx="5.6" cy="12" r="1.15"/><circle cx="10.4" cy="12" r="1.15"/></svg>'

export function MilkdownBlockHandle({
  onAdd,
  onMenuClose,
  onRunCommand,
}: MilkdownBlockHandleProps): React.ReactElement {
  const copy = useEditorCopy()
  const [menuOpen, setMenuOpen] = useState(false)
  const blockCommands = useMemo(() => getBlockTypeMenuItems(), [])
  const blockActions = useMemo(() => getBlockActionMenuItems(), [])

  useEffect(() => {
    if (!menuOpen) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      // Capture phase: the editor's own Escape handling (layered panels) must not also
      // fire — the menu is the topmost surface while it is open.
      event.stopPropagation()
      setMenuOpen(false)
      onMenuClose()
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [menuOpen, onMenuClose])

  return (
    <div className="milkdown-block-handle">
      <div
        className="operation-item"
        data-action="add"
        role="button"
        tabIndex={-1}
        aria-label={copy('Insert block below')}
        title={copy('Insert block below')}
        onPointerDown={(event) => {
          // Crepe's exact interaction: pointerdown arms the button (and must not start a
          // drag or blur the editor), pointerup performs the insert.
          event.preventDefault()
          event.stopPropagation()
          event.currentTarget.classList.add('active')
        }}
        onPointerUp={(event) => {
          event.preventDefault()
          event.stopPropagation()
          event.currentTarget.classList.remove('active')
          onAdd()
        }}
        dangerouslySetInnerHTML={{ __html: PLUS_ICON }}
      />
      <div
        className="operation-item"
        data-action="menu"
        role="button"
        tabIndex={-1}
        aria-label={copy('Block menu')}
        title={copy('Block menu')}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onPointerDown={(event) => {
          // NO `preventDefault()` here, unlike the `+` button above. The upstream
          // `BlockService` starts HTML5 drag-and-drop from its own `mousedown` listener
          // (`#createSelection` → `#handleDragStart` needs the NodeSelection it creates),
          // and `preventDefault()` on `pointerdown` suppresses the compatibility mouse
          // events entirely — measured: zero `dragstart`/`dragover`/`drop` events fired,
          // i.e. the grip could not reorder anything. `stopPropagation()` is still fine:
          // it does not affect the mouse-event pipeline.
          event.stopPropagation()
        }}
        onClick={() => setMenuOpen((open) => !open)}
        dangerouslySetInnerHTML={{ __html: GRIP_ICON }}
      />
      {menuOpen && (
        <div className="milkdown-block-handle-menu" role="menu">
          <h6>{copy('Turn into')}</h6>
          <ul>
            {blockCommands.map((command) => (
              <li
                key={command.id}
                role="menuitem"
                data-command-id={command.id}
                title={formatCommandTitle({ label: copy(command.label), aliases: command.aliases })}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setMenuOpen(false)
                  onRunCommand(command.id)
                }}
              >
                <span className="item-icon" aria-hidden dangerouslySetInnerHTML={{ __html: command.icon }} />
                <span>{copy(command.label)}</span>
              </li>
            ))}
          </ul>
          <h6>{copy('Block')}</h6>
          <ul>
            {blockActions.map((action) => (
              <li
                key={action.id}
                role="menuitem"
                data-command-id={action.id}
                title={formatCommandTitle({ label: copy(action.label), aliases: action.aliases })}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setMenuOpen(false)
                  onRunCommand(action.id)
                }}
              >
                <span className="item-icon" aria-hidden dangerouslySetInnerHTML={{ __html: action.icon }} />
                <span>{copy(action.label)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
