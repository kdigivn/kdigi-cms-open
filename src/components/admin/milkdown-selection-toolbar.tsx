'use client'

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useEditorCopy } from './milkdown-ui-copy'

import { formatCommandTitle, type MilkdownCommandDescriptor } from './milkdown-command-registry'
import { milkdownBlockGridIcon } from './milkdown-lark-icons'
import {
  getBlockTypeMenuCommands,
  getLinkToolbarCommand,
  getMarkToolbarCommands,
} from './milkdown-toolbar-config'
import type { Ctx } from './milkdown-vendor'

const VIEWPORT_MARGIN_PX = 8
const BLOCK_TYPE_FALLBACK_ID = 'paragraph'

function safeIsActive(command: MilkdownCommandDescriptor, ctx: Ctx | null): boolean {
  if (!ctx || !command.isActive) return false
  try {
    return command.isActive(ctx)
  } catch {
    return false
  }
}

function runSafely(command: MilkdownCommandDescriptor, ctx: Ctx | null) {
  if (!ctx || !command.run) return
  command.run(ctx)
}

// `commandTitle` now lives in the registry (`formatCommandTitle`) so the toolbar, the
// Turn-into menu and the block handle menu all print the same `Label (shortcut)` text.
const commandTitle = formatCommandTitle

export interface MilkdownSelectionToolbarProps {
  /** Stable Milkdown ctx captured once after `crepe.create()` resolves — `ctx.get(editorViewCtx)` always reads the LIVE view, so this never goes stale. `null` until the editor mounts. */
  ctx: Ctx | null
  /** True while the Lark selection plugin's phase is `visible` or `menu-open` (see `milkdown-lark-selection-plugin.ts`). Drives show/hide via the `.is-selection-toolbar-visible` wrapper class, mirroring the prior Crepe-toolbar CSS contract. */
  isVisible: boolean
  /** True while the "Turn into" dropdown this toolbar opens is currently open. */
  isBlockMenuOpen: boolean
  /** Bumped on every `markdownUpdated` — forces a re-sample of active/current-block state after a command runs even when the selection range itself did not move. */
  contentVersion: number
  onOpenBlockMenu: (anchorRect: DOMRect) => void
  onCloseBlockMenu: () => void
}

/**
 * Custom Lark-style floating selection toolbar (Lark editor stabilization
 * plan, Phase 4). Replaces Crepe's built-in toolbar feature entirely — see
 * `milkdown-editor-core.tsx`'s Phase 4 comment for the "disable vs. portal
 * over hidden Crepe DOM" decision.
 *
 * Order: [block-type trigger] | Bold Italic Strikethrough Inline-Code | Link
 * | block-menu grid (`⠿`). The trailing grid button opens the SAME "Turn
 * into" dropdown as the block-type trigger (`onOpenBlockMenu`/
 * `onCloseBlockMenu`, both wired to `openSelectionBlockMenu` in
 * `milkdown-editor-core.tsx`) — a second, Lark-parity entry point, not a
 * second menu — anchored to its own button rect instead of the trigger's.
 * Anchored to the live text selection via `getBoundingClientRect()`,
 * `position: fixed` (zero layout participation), clamped to the viewport
 * with above/below collision handling, repositioned on scroll/resize/
 * selection change.
 */
export function MilkdownSelectionToolbar({
  ctx,
  isVisible,
  isBlockMenuOpen,
  contentVersion,
  onOpenBlockMenu,
  onCloseBlockMenu,
}: MilkdownSelectionToolbarProps) {
  const copy = useEditorCopy()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const blockGridTriggerRef = useRef<HTMLButtonElement | null>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const [selectionTick, setSelectionTick] = useState(0)

  const blockTypeCommands = useMemo(() => getBlockTypeMenuCommands(), [])
  const markCommands = useMemo(() => getMarkToolbarCommands(), [])
  const linkCommand = useMemo(() => getLinkToolbarCommand(), [])

  const activeBlockCommand = useMemo(() => {
    const fallback =
      blockTypeCommands.find((command) => command.id === BLOCK_TYPE_FALLBACK_ID)
      ?? blockTypeCommands[0]
    if (!ctx) return fallback
    return blockTypeCommands.find((command) => safeIsActive(command, ctx)) ?? fallback
    // `contentVersion`/`selectionTick` are read only to force this memo to
    // recompute after a transaction or selection change — they are not used
    // in the computation itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, blockTypeCommands, contentVersion, selectionTick])

  const reposition = useCallback(() => {
    const node = rootRef.current
    if (!node) return
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return
    const anchorRect = selection.getRangeAt(0).getBoundingClientRect()
    if (anchorRect.width === 0 && anchorRect.height === 0) return

    const { width, height } = node.getBoundingClientRect()
    let left = anchorRect.left + anchorRect.width / 2 - width / 2
    left = Math.max(
      VIEWPORT_MARGIN_PX,
      Math.min(left, window.innerWidth - width - VIEWPORT_MARGIN_PX),
    )

    const spaceAbove = anchorRect.top - VIEWPORT_MARGIN_PX
    const spaceBelow = window.innerHeight - anchorRect.bottom - VIEWPORT_MARGIN_PX
    const placeAbove = spaceAbove >= height || spaceAbove >= spaceBelow
    const top = placeAbove
      ? Math.max(VIEWPORT_MARGIN_PX, anchorRect.top - height - 8)
      : Math.min(window.innerHeight - height - VIEWPORT_MARGIN_PX, anchorRect.bottom + 8)

    setPosition({ top, left })
  }, [])

  // Reposition on show, and keep tracking scroll/resize/selection changes
  // while shown. Runs even while hidden-but-mounted would be wasted work, so
  // it is gated on `isVisible` — the CSS-hide transition only needs the LAST
  // good position, not a live one while off-screen.
  useLayoutEffect(() => {
    if (!isVisible) return
    reposition()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    document.addEventListener('selectionchange', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
      document.removeEventListener('selectionchange', reposition)
    }
  }, [isVisible, reposition, contentVersion])

  // Forces a render (and therefore a fresh read of every command's
  // `isActive`) whenever the native selection changes — e.g. the caret moves
  // from bold text into plain text while the toolbar stays open for an
  // unrelated reason (menu-open phase).
  useEffect(() => {
    if (!isVisible) return
    const bump = () => setSelectionTick((tick) => tick + 1)
    document.addEventListener('selectionchange', bump)
    return () => document.removeEventListener('selectionchange', bump)
  }, [isVisible])

  const handleCommandClick = useCallback(
    (command: MilkdownCommandDescriptor) => {
      runSafely(command, ctx)
    },
    [ctx],
  )

  // Shared open/close logic for BOTH block-menu entry points (the `T▾`
  // trigger and the trailing `⠿` grid button) — each anchors from its OWN
  // button rect but opens the identical dropdown via the identical
  // `onOpenBlockMenu`/`onCloseBlockMenu` props, so only one dropdown can ever
  // be open at a time regardless of which control triggered it.
  const openBlockMenuFromRef = useCallback(
    (ref: React.RefObject<HTMLButtonElement | null>) => {
      if (isBlockMenuOpen) {
        onCloseBlockMenu()
        return
      }
      const rect = ref.current?.getBoundingClientRect()
      if (rect) onOpenBlockMenu(rect)
    },
    [isBlockMenuOpen, onOpenBlockMenu, onCloseBlockMenu],
  )

  const handleBlockMenuKeyDown = useCallback(
    (ref: React.RefObject<HTMLButtonElement | null>, event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== 'ArrowDown' && event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      if (isBlockMenuOpen) return
      const rect = ref.current?.getBoundingClientRect()
      if (rect) onOpenBlockMenu(rect)
    },
    [isBlockMenuOpen, onOpenBlockMenu],
  )

  const handleTriggerClick = useCallback(
    () => openBlockMenuFromRef(triggerRef),
    [openBlockMenuFromRef],
  )
  const handleTriggerKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => handleBlockMenuKeyDown(triggerRef, event),
    [handleBlockMenuKeyDown],
  )
  const handleBlockGridClick = useCallback(
    () => openBlockMenuFromRef(blockGridTriggerRef),
    [openBlockMenuFromRef],
  )
  const handleBlockGridKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => handleBlockMenuKeyDown(blockGridTriggerRef, event),
    [handleBlockMenuKeyDown],
  )

  return (
    <div
      ref={rootRef}
      aria-label={copy('Text formatting')}
      className="milkdown-selection-toolbar"
      role="toolbar"
      style={position ? { top: position.top, left: position.left } : undefined}
      onPointerDown={(event) => {
        // A toolbar control must never steal DOM focus from the editor —
        // that would blur ProseMirror and (outside the menu-open phase)
        // collapse/hide the very selection this toolbar is anchored to.
        event.preventDefault()
      }}
    >
      <button
        aria-expanded={isBlockMenuOpen}
        aria-haspopup="menu"
        aria-label={`${copy('Turn into')} (${copy('currently')} ${copy(activeBlockCommand.label)})`}
        className="milkdown-selection-toolbar__trigger"
        data-command-group="block-type"
        ref={triggerRef}
        title={copy(activeBlockCommand.label)}
        type="button"
        onClick={handleTriggerClick}
        onKeyDown={handleTriggerKeyDown}
      >
        <span
          aria-hidden="true"
          className="milkdown-selection-toolbar__icon"
          dangerouslySetInnerHTML={{ __html: activeBlockCommand.icon }}
        />
        <span aria-hidden="true" className="milkdown-selection-toolbar__chevron" />
      </button>

      <span aria-hidden="true" className="milkdown-selection-toolbar__divider" />

      {markCommands.map((command) => {
        const active = safeIsActive(command, ctx)
        return (
          <button
            aria-label={copy(command.label)}
            aria-pressed={active}
            className={active ? 'is-active' : undefined}
            data-command-group="mark"
            key={command.id}
            title={commandTitle({ label: copy(command.label), aliases: command.aliases })}
            type="button"
            onClick={() => handleCommandClick(command)}
          >
            <span
              aria-hidden="true"
              className="milkdown-selection-toolbar__icon"
              dangerouslySetInnerHTML={{ __html: command.icon }}
            />
          </button>
        )
      })}

      <span aria-hidden="true" className="milkdown-selection-toolbar__divider" />

      <button
        aria-label={copy(linkCommand.label)}
        aria-pressed={safeIsActive(linkCommand, ctx)}
        className={safeIsActive(linkCommand, ctx) ? 'is-active' : undefined}
        data-command-group="insert"
        title={commandTitle({ label: copy(linkCommand.label), aliases: linkCommand.aliases })}
        type="button"
        onClick={() => handleCommandClick(linkCommand)}
      >
        <span
          aria-hidden="true"
          className="milkdown-selection-toolbar__icon"
          dangerouslySetInnerHTML={{ __html: linkCommand.icon }}
        />
      </button>

      <span aria-hidden="true" className="milkdown-selection-toolbar__divider" />

      <button
        aria-expanded={isBlockMenuOpen}
        aria-haspopup="menu"
        aria-label={copy('Turn into')}
        className="milkdown-selection-toolbar__trigger"
        data-command-group="block-type"
        ref={blockGridTriggerRef}
        title={copy('Turn into')}
        type="button"
        onClick={handleBlockGridClick}
        onKeyDown={handleBlockGridKeyDown}
      >
        <span
          aria-hidden="true"
          className="milkdown-selection-toolbar__icon"
          dangerouslySetInnerHTML={{ __html: milkdownBlockGridIcon }}
        />
      </button>
    </div>
  )
}
