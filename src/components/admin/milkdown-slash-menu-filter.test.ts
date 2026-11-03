import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canExecuteSlashMenuSelection,
  filterSlashMenuCommands,
  resolveSlashMenuSelectedIndex,
  stepSlashMenuSelectedIndex,
} from './milkdown-slash-menu-filter'
import type { SlashMenuFilterableCommand } from './milkdown-slash-menu-filter'

const COMMANDS: SlashMenuFilterableCommand[] = [
  { id: 'paragraph', label: 'Text', aliases: ['Ctrl+Alt+0'], isExecutable: true },
  { id: 'heading1', label: 'Heading 1', aliases: ['# Space'], isExecutable: true },
  { id: 'heading2', label: 'Heading 2', aliases: ['## Space'], isExecutable: true },
  { id: 'quote', label: 'Quote', aliases: ['> Space'], isExecutable: true },
  { id: 'image', label: 'Image', aliases: [], isExecutable: true },
  { id: 'placeholder', label: 'Not wired yet', aliases: [], isExecutable: false },
]

test('filterSlashMenuCommands: empty query returns every command, order preserved', () => {
  const result = filterSlashMenuCommands(COMMANDS, '')
  assert.deepEqual(
    result.map((c) => c.id),
    COMMANDS.map((c) => c.id),
  )
})

test('filterSlashMenuCommands: whitespace-only query behaves like empty query', () => {
  const result = filterSlashMenuCommands(COMMANDS, '   ')
  assert.equal(result.length, COMMANDS.length)
})

test('filterSlashMenuCommands: matches by label substring, case-insensitive', () => {
  const result = filterSlashMenuCommands(COMMANDS, 'HEA')
  assert.deepEqual(
    result.map((c) => c.id),
    ['heading1', 'heading2'],
  )
})

test('filterSlashMenuCommands: matches by id', () => {
  const result = filterSlashMenuCommands(COMMANDS, 'quote')
  assert.deepEqual(
    result.map((c) => c.id),
    ['quote'],
  )
})

test('filterSlashMenuCommands: matches by alias/shortcut text', () => {
  const result = filterSlashMenuCommands(COMMANDS, '# space')
  assert.deepEqual(
    result.map((c) => c.id),
    ['heading1', 'heading2'],
  )
})

/** Vietnamese labels as the real registry ships them (`milkdown-slash-menu-items.ts`). */
const VI_COMMANDS: SlashMenuFilterableCommand[] = [
  { id: 'heading2', label: 'Tiêu đề 2 / Heading 2', aliases: ['## Space'], isExecutable: true },
  { id: 'link', label: 'Liên kết / Link', aliases: ['duong dan'], isExecutable: true },
  { id: 'table', label: 'Bảng / Table', aliases: ['table'], isExecutable: true },
]

test('filterSlashMenuCommands: unaccented query matches a Vietnamese label', () => {
  assert.deepEqual(
    filterSlashMenuCommands(VI_COMMANDS, 'tieu de 2').map((c) => c.id),
    ['heading2'],
  )
})

test('filterSlashMenuCommands: "duong" matches both "Đường"-style labels and their aliases', () => {
  // Accent-stripped alias ("duong dan") and the label's own `đ` both fold to `d`.
  assert.deepEqual(
    filterSlashMenuCommands(VI_COMMANDS, 'duong').map((c) => c.id),
    ['link'],
  )
})

test('filterSlashMenuCommands: accented query still matches an ASCII label (symmetric fold)', () => {
  assert.deepEqual(
    filterSlashMenuCommands(VI_COMMANDS, 'BẢNG').map((c) => c.id),
    ['table'],
  )
})

test('filterSlashMenuCommands: diacritic folding does not turn misses into hits', () => {
  assert.deepEqual(filterSlashMenuCommands(VI_COMMANDS, 'tieu de 9'), [])
})

test('filterSlashMenuCommands: no match returns empty array (empty-result state input)', () => {
  const result = filterSlashMenuCommands(COMMANDS, 'zzz-nonexistent')
  assert.deepEqual(result, [])
})

test('resolveSlashMenuSelectedIndex: zero results always yields -1', () => {
  assert.equal(resolveSlashMenuSelectedIndex(0, 5, 0), -1)
  assert.equal(resolveSlashMenuSelectedIndex(-1, 0, 0), -1)
})

test('resolveSlashMenuSelectedIndex: unchanged result count preserves index, clamped into bounds', () => {
  assert.equal(resolveSlashMenuSelectedIndex(2, 4, 4), 2)
  // previous index somehow out of range for the new (same-length) set — clamp, don't throw
  assert.equal(resolveSlashMenuSelectedIndex(9, 4, 4), 3)
})

test('resolveSlashMenuSelectedIndex: changed result count resets to first item', () => {
  assert.equal(resolveSlashMenuSelectedIndex(3, 6, 2), 0)
  assert.equal(resolveSlashMenuSelectedIndex(0, 1, 5), 0)
})

test('resolveSlashMenuSelectedIndex: no previous selection on a non-empty result starts at 0', () => {
  assert.equal(resolveSlashMenuSelectedIndex(-1, 0, 3), 0)
})

test('canExecuteSlashMenuSelection: false when index out of range', () => {
  assert.equal(canExecuteSlashMenuSelection(COMMANDS, -1), false)
  assert.equal(canExecuteSlashMenuSelection(COMMANDS, COMMANDS.length), false)
})

test('canExecuteSlashMenuSelection: false for a selected-but-non-executable command (never fires on Enter)', () => {
  const placeholderIndex = COMMANDS.findIndex((c) => c.id === 'placeholder')
  assert.equal(canExecuteSlashMenuSelection(COMMANDS, placeholderIndex), false)
})

test('canExecuteSlashMenuSelection: true for a selected executable command', () => {
  const headingIndex = COMMANDS.findIndex((c) => c.id === 'heading1')
  assert.equal(canExecuteSlashMenuSelection(COMMANDS, headingIndex), true)
})

test('stepSlashMenuSelectedIndex: empty result set always yields -1 regardless of direction', () => {
  for (const direction of ['next', 'previous', 'first', 'last'] as const) {
    assert.equal(stepSlashMenuSelectedIndex(0, 0, direction), -1)
  }
})

test('stepSlashMenuSelectedIndex: next wraps from last to first', () => {
  assert.equal(stepSlashMenuSelectedIndex(4, 5, 'next'), 0)
})

test('stepSlashMenuSelectedIndex: previous wraps from first to last', () => {
  assert.equal(stepSlashMenuSelectedIndex(0, 5, 'previous'), 4)
})

test('stepSlashMenuSelectedIndex: next/previous start at 0 when nothing was selected yet', () => {
  assert.equal(stepSlashMenuSelectedIndex(-1, 5, 'next'), 0)
  assert.equal(stepSlashMenuSelectedIndex(-1, 5, 'previous'), 4)
})

test('stepSlashMenuSelectedIndex: Home/End jump to first/last', () => {
  assert.equal(stepSlashMenuSelectedIndex(2, 6, 'first'), 0)
  assert.equal(stepSlashMenuSelectedIndex(2, 6, 'last'), 5)
})
