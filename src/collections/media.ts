/**
 * Media collection — file uploads.
 *
 * Storage strategy (hybrid adapter, see src/lib/r2-storage-adapter.ts):
 *   - Sites with R2 credentials (Sites.r2.*) store files in their own Cloudflare R2 bucket.
 *   - Every other site stores files on local disk (MEDIA_DIR, default ./media).
 *   - R2_OFF=true forces local disk even when a site has R2 config.
 *   Tenant context is set in the beforeChange hook.
 *
 * Custom fields:
 *   - externalUrl: stores a CDN/external URL directly (used when files are hosted
 *     externally rather than uploaded to Payload storage). The afterRead hook
 *     returns this value as `url` when set, bypassing Payload's file path generation.
 */
import type { CollectionConfig, PayloadRequest } from 'payload'

import { resolveUploadTenantId, toTenantRelationshipId } from '../lib/resolve-upload-tenant'
import { hasAnyTenantOrSuperAdmin, tenantScopedDelete, tenantScopedWrite } from '../access/tenant-scoped'
import { resolveR2BucketForTenant } from '../lib/r2-bucket-resolver'
import { maybeConvertToWebp, applyWebpDecision } from '../lib/webp-on-upload'
import { stripDiacritics } from '../lib/vietnamese-text'
import { fetchMediaFromR2Endpoint } from '../endpoints/fetch-media-from-r2'
import { editMediaImageEndpoint } from '../endpoints/edit-media-image'
import { createMediaFromUrlEndpoint } from '../endpoints/create-media-from-url'

// Native Folders ship in Payload ≥3.39; this project runs 3.78.0 (see package.json).
// Typed locally because some @payloadcms/* type versions don't yet expose `folders` on CollectionConfig.
type MediaConfig = CollectionConfig & { folders?: boolean }

export const Media: MediaConfig = {
  slug: 'media',
  labels: {
    singular: { vi: 'Media', en: 'Media' },
    plural: { vi: 'Thư viện Media', en: 'Media Library' },
  },
  // Collection-level endpoints: mounted at /api/media/<path>. See
  // src/endpoints/fetch-media-from-r2.ts for the Fetch-from-R2 reconcile
  // endpoint (Phase 4) and edit-media-image.ts for the image editor
  // (Phase 6). Note: collection endpoints only work when the
  // collection has its own endpoints field, not via the global config.
  endpoints: [fetchMediaFromR2Endpoint, editMediaImageEndpoint, createMediaFromUrlEndpoint],
  admin: {
    description: 'Thư viện file — ảnh, video, tài liệu. Alt text bắt buộc để đảm bảo SEO và khả năng tiếp cận.',
    group: { vi: 'Nội dung', en: 'Content' },
    defaultColumns: ['thumbPreview', 'filename', 'alt', 'mimeType', 'filesize'],
    listSearchableFields: ['filename', 'alt'],
    components: {
      views: {
        list: {
          Component: '@/components/admin/media-grid-list-view#MediaGridListView',
        },
      },
    },
  },
  // Native folder tree sidebar — requires Payload ≥3.39; enabled on the 3.78.0 upgrade.
  folders: true,
  access: {
    // Public read: media URLs are embedded in published pages and posts.
    read: () => true,
    // SP0-R2: closes the hole where ANY authenticated user (any tenant, any role)
    // could create/update/delete ANY tenant's media through REST or the Local API.
    // `create` cannot use a Where (the row does not exist yet), so it is a boolean
    // gate; the beforeChange hook below assigns the tenant and the field-level
    // update rule keeps later reassignment to super-admins.
    create: hasAnyTenantOrSuperAdmin,
    update: tenantScopedWrite,
    delete: tenantScopedDelete,
  },
  fields: [
    {
      // UI-only column — renders thumbnail in list view via MediaThumbCell
      name: 'thumbPreview',
      type: 'ui',
      admin: {
        components: {
          Cell: '@/components/admin/media-thumb-cell#MediaThumbCell',
        },
      },
    },
    {
      name: 'alt',
      type: 'text',
      required: true,
      admin: {
        description: 'Mô tả ảnh (alt text) — quan trọng cho SEO và accessibility. Hãy mô tả nội dung ảnh.',
      },
    },
    {
      // Persisted tenant marker so the Media Library admin list can be scoped to
      // the currently selected site. Auto-populated on create from the same
      // resolution the R2 storage adapter already uses (see beforeChange below) —
      // never auto-overwritten on later updates, so an unrelated metadata edit
      // (e.g. alt text) can't silently reassign a doc's tenant. Docs created
      // before this field existed, or imported via externalUrl with no R2 key,
      // may have no tenant — they only show when no site is selected.
      name: 'tenant',
      type: 'relationship',
      relationTo: 'sites',
      hasMany: false,
      index: true,
      access: {
        // Collection-level access (above) now restricts media writes to the caller's
        // own tenants, but it deliberately allows a member to edit any doc inside
        // their tenant — including this field. Without a field-level restriction, a
        // member could move a doc to another tenant they also belong to (or, before
        // SP0-R2, to any tenant at all), undermining the Media Library's site
        // scoping. Field access only gates client-submitted values — the
        // beforeChange hook's auto-assignment on create and importer
        // `overrideAccess: true` writes are both unaffected.
        update: ({ req }) => (req.user as unknown as { role?: string } | null)?.role === 'super-admin',
      },
      admin: {
        position: 'sidebar',
        description: 'Site sở hữu file này. Tự động gán khi upload — chỉ super-admin sửa tay được.',
      },
    },
    {
      name: 'externalUrl',
      type: 'text',
      maxLength: 500,
      admin: {
        description:
          'External CDN/remote URL — set this instead of uploading a file when the ' +
          'image is hosted elsewhere. When set, the API returns this as the `url` field.',
      },
      // Reject javascript: and other non-http(s) protocols to prevent XSS
      // when this value is rendered as an href in the admin lightbox.
      //
      // SP0-R2 / RT-1: also reject URLs that point INTO this CMS's own R2
      // keyspace (`media/<tenant>/...`) unless the caller is a super-admin. The
      // value becomes the doc's public `url` (afterRead) and the R2 delete path
      // used to derive its object key from that URL, so a member could otherwise
      // aim a delete at another tenant's object. The adapter refuses such deletes
      // too — this is the input-side half of the same guard.
      validate: (value: string | null | undefined, options: { req?: PayloadRequest } = {}) => {
        if (!value) return true // optional field — empty is fine
        if (!/^https?:\/\//i.test(value)) {
          return 'URL bên ngoài phải bắt đầu bằng https:// hoặc http://'
        }
        const isSuperAdmin = options.req?.user?.role === 'super-admin'
        if (!isSuperAdmin) {
          try {
            const path = new URL(value).pathname.replace(/^\/+/, '')
            if (path.startsWith('media/')) {
              return 'Không được trỏ URL vào keyspace media/ của CMS (chỉ super-admin).'
            }
          } catch {
            return 'URL không hợp lệ'
          }
        }
        return true
      },
    },
    {
      // WordPress attachment id written by the WP importer so re-runs are idempotent
      // (src/importers/wp-migration/import-context.ts → ensureMediaDoc). Unique per site, not globally.
      name: 'sourceMediaId',
      type: 'text',
      index: true,
      maxLength: 64,
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'WordPress attachment id (set by the WP importer; used to avoid duplicates on re-import).',
      },
    },
    {
      // Phase 6: cache-bust token. Bumped on every image edit so the
      // afterRead hook can append `?v=<version>` to the URL. CDNs that
      // vary cache by query string (Cloudflare with the matching Cache
      // Rule) serve the new bytes on the next request. Hidden + readOnly
      // because the only legitimate writer is the edit-image endpoint.
      name: 'version',
      type: 'number',
      defaultValue: 1,
      admin: {
        readOnly: true,
        hidden: true,
        description: 'Cache-bust token — bump trên mỗi lần sửa ảnh để CDN trả bytes mới.',
      },
    },
  ],
  upload: true,
  hooks: {
    /**
     * Phase 2 — WebP-on-upload + folder-path context.
     *
     * Runs BEFORE Payload's `generateFileData` (which reads `req.file` to
     * compute width/height/filesize/mimeType) and before the cloud-storage
     * plugin's afterChange calls `adapter.handleUpload` → R2 `PutObject`.
     * Mutating `req.file` here is what makes Payload store the WebP bytes
     * (and the WebP-derived width/height/filesize) rather than the original
     * upload.
     *
     * The hook also resolves the upload folder chain into a slugified
     * `media/<tenantId>/<folder-path>/<ts>-<file>` key path so the
     * Fetch-from-R2 reconcile (Phase 4) can round-trip out-of-band objects
     * back into matching folders. The r2StorageAdapter reads
     * `req.context.uploadFolderPath` to assemble the final key.
     */
    beforeOperation: [
      async ({ args, operation, req }) => {
        // Only act on operations that carry a file: create (new upload) and
        // update (replace file). List/find/delete don't have req.file.
        if (operation !== 'create' && operation !== 'update') return

        const file = (req as unknown as { file?: import('payload').File }).file
        if (!file) return

        // 1. Resolve tenant + WebP config. The tenantId may be missing in
        // server-internal paths (e.g. the importer); in that case the upload
        // runs without transcoding, which is the safest default.
        const tenantId = resolveUploadTenantId(
          (args.data as Record<string, unknown> | undefined) ?? undefined,
          req,
        )
        if (!tenantId) return

        const cfg = await resolveR2BucketForTenant(req, tenantId)
        if (!cfg) return

        // 2. Transcode to WebP if the tenant has the toggle on. The decision
        // helper is pure and unit-tested separately.
        const webpDecision = await maybeConvertToWebp({
          file,
          compressToWebp: cfg.compressToWebp,
          webpQuality: cfg.webpQuality,
        })
        applyWebpDecision(file, webpDecision)
      },
    ],
    /**
     * Set tenant ID + folder-path context before file upload.
     * The r2StorageAdapter reads these to resolve per-tenant R2 bucket config
     * and to embed the folder chain in the object key.
     */
    beforeChange: [
      async ({ data, operation, req }) => {
        // The tenant is resolved transiently (explicit data.tenant from an
        // importer, the admin selected-tenant cookie, or a single-tenant user) and
        // stashed in req.context for the R2 storage adapter to pick the right bucket.
        const tenantId = resolveUploadTenantId(data as Record<string, unknown> | undefined, req)
        if (tenantId) {
          ;(req.context as Record<string, unknown>).tenantId = tenantId

          const tenantField = resolveTenantFieldValue(
            operation,
            (data as { tenant?: unknown } | undefined)?.tenant,
            tenantId,
          )
          if (tenantField !== undefined) {
            ;(data as Record<string, unknown>).tenant = tenantField
          }
        }

        // Phase 2: resolve the folder chain for the upload. Skip silently when
        // the upload has no folder (root) or when the helper cannot reach
        // Payload (server-internal paths). The r2StorageAdapter treats an
        // empty / missing uploadFolderPath as "no folder segments".
        const folderId = (data as { folder?: unknown } | undefined)?.folder
        const folderIdStr = (() => {
          if (folderId == null) return undefined
          if (typeof folderId === 'string') return folderId || undefined
          if (typeof folderId === 'number') return String(folderId)
          if (typeof folderId === 'object' && 'id' in (folderId as Record<string, unknown>)) {
            const inner = (folderId as { id: unknown }).id
            return inner == null ? undefined : String(inner)
          }
          return undefined
        })()
        if (folderIdStr) {
          const path = await resolveFolderPath(req.payload, folderIdStr)
          if (path) {
            ;(req.context as Record<string, unknown>).uploadFolderPath = path
          }
        }

        return data
      },
    ],
    /**
     * afterRead: when externalUrl is set, return it as `url` so callers don't
     * need to know about the internal field name. This lets us seed media records
     * from WP CDN URLs without needing actual file uploads.
     *
     * Phase 6 addition: when `version > 1` and the URL we are about to return
     * is owned by this CMS (not an externalUrl override), append `?v=<version>`
     * to bust CDN caches. The `?v=` strategy works on CDNs that vary cache
     * key by query string (Cloudflare with the matching Cache Rule). For
     * tenants whose CDN config strips query strings, the user must either
     * enable the rule or manually purge — see the Phase 6 plan §Success
     * Criteria for the manual verification step.
     */
    afterRead: [
      ({ doc, req: _req }) => {
        if (doc.externalUrl) {
          // Override the auto-generated Payload URL with our external CDN URL
          doc.url = doc.externalUrl
        } else {
          // Append ?v=<version> on cache-bust. version is on every doc
          // (defaultValue: 1 from the schema). Only append when version > 1
          // to keep the default URL clean.
          const version = (doc as { version?: number }).version
          if (version && version > 1 && doc.url && !doc.url.includes('?v=')) {
            doc.url = doc.url.includes('?')
              ? `${doc.url}&v=${version}`
              : `${doc.url}?v=${version}`
          }
        }
        return doc
      },
    ],
  },
}

/**
 * Decide what (if anything) the Media beforeChange hook should write into
 * `data.tenant` for this operation. Returns `undefined` when nothing should
 * be written — the caller then leaves `data.tenant` untouched.
 *
 * Rules:
 *   - Only ever fires on `create`. A later metadata-only PATCH (alt edit,
 *     move, etc.) must never silently reassign an existing doc's tenant
 *     based on whichever site happens to be selected in the admin UI at
 *     edit time.
 *   - Only fires when the caller didn't already pass an explicit tenant
 *     (e.g. an importer sets one directly).
 *   - `resolvedTenantId` (from resolveUploadTenantId) is a string that's
 *     normally a numeric Sites id, but a super-admin's malformed/stale
 *     `payload-tenant` cookie skips that resolver's membership validation —
 *     guard against writing a non-numeric value into the relationship field.
 *
 * Exported for unit testing.
 */
export function resolveTenantFieldValue(
  operation: string,
  existingTenant: unknown,
  resolvedTenantId: string,
): number | undefined {
  if (operation !== 'create' || existingTenant != null) return undefined
  // `toTenantRelationshipId` owns the numeric guard: `Number('')` is 0, not NaN,
  // so an empty string must not become a bogus "tenant 0", and Sites ids are a
  // Postgres serial (1-indexed) so require > 0.
  return toTenantRelationshipId(resolvedTenantId)
}

/**
 * Walk up the parent chain of a Payload folder and return a slash-joined
 * slugified path string, e.g. `promos/summer-2024`. Returns `undefined`
 * when the folder cannot be resolved — the caller treats that as "no
 * folder segments" (root-level upload).
 *
 * Used by the beforeChange hook to populate `req.context.uploadFolderPath`
 * so the r2StorageAdapter can embed the folder chain in the object key.
 *
 * Exported for unit testing.
 */
export async function resolveFolderPath(
  payload: import('payload').Payload,
  folderId: string,
): Promise<string | undefined> {
  // Cap the walk depth at a sensible upper bound (8 levels) to defend
  // against a misconfigured cycle in the folder graph.
  const MAX_DEPTH = 8
  const segments: string[] = []
  let currentId: string | undefined = folderId
  let depth = 0
  const seen = new Set<string>()
  while (currentId && depth < MAX_DEPTH) {
    if (seen.has(currentId)) return undefined // cycle — bail
    seen.add(currentId)
    let folder: Record<string, unknown> | null = null
    try {
      folder = (await payload.findByID({
        collection: 'payload-folders',
        id: currentId,
        depth: 0,
        overrideAccess: true,
      })) as unknown as Record<string, unknown> | null
    } catch {
      return undefined
    }
    if (!folder) return undefined
    const name = (folder.name as string | null | undefined) ?? ''
    if (!name) return undefined
    segments.unshift(slugifySegment(name))
    const parent = folder.folder
    if (parent == null) break
    if (typeof parent === 'string') currentId = parent || undefined
    else if (typeof parent === 'number') currentId = String(parent)
    else if (typeof parent === 'object' && 'id' in (parent as Record<string, unknown>)) {
      const inner = (parent as { id: unknown }).id
      currentId = inner == null ? undefined : String(inner)
    } else {
      currentId = undefined
    }
    depth += 1
  }
  if (segments.length === 0) return undefined
  return segments.join('/')
}

/**
 * Slugify a single folder-name segment for inclusion in an R2 object key.
 *
 * Rules:
 *   - Fold Vietnamese diacritics to their base Latin letter (e.g. "Phú Quốc" -> "phu quoc").
 *   - Lowercase.
 *   - Replace anything that is not [a-z0-9-] with a single '-'.
 *   - Collapse multiple '-' into one.
 *   - Trim leading/trailing '-'.
 *   - Empty result returns the literal 'untitled' so the path is never empty.
 *
 * Folder display names keep their unicode for the admin UI — only the key
 * path is normalized to be URL/s3 safe.
 */
export function slugifySegment(name: string): string {
  const slug = stripDiacritics(name)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'untitled'
}
