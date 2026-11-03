/**
 * Intrinsic `width`/`height` for content `<img>` tags.
 *
 * Markdown images (`![alt](url)`) carry no size, so the rendered HTML had
 * `loading="lazy"` images with 0×0 layout boxes. The page height only settled
 * after the images loaded, shifting everything below by thousands of pixels:
 * `#comments-section` scrolled to a position that was no longer the comments,
 * and below-the-fold two-column image tables looked broken. WordPress emitted
 * the attributes, so migrated pages regressed. The media library already knows
 * every image's size; this reattaches it to the rendered HTML (REST only, never
 * persisted — the Markdown stays the source of truth).
 */
import type { Payload } from 'payload'

export interface ImageSize {
  width: number
  height: number
}

const IMG_TAG = /<img\b[^>]*>/gi
const hasAttr = (tag: string, name: string) => new RegExp(`\\s${name}\\s*=`, 'i').test(tag)
const srcOf = (tag: string) => tag.match(/\ssrc\s*=\s*"([^"]*)"/i)?.[1]

/** Add width/height to every `<img>` that lacks both and whose src has a known size. */
export function injectImageDimensions(html: string, sizes: ReadonlyMap<string, ImageSize>): string {
  if (!html || sizes.size === 0) return html
  return html.replace(IMG_TAG, (tag) => {
    if (hasAttr(tag, 'width') || hasAttr(tag, 'height')) return tag
    const src = srcOf(tag)
    const size = src ? sizes.get(src) : undefined
    if (!size) return tag
    return tag.replace(/(\s*\/?>)$/, ` width="${size.width}" height="${size.height}"$1`)
  })
}

const TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { at: number; sizes: Promise<Map<string, ImageSize>> }>()

/** url -> size for every sized media doc of a tenant; one query per tenant per TTL. */
export function loadTenantImageSizes(payload: Payload, tenantId: number | string): Promise<Map<string, ImageSize>> {
  const key = String(tenantId)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.sizes

  const sizes = (async () => {
    const out = new Map<string, ImageSize>()
    const result = await payload.find({
      collection: 'media',
      where: { tenant: { equals: tenantId } },
      limit: 0,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    })
    for (const doc of result.docs as unknown as Array<Record<string, unknown>>) {
      const { width, height } = doc
      if (typeof width !== 'number' || typeof height !== 'number' || width <= 0 || height <= 0) continue
      for (const url of [doc.externalUrl, doc.url]) {
        if (typeof url === 'string' && url && !out.has(url)) out.set(url, { width, height })
      }
    }
    return out
  })()
  cache.set(key, { at: Date.now(), sizes })
  // A failed load must not be cached for the whole TTL.
  sizes.catch(() => cache.delete(key))
  return sizes
}
