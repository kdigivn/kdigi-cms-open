import assert from 'node:assert/strict'
import test from 'node:test'

import { Schema } from '@milkdown/kit/prose/model'
import { EditorState, TextSelection } from '@milkdown/kit/prose/state'

import { findActiveCellRange } from './milkdown-active-cell-plugin'

// Minimal headless schema mirroring the tableRole specs the GFM preset uses —
// enough to prove the ancestor walk without booting a DOM-bound editor.
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    text: { group: 'inline' },
    table: { group: 'block', content: 'table_row+', tableRole: 'table' },
    table_row: { content: '(table_cell | table_header)+', tableRole: 'row' },
    table_cell: { content: 'paragraph+', tableRole: 'cell' },
    table_header: { content: 'paragraph+', tableRole: 'header_cell' },
  },
})

function cell(type: 'table_cell' | 'table_header', textContent: string) {
  return schema.nodes[type].create(null, schema.nodes.paragraph.create(null, schema.text(textContent)))
}

const doc = schema.nodes.doc.create(null, [
  schema.nodes.paragraph.create(null, schema.text('outside')),
  schema.nodes.table.create(null, [
    schema.nodes.table_row.create(null, [cell('table_header', 'head a'), cell('table_header', 'head b')]),
    schema.nodes.table_row.create(null, [cell('table_cell', 'cell a'), cell('table_cell', 'cell b')]),
  ]),
])

function stateWithSelectionAt(pos: number) {
  return EditorState.create({ doc, selection: TextSelection.create(doc, pos) })
}

test('returns null when the caret is outside any table', () => {
  assert.equal(findActiveCellRange(stateWithSelectionAt(2)), null)
})

test('resolves the containing header cell (tableRole header_cell)', () => {
  // Position inside the first header cell's text.
  let headerTextPos = -1
  doc.descendants((node, pos) => {
    if (headerTextPos === -1 && node.isText && node.text === 'head a') headerTextPos = pos + 2
    return headerTextPos === -1
  })
  const range = findActiveCellRange(stateWithSelectionAt(headerTextPos))
  assert.ok(range, 'expected a cell range')
  const cellNode = doc.nodeAt(range.from)
  assert.equal(cellNode?.type.name, 'table_header')
  assert.equal(range.to - range.from, cellNode?.nodeSize)
})

test('resolves the containing body cell and tracks a different cell after moving', () => {
  let cellAPos = -1
  let cellBPos = -1
  doc.descendants((node, pos) => {
    if (node.isText && node.text === 'cell a') cellAPos = pos + 2
    if (node.isText && node.text === 'cell b') cellBPos = pos + 2
    return cellAPos === -1 || cellBPos === -1
  })

  const rangeA = findActiveCellRange(stateWithSelectionAt(cellAPos))
  const rangeB = findActiveCellRange(stateWithSelectionAt(cellBPos))
  assert.ok(rangeA && rangeB)
  assert.equal(doc.nodeAt(rangeA.from)?.type.name, 'table_cell')
  assert.equal(doc.nodeAt(rangeB.from)?.type.name, 'table_cell')
  assert.notEqual(rangeA.from, rangeB.from, 'moving cells must move the decorated range')
})
