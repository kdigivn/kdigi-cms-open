/**
 * Unit tests for menu-tree-to-rest.ts
 * Runner: node --import tsx --test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { treeToRest } from './menu-tree-to-rest.js'
import type { MenuNode } from './menu-tree-types.js'

// 3-level fixture: node 'c' has empty en label (tests vi-fallback for en locale)
const THREE_LEVEL: MenuNode[] = [
  {
    id: 'a',
    label: { vi: 'Vé sản phẩm', en: 'Product Tickets' },
    url: '/ve-tau',
    children: [
      {
        id: 'b',
        label: { vi: 'Đến Côn Đảo', en: 'To Con Dao' },
        url: '/den-con-dao',
        children: [
          {
            id: 'c',
            label: { vi: 'Sóc Trăng Côn Đảo', en: '' },
            url: '/soc-trang-con-dao',
            children: [],
          },
        ],
      },
    ],
  },
]

test('null tree returns { items: [] }', () => {
  const result = treeToRest(null, 'vi')
  assert.deepEqual(result, { items: [] })
})

test('undefined tree returns { items: [] }', () => {
  const result = treeToRest(undefined, 'vi')
  assert.deepEqual(result, { items: [] })
})

test('empty array returns { items: [] }', () => {
  const result = treeToRest([], 'vi')
  assert.deepEqual(result, { items: [] })
})

test('single root node has correct fields and empty children', () => {
  const tree: MenuNode[] = [{ id: 'x', label: { vi: 'Trang chủ', en: 'Home' }, url: '/', children: [] }]
  const { items } = treeToRest(tree, 'vi')
  assert.equal(items.length, 1)
  const item = items[0]
  assert.equal(item.id, 'x')
  assert.equal(item.label, 'Trang chủ')
  assert.equal(item.url, '/')
  assert.equal(item.path, '/')
  assert.equal(item.uri, '/')
  assert.equal(item.order, 0)
  assert.equal(item.parentId, null)
  assert.deepEqual(item.children, [])
  assert.deepEqual(item.childItems, { nodes: [] })
})

test('locale vi returns vi label', () => {
  const { items } = treeToRest(THREE_LEVEL, 'vi')
  assert.equal(items[0].label, 'Vé sản phẩm')
})

test('locale en returns en label', () => {
  const { items } = treeToRest(THREE_LEVEL, 'en')
  assert.equal(items[0].label, 'Product Tickets')
})

test('locale en falls back to vi when en is empty', () => {
  const { items } = treeToRest(THREE_LEVEL, 'en')
  // node 'c' has en: '' — should fall back to vi label
  const nodeC = items[0].children[0].children[0]
  assert.equal(nodeC.id, 'c')
  assert.equal(nodeC.label, 'Sóc Trăng Côn Đảo')
})

test('both labels missing falls back to node id', () => {
  const tree: MenuNode[] = [{ id: 'fallback-id', label: {}, url: '/x', children: [] }]
  const { items } = treeToRest(tree, 'vi')
  assert.equal(items[0].label, 'fallback-id')
})

test('nested 3 levels: parentId set correctly at each level', () => {
  const { items } = treeToRest(THREE_LEVEL, 'vi')
  const root = items[0]
  assert.equal(root.parentId, null)
  const child = root.children[0]
  assert.equal(child.parentId, 'a')
  const grandchild = child.children[0]
  assert.equal(grandchild.parentId, 'b')
})

test('children[] and childItems.nodes[] are equal at every level', () => {
  const { items } = treeToRest(THREE_LEVEL, 'vi')
  const root = items[0]
  assert.deepEqual(root.children, root.childItems.nodes)
  const child = root.children[0]
  assert.deepEqual(child.children, child.childItems.nodes)
  const grandchild = child.children[0]
  assert.deepEqual(grandchild.children, grandchild.childItems.nodes)
})

test('order increments per sibling position', () => {
  const tree: MenuNode[] = [
    { id: 'first', label: { vi: 'A' }, url: '/a', children: [] },
    { id: 'second', label: { vi: 'B' }, url: '/b', children: [] },
    { id: 'third', label: { vi: 'C' }, url: '/c', children: [] },
  ]
  const { items } = treeToRest(tree, 'vi')
  assert.equal(items[0].order, 0)
  assert.equal(items[1].order, 1)
  assert.equal(items[2].order, 2)
})

test('depth cap at MAX_DEPTH=10 does not throw or infinite-loop', () => {
  // Build a 15-level deep chain
  let deepNode: MenuNode = { id: 'leaf', label: { vi: 'Leaf' }, url: '/leaf', children: [] }
  for (let i = 14; i >= 0; i--) {
    deepNode = { id: `n${i}`, label: { vi: `Level ${i}` }, url: `/l${i}`, children: [deepNode] }
  }
  // Should not throw; depth 10+ children are stripped
  assert.doesNotThrow(() => {
    const { items } = treeToRest([deepNode], 'vi')
    assert.ok(items.length > 0)
  })
})

test('unknown locale treated as vi', () => {
  const { items } = treeToRest(THREE_LEVEL, 'fr')
  assert.equal(items[0].label, 'Vé sản phẩm')
})
