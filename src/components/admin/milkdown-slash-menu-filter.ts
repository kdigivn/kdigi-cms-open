'use client'

/**
 * Reference algorithm for the slash-menu keyboard/filter contract (Lark
 * editor stabilization plan, Phase 5, Requirements items 5+7+8).
 *
 * Crepe's `BlockEditFeatureConfig` (`milkdown-slash-menu-config.ts`) has no
 * hook for query filtering, selected-index management, disabled-item
 * guarding, or empty-result state — those are internal to Crepe's compiled
 * `BlockEdit` implementation, unmodifiable from a feature-config consumer.
 * This module is the pure, tested contract the owned slash-menu surface runs (it
 * replaced Crepe's `BlockEdit` feature in phase 5 — see
 * `milkdown-slash-menu-plugin.ts` for the state machine that feeds it). Nothing here
 * depends on Crepe, ProseMirror, or the DOM, so it is fully unit-testable in
 * isolation.
 */

import { stripDiacritics } from '@/lib/vietnamese-text'

export interface SlashMenuFilterableCommand {
  id: string
  label: string
  /** Markdown syntax / keyboard-shortcut strings also searchable (matches `MilkdownCommandDescriptor.aliases`). */
  aliases: readonly string[]
  /** Whether this command can actually execute if chosen. Mirrors "no `run` and not a documented interactive exception" from the registry contract. */
  isExecutable: boolean
}

/**
 * Case- and diacritic-insensitive substring match against id, label, and
 * aliases. Order of `commands` is preserved (no re-ranking) — Lark's own menu
 * does not reorder by match quality, only removes non-matches. Empty/whitespace-only
 * query returns every command, unchanged order.
 *
 * Diacritic folding (phase 5 requirement: `"tieu de 2"` must reach "Tiêu đề 2") reuses
 * `stripDiacritics` — the same NFD + combining-mark strip + `đ→d` mapping the slug code
 * uses, so `"duong"` matches "Đường" and typed-with-marks queries keep matching ASCII
 * labels. Both sides are folded, so the match is symmetric.
 */
export function filterSlashMenuCommands<T extends SlashMenuFilterableCommand>(
  commands: readonly T[],
  query: string,
): T[] {
  const needle = foldForSearch(query.trim())
  if (needle.length === 0) return [...commands]

  return commands.filter((command) => {
    if (foldForSearch(command.id).includes(needle)) return true
    if (foldForSearch(command.label).includes(needle)) return true
    return command.aliases.some((alias) => foldForSearch(alias).includes(needle))
  })
}

/** `stripDiacritics` preserves case (only `Đ→D`), so fold case here. */
function foldForSearch(value: string): string {
  return stripDiacritics(value).toLowerCase()
}

/**
 * Safe selected-index transition for a filtered result list.
 *
 * - No results: -1 (nothing selectable — renders the empty-result state;
 *   Enter/click must no-op when the index is -1).
 * - Result count unchanged from the previous render (the query changed but
 *   still matches the same number of items, e.g. cursor moved without
 *   editing): keep the previous index, clamped defensively into bounds.
 * - Result count changed (a keystroke added/removed matches): reset to the
 *   first item (0) rather than keep a stale index that may now point at an
 *   unrelated command — this is the "reset index safely when result count
 *   changes" requirement.
 */
export function resolveSlashMenuSelectedIndex(
  previousIndex: number,
  previousResultCount: number,
  nextResultCount: number,
): number {
  if (nextResultCount <= 0) return -1
  if (nextResultCount !== previousResultCount) return 0
  if (previousIndex < 0) return 0
  return Math.min(previousIndex, nextResultCount - 1)
}

/**
 * Guards Enter/click execution: a command can only run when it is currently
 * selectable (index in range) and marked executable. Prevents an
 * out-of-range or non-executable ("disabled") entry from ever firing —
 * covers Requirements item 5's "disabled/inapplicable commands never
 * execute on Enter".
 */
export function canExecuteSlashMenuSelection<T extends SlashMenuFilterableCommand>(
  filteredCommands: readonly T[],
  selectedIndex: number,
): boolean {
  if (selectedIndex < 0 || selectedIndex >= filteredCommands.length) return false
  return filteredCommands[selectedIndex].isExecutable
}

/**
 * Keyboard-navigation index step for ArrowUp/ArrowDown/Home/End, wrapping
 * at both ends (matches the existing `MilkdownSelectionBlockMenu` roving
 * contract in `milkdown-selection-block-menu.tsx` for consistency across
 * menus). Returns -1 unchanged when there are no results to navigate.
 */
export function stepSlashMenuSelectedIndex(
  currentIndex: number,
  resultCount: number,
  direction: 'next' | 'previous' | 'first' | 'last',
): number {
  if (resultCount <= 0) return -1
  switch (direction) {
    case 'first':
      return 0
    case 'last':
      return resultCount - 1
    case 'next':
      return currentIndex < 0 ? 0 : (currentIndex + 1) % resultCount
    case 'previous':
      return currentIndex < 0 ? resultCount - 1 : (currentIndex - 1 + resultCount) % resultCount
    default:
      return currentIndex
  }
}
