/**
 * Pure utility functions for the menu tree builder.
 *
 * All functions are side-effect-free and unit-testable without React or Payload.
 * Flat/nested conversions mirror the dnd-kit official tree example pattern:
 * flatten once for rendering, unflatten after each drop commit.
 */
import type { MenuNode } from '../../lib/menu-tree-types'

/** Pixels per indent level. Must match the value in MenuTreeRow. */
export const INDENT_WIDTH = 28

/** Maximum nesting depth enforced in the UI (prevents UI overflow). */
export const MAX_DEPTH = 5

/**
 * Flat representation of one node for rendering the sortable list.
 * Not persisted — reconstructed from the nested tree on every render.
 */
export interface FlatNode {
  id: string
  depth: number
  parentId: string | null
  /** Full node reference (label, url, children). */
  node: MenuNode
}

/**
 * DFS-flatten a nested MenuNode[] into an ordered flat list.
 * Children immediately follow their parent, preserving visual tree order.
 */
export function flattenTree(
  nodes: MenuNode[],
  parentId: string | null = null,
  depth = 0,
): FlatNode[] {
  const result: FlatNode[] = []
  for (const node of nodes) {
    result.push({ id: node.id, depth, parentId, node })
    if (node.children.length > 0) {
      result.push(...flattenTree(node.children, node.id, depth + 1))
    }
  }
  return result
}

/**
 * Rebuild a nested MenuNode[] from an ordered flat list.
 * Uses the depth sequence to determine parent-child relationships:
 * each node's parent is the nearest preceding node with depth - 1.
 */
export function unflattenTree(flat: FlatNode[]): MenuNode[] {
  if (flat.length === 0) return []

  // Clone nodes to avoid mutating flat items' node.children arrays
  const cloned: MenuNode[] = flat.map((f) => ({ ...f.node, children: [] }))

  const roots: MenuNode[] = []
  // Stack of ancestors at each depth level
  const depthMap = new Map<number, MenuNode>()

  for (let i = 0; i < flat.length; i++) {
    const node = cloned[i]
    const depth = flat[i].depth

    depthMap.set(depth, node)

    if (depth === 0) {
      roots.push(node)
    } else {
      const parent = depthMap.get(depth - 1)
      if (parent) {
        parent.children.push(node)
      } else {
        // Orphan — promote to root (defensive; should not happen after validation)
        roots.push(node)
      }
    }
  }

  return roots
}

/**
 * Reorder a flat list after a drag-and-drop operation and patch depth values.
 *
 * The projected depth is computed from horizontal pointer offset by the caller
 * (Math.round(offsetLeft / INDENT_WIDTH)) and clamped before this call.
 *
 * After moving `activeIdx` to `overIdx`, the moved subtree (active node +
 * its descendants in the original flat list) is relocated as a block.
 * The depth delta (projectedDepth - activeDepth) is applied to all nodes
 * in that subtree so relative nesting within the subtree is preserved.
 */
export function moveFlatNodes(
  flat: FlatNode[],
  activeIdx: number,
  overIdx: number,
  projectedDepth: number,
): FlatNode[] {
  // Collect the subtree of the active node: active + its descendants
  const activeDepth = flat[activeIdx].depth
  const subtreeEnd = flat.findIndex(
    (f, i) => i > activeIdx && f.depth <= activeDepth,
  )
  const subtreeLength = subtreeEnd === -1 ? flat.length - activeIdx : subtreeEnd - activeIdx

  const subtree = flat.slice(activeIdx, activeIdx + subtreeLength)
  const depthDelta = projectedDepth - activeDepth

  const patched = subtree.map((f) => ({
    ...f,
    depth: Math.max(0, Math.min(MAX_DEPTH, f.depth + depthDelta)),
  }))

  // Remove subtree from original, insert at target position
  const without = [...flat.slice(0, activeIdx), ...flat.slice(activeIdx + subtreeLength)]

  // Adjust overIdx for the removal offset. The +1 lands the active subtree
  // AFTER the drop target on downward moves (without it, a node dragged down
  // by one slot resolves back to its own original index — a silent no-op).
  const adjustedOver = overIdx > activeIdx ? overIdx - subtreeLength + 1 : overIdx
  const insertAt = Math.max(0, Math.min(adjustedOver, without.length))

  return [...without.slice(0, insertAt), ...patched, ...without.slice(insertAt)]
}

/**
 * Clamp the projected depth to a valid range given the item at `overIdx`
 * in the current flat list. Rules:
 *   - Min 0 (top-level)
 *   - Max: previous sibling's depth + 1 (can become child of prev, not grandchild)
 *   - Max MAX_DEPTH overall
 */
export function clampDepth(
  rawDepth: number,
  flat: FlatNode[],
  overIdx: number,
): number {
  const prevNode = flat[overIdx - 1]
  const maxAllowed = prevNode ? Math.min(prevNode.depth + 1, MAX_DEPTH) : 0
  return Math.max(0, Math.min(rawDepth, maxAllowed))
}

/**
 * Immutable deep-clone + patch of a single node by id.
 * Patches only the node's own fields (label, url) — not children.
 */
export function updateNode(
  tree: MenuNode[],
  id: string,
  patch: Partial<Pick<MenuNode, 'label' | 'url'>>,
): MenuNode[] {
  return tree.map((node) => {
    if (node.id === id) return { ...node, ...patch }
    if (node.children.length > 0) {
      return { ...node, children: updateNode(node.children, id, patch) }
    }
    return node
  })
}

/**
 * Remove a node by id. Children of the removed node are promoted
 * to the removed node's parent level (no silent data loss).
 */
export function removeNode(tree: MenuNode[], id: string): MenuNode[] {
  const result: MenuNode[] = []
  for (const node of tree) {
    if (node.id === id) {
      // Promote children in place of the removed node
      result.push(...node.children)
    } else {
      result.push({ ...node, children: removeNode(node.children, id) })
    }
  }
  return result
}

/**
 * Create a blank new node with a stable UUID.
 * crypto.randomUUID() is available in Node 18+ and all modern browsers natively.
 */
export function newNode(): MenuNode {
  return {
    id: crypto.randomUUID(),
    label: { vi: '', en: '' },
    url: '#',
    children: [],
  }
}
