/**
 * Resolves per-tenant R2 bucket config from Sites.r2 fields.
 * R2 is ON by default; returns null (local disk) only when R2_OFF=true.
 * The account id comes from each site's r2.accountId (no global env fallback).
 * The r2 fields on Sites have access: {read: () => false} so they never
 * appear in REST responses — this resolver runs server-side only.
 */
import type { PayloadRequest } from 'payload'

export type BucketConfig = {
  bucket: string
  publicBaseUrl: string
  accessKeyId: string
  secretAccessKey: string
  /** Cloudflare account id for this tenant's R2 bucket (from Sites.r2.accountId). */
  accountId: string
  /** R2 S3-compatible endpoint: https://<accountId>.r2.cloudflarestorage.com */
  endpoint: string
  /**
   * Phase 2: per-tenant WebP-on-upload toggle. When true, the Media
   * beforeOperation hook transcodes raster uploads to WebP at `webpQuality`
   * before storage. SVG and animated GIF are always preserved as-is, and
   * the skip-if-larger guard keeps the original bytes when WebP ends up
   * bigger. Defaults to false — admins opt in per tenant.
   */
  compressToWebp: boolean
  /**
   * Phase 2: WebP quality 1-100 used by the encoder when `compressToWebp`
   * is on. Defaults to 80.
   */
  webpQuality: number
}

export async function resolveR2BucketForTenant(
  req: PayloadRequest,
  tenantId: string,
): Promise<BucketConfig | null> {
  if (process.env.R2_OFF === 'true') return null

  try {
    const site = await req.payload.findByID({
      collection: 'sites',
      id: tenantId,
      depth: 0,
      // Override field-level access so server code can read r2 credentials
      overrideAccess: true,
    })

    const r2 = (site as unknown as { r2?: Partial<BucketConfig> })?.r2
    if (!r2?.bucket || !r2?.accountId) return null

    return {
      bucket: r2.bucket,
      publicBaseUrl: r2.publicBaseUrl ?? '',
      accessKeyId: r2.accessKeyId ?? '',
      secretAccessKey: r2.secretAccessKey ?? '',
      accountId: r2.accountId,
      endpoint: `https://${r2.accountId}.r2.cloudflarestorage.com`,
      // Phase 2: WebP settings — both default off / 80 to match the admin
      // form. Cast through unknown because the loose site-doc type doesn't
      // yet include the new fields on generated types until generate:types
      // is re-run.
      compressToWebp: Boolean((r2 as unknown as { compressToWebp?: boolean }).compressToWebp),
      webpQuality: (() => {
        const q = (r2 as unknown as { webpQuality?: number }).webpQuality
        if (typeof q !== 'number' || Number.isNaN(q)) return 80
        // Clamp to the field's [1, 100] range to defend against a stale row
        // value that predates the range check.
        return Math.max(1, Math.min(100, Math.round(q)))
      })(),
    }
  } catch {
    return null
  }
}
