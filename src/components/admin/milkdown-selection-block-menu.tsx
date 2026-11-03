'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useEditorCopy } from './milkdown-ui-copy'

import { formatCommandTitle, type MilkdownCommandDescriptor } from './milkdown-command-registry'
import { getBlockTypeMenuCommands } from './milkdown-toolbar-config'
import type { Ctx } from './milkdown-vendor'
import { editorViewCtx } from './milkdown-vendor'

/** Typeahead buffer resets if the user pauses longer than this between keystrokes. */
const TYPEAHEAD_RESET_MS = 600

function isActive(command: MilkdownCommandDescriptor, ctx: Ctx) {
  try {
    return command.isActive?.(ctx) ?? false
  } catch {
    return false
  }
}

/**
 * The "Turn into" block-type dropdown. Sourced from the shared command
 * registry (`milkdown-command-registry.ts` via `milkdown-toolbar-config.ts`)
 * — see `reports/phase-01-baseline-inventory.md` §2 for the duplication this
 * replaces. Implements the full keyboard-menu contract from phase-04
 * (roving focus, Arrow/Home/End, Enter/Space via native `<button>`
 * activation, Escape, single-character typeahead).
 */
export function MilkdownSelectionBlockMenu({
  ctx,
  left,
  maxHeight,
  onClose,
  top,
}: {
  ctx: Ctx
  left: number
  maxHeight: number
  onClose: () => void
  top: number
}) {
  const copy = useEditorCopy()
  const commands = useMemo(() => getBlockTypeMenuCommands(), [])
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const typeaheadRef = useRef<{ buffer: string; timer: ReturnType<typeof setTimeout> | null }>({
    buffer: '',
    timer: null,
  })
  const [focusedIndex, setFocusedIndex] = useState(() => {
    const activeIndex = commands.findIndex((command) => isActive(command, ctx))
    return activeIndex >= 0 ? activeIndex : 0
  })

  // Focus the active (or first) item once, on open — matches the roving
  // tabindex pattern's initial-focus expectation for a freshly opened menu.
  useEffect(() => {
    itemRefs.current[focusedIndex]?.focus()
    // Intentionally runs once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const runItem = (command: MilkdownCommandDescriptor) => {
    command.run?.(ctx)
    onClose()
    requestAnimationFrame(() => {
      try {
        ctx.get(editorViewCtx).focus()
      } catch {
        // The editor can be destroyed while the floating menu is closing.
      }
    })
  }

  const focusIndex = (index: number) => {
    const count = itemRefs.current.length
    if (count === 0) return
    const clamped = ((index % count) + count) % count
    setFocusedIndex(clamped)
    itemRefs.current[clamped]?.focus()
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        focusIndex(focusedIndex + 1)
        return
      case 'ArrowUp':
        event.preventDefault()
        focusIndex(focusedIndex - 1)
        return
      case 'Home':
        event.preventDefault()
        focusIndex(0)
        return
      case 'End':
        event.preventDefault()
        focusIndex(commands.length - 1)
        return
      case 'Escape':
        event.preventDefault()
        event.stopPropagation()
        onClose()
        return
      default:
        break
    }

    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const state = typeaheadRef.current
      if (state.timer) clearTimeout(state.timer)
      state.buffer += event.key.toLowerCase()
      state.timer = setTimeout(() => {
        state.buffer = ''
      }, TYPEAHEAD_RESET_MS)

      const match = commands.findIndex((command) =>
        copy(command.label).toLowerCase().startsWith(state.buffer) || command.label.toLowerCase().startsWith(state.buffer),
      )
      if (match >= 0) focusIndex(match)
    }
  }

  return (
    <div
      aria-label={copy('Turn into')}
      className="milkdown-selection-block-menu"
      role="menu"
      style={{ left, maxHeight, top }}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => event.preventDefault()}
    >
      <div className="milkdown-selection-block-menu__title">{copy('Turn into')}</div>
      {commands.map((command, index) => {
        const active = isActive(command, ctx)
        return (
          <button
            aria-checked={active}
            className={active ? 'is-active' : undefined}
            data-command-group="block-type"
            key={command.id}
            ref={(node) => {
              itemRefs.current[index] = node
            }}
            role="menuitemradio"
            tabIndex={index === focusedIndex ? 0 : -1}
            title={formatCommandTitle({ label: copy(command.label), aliases: command.aliases })}
            type="button"
            onClick={() => runItem(command)}
            onFocus={() => setFocusedIndex(index)}
          >
            <span
              aria-hidden="true"
              className="milkdown-selection-block-menu__icon"
              dangerouslySetInnerHTML={{ __html: command.icon }}
            />
            <span>{copy(command.label)}</span>
            {active ? <span className="milkdown-selection-block-menu__check">✓</span> : null}
          </button>
        )
      })}
    </div>
  )
}
