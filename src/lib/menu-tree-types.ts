/**
 * Shared type definitions for the menu tree builder.
 *
 * MenuNode is the canonical storage format saved in the `tree` json field.
 * RestMenuItem is the output shape consumed by frontend — must remain
 * byte-compatible with the legacy `items[].children[]` shape already in prod.
 *
 * Keeping types in a dedicated file (not menus.ts) so the pure transform
 * function in menu-tree-to-rest.ts can import them without pulling in any
 * Payload config (which would break unit-test isolation).
 */

/** Supported locale keys for per-node label maps. */
export type MenuLocale = 'vi' | 'en'

/**
 * A single node in the stored tree structure.
 * Nodes form an arbitrary-depth tree; children are inlined (not FK-linked)
 * so the entire tree serializes to a single JSON column.
 */
export interface MenuNode {
  /** crypto.randomUUID() generated client-side; stable across saves. */
  id: string
  /** Per-locale label map. Both keys optional — resolveLabel falls back. */
  label: { vi?: string; en?: string }
  /** Relative path or absolute URL, e.g. /ve-tau or https://... */
  url: string
  /** Nested children — arbitrary depth; Phase 1 enforces max 10 at read time. */
  children: MenuNode[]
}

/**
 * REST output shape for a single menu item.
 * Matches frontend ChildItem type from types/menu.ts:
 *   { id, label, parentId, path, uri, childItems?: { nodes: ChildItem[] } }
 *
 * We extend with `url`, `order`, and `children[]` which the legacy items array
 * also emits, so all frontend consumption patterns are satisfied by one shape.
 */
export interface RestMenuItem {
  id: string
  label: string
  url: string
  /** Relative path alias — frontend reads `.path` */
  path: string
  /** Absolute URI alias — frontend reads `.uri` */
  uri: string
  /** Sort position within the sibling list (0-based). */
  order: number
  /** Parent node id; null at the root level. */
  parentId: string | null
  /** Legacy nested shape: direct children array. */
  children: RestMenuItem[]
  /** WP-style nested shape: childItems wrapper. */
  childItems: { nodes: RestMenuItem[] }
}
