/**
 * Phase 4 — Fetch from R2 reconcile endpoint.
 *
 * Mounted at POST /api/media/fetch-from-r2.
 *
 * The case this solves: a tenant has media objects in their R2 bucket
 * (uploaded out-of-band via rclone, dashboard, or another tool) that the
 * CMS database has no record of. This endpoint scans the tenant's R2 prefix,
 * diffs against the existing media docs, and creates `media` rows for the
 * missing objects — pointing at the existing R2 object, not re-PUTting
 * (which would duplicate every object under a new timestamped key).
 *
 * Per Phase 2's key convention, the folder path is encoded in the key
 * (media/<tenantId>/<folder-path?>/<file>). The endpoint walks the path
 * segments and find-or-creates the Payload `payload-folders` chain, so the
 * imported docs land in folders that match the on-disk layout.
 *
 * Tenant isolation: the ListObjectsV2 prefix filter is the authoritative
 * guard — no cross-tenant objects can be returned. The endpoint also
 * validates the resolved tenant against the caller's memberships via
 * `resolveUploadTenantId` (super-admins exempt).
 *
 * Idempotent: re-running imports nothing new. The cap is 200 objects per
 * request (per Validation Session 1) — the response reports the remainder
 * so the user can click "Fetch R2" again.
 */
import type { Endpoint, PayloadRequest, Where } from 'payload'
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  HeadObjectCommand,
  type _Object,
} from '@aws-sdk/client-s3'
import { resolveUploadTenantId, toTenantRelationshipId } from '../lib/resolve-upload-tenant'
import { resolveR2BucketForTenant } from '../lib/r2-bucket-resolver'
import {
  parseMediaKey,
  defaultAltFromFilename,
  FolderCache,
} from './fetch-media-from-r2-helpers'

/** Cap on imports per request — keep the response under a few seconds. */
const MAX_IMPORTS_PER_REQUEST = 200

/** Cap on object size to import — skip large binaries (no thumbnail read). */
const MAX_OBJECT_BYTES = 50 * 1024 * 1024 // 50 MB

interface ImportResult {
  imported: number
  skipped: number
  foldersCreated: number
  errors: string[]
  /** How many candidate objects were NOT imported this round (cap reached). */
  remainder: number
}

export const fetchMediaFromR2Endpoint: Endpoint = {
  method: 'post',
  path: '/fetch-from-r2',
  handler: async (req) => {
    // 1. Auth + tenant resolution
    if (!req.user) {
      return Response.json({ error: 'Authentication required' }, { status: 401 })
    }
    let tenantId: string | undefined
    try {
      tenantId = resolveUploadTenantId({}, req as unknown as PayloadRequest)
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : 'Tenant resolution failed' },
        { status: 403 },
      )
    }
    if (!tenantId) {
      return Response.json({ error: 'Tenant context missing' }, { status: 400 })
    }

    // Payload's relationship validator needs a NUMBER for `sites` (serial ids);
    // `tenantId` is a string. The create below previously passed the string, so
    // every import failed validation ("invalid relationships: 3 0") — see
    // toTenantRelationshipId.
    const tenant = toTenantRelationshipId(tenantId)
    if (!tenant) {
      return Response.json({ error: 'Tenant không hợp lệ' }, { status: 400 })
    }

    // 2. Resolve R2 config + S3 client
    const config = await resolveR2BucketForTenant(req as unknown as PayloadRequest, tenantId)
    if (!config) {
      return Response.json({ error: 'R2 not configured for this tenant' }, { status: 500 })
    }
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    })

    // 3. List EVERY object in the tenant's bucket (paginated). Each tenant has
    //    its own dedicated R2 bucket (confirmed product decision), so the bucket
    //    itself is the tenant boundary and a root scan cannot reach another
    //    tenant's files. This also pulls in objects that live outside the
    //    `media/<tenant>/` write convention (e.g. a `wp-content/uploads/...`
    //    archive uploaded out-of-band), recreating their folder tree from the
    //    key path.
    const prefix = ''
    const allKeys: string[] = []
    let continuationToken: string | undefined
    // Listing is the most failure-prone R2 call: a per-bucket token that grants
    // GetObject/PutObject but NOT ListBucket throws AccessDenied here, and a
    // wrong accountId/bucket throws NoSuchBucket. Without this guard the throw
    // propagates as a framework error with no readable message (the client only
    // sees a bare HTTP status). Surface the real cause as a 502 + clear message.
    try {
      do {
        const listResp = await client.send(
          new ListObjectsV2Command({
            Bucket: config.bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
            MaxKeys: 1000,
          }),
        )
        for (const obj of (listResp.Contents ?? []) as _Object[]) {
          if (!obj.Key) continue
          // Skip "directory placeholder" keys that end with '/' (some tools
          // write empty objects to materialize folders).
          if (obj.Key.endsWith('/')) continue
          allKeys.push(obj.Key)
        }
        continuationToken = listResp.IsTruncated ? listResp.NextContinuationToken : undefined
      } while (continuationToken)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      req.payload.logger?.error?.(`[fetch-media-from-r2] ListObjectsV2 failed for bucket ${config.bucket}: ${msg}`)
      return Response.json(
        {
          error:
            'Không liệt kê được R2. Kiểm tra Account ID, tên bucket, và quyền của token ' +
            '(token cần quyền liệt kê đối tượng — "Admin Read & Write" hoặc Object Read). ' +
            `Chi tiết: ${msg}`,
        },
        { status: 502 },
      )
    }

    // 4. Diff against existing media docs.
    //    NOTE: the cloud-storage plugin does NOT persist a `prefix` field here
    //    (there is no `media.prefix` column and `doc.prefix` is undefined at
    //    runtime), so we cannot query by prefix — doing so throws a Payload
    //    QueryError → HTTP 400. The queryable field that encodes the R2 object
    //    key is `url`: `<publicBaseUrl>/<key>` when a CDN base is set, or the
    //    bare key when it is not. We match on `url` and strip the base to
    //    recover each known key.
    const base = config.publicBaseUrl ? config.publicBaseUrl.replace(/\/+$/, '') : ''
    const urlPattern = base ? `${base}/${prefix}%` : `${prefix}%`
    const existing = await req.payload.find({
      collection: 'media',
      where: { url: { like: urlPattern } },
      limit: 0, // 0 = no limit in Payload — fetch every matching doc
      depth: 0,
      overrideAccess: true,
    })
    const keyFromUrl = (u: string): string =>
      base && u.startsWith(`${base}/`) ? u.slice(base.length + 1) : u
    const knownKeys = new Set(
      ((existing.docs as unknown as Array<Record<string, unknown>>) ?? [])
        .map((d) => (typeof d.url === 'string' ? keyFromUrl(d.url) : ''))
        .filter(Boolean),
    )

    const missing = allKeys.filter((k) => !knownKeys.has(k))
    const toImport = missing.slice(0, MAX_IMPORTS_PER_REQUEST)
    const remainder = Math.max(0, missing.length - toImport.length)

    const result: ImportResult = {
      imported: 0,
      skipped: 0,
      foldersCreated: 0,
      errors: [],
      remainder,
    }
    const folderCache = new FolderCache()

    // 5. Per-missing-key: find-or-create folders, then create the media doc
    // with reuseExistingKey so the adapter skips PutObject.
    for (const key of toImport) {
      try {
        const { filename, folderSegments } = parseMediaKey(key)
        if (!filename) {
          result.skipped += 1
          result.errors.push(`Skipped ${key}: cannot derive filename`)
          continue
        }

        // 5a. Find-or-create folder chain
        let parentFolderId: string | undefined
        const createdSegments: string[] = []
        for (const seg of folderSegments) {
          const pathSoFar = [...createdSegments, seg]
          const cached = folderCache.get(tenantId, pathSoFar)
          if (cached) {
            parentFolderId = cached
            createdSegments.push(seg)
            continue
          }
          // Look up by name + parent (folderType:['media'] to disambiguate
          // from any other folders collection in the future). Use `in` (not
          // `contains`): folderType is a Postgres enum column, and `contains`
          // compiles to `value ILIKE '%media%'`, for which no enum operator
          // exists — it throws `operator does not exist: enum_... ~~* unknown`.
          const andClauses: Where[] = [
            { name: { equals: seg } },
            { folderType: { in: ['media'] } },
          ]
          if (parentFolderId) {
            andClauses.push({ folder: { equals: parentFolderId } })
          } else {
            andClauses.push({ folder: { exists: false } })
          }
          const found = await req.payload.find({
            collection: 'payload-folders',
            where: { and: andClauses },
            limit: 1,
            depth: 0,
            overrideAccess: true,
          })
          let id: string
          if (found.docs.length > 0) {
            id = String(found.docs[0]!.id)
          } else {
            // Cast to a permissive create shape — the generated type for
            // payload-folders' folder field is strict about id types and
            // the parent-folder-id carries over from the lookup. We
            // intentionally use the FolderInterface shape (string id is
            // acceptable; Payload coerces to its own type at the DB layer).
            // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
            const created = await (req.payload.create as Function)({
              collection: 'payload-folders',
              data: {
                name: seg,
                folder: parentFolderId ?? null,
                folderType: ['media'],
              },
              overrideAccess: true,
            })
            id = String(created.id)
            result.foldersCreated += 1
          }
          folderCache.set(tenantId, pathSoFar, id)
          parentFolderId = id
          createdSegments.push(seg)
        }

        // 5b. Get object metadata (size, content-type) — skip too-large
        const head = await client.send(
          new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
        )
        const size = head.ContentLength ?? 0
        if (size > MAX_OBJECT_BYTES) {
          result.skipped += 1
          result.errors.push(`Skipped ${key}: too large (${size} bytes > ${MAX_OBJECT_BYTES})`)
          continue
        }
        const mimeType = head.ContentType ?? 'application/octet-stream'

        // 5c. Download the object for the payload.create call. Even for
        // non-images we need bytes — the upload pipeline computes width/
        // height/filesize from them.
        const getResp = await client.send(
          new GetObjectCommand({ Bucket: config.bucket, Key: key }),
        )
        if (!getResp.Body) {
          result.skipped += 1
          result.errors.push(`Skipped ${key}: empty body`)
          continue
        }
        const chunks: Buffer[] = []
        // ReadableStream vs Node Readable
        const stream = getResp.Body as unknown as NodeJS.ReadableStream
        for await (const chunk of stream) {
          const c = chunk as unknown
          if (Buffer.isBuffer(c)) chunks.push(c)
          else if (c instanceof Uint8Array) chunks.push(Buffer.from(c))
          else chunks.push(Buffer.from(String(c), 'utf8'))
        }
        const buffer = Buffer.concat(chunks)

        // 5d. Create the media doc with reuseExistingKey context — the
        // adapter sees this and skips PutObject, returning the existing
        // key as the doc's prefix. We cast to a permissive create shape
        // for the same reason as the folder create above (the generated
        // type's folder-field is strict about id types).
        // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
        await (req.payload.create as Function)({
          collection: 'media',
          data: {
            alt: defaultAltFromFilename(filename),
            folder: parentFolderId ?? null,
            tenant,
          },
          file: { data: buffer, name: filename, mimetype: mimeType, size: buffer.length },
          context: {
            reuseExistingKey: key,
            // tenantId is needed by the adapter's tenant-ownership check +
            // the bucket-config resolution.
            tenantId,
          },
          overrideAccess: true,
        })
        result.imported += 1
      } catch (err) {
        result.errors.push(
          `Failed to import ${key}: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }

    return Response.json(result, { status: 200 })
  },
}
