/**
 * Phase 6 — Image edit endpoint.
 *
 * Mounted at POST /api/media/:id/edit-image.
 *
 * Applies a declarative transform set (rotate, flip, crop, resize) to the
 * original R2 bytes and overwrites the SAME R2 object in place (the key
 * is `doc.prefix`, never a new key). The doc's `version` is bumped so
 * the afterRead hook appends `?v=<n>` to the public URL and busts CDN
 * caches (the `?v=` strategy assumes the Cloudflare Cache Rule that
 * varies the cache key by query string is enabled).
 *
 * This is a destructive operation (the original bytes are overwritten
 * permanently). The client is expected to confirm with the user before
 * posting.
 *
 * Tenant isolation:
 *   - tenantId is derived from doc.prefix (the second segment of the key)
 *     and the resolved bucket config must agree.
 *   - forcedKey on the upload context is validated to start with
 *     `media/<tenantId>/` (the adapter also checks this, but we double
 *     guard before issuing GetObject).
 *
 * WebP re-encode: if the tenant's `compressToWebp` is on, the transformed
 * bytes are encoded as WebP at the configured quality. The key/extension
 * is preserved (overwriting a .jpg key with WebP bytes keeps the URL
 * stable) but `doc.mimeType` and `doc.filename` are updated so the
 * grid view reflects the new content type honestly.
 */
import type { Endpoint, PayloadRequest } from 'payload'
import sharp from 'sharp'
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { resolveR2BucketForTenant } from '../lib/r2-bucket-resolver'
import { deriveR2Key } from '../lib/r2-storage-adapter'
import { maybeConvertToWebp } from '../lib/webp-on-upload'
import { resolveUploadTenantId } from '../lib/resolve-upload-tenant'
import {
  SHARED_TENANT_KEY,
  isLocalMediaUrl,
  readLocalMediaStat,
  toLocalTenantKey,
  writeLocalMedia,
} from '../lib/storage/local-media'
import { readFile } from 'node:fs/promises'

interface EditImageBody {
  rotate?: 0 | 90 | 180 | 270
  flipH?: boolean
  flipV?: boolean
  crop?: { left: number; top: number; width: number; height: number }
  resizeWidth?: number
}

const VALID_ROTATIONS = new Set([0, 90, 180, 270])

/** Upper bound on the resize target — sharp's hard limit is 32767, but a value
 *  near it lets a tiny source balloon into a huge buffer (CPU/memory DoS). Cap
 *  at a production-reasonable width. */
const MAX_RESIZE_WIDTH = 8192

function validateBody(raw: unknown): EditImageBody {
  const body = (raw ?? {}) as EditImageBody
  if (body.rotate !== undefined && !VALID_ROTATIONS.has(body.rotate)) {
    throw new Error(`Invalid rotate: ${body.rotate}. Must be one of 0|90|180|270`)
  }
  if (body.crop) {
    const c = body.crop
    if (
      typeof c.left !== 'number' ||
      typeof c.top !== 'number' ||
      typeof c.width !== 'number' ||
      typeof c.height !== 'number' ||
      !Number.isFinite(c.left) ||
      !Number.isFinite(c.top) ||
      c.width <= 0 ||
      c.height <= 0
    ) {
      throw new Error('Invalid crop: width/height must be positive and left/top finite numbers')
    }
  }
  if (
    body.resizeWidth !== undefined &&
    (typeof body.resizeWidth !== 'number' || body.resizeWidth <= 0 || body.resizeWidth > MAX_RESIZE_WIDTH)
  ) {
    throw new Error(`Invalid resizeWidth: must be between 1 and ${MAX_RESIZE_WIDTH}`)
  }
  return body
}

export const editMediaImageEndpoint: Endpoint = {
  method: 'post',
  path: '/:id/edit-image',
  handler: async (req) => {
    if (!req.user) {
      return Response.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Pull the :id from the route params (Payload puts these on req.routeData
    // for collection endpoints).
    const id = ((req as unknown as { routeData?: { params?: { id?: string } } }).routeData
      ?.params?.id)
    if (!id) {
      return Response.json({ error: 'Missing :id' }, { status: 400 })
    }

    // 1. Load the source doc
    const doc = (await req.payload.findByID({
      collection: 'media',
      id,
      depth: 0,
      overrideAccess: true,
    }).catch(() => null)) as unknown as Record<string, unknown> | null
    if (!doc) {
      return Response.json({ error: 'Media not found' }, { status: 404 })
    }
    // Storage backend: local disk (URL under /api/media/file/) or Cloudflare R2 (object key
    // `media/<tenantId>/...`, recovered from doc.prefix or the stored URL).
    const local =
      isLocalMediaUrl(doc.url) && typeof doc.filename === 'string'
        ? { tenantKey: toLocalTenantKey(doc.tenant), filename: doc.filename }
        : undefined
    const prefix = (doc.prefix as string | null | undefined) ?? deriveR2Key(doc)
    const r2Key = prefix && prefix.startsWith('media/') ? prefix : undefined
    const tenantId = local ? local.tenantKey : r2Key?.split('/')[1]
    if (!tenantId) {
      return Response.json({ error: 'Document is not stored in CMS-managed storage' }, { status: 400 })
    }

    // 1b. Authorize the CALLER against the doc's tenant. The doc was loaded with
    // overrideAccess and this endpoint writes to storage directly (bypassing Payload's
    // upload pipeline + the adapter forcedKey guard), so without this check any
    // authenticated user could overwrite another tenant's file by passing that
    // tenant's media id. resolveUploadTenantId throws when the non-super-admin
    // caller is not a member of `tenantId` (super-admins are exempt). Untenanted local
    // files (`shared`) have no tenant to check against.
    if (tenantId !== SHARED_TENANT_KEY) {
      try {
        resolveUploadTenantId({ tenant: tenantId }, req as unknown as PayloadRequest)
      } catch {
        return Response.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    // 2. Resolve the storage backend. R2 config also carries the per-site WebP toggle;
    // local-disk sites never transcode.
    let webpSettings = { compress: false, quality: 80 }
    let store: { read: () => Promise<Buffer | undefined>; write: (buf: Buffer, mime: string) => Promise<void> }
    if (local) {
      store = {
        read: async () => {
          const info = await readLocalMediaStat(local.tenantKey, local.filename)
          return info ? readFile(info.path) : undefined
        },
        write: (buf) => writeLocalMedia(local.tenantKey, local.filename, buf),
      }
    } else {
      const config = await resolveR2BucketForTenant(req as unknown as PayloadRequest, tenantId)
      if (!config || !r2Key) {
        return Response.json({ error: 'R2 not configured for this tenant' }, { status: 500 })
      }
      webpSettings = { compress: config.compressToWebp, quality: config.webpQuality }
      const client = new S3Client({
        region: 'auto',
        endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      })
      store = {
        read: async () => {
          const getResp = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: r2Key }))
          if (!getResp.Body) return undefined
          const chunks: Buffer[] = []
          for await (const chunk of getResp.Body as unknown as NodeJS.ReadableStream) {
            const c = chunk as unknown
            if (Buffer.isBuffer(c)) chunks.push(c)
            else if (c instanceof Uint8Array) chunks.push(Buffer.from(c))
            else chunks.push(Buffer.from(String(c), 'utf8'))
          }
          return Buffer.concat(chunks)
        },
        write: async (buf, mime) => {
          await client.send(
            new PutObjectCommand({ Bucket: config.bucket, Key: r2Key, Body: buf, ContentType: mime }),
          )
        },
      }
    }

    // 3. Parse + validate body
    let body: EditImageBody
    try {
      const raw = await req.json?.()
      body = validateBody(raw)
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : 'Invalid JSON' },
        { status: 400 },
      )
    }

    // 3b. Bound the crop against the known source dimensions so an out-of-range
    // rect is a clean 400 instead of an uncaught sharp `extract_area` throw that
    // would 500 and leak the image dimensions in the error text.
    if (body.crop) {
      const w = doc.width as number | undefined
      const h = doc.height as number | undefined
      const left = Math.max(0, Math.round(body.crop.left))
      const top = Math.max(0, Math.round(body.crop.top))
      const cw = Math.round(body.crop.width)
      const ch = Math.round(body.crop.height)
      if (typeof w === 'number' && typeof h === 'number' && (left + cw > w || top + ch > h)) {
        return Response.json({ error: 'Crop rect exceeds image dimensions' }, { status: 400 })
      }
    }

    // All R2 I/O and image processing run inside a single try/catch so a sharp
    // decode failure, an out-of-bounds extract, or an S3 error returns a generic
    // 500 instead of propagating the raw error (which would leak R2 keys, image
    // dimensions, or credential state to the client).
    try {
      // 4. Get original bytes
      const sourceBuffer = await store.read()
      if (!sourceBuffer) {
        return Response.json({ error: 'Empty source object' }, { status: 500 })
      }

      // 5. Apply sharp pipeline in the documented order:
      //    rotate → flop/flip → extract(crop) → resize → encode
      //    The order matters: rotation must apply before crop (the crop
      //    coordinates are in the source pixel space), resize must apply
      //    last to use the post-rotation/crop dimensions.
      let pipeline = sharp(sourceBuffer).rotate()
      if (body.rotate) {
        pipeline = pipeline.rotate(body.rotate)
      }
      if (body.flipH) pipeline = pipeline.flop()
      if (body.flipV) pipeline = pipeline.flip()
      if (body.crop) {
        // left/top are clamped to >= 0 (a negative origin throws in sharp).
        pipeline = pipeline.extract({
          left: Math.max(0, Math.round(body.crop.left)),
          top: Math.max(0, Math.round(body.crop.top)),
          width: Math.round(body.crop.width),
          height: Math.round(body.crop.height),
        })
      }
      if (body.resizeWidth && body.resizeWidth > 0) {
        pipeline = pipeline.resize({ width: Math.round(body.resizeWidth) })
      }

      // 6. WebP decision. When the tenant has WebP on, encode as WebP; the
      //    skip-if-larger guard inside maybeConvertToWebp falls back to
      //    the original format when WebP would be larger (defensive).
      const sourceMime = (doc.mimeType as string | null | undefined) ?? 'image/jpeg'
      const fileForDecision = {
        data: sourceBuffer,
        mimeType: sourceMime,
        mimetype: sourceMime,
        filename: (doc.filename as string | null | undefined) ?? 'image',
      }
      const decision = await maybeConvertToWebp({
        file: fileForDecision,
        compressToWebp: webpSettings.compress,
        webpQuality: webpSettings.quality,
      })

      // Encode the pipeline output. We need bytes for PutObject regardless
      // of whether WebP applied, so the pipeline always runs through .toBuffer
      // first, then we swap in WebP bytes if the decision said yes.
      const outFormat = decision.changed ? 'webp' : (sourceMime.split('/')[1] ?? 'jpeg')
      let outBuffer: Buffer
      let outMime: string
      let outFilename: string
      if (decision.changed) {
        // Encode pipeline to webp at the same quality decision
        outBuffer = await pipeline.webp({ quality: webpSettings.quality }).toBuffer()
        outMime = 'image/webp'
        const filenameBase = (doc.filename as string | null | undefined) ?? 'image'
        outFilename = filenameBase.replace(/\.[^./\\]+$/, '') + '.webp'
      } else {
        // Keep the original format
        const enc = outFormat === 'png' ? pipeline.png() :
                    outFormat === 'webp' ? pipeline.webp({ quality: webpSettings.quality }) :
                    outFormat === 'avif' ? pipeline.avif() :
                    pipeline.jpeg({ quality: 92 })
        outBuffer = await enc.toBuffer()
        outMime = sourceMime
        outFilename = (doc.filename as string | null | undefined) ?? 'image'
      }

      await store.write(outBuffer, outMime)

      // 8. Read the new metadata (width/height) for the doc update
      const meta = await sharp(outBuffer).metadata()
      const newVersion = ((doc.version as number | undefined) ?? 1) + 1

      // 9. Update the media doc
      const updateData: Record<string, unknown> = {
        width: meta.width ?? undefined,
        height: meta.height ?? undefined,
        filesize: outBuffer.length,
        version: newVersion,
        mimeType: outMime,
      }
      // Update filename to the new extension when the format changed (jpg
      // bytes → webp). The key/URL stays stable because the adapter wrote
      // to doc.prefix above; the filename field is what the admin UI shows.
      if (outFilename !== doc.filename) {
        updateData.filename = outFilename
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
      await (req.payload.update as Function)({
        collection: 'media',
        id,
        data: updateData,
        overrideAccess: true,
      })

      return Response.json({
        ok: true,
        id,
        version: newVersion,
        width: meta.width,
        height: meta.height,
        filesize: outBuffer.length,
        mimeType: outMime,
        url: doc.url
          ? `${doc.url as string}${(doc.url as string).includes('?') ? '&' : '?'}v=${newVersion}`
          : undefined,
      })
    } catch (err) {
      req.payload.logger?.error?.(
        `[edit-media-image] processing failed for media ${id}: ${err instanceof Error ? err.message : String(err)}`,
      )
      return Response.json({ error: 'Image processing failed' }, { status: 500 })
    }
  },
}
