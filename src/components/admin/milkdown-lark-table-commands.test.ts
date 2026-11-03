import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  describeTableDeletionScope,
  GFM_TABLE_ALIGNMENT_DELIMITER,
  type TableColumnAlignment,
} from './milkdown-lark-commands'
import { getMilkdownCommand, milkdownCommandRegistry } from './milkdown-command-registry'

/**
 * Pure-logic tests for the Phase 6 table affordances (Lark editor
 * stabilization plan). NO-TEST-MODE directive: no Playwright/e2e authoring,
 * no dev-server browser verification — these are cheap `node:test` checks
 * over pure functions and registry data only. See
 * `reports/phase-06-table-affordances-report.md` for the browser-only
 * behaviors this intentionally does not cover (pointer hover/drag geometry,
 * Crepe's own node-view rendering).
 */

test('describeTableDeletionScope mirrors @milkdown/preset-gfm deleteSelectedCellsCommand branching', () => {
  // Verified against @milkdown/preset-gfm@7.21.2's deleteSelectedCellsCommand
  // source (see report): row+col selection deletes the table; col-only
  // deletes the column; anything else deletes the row.
  assert.equal(describeTableDeletionScope(true, true), 'table')
  assert.equal(describeTableDeletionScope(false, true), 'column')
  assert.equal(describeTableDeletionScope(true, false), 'row')
  assert.equal(describeTableDeletionScope(false, false), 'row')
})

test('GFM_TABLE_ALIGNMENT_DELIMITER covers every TableColumnAlignment with the correct GFM delimiter syntax', () => {
  const expected: Record<TableColumnAlignment, string> = {
    left: ':---',
    center: ':---:',
    right: '---:',
  }
  assert.deepEqual(GFM_TABLE_ALIGNMENT_DELIMITER, expected)

  // Every delimiter must start with the shared "---" run and only differ by
  // the leading/trailing colon that signals alignment to a GFM parser.
  for (const delimiter of Object.values(GFM_TABLE_ALIGNMENT_DELIMITER)) {
    assert.match(delimiter, /^:?---:?$/)
  }
})

test('table registry entries exist, are wired to a run, and have unique ids', () => {
  const tableIds = [
    'table',
    'tableAddRowBefore',
    'tableAddRowAfter',
    'tableAddColumnBefore',
    'tableAddColumnAfter',
    'tableDeleteSelection',
    'tableDeleteWhole',
    'tableAlignLeft',
    'tableAlignCenter',
    'tableAlignRight',
  ]

  for (const id of tableIds) {
    const command = getMilkdownCommand(id)
    assert.ok(command, `expected registry entry for "${id}"`)
    assert.equal(typeof command?.run, 'function', `${id}: expected a run function`)
  }

  const ids = milkdownCommandRegistry.map((command) => command.id)
  assert.equal(new Set(ids).size, ids.length, 'duplicate command id found in registry')
})

test('table alignment commands report isActive and their alias documents the exact GFM delimiter', () => {
  const alignments: { id: string; alignment: TableColumnAlignment }[] = [
    { id: 'tableAlignLeft', alignment: 'left' },
    { id: 'tableAlignCenter', alignment: 'center' },
    { id: 'tableAlignRight', alignment: 'right' },
  ]

  for (const { id, alignment } of alignments) {
    const command = getMilkdownCommand(id)
    assert.ok(command, `expected registry entry for "${id}"`)
    assert.equal(typeof command?.isActive, 'function', `${id}: expected an isActive function`)
    assert.deepEqual(command?.aliases, [GFM_TABLE_ALIGNMENT_DELIMITER[alignment]])
  }
})

test('table add/delete commands intentionally omit isActive (one-shot actions, like table/image insert)', () => {
  for (const id of [
    'tableAddRowBefore',
    'tableAddRowAfter',
    'tableAddColumnBefore',
    'tableAddColumnAfter',
    'tableDeleteSelection',
    'tableDeleteWhole',
  ]) {
    const command = getMilkdownCommand(id)
    assert.ok(command, `expected registry entry for "${id}"`)
    assert.equal(command?.isActive, undefined, `${id}: should not declare an isActive state`)
  }
})

test('no milkdown-*.css file introduces a fake column/row resize cursor', () => {
  // Column-width persistence has no GFM representation and is intentionally
  // excluded (plan.md product boundary + phase-06 requirement). This guards
  // against a future edit accidentally introducing a resize affordance that
  // cannot actually persist.
  const adminDir = path.dirname(fileURLToPath(import.meta.url))
  const cssFiles = readdirSync(adminDir)
    .filter((name) => name.startsWith('milkdown-') && name.endsWith('.css'))
    .sort()
  assert.ok(cssFiles.length > 0, 'expected at least one milkdown-*.css file to scan')

  const RESIZE_CURSOR_PATTERN = /cursor:\s*(col-resize|row-resize|ew-resize|ns-resize)/i
  const offenders: { file: string; lineNumber: number; line: string }[] = []
  for (const file of cssFiles) {
    const contents = readFileSync(path.join(adminDir, file), 'utf-8')
    contents.split('\n').forEach((line, index) => {
      if (RESIZE_CURSOR_PATTERN.test(line)) {
        offenders.push({ file, lineNumber: index + 1, line: line.trim() })
      }
    })
  }

  assert.deepEqual(
    offenders,
    [],
    `found a resize cursor with no backing resize feature: ${JSON.stringify(offenders, null, 2)}`,
  )
})
