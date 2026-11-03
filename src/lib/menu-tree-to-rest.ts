/**
 * Pure transform: converts the stored MenuNode tree to the REST shape
 * consumed by frontend.
 *
 * Design invariants:
 * - Zero Payload imports — safe to import in unit tests and edge runtimes.
 * - Recursion is depth-capped at MAX_DEPTH to guard against corrupted data
 *   with cycles or pathologically deep nesting.
 * - Emits BOTH `children[]` (legacy) and `childItems.nodes[]` (WP-style)
 *   at every level so all frontend consumption patterns are satisfied.
 * - `path` and `uri` alias `url` — frontend reads both field names
 *   depending on which query/component is consuming the data.
 * - locale fallback: requested locale → other locale → node id as last resort
 *   (id ensures the label is always a non-empty string, never undefined).
 */

import type { MenuLocale, MenuNode, RestMenuItem } from './menu-tree-types'

/** Maximum recursion depth — protects against corrupted or malicious data. */
const MAX_DEPTH = 10

/**
 * Resolves a node's label for the requested locale.
 * Falls back vi→en or en→vi, then uses the node id as a last-resort sentinel.
 */
function resolveLabel(node: MenuNode, locale: MenuLocale): string {
  // Guard against corrupt nodes: the `tree` json column has no DB-level schema,
  // so a node may arrive with label null/undefined. Never let that throw.
  const label = node.label ?? {}
  if (locale === 'en') {
    return label.en || label.vi || node.id
  }
  // default: vi-first
  return label.vi || label.en || node.id
}

/**
 * Recursively converts one MenuNode to a RestMenuItem.
 *
 * @param node    - source tree node
 * @param order   - position index within its sibling list
 * @param locale  - resolved display locale
 * @param parentId - parent node id; null at root level
 * @param depth   - current recursion depth (0 = root)
 */
function nodeToRest(
  node: MenuNode,
  order: number,
  locale: MenuLocale,
  parentId: string | null,
  depth: number,
): RestMenuItem {
  // Depth cap: stop recursing but still emit the node itself.
  const childItems: RestMenuItem[] =
    depth < MAX_DEPTH
      ? (node.children ?? []).map((child, i) =>
          nodeToRest(child, i, locale, node.id, depth + 1),
        )
      : []

  const label = resolveLabel(node, locale)

  return {
    id: node.id,
    label,
    url: node.url,
    path: node.url,
    uri: node.url,
    order,
    parentId,
    children: childItems,
    childItems: { nodes: childItems },
  }
}

/**
 * Entry point: converts a full menu tree to the REST items array.
 *
 * Returns `{ items: [] }` when tree is null/empty — callers can use the
 * legacy stored `items` array as fallback in that case.
 *
 * @param tree   - stored MenuNode array (root level)
 * @param locale - locale string from req.locale; defaults to 'vi'
 */
export function treeToRest(
  tree: MenuNode[] | null | undefined,
  locale: string,
): { items: RestMenuItem[] } {
  if (!tree || tree.length === 0) {
    return { items: [] }
  }

  // Normalise locale to the supported union type; fall back to 'vi'.
  const resolvedLocale: MenuLocale = locale === 'en' ? 'en' : 'vi'

  const items = tree.map((node, i) => nodeToRest(node, i, resolvedLocale, null, 0))
  return { items }
}
