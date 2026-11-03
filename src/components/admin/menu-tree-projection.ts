/**
 * Pure projection helper for live-depth previewing during drag.
 *
 * Mirrors the dnd-kit official tree example `getProjection` logic, adapted to
 * our FlatNode shape. Called on every onDragMove event so the UI can show the
 * editor exactly which depth the item will land at — BEFORE they release.
 *
 * Algorithm (why each step matters):
 *   1. dragDepth = round(offsetX / INDENT_WIDTH)
 *      — converts raw pixel offset to a discrete depth delta.
 *   2. projectedDepth = activeItem.depth + dragDepth
 *      — adds the delta to the item's current depth so dragging right nests,
 *        dragging left outdents (same feel as WordPress menus).
 *   3. maxDepth = previousItem.depth + 1
 *      — a dragged item can become AT MOST a direct child of the item above it;
 *        skipping depth levels would create orphan gaps in the tree.
 *   4. minDepth = nextItem.depth
 *      — the item must remain at least as deep as the next item because the next
 *        item might already be its child; pulling it shallower would orphan that child.
 *   5. depth = clamp(projectedDepth, minDepth, maxDepth) capped by MAX_DEPTH.
 *   6. parentId is resolved by walking backwards from (overIdx - 1) to find the
 *      first node whose depth equals (depth - 1); that node is the new parent.
 */
import type { FlatNode } from './menu-tree-utils'
import { INDENT_WIDTH, MAX_DEPTH } from './menu-tree-utils'

export interface Projection {
  depth: number
  parentId: string | null
}

/**
 * Compute projected depth and parentId for the dragged item.
 *
 * @param flat      Current flat list (un-reordered; active item still in its original slot).
 * @param activeId  Id of the item being dragged.
 * @param overId    Id of the item currently under the pointer.
 * @param dragOffsetX  Raw horizontal drag delta in pixels (e.delta.x from dnd-kit).
 * @returns Projection with clamped depth and resolved parentId, or null if ids not found.
 */
export function getProjection(
  flat: FlatNode[],
  activeId: string,
  overId: string,
  dragOffsetX: number,
): Projection | null {
  const activeIdx = flat.findIndex((f) => f.id === activeId)
  const overIdx = flat.findIndex((f) => f.id === overId)
  if (activeIdx === -1 || overIdx === -1) return null

  const activeItem = flat[activeIdx]

  // Step 1–2: translate pixel offset to projected depth
  const dragDepth = Math.round(dragOffsetX / INDENT_WIDTH)
  const projectedDepth = activeItem.depth + dragDepth

  // Step 3: maxDepth — cannot skip levels; can only be child of the item directly above
  const previousItem = flat[overIdx - 1]
  const maxDepth = previousItem ? Math.min(previousItem.depth + 1, MAX_DEPTH) : 0

  // Step 4: minDepth — cannot be shallower than the item immediately after the drop target
  // (to avoid orphaning that item if it was the active's child)
  const nextItem = flat[overIdx + 1]
  // When dragging downward, nextItem at overIdx+1 might be the active item itself —
  // skip it so we measure the real successor.
  const effectiveNext =
    nextItem && nextItem.id !== activeId ? nextItem : undefined
  const minDepth = effectiveNext ? effectiveNext.depth : 0

  // Step 5: clamp to [minDepth, maxDepth]
  const depth = Math.max(minDepth, Math.min(projectedDepth, maxDepth))

  // Step 6: resolve parentId — walk backwards from overIdx to find nearest ancestor
  // at depth (depth - 1). Excludes the active item itself from consideration.
  const parentId = resolveParentId(flat, overIdx, depth, activeId)

  return { depth, parentId }
}

/**
 * Walk backwards from `fromIdx` (exclusive) to find the first node whose depth
 * equals `targetDepth - 1`. That node becomes the new parent.
 * Returns null when depth is 0 (root level).
 */
function resolveParentId(
  flat: FlatNode[],
  fromIdx: number,
  targetDepth: number,
  skipId: string,
): string | null {
  if (targetDepth === 0) return null

  for (let i = fromIdx - 1; i >= 0; i--) {
    if (flat[i].id === skipId) continue
    if (flat[i].depth === targetDepth - 1) return flat[i].id
    // Once we hit a shallower node than target-1, stop — no valid parent exists above
    if (flat[i].depth < targetDepth - 1) break
  }

  return null
}
