/**
 * WebP-on-upload helper for the Media collection.
 *
 * Called from the Media beforeOperation hook (see src/collections/media.ts).
 * Runs server-side; uses `sharp` for the transcode, which is already registered
 * in payload.config.ts.
 *
 * Decision matrix:
 *   - Skip when the tenant's `compressToWebp` is off.
 *   - Skip when the input MIME type is not a convertible raster (svg is never
 *     converted because it isn't a raster; animated GIF is detected by
 *     `sharp(buf).metadata().pages > 1` and skipped to preserve animation).
 *   - Convert JPEG/PNG/TIFF/AVIF inputs to WebP at the configured quality.
 *   - If the WebP output is >= the input size, return the original bytes
 *     unchanged (skip-if-larger guard prevents quality regression on already-
 *     compressed inputs).
 */
import sharp from 'sharp'
import type { File } from 'payload'

/** MIME types eligible for WebP transcoding. SVG is intentionally absent. */
const CONVERTIBLE_RASTER_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/tiff',
  'image/avif',
])

export type WebpConvertDecision =
  | { changed: false; reason: 'disabled' | 'skipped-mime' | 'animated-gif' | 'larger' }
  | { changed: true; data: Buffer; mimeType: 'image/webp'; filename: string }

/**
 * Internal shape we use for the upload file — Payload's File type uses
 * `mimetype` and `name`, but Payload's middleware normalizes both into
 * `mimeType` and `filename` on the inbound file object. We accept either.
 */
type FileInput = {
  data: Buffer
  mimetype?: string
  mimeType?: string
  name?: string
  filename?: string
  size?: number
}

/** Get the file's base name (no extension) and current extension, if any. */
function splitBaseAndExt(name: string): { base: string; ext: string } {
  const m = name.match(/^(.*?)(\.[^./\\]+)?$/)
  if (!m) return { base: name, ext: '' }
  return { base: m[1] ?? name, ext: m[2] ?? '' }
}

function fileMime(file: FileInput): string | undefined {
  return file.mimeType ?? file.mimetype
}

function fileName(file: FileInput): string {
  return file.filename ?? file.name ?? 'file'
}

/**
 * Read the input buffer with sharp and report whether it is an animated GIF.
 * Returns false on any error so the caller treats the input as a still image.
 */
async function isAnimatedGif(buf: Buffer, mimeType: string | undefined): Promise<boolean> {
  if (mimeType !== 'image/gif') return false
  try {
    const meta = await sharp(buf).metadata()
    return (meta.pages ?? 0) > 1
  } catch {
    return false
  }
}

export interface MaybeConvertToWebpArgs {
  /** The original file data (Payload's File shape on uploads). */
  file: FileInput
  /** Tenant's WebP settings (from BucketConfig). */
  compressToWebp: boolean
  /** 1-100, the WebP quality. Clamped before use. */
  webpQuality: number
}

/**
 * Decide whether to transcode the upload to WebP. Returns a decision that
 * either preserves the input (`changed: false`) or replaces it with WebP
 * bytes (`changed: true`).
 *
 * Never throws. On any unexpected error during the sharp pipeline the input
 * is returned unchanged so the upload always succeeds (just without WebP).
 */
export async function maybeConvertToWebp(
  args: MaybeConvertToWebpArgs,
): Promise<WebpConvertDecision> {
  const { file, compressToWebp, webpQuality } = args

  if (!compressToWebp) return { changed: false, reason: 'disabled' }

  const mimeType = fileMime(file)
  if (!mimeType || !CONVERTIBLE_RASTER_MIMES.has(mimeType)) {
    return { changed: false, reason: 'skipped-mime' }
  }

  // Animated GIF is excluded by the rule "không convert GIF động".
  if (await isAnimatedGif(file.data, mimeType)) {
    return { changed: false, reason: 'animated-gif' }
  }

  // Clamp the quality to the [1, 100] range. A bad value silently degrades
  // to the default of 80 rather than throwing — the upload must succeed.
  const safeQuality = Math.max(1, Math.min(100, Math.round(webpQuality || 80)))

  let webpBuf: Buffer
  try {
    webpBuf = await sharp(file.data)
      // .rotate() reads EXIF orientation and applies it to the buffer
      // before encoding. Without this, JPEG uploads with EXIF rotation
      // would store the wrong orientation after transcoding.
      .rotate()
      .webp({ quality: safeQuality })
      .toBuffer()
  } catch {
    // Sharp failed (e.g. corrupt input). Return the original so the upload
    // succeeds — admin can re-upload or fix the file.
    return { changed: false, reason: 'larger' }
  }

  // Skip-if-larger guard: never store a WebP that is bigger than the input.
  // This prevents quality regression on already-compressed assets (e.g. a
  // small JPEG with low entropy can sometimes have a slightly bigger WebP
  // twin at the configured quality).
  if (webpBuf.length >= file.data.length) {
    return { changed: false, reason: 'larger' }
  }

  const { base } = splitBaseAndExt(fileName(file))
  return {
    changed: true,
    data: webpBuf,
    mimeType: 'image/webp',
    filename: `${base}.webp`,
  }
}

/**
 * Apply a WebpConvertDecision to a Payload File, mutating it in place. This
 * is the function the beforeOperation hook calls after running the decision.
 * Splitting the decision from the mutation keeps the pure decision easy to
 * unit-test.
 */
export function applyWebpDecision(
  file: FileInput,
  decision: WebpConvertDecision,
): FileInput {
  if (!decision.changed) return file
  file.data = decision.data
  // Set both spellings — Payload's inbound file uses one or the other
  // depending on where it came from. The next consumer (beforeChange hook,
  // generateFileData) reads whichever one applies.
  file.mimeType = decision.mimeType
  file.mimetype = decision.mimeType
  file.filename = decision.filename
  file.name = decision.filename
  file.size = decision.data.length
  return file
}

// Re-export for callers that need a quick mime eligibility check without
// running the full decision pipeline.
export function isConvertibleRaster(mimeType: string | undefined): boolean {
  return !!mimeType && CONVERTIBLE_RASTER_MIMES.has(mimeType)
}
