/**
 * Shared context for the import phases: Payload instance, site id, staged
 * readers, media resolver, and dry-run aware write helpers.
 */
import { createHash } from 'crypto'
import fs from 'fs'
import path from 'path'
import type { BasePayload } from 'payload'
import { rawDir, stagedDir, type SiteMigrationConfig } from './wp-migration-config'
import type {
  StagedAuthor,
  StagedComment,
  StagedFaq,
  StagedMedia,
  StagedMediaRef,
  StagedMenu,
  StagedPage,
  StagedPost,
  StagedProduct,
  StagedSiteConfig,
  StagedTaxonomy,
} from './staged-doc-types'
export interface ImportContext {
  cfg: SiteMigrationConfig
  payload: BasePayload
  /** Payload id of the Sites doc being imported into (the `tenant` relation value on every doc). */
  tenantId: string | number
  dryRun: boolean
  log: (msg: string) => void
  /**
   * Where inline body images point after the media phase:
   * `cms` (default) → the CMS-hosted media URL (WordPress can be switched off),
   * `source` → keep the original WordPress/CDN URL.
   */
  mediaUrls?: 'cms' | 'source'
}

export function makeLogger(prefix: string): (msg: string) => void {
  return (msg) => console.log(`[${new Date().toISOString().slice(11, 19)}] [${prefix}] ${msg}`)
}

// ── Staged readers ────────────────────────────────────────────────────────────

function readStagedCollection<T>(cfg: SiteMigrationConfig, collection: string): T[] {
  const dir = path.join(stagedDir(cfg), collection)
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('.'))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as T)
}

export const staged = {
  pages: (cfg: SiteMigrationConfig) => readStagedCollection<StagedPage>(cfg, 'pages'),
  posts: (cfg: SiteMigrationConfig) => readStagedCollection<StagedPost>(cfg, 'posts'),
  products: (cfg: SiteMigrationConfig) => readStagedCollection<StagedProduct>(cfg, 'products'),
  taxonomies: (cfg: SiteMigrationConfig) => readStagedCollection<StagedTaxonomy>(cfg, 'taxonomies'),
  authors: (cfg: SiteMigrationConfig) => readStagedCollection<StagedAuthor>(cfg, 'authors'),
  media: (cfg: SiteMigrationConfig) => readStagedCollection<StagedMedia>(cfg, 'media'),
  menus: (cfg: SiteMigrationConfig) => readStagedCollection<StagedMenu>(cfg, 'menus'),
  faqs: (cfg: SiteMigrationConfig) => readStagedCollection<StagedFaq>(cfg, 'faqs'),
  site: (cfg: SiteMigrationConfig): StagedSiteConfig | null =>
    readStagedCollection<StagedSiteConfig>(cfg, 'site')[0] ?? null,
  comments: (cfg: SiteMigrationConfig) => readStagedCollection<StagedComment>(cfg, 'comments'),
}

// ── Payload lookups ───────────────────────────────────────────────────────────

export async function resolveTenantId(payload: BasePayload, site: string): Promise<string | number> {
  const result = await payload.find({
    collection: 'sites',
    where: { siteKey: { equals: site } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (!result.docs.length) throw new Error(`Site "${site}" not found — run the seed phase first`)
  return result.docs[0].id
}

/** Find a doc by slug within the current site (all site-scoped content collections). */
export async function findBySlugTenant(
  ctx: ImportContext,
  collection: 'pages' | 'posts' | 'products' | 'authors',
  slug: string,
): Promise<string | number | null> {
  const result = await ctx.payload.find({
    collection,
    where: { and: [{ slug: { equals: slug } }, { tenant: { equals: ctx.tenantId } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return result.docs.length ? result.docs[0].id : null
}

export async function findTaxonomy(
  ctx: ImportContext,
  type: string,
  slug: string,
  customType?: string,
): Promise<string | number | null> {
  const result = await ctx.payload.find({
    collection: 'taxonomies',
    where: {
      and: [
        { slug: { equals: slug } },
        { type: { equals: type } },
        { tenant: { equals: ctx.tenantId } },
        ...(type === 'custom' && customType ? [{ customType: { equals: customType } }] : []),
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return result.docs.length ? result.docs[0].id : null
}

/** Key of a taxonomy in the id map: `type:slug`, or `custom:<wpTaxonomy>:slug` for custom taxonomies. */
export function taxonomyKey(type: string, slug: string, customType?: string | null): string {
  return type === 'custom' && customType ? `custom:${customType}:${slug}` : `${type}:${slug}`
}

/** Build a taxonomyKey → CMS id map for every taxonomy already imported into this site. */
export async function taxonomyIdMap(ctx: ImportContext): Promise<Map<string, string | number>> {
  const map = new Map<string, string | number>()
  let page = 1
  for (;;) {
    const result = await ctx.payload.find({
      collection: 'taxonomies',
      where: { tenant: { equals: ctx.tenantId } },
      limit: 500,
      page,
      depth: 0,
      overrideAccess: true,
    })
    for (const doc of result.docs) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = doc as any
      map.set(taxonomyKey(d.type, d.slug, d.customType), d.id)
    }
    if (!result.hasNextPage) break
    page += 1
  }
  return map
}

// ── Media resolver ────────────────────────────────────────────────────────────

/**
 * Resolve an image URL already hosted by this CMS back to its Payload media
 * id. These URLs are the CMS's own `media.url`, not a WP-sourced
 * `sourceMediaId` — ensureMediaDoc() cannot find them, so `seo.openGraph.image`
 * must be resolved here instead of ever writing the raw URL into the upload field.
 */
export async function resolveMediaByUrl(ctx: ImportContext, url: string): Promise<string | number | null> {
  const result = await ctx.payload.find({
    collection: 'media',
    // site-scoped like every media lookup — see ensureMediaDoc
    where: { and: [{ url: { equals: url } }, { tenant: { equals: ctx.tenantId } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return result.docs[0]?.id ?? null
}

/**
 * Idempotency key stored in `media.sourceMediaId`: the WordPress attachment id
 * when known, otherwise `url:<sha1 of the source URL without query/hash>` (site
 * icons, knowledge-graph logos and OG images are referenced by URL only).
 * A filename lookup is NOT usable: Payload renames colliding uploads
 * (`logo.png` → `logo-1.png`), so a URL-only ref would be re-uploaded on every run.
 */
export function mediaSourceKey(wpId: number | string | null | undefined, sourceUrl: string): string {
  if (wpId != null) return String(wpId)
  const stable = sourceUrl.split('#')[0].split('?')[0]
  return `url:${createHash('sha1').update(stable).digest('hex')}`
}

/**
 * Ensure a media doc exists for a staged media ref. Prefers the mirrored
 * binary in raw/media/files/; falls back to fetching sourceUrl. Idempotent on
 * `sourceMediaId` (see {@link mediaSourceKey}).
 */
export async function ensureMediaDoc(
  ctx: ImportContext,
  ref: StagedMediaRef | StagedMedia,
  altFallback: string,
): Promise<string | number | null> {
  const sourceUrl = ref.sourceUrl
  if (!sourceUrl) return null
  const wpId = 'wp' in ref ? ref.wp.databaseId : ref.wpId
  const sourceKey = mediaSourceKey(wpId, sourceUrl)

  // Every lookup MUST be site-scoped: WP attachment ids are only unique
  // within one WP site, and different sites migrated from different WP
  // installs reuse the same ids (and even the same source URLs). Without the
  // tenant filter, a shared multi-site DB resolves refs to another site's
  // media — cross-site featured images and wrong-CDN links.
  const existing = await ctx.payload.find({
    collection: 'media',
    where: { and: [{ sourceMediaId: { equals: sourceKey } }, { tenant: { equals: ctx.tenantId } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (existing.docs[0]) return existing.docs[0].id

  const alt = ('alt' in ref && ref.alt) || altFallback || path.basename(sourceUrl)
  if (ctx.dryRun) {
    ctx.log(`DRY create media ← ${sourceUrl}`)
    return null
  }

  // Prefer the mirrored binary; fall back to fetching from the source.
  const relPath = sourceUrl.replace(/^https?:\/\/[^/]+\//, '')
  const localFile = path.join(rawDir(ctx.cfg), 'media', 'files', relPath)
  let buffer: Buffer
  let mimetype = ('mimeType' in ref && ref.mimeType) || ''
  if (fs.existsSync(localFile) && fs.statSync(localFile).size > 0) {
    buffer = fs.readFileSync(localFile)
  } else {
    const res = await fetch(sourceUrl, { headers: { 'User-Agent': 'kdigi-importer/1.0' } })
    if (!res.ok) throw new Error(`media fetch ${res.status} ${sourceUrl}`)
    buffer = Buffer.from(await res.arrayBuffer())
    mimetype = mimetype || res.headers.get('content-type') || ''
  }
  const name = (sourceUrl.split('/').pop() || 'image.webp').split('?')[0]
  const created = await ctx.payload.create({
    collection: 'media',
    data: {
      alt,
      // Do NOT set externalUrl here: it's documented as "instead of uploading
      // a file" (media.ts) and the afterRead hook always prefers it as `url`
      // when present — setting it alongside a real `file:` upload below would
      // permanently pin `url` to the old WP/legacy CDN instead of the file we
      // just uploaded to this site's own storage (R2 or local disk).
      sourceMediaId: sourceKey,
      tenant: ctx.tenantId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    file: { data: buffer, name, mimetype: mimetype || 'image/webp', size: buffer.length },
    overrideAccess: true,
  })
  return created.id
}
