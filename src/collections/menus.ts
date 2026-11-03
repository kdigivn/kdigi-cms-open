/**
 * Menus collection — navigation menu configuration per site (tenant).
 *
 * location values match MenuLocationEnum from frontend enums/menu-locations.ts:
 *   PRIMARY | SECONDARY_MENU | MOBILE_MENU | FOOTER_MENU | LOGGEDIN_ACCOUNT_MENU
 *
 * Menu item REST shape matches frontend ChildItem type from types/menu.ts:
 *   { id, label, parentId, path, uri, childItems?: { nodes: ChildItem[] } }
 *
 * Storage: the `tree` json field holds the canonical MenuNode[] structure.
 * An afterRead hook transforms it to the REST shape above on read.
 * The legacy `items` array is kept (hidden) for rollback during rollout.
 */
import type { CollectionConfig, CollectionAfterDeleteHook, CollectionAfterReadHook } from 'payload'
import { tenantScopedRead, tenantScopedWrite } from '../access/tenant-scoped'
import { triggerRevalidate, triggerRevalidateAfterDelete } from '../hooks/trigger-revalidate'
import type { MenuNode } from '../lib/menu-tree-types'
import { treeToRest } from '../lib/menu-tree-to-rest'

/**
 * Collection afterRead — projects the canonical `tree` onto the public
 * `items` key that frontend consumes, so the REST contract is
 * unchanged regardless of which key the frontend reads.
 *
 * REST-only (admin/local API keeps the raw `tree` so the Phase 2 tree-builder
 * component reads/writes the real structure via form state). When `tree` is
 * empty the legacy stored `items` array is left untouched as a rollback
 * fallback during the migration window. Runs at the collection level (not a
 * field hook) to avoid field-ordering coupling between `tree` and `items`.
 */
const projectTreeToItems: CollectionAfterReadHook = ({ doc, req }) => {
  if (req?.payloadAPI !== 'REST') return doc
  const tree = doc?.tree as MenuNode[] | null | undefined
  // Strip the raw canonical tree from REST output — it is an internal storage
  // shape (labels as {vi,en} maps), not part of the public contract.
  const { tree: _internal, ...rest } = doc
  if (!Array.isArray(tree) || tree.length === 0) return rest
  const locale = (req as { locale?: string }).locale ?? 'vi'
  try {
    return { ...rest, items: treeToRest(tree, locale).items }
  } catch {
    // Corrupt tree must never 500 a public read — fall back to the legacy
    // stored items[] array (kept for exactly this rollback path).
    return rest
  }
}

/** Render collapsed array rows with the item's own label instead of "Item 01". */
const ROW_LABEL = { RowLabel: '@/components/admin/array-row-label#ArrayRowLabel' } as const

/** Shared menu item fields — reused at root and child levels */
const menuItemFields = [
  {
    name: 'label',
    type: 'text' as const,
    required: true,
    localized: true,
  },
  {
    name: 'url',
    type: 'text' as const,
    required: true,
    admin: { description: 'Relative path or absolute URL, e.g. /ve-chung-toi' },
  },
  {
    name: 'order',
    type: 'number' as const,
    defaultValue: 0,
    admin: { description: 'Sort order within the parent level.' },
  },
]

export const Menus: CollectionConfig = {
  slug: 'menus',
  labels: {
    singular: { vi: 'Menu', en: 'Menu' },
    plural: { vi: 'Menus', en: 'Menus' },
  },
  admin: {
    useAsTitle: 'location',
    description: 'Menu điều hướng của site — mỗi document tương ứng một vị trí menu (Header, Footer, Mobile, v.v.).',
    defaultColumns: ['location', 'tenant'],
    listSearchableFields: ['location'],
    group: { vi: 'Phân loại', en: 'Taxonomy' },
  },
  access: {
    read: ({ req }) => {
      if (!req.user) return true
      return tenantScopedRead({ req })
    },
    create: tenantScopedWrite,
    update: tenantScopedWrite,
    delete: tenantScopedWrite,
  },
  hooks: {
    afterRead: [projectTreeToItems],
    // Navigation is rendered on every page: revalidate the frontend cache.
    afterChange: [triggerRevalidate],
    afterDelete: [triggerRevalidateAfterDelete as CollectionAfterDeleteHook],
  },
  fields: [
    {
      name: 'location',
      type: 'select',
      required: true,
      options: [
        { label: 'Primary', value: 'PRIMARY' },
        { label: 'Secondary', value: 'SECONDARY_MENU' },
        { label: 'Mobile', value: 'MOBILE_MENU' },
        { label: 'Footer', value: 'FOOTER_MENU' },
        { label: 'Logged-in Account Menu', value: 'LOGGEDIN_ACCOUNT_MENU' },
      ],
      admin: {
        description: 'Vị trí menu — PRIMARY là header chính, FOOTER_MENU là footer, MOBILE_MENU là menu mobile.',
      },
    },
    {
      // Canonical menu structure. Stores an arbitrary-depth MenuNode[] tree.
      // The drag-and-drop tree builder component reads and writes this field via useField.
      // Raw JSON editing is replaced by the custom Field component registered below.
      name: 'tree',
      type: 'json',
      required: false,
      admin: {
        description: 'Menu tree builder — drag to reorder, indent to nest.',
        components: {
          Field: '@/components/admin/menu-tree-field#MenuTreeField',
        },
      },
    },
    {
      // DEPRECATED — superseded by the `tree` field above.
      // Kept in schema so the DB column is preserved during the rollout window.
      // Re-enable (remove hidden:true) only if rollback is needed.
      // Do NOT delete this field until `tree` is stable on all tenants.
      name: 'items',
      type: 'array',
      admin: {
        description: 'DEPRECATED — use tree field. Hidden. Do not remove until tree is stable.',
        hidden: true,
        initCollapsed: true,
        components: ROW_LABEL,
      },
      fields: [
        ...menuItemFields,
        {
          // One level of children (Payload nested arrays can't reuse the field
          // name "children" deeper — drizzle relation name collision). WP 3-level
          // mega-menus are flattened: route labels already carry the departure.
          name: 'children',
          type: 'array',
          admin: {
            description: 'Nested child menu items (one level deep).',
            initCollapsed: true,
            components: ROW_LABEL,
          },
          fields: menuItemFields,
        },
      ],
    },
  ],
}
