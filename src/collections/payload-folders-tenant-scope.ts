/**
 * Tenant-scopes Payload's native `payload-folders` collection (the folder
 * tree backing `Media`'s `folders: true`). Wired in via `folders.collectionOverrides`
 * in payload.config.ts.
 *
 * Mirrors Media's own tenant field exactly (src/collections/media.ts): a
 * `tenant` relationship auto-assigned on create from the same resolution the
 * R2 storage adapter uses, restricted to super-admin for manual reassignment,
 * never touched on update. Without this, the folder tree/dropdown in the
 * admin Media Library showed every site's folders regardless of the selected
 * site — files were correctly scoped (see media.ts) but folder names and the
 * "move to folder" list still leaked across tenants.
 */
import type { CollectionConfig } from 'payload'

import { resolveUploadTenantId } from '../lib/resolve-upload-tenant'
import {
  hasAnyTenantOrSuperAdmin,
  tenantScopedDelete,
  tenantScopedRead,
  tenantScopedWrite,
} from '../access/tenant-scoped'
import { resolveTenantFieldValue } from './media'

export function foldersCollectionOverride({
  collection,
}: {
  collection: Omit<CollectionConfig, 'trash'>
}): Omit<CollectionConfig, 'trash'> {
  return {
    ...collection,
    // SP0-R2 / RT-5: `payload-folders` shipped with Payload's default access
    // (any authenticated user), so a member of tenant A could read, rename or
    // delete tenant B's folders — and deleting a folder runs the plugin's
    // `dissasociateAfterDelete` through the Local API with `overrideAccess`
    // default, which rewrote other tenants' media rows. Folder docs carry the
    // `tenant` field added below, so the shared predicates apply directly.
    access: {
      read: tenantScopedRead,
      create: hasAnyTenantOrSuperAdmin,
      update: tenantScopedWrite,
      delete: tenantScopedDelete,
    },
    fields: [
      ...collection.fields,
      {
        name: 'tenant',
        type: 'relationship',
        relationTo: 'sites',
        hasMany: false,
        index: true,
        access: {
          update: ({ req }) => (req.user as unknown as { role?: string } | null)?.role === 'super-admin',
        },
        admin: {
          position: 'sidebar',
          description: 'Site sở hữu folder này. Tự động gán khi tạo — chỉ super-admin sửa tay được.',
        },
      },
    ],
    hooks: {
      ...collection.hooks,
      beforeChange: [
        ...(collection.hooks?.beforeChange ?? []),
        async ({ data, operation, req }) => {
          const tenantId = resolveUploadTenantId(data as Record<string, unknown> | undefined, req)
          if (!tenantId) return data
          const tenantField = resolveTenantFieldValue(
            operation,
            (data as { tenant?: unknown } | undefined)?.tenant,
            tenantId,
          )
          if (tenantField !== undefined) {
            ;(data as Record<string, unknown>).tenant = tenantField
          }
          return data
        },
      ],
    },
  }
}
