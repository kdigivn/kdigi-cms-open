/**
 * Unit tests for menu-tree-utils.ts
 * Runner: node --import tsx --test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  flattenTree,
  unflattenTree,
  moveFlatNodes,
  clampDepth,
  updateNode,
  removeNode,
  newNode,
  INDENT_WIDTH,
  MAX_DEPTH,
} from './menu-tree-utils.js'
import type { MenuNode } from '../../lib/menu-tree-types.js'

// 3-level nested fixture
const THREE_LEVEL: MenuNode[] = [
  {
    id: 'a',
    label: { vi: 'Dịch vụ', en: 'Services' },
    url: '/dich-vu',
    children: [
      {
        id: 'b',
        label: { vi: 'Thiết kế web', en: 'Web design' },
        url: '/thiet-ke-web',
        children: [
          {
            id: 'c',
            label: { vi: 'Thiết kế web Hà Nội', en: '' },
            url: '/thiet-ke-web-ha-noi',
            children: [],
          },
        ],
      },
    ],
  },
]

// --- constants ---

test('INDENT_WIDTH is 28', () => {
  assert.equal(INDENT_WIDTH, 28)
})

test('MAX_DEPTH is 5', () => {
  assert.equal(MAX_DEPTH, 5)
})

// --- flattenTree ---

test('flattenTree produces correct DFS order with depths', () => {
  const flat = flattenTree(THREE_LEVEL)
  assert.equal(flat.length, 3)
  assert.equal(flat[0].id, 'a')
  assert.equal(flat[0].depth, 0)
  assert.equal(flat[1].id, 'b')
  assert.equal(flat[1].depth, 1)
  assert.equal(flat[2].id, 'c')
  assert.equal(flat[2].depth, 2)
})

test('flattenTree sets parentId correctly', () => {
  const flat = flattenTree(THREE_LEVEL)
  assert.equal(flat[0].parentId, null)
  assert.equal(flat[1].parentId, 'a')
  assert.equal(flat[2].parentId, 'b')
})

test('flattenTree on empty array returns []', () => {
  assert.deepEqual(flattenTree([]), [])
})

test('flattenTree preserves node reference', () => {
  const flat = flattenTree(THREE_LEVEL)
  assert.equal(flat[0].node.id, 'a')
  assert.equal(flat[0].node.url, '/dich-vu')
})

// --- unflattenTree ---

test('unflattenTree round-trips THREE_LEVEL (ids + structure)', () => {
  const flat = flattenTree(THREE_LEVEL)
  const rebuilt = unflattenTree(flat)
  assert.equal(rebuilt.length, 1)
  assert.equal(rebuilt[0].id, 'a')
  assert.equal(rebuilt[0].children.length, 1)
  assert.equal(rebuilt[0].children[0].id, 'b')
  assert.equal(rebuilt[0].children[0].children.length, 1)
  assert.equal(rebuilt[0].children[0].children[0].id, 'c')
})

test('unflattenTree on empty array returns []', () => {
  assert.deepEqual(unflattenTree([]), [])
})

test('unflattenTree round-trip preserves labels and urls', () => {
  const flat = flattenTree(THREE_LEVEL)
  const rebuilt = unflattenTree(flat)
  assert.deepEqual(rebuilt[0].label, { vi: 'Dịch vụ', en: 'Services' })
  assert.equal(rebuilt[0].url, '/dich-vu')
  assert.deepEqual(rebuilt[0].children[0].label, { vi: 'Thiết kế web', en: 'Web design' })
})

// --- updateNode ---

test('updateNode changes target node label only', () => {
  const updated = updateNode(THREE_LEVEL, 'b', { label: { vi: 'Updated', en: 'Updated EN' } })
  assert.deepEqual(updated[0].children[0].label, { vi: 'Updated', en: 'Updated EN' })
  // siblings and other nodes unchanged
  assert.deepEqual(updated[0].label, { vi: 'Dịch vụ', en: 'Services' })
  assert.deepEqual(updated[0].children[0].children[0].label, { vi: 'Thiết kế web Hà Nội', en: '' })
})

test('updateNode changes url on target node', () => {
  const updated = updateNode(THREE_LEVEL, 'c', { url: '/new-url' })
  assert.equal(updated[0].children[0].children[0].url, '/new-url')
  // parent url unchanged
  assert.equal(updated[0].url, '/dich-vu')
})

test('updateNode on non-existent id returns tree unchanged (deepEqual)', () => {
  const updated = updateNode(THREE_LEVEL, 'zzz', { url: '/ghost' })
  assert.equal(updated[0].url, '/dich-vu')
  assert.equal(updated[0].children[0].url, '/thiet-ke-web')
})

// --- removeNode ---

test('removeNode removes root node with no children', () => {
  const tree: MenuNode[] = [
    { id: 'x', label: { vi: 'X' }, url: '/x', children: [] },
    { id: 'y', label: { vi: 'Y' }, url: '/y', children: [] },
  ]
  const result = removeNode(tree, 'x')
  assert.equal(result.length, 1)
  assert.equal(result[0].id, 'y')
})

test('removeNode promotes children to parent level', () => {
  // Remove 'b' which has child 'c' — 'c' should be promoted to root level under 'a'
  const result = removeNode(THREE_LEVEL, 'b')
  assert.equal(result.length, 1)
  assert.equal(result[0].id, 'a')
  assert.equal(result[0].children.length, 1)
  assert.equal(result[0].children[0].id, 'c')
})

test('removeNode on leaf node', () => {
  const result = removeNode(THREE_LEVEL, 'c')
  assert.equal(result[0].children[0].children.length, 0)
})

// --- newNode ---

test('newNode returns node with unique ids', () => {
  const n1 = newNode()
  const n2 = newNode()
  assert.notEqual(n1.id, n2.id)
  assert.ok(n1.id.length > 0)
})

test('newNode has empty label map and empty children', () => {
  const n = newNode()
  assert.deepEqual(n.label, { vi: '', en: '' })
  assert.deepEqual(n.children, [])
})

test('newNode url defaults to #', () => {
  const n = newNode()
  assert.equal(n.url, '#')
})

// --- clampDepth ---

test('clampDepth returns 0 when no previous node', () => {
  const flat = flattenTree(THREE_LEVEL)
  // overIdx=0 means no previous node
  const clamped = clampDepth(5, flat, 0)
  assert.equal(clamped, 0)
})

test('clampDepth allows depth one greater than previous sibling', () => {
  const flat = flattenTree(THREE_LEVEL)
  // flat[0] is depth 0, so max for next item is 1
  const clamped = clampDepth(3, flat, 1)
  assert.equal(clamped, 1)
})

test('clampDepth never exceeds MAX_DEPTH', () => {
  // Build a flat list where prev node is at depth MAX_DEPTH
  const flat = flattenTree(THREE_LEVEL)
  // Override a node depth to MAX_DEPTH for testing
  const deepFlat = [{ ...flat[0], depth: MAX_DEPTH }]
  const clamped = clampDepth(MAX_DEPTH + 5, deepFlat, 1)
  assert.ok(clamped <= MAX_DEPTH)
})

test('clampDepth clamps negative to 0', () => {
  const flat = flattenTree(THREE_LEVEL)
  const clamped = clampDepth(-3, flat, 1)
  assert.equal(clamped, 0)
})

// --- moveFlatNodes ---

test('moveFlatNodes reorders items at same depth and preserves ids', () => {
  const tree: MenuNode[] = [
    { id: 'first', label: { vi: 'A' }, url: '/a', children: [] },
    { id: 'second', label: { vi: 'B' }, url: '/b', children: [] },
    { id: 'third', label: { vi: 'C' }, url: '/c', children: [] },
  ]
  const flat = flattenTree(tree)
  // Move index 2 (third) to index 0 at same depth 0
  const result = moveFlatNodes(flat, 2, 0, 0)
  assert.equal(result[0].id, 'third')
  assert.equal(result.length, 3)
  // All original ids present
  const ids = result.map((f) => f.id)
  assert.ok(ids.includes('first'))
  assert.ok(ids.includes('second'))
  assert.ok(ids.includes('third'))
})

test('moveFlatNodes with depth increase nests item under preceding node', () => {
  const tree: MenuNode[] = [
    { id: 'p', label: { vi: 'Parent' }, url: '/p', children: [] },
    { id: 'q', label: { vi: 'Child' }, url: '/q', children: [] },
  ]
  const flat = flattenTree(tree)
  // Move index 1 to index 1, projectedDepth=1 (nest under p)
  const result = moveFlatNodes(flat, 1, 1, 1)
  assert.equal(result[0].id, 'p')
  assert.equal(result[1].id, 'q')
  assert.equal(result[1].depth, 1)
})

test('moveFlatNodes preserves subtree relative depths', () => {
  // Move subtree (a + b + c) as a block: same positions, different projected depth clamped
  const flat = flattenTree(THREE_LEVEL)
  // Move index 0 to index 0, same depth — result should be identical order
  const result = moveFlatNodes(flat, 0, 0, 0)
  assert.equal(result.map((f) => f.id).join(','), 'a,b,c')
})

test('moveFlatNodes moves a node DOWN by one slot (regression: was a silent no-op)', () => {
  const tree: MenuNode[] = [
    { id: 'first', label: { vi: 'A' }, url: '/a', children: [] },
    { id: 'second', label: { vi: 'B' }, url: '/b', children: [] },
  ]
  const flat = flattenTree(tree)
  // Drag 'first' (idx 0) down past 'second' (idx 1) at same depth.
  const result = moveFlatNodes(flat, 0, 1, 0)
  assert.equal(result.map((f) => f.id).join(','), 'second,first')
})
