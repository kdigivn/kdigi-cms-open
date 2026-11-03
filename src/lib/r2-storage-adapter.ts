/**
 * Hybrid media storage adapter.
 *
 *   - Site has Sites.r2 config (and R2_OFF is not "true") -> Cloudflare R2, per-tenant
 *     bucket/credentials read from the Sites collection.
 *   - Otherwise -> local disk (./media or MEDIA_DIR), served through Payload's
 *     /api/media/file/<name> route. See ./storage/local-media.ts.
 */
import type { FileData, TypeWithID, PayloadRequest } from 'payload'
import type { HandleUpload, HandleDelete, GenerateURL, StaticHandler, GeneratedAdapter, File } from '@payloadcms/plugin-cloud-storage/types'
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import type { BucketConfig } from './r2-bucket-resolver'
import { resolveR2BucketForTenant } from './r2-bucket-resolver'
import { resolveReadTenantId } from './resolve-upload-tenant'
import { isSuperAdminUser, userTenantIds, type TenantUser } from './admin-selected-tenant'
import { stripDiacritics } from './vietnamese-text'
import {
  deleteLocalMedia,
  isLocalMediaUrl,
  serveLocalMedia,
  toLocalTenantKey,
  writeLocalMedia,
} from './storage/local-media'

type R2Adapter = () => GeneratedAdapter

const s3Clients = new Map<string, S3Client>()

/**
 * Internal helper used by the staticHandler on both the trusted (context-
 * provided tenantId) and resolved (caller-tenant) paths. Resolves the bucket
 * config, builds the S3 client, and issues the 302 redirect to a signed URL.
 *
 * Exported for unit testing.
 */
export async function serveFromR2(
  req: PayloadRequest,
  tenantId: string,
  prefix: string,
): Promise<Response> {
  const config = await resolveR2BucketForTenant(req, tenantId)
  if (!config) {
    return new Response('R2 config not found', { status: 500 })
  }

  const client = getS3Client(config, config.accountId)
  // Key is the prefix as stored (bucket is the Bucket param, never part of the key).
  const key = prefix

  try {
    const command = new GetObjectCommand({ Bucket: config.bucket, Key: key })
    const signedUrl = await getSignedUrl(client, command, { expiresIn: 3600 })
    return Response.redirect(signedUrl, 302)
  } catch {
    return new Response('File not found', { status: 404 })
  }
}

function getS3Client(config: BucketConfig, accountId: string): S3Client {
  // Include accessKeyId in the cache key so two tenants that share the same
  // accountId but use different per-bucket tokens never receive each other's client.
  const key = `${accountId}:${config.accessKeyId}:${config.bucket}`
  if (s3Clients.has(key)) return s3Clients.get(key)!

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    // Bound R2 network calls. handleUpload/handleDelete run inside the media
    // create/update/delete DB transaction; a slow or unreachable bucket would
    // otherwise hold that transaction open indefinitely (idle-in-transaction →
    // Postgres kills the connection). Fail fast instead.
    requestHandler: { connectionTimeout: 5000, requestTimeout: 20000 },
    // The per-request timeouts above only bound ONE attempt — the SDK's default
    // of 3 attempts multiplies them back up to ~60s of transaction-held network
    // time on a struggling bucket. One retry is enough to ride out a transient
    // blip while keeping the worst case near the 20s request timeout.
    maxAttempts: 2,
  })
  s3Clients.set(key, client)
  return client
}

/**
 * Derive the R2 object key (`media/<tenantId>/...`) from a media doc.
 *
 * The cloud-storage plugin in this project does NOT persist a `prefix` field
 * (there is no `media.prefix` column and `doc.prefix` is undefined at runtime),
 * so the key has to be recovered from `url`, which is stored as either
 * `<publicBaseUrl>/media/<tenantId>/<file>` (CDN) or a bare `media/<tenantId>/<file>`.
 * Any `?v=` cache-bust suffix (added by the image-edit afterRead) is stripped.
 *
 * Returns undefined for external-reference docs whose url points outside our
 * `media/<tenantId>/` keyspace (e.g. a pasted remote URL or a `wp-content/...`
 * archive object) — those objects are not adapter-managed and must NOT be
 * deleted from R2 on doc delete.
 *
 * Exported for unit testing.
 */
export function deriveR2Key(doc: { prefix?: unknown; url?: unknown } | null | undefined): string | undefined {
  const stripQuery = (s: string): string => {
    const i = s.indexOf('?')
    return i === -1 ? s : s.slice(0, i)
  }
  // Future-proof: honour a real `prefix` field if one is ever persisted.
  const rawPrefix = typeof doc?.prefix === 'string' ? doc.prefix : undefined
  if (rawPrefix && rawPrefix.startsWith('media/')) return stripQuery(rawPrefix)

  const url = typeof doc?.url === 'string' ? doc.url : undefined
  if (!url) return undefined
  let path: string
  if (/^https?:\/\//i.test(url)) {
    try {
      path = new URL(url).pathname.replace(/^\/+/, '')
    } catch {
      return undefined
    }
  } else {
    path = stripQuery(url).replace(/^\/+/, '')
  }
  return path.startsWith('media/') ? path : undefined
}

/**
 * Slugify a client-supplied filename for use in an R2 object key.
 *
 * Strips any path component, folds Vietnamese diacritics to their base
 * Latin letter, lowercases, and collapses the basename to [a-z0-9-]
 * (preserving the extension verbatim, lowercased) so uploaded URLs read
 * cleanly for SEO, e.g. `Example Site.webp` -> `ve-tau-phu-quoc.webp`.
 *
 * Exported for unit testing.
 */
export function slugifyFilename(filename: string): string {
  const rawName = filename.replace(/^.*[/\\]/, '')
  const extMatch = rawName.match(/\.[a-zA-Z0-9]+$/)
  const ext = extMatch ? extMatch[0].toLowerCase() : ''
  const base = ext ? rawName.slice(0, -ext.length) : rawName
  const slug = stripDiacritics(base)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug || 'file'}${ext}`
}

/**
 * Decide which R2 object key — if any — a delete call is allowed to remove.
 *
 * Pure and exported for unit testing; `handleDelete` supplies the caller facts.
 *
 * Threat model (SP0-R2 / RT-1): the cloud-storage plugin calls `handleDelete`
 * with the **post-afterRead** document (Payload's `deleteByID` runs field
 * afterRead hooks before the afterDelete collection hooks), and Media's afterRead
 * replaces `url` with the client-writable `externalUrl`. `deriveR2Key` parses that
 * URL, so a doc whose `externalUrl` points at `media/<otherTenant>/<key>` would
 * otherwise delete another tenant's object. Rules, in order:
 *
 *   1. `externalUrl` set → never delete (the doc references an external object;
 *      any R2 bytes are left behind on purpose rather than trusting the URL).
 *   2. The key must be derivable and live under `media/<tenant>/`.
 *   3. The key's tenant must match the doc's own tenant when the doc has one.
 *   4. Internal callers (no `req.user`: clone engine, migration scripts, seeds) and
 *      super-admins may delete any tenant's key; everyone else only their own.
 */
export function resolveDeletableKey(
  doc: { url?: unknown; externalUrl?: unknown; tenant?: unknown; prefix?: unknown },
  caller: {
    /** tenant id carried in the request context (upload/replace paths) */
    contextTenantId?: string
    /** tenant ids the authenticated caller belongs to */
    memberTenantIds: string[]
    isSuperAdmin: boolean
    /** no authenticated user — server-side internal caller */
    isInternalCaller: boolean
  },
): string | undefined {
  if (typeof doc.externalUrl === 'string' && doc.externalUrl.trim()) return undefined

  const key = deriveR2Key(doc)
  if (!key) return undefined

  const keyTenant = key.split('/')[1]
  if (!keyTenant) return undefined

  const docTenant = toIdString(doc.tenant)
  if (docTenant && docTenant !== keyTenant) return undefined

  if (caller.isInternalCaller || caller.isSuperAdmin) return key

  const allowed =
    caller.contextTenantId === keyTenant || caller.memberTenantIds.includes(keyTenant)
  return allowed ? key : undefined
}

/** Normalize a relationship value (id | { id } | number) to a string id, or undefined. */
function toIdString(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
    const inner = (value as { id: unknown }).id
    return inner === null || inner === undefined || inner === '' ? undefined : String(inner)
  }
  return undefined
}

export const r2StorageAdapter: R2Adapter = () => {
  const handleUpload: HandleUpload = async ({ req, file, data }) => {
    const ctx = req.context as Record<string, unknown> | undefined
    const tenantId = ctx?.tenantId as string | undefined

    const config = tenantId ? await resolveR2BucketForTenant(req, tenantId) : null
    if (!config) {
      // No R2 for this site (or no site at all): store on local disk under the doc's site.
      // Payload keeps the default /api/media/file/<filename> URL; staticHandler serves it.
      const tenantKey = toLocalTenantKey((data as { tenant?: unknown } | undefined)?.tenant ?? tenantId)
      await writeLocalMedia(tenantKey, file.filename ?? 'file', file.buffer)
      // Nothing to persist: Payload's default URL already addresses the file.
      return {} as Partial<FileData & TypeWithID>
    }
    if (!tenantId) throw new Error('[r2-storage] unreachable: R2 config without tenant')

    // forcedKey path (Phase 6 — image edit): the caller already has a stored
    // key (doc.prefix) and wants to overwrite the same R2 object in place.
    // Validate that the key lives under the caller's tenant prefix so a
    // client-supplied value cannot escape its tenant.
    const forcedKey = ctx?.forcedKey as string | undefined
    if (forcedKey) {
      if (!forcedKey.startsWith(`media/${tenantId}/`)) {
        throw new Error(`[r2-storage] forcedKey ${forcedKey} does not belong to tenant ${tenantId}`)
      }
      const client = getS3Client(config, config.accountId)
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: forcedKey,
          Body: file.buffer,
          ContentType: file.mimeType,
        }),
      )
      return {
        prefix: forcedKey,
        url: config.publicBaseUrl ? `${config.publicBaseUrl}/${forcedKey}` : undefined,
      } as Partial<FileData & TypeWithID>
    }

    // reuseExistingKey path (Phase 4 — Fetch from R2): the bytes are already
    // in R2 under an existing key. Skip the PutObject entirely and return
    // that key as the doc's prefix, so the doc points at the already-present
    // object with no duplicate.
    const reuseExistingKey = ctx?.reuseExistingKey as string | undefined
    if (reuseExistingKey) {
      // The Fetch-from-R2 reconcile passes a key it just listed from THIS
      // tenant's own dedicated bucket (config resolved for tenantId), so the
      // bucket itself is the tenant boundary — a root scan cannot surface
      // another tenant's object. We therefore allow any key in the bucket
      // (incl. out-of-band paths like `wp-content/...`) and only reject a
      // malformed key (absolute path or traversal). Unlike forcedKey (which
      // overwrites bytes) this path writes nothing — it just registers a
      // pointer to an already-present object.
      if (reuseExistingKey.startsWith('/') || reuseExistingKey.includes('..')) {
        throw new Error(`[r2-storage] invalid reuseExistingKey: ${reuseExistingKey}`)
      }
      return {
        prefix: reuseExistingKey,
        url: config.publicBaseUrl ? `${config.publicBaseUrl}/${reuseExistingKey}` : undefined,
      } as Partial<FileData & TypeWithID>
    }

    const client = getS3Client(config, config.accountId)
    // Slugify the client-supplied filename before embedding it in the object key:
    // strip any path component, lowercase, and collapse everything but the
    // extension to [a-z0-9-] so the key is URL/SEO-friendly and cannot craft
    // unexpected key paths (e.g. "../") or break downstream key parsing.
    // No uniqueness suffix is added — same filename in the same tenant/folder
    // overwrites the existing R2 object by design.
    const safeName = slugifyFilename(file.filename ?? 'file')

    // Phase 2: embed the folder chain in the object key. The
    // beforeChange hook populates req.context.uploadFolderPath with a
    // slash-joined, slugified ancestor chain (e.g. "promos/summer-2024"),
    // or leaves it empty / undefined for root-level uploads. The format
    // is `media/<tenantId>/<folder-path?>/<safeName>` so Fetch-from-R2
    // (Phase 4) can recover the folder tree from the key alone.
    const folderPath = (ctx?.uploadFolderPath as string | undefined) ?? ''
    const folderSegment = folderPath ? `${folderPath}/` : ''
    const prefix = `media/${tenantId}/${folderSegment}${safeName}`
    // The object key is the prefix itself — the bucket is addressed via the Bucket
    // param, so it must NOT be repeated in the key. Repeating it would store the
    // object at `<bucket>/media/...` while the public CDN URL (publicBaseUrl/prefix)
    // points at `media/...`, causing every uploaded image to 404.
    const key = prefix

    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimeType,
      }),
    )

    return {
      prefix,
      url: config.publicBaseUrl ? `${config.publicBaseUrl}/${prefix}` : undefined,
    } as Partial<FileData & TypeWithID>
  }

  const handleDelete: HandleDelete = async ({ req, doc }) => {
    const docRecord = doc as {
      url?: unknown
      externalUrl?: unknown
      tenant?: unknown
      filename?: unknown
      prefix?: unknown
    }

    // External-reference docs never delete from R2 (see resolveDeletableKey rule 1).
    if (typeof docRecord.externalUrl === 'string' && docRecord.externalUrl.trim()) {
      req.payload.logger?.debug?.('[r2-storage] skip delete: doc uses externalUrl')
      return
    }

    // Local-disk files (url = Payload's /api/media/file/<filename> route): the path is derived
    // from the doc's own tenant + filename, so nothing a client supplies can point elsewhere.
    if (isLocalMediaUrl(docRecord.url) && typeof docRecord.filename === 'string') {
      await deleteLocalMedia(toLocalTenantKey(docRecord.tenant), docRecord.filename)
      return
    }

    const context = req.context as Record<string, unknown> | undefined
    const user = req.user as TenantUser | null
    const key = resolveDeletableKey(docRecord, {
      contextTenantId: typeof context?.tenantId === 'string' ? context.tenantId : undefined,
      memberTenantIds: userTenantIds(user),
      isSuperAdmin: isSuperAdminUser(user),
      isInternalCaller: !user,
    })
    if (!key) {
      // Covers "not adapter-managed" (external/foreign keyspace) and — the case this
      // guard exists for — a caller trying to delete another tenant's object.
      if (deriveR2Key(docRecord)) {
        req.payload.logger?.warn?.(
          '[r2-storage] refused R2 delete: object key is outside the caller tenant',
        )
      }
      return
    }

    // The key's tenant is authoritative and validated above (format: `media/<tenantId>/...`).
    const tenantId = key.split('/')[1]
    if (!tenantId) return

    const config = await resolveR2BucketForTenant(req, tenantId)
    if (!config) return

    const client = getS3Client(config, config.accountId)

    await client.send(
      new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }),
    )
  }

  const generateURL: GenerateURL = ({ prefix }) => {
    if (!prefix) return ''
    return prefix
  }

  const staticHandler: StaticHandler = async (req, { params }) => {
    const prefix = (req.query as Record<string, string>)?.prefix ?? ''

    // Local-disk files carry no `prefix` (that is an R2 object key): Payload's own URL is
    // /api/media/file/<filename>, and media.filename is globally unique, so the owning site is
    // one lookup away — see storage/local-media.ts. Media read access has already been
    // enforced by Payload before this handler runs.
    if (!prefix && params?.filename) {
      const found = await req.payload.find({
        collection: 'media',
        where: { filename: { equals: params.filename } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const row = found.docs[0] as { tenant?: unknown } | undefined
      if (!row) return new Response('File not found', { status: 404 })
      return serveLocalMedia(req, toLocalTenantKey(row.tenant), params.filename)
    }

    // Fast path: tenantId is pre-set in request context by an internal caller
    // (e.g. the clone engine). Trust it, but still verify the prefix matches
    // the requested tenant — a malformed prefix must not pass even on the
    // trusted path.
    const contextTenantId = (req.context as Record<string, unknown>)?.tenantId as string | undefined
    if (contextTenantId) {
      if (!prefix.startsWith(`media/${contextTenantId}/`)) {
        return new Response('Forbidden', { status: 403 })
      }
      return serveFromR2(req, contextTenantId, prefix)
    }

    // Read path: resolve the CALLER's tenant from cookie/referer/single-tenant
    // fallback, NOT from the requested prefix. The previous code derived
    // tenantId from `prefix.split('/')[1]` then checked
    // `prefix.startsWith("media/" + <derived> + "/")` — a tautology true for
    // any `media/<X>/...` prefix, which let a tenant-A user read tenant B's
    // objects by passing B's prefix. Fix: use `resolveReadTenantId` to learn
    // who the caller is, then compare.
    const callerTenantId = resolveReadTenantId(req)
    if (!callerTenantId) {
      // No tenant context at all — anonymous request with no cookie, no
      // referer hint, and no single-tenant fallback. Refuse.
      return new Response('Tenant context missing', { status: 401 })
    }

    // Super-admins are exempt from the cross-tenant check (used by the clone
    // engine and admin support flows that legitimately browse across tenants).
    const role = (req.user as unknown as { role?: string } | null)?.role
    const isSuperAdmin = role === 'super-admin'

    if (!isSuperAdmin) {
      // The candidate tenant is the one encoded in the requested object key
      // (format: `media/<tenantId>/...`). It tells us whose object the caller
      // is asking for, not whose they are. Reject if the two differ.
      if (!prefix.startsWith('media/')) {
        return new Response('Forbidden', { status: 403 })
      }
      const candidateTenantId = prefix.split('/')[1]
      if (!candidateTenantId || candidateTenantId !== callerTenantId) {
        return new Response('Forbidden', { status: 403 })
      }
    }

    // Serve from the OBJECT OWNER's bucket — the tenant encoded in the prefix —
    // not the caller's. For a non-super-admin these are identical (enforced
    // above). For a super-admin reading another tenant's object, the owner's
    // bucket is the one that actually holds the key; using the caller's bucket
    // would 404. Fall back to the caller's tenant for any non-`media/` prefix.
    const ownerTenantId = prefix.startsWith('media/') ? (prefix.split('/')[1] || callerTenantId) : callerTenantId
    return serveFromR2(req, ownerTenantId, prefix)
  }

  return {
    name: 'r2-storage',
    handleUpload,
    handleDelete,
    generateURL,
    staticHandler,
  }
}
