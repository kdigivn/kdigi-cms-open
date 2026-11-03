/**
 * Phase `media` — create media docs from staged inventory (binary from the
 * raw mirror, sourceMediaId for idempotency), then link:
 *   - featuredImage on pages/posts/products
 *   - hero.slider on products (WooCommerce gallery)
 *   - seo.openGraph.image + seo.openGraph.twitterMeta.image on content + taxonomies
 *   - inline body images (rewritten to the CMS-hosted media URL by default, so
 *     the WordPress site can be switched off; `ctx.mediaUrls = 'source'` keeps
 *     the original source URLs instead)
 *
 * The media phase runs after content/taxonomy. Source URLs are rewritten only
 * when their host is verified for this site and their upload path identifies
 * one staged media ref. Arbitrary external images remain untouched.
 */
import { makeLogger, staged, ensureMediaDoc, findBySlugTenant, findTaxonomy, type ImportContext } from './import-context'
import { PRESERVE_SOURCE_PUBLISHED_AT } from '../../fields/sidebar-meta-fields'
import { sourcePublicHost, type SiteMigrationConfig } from './wp-migration-config'
import type { StagedMedia, StagedMediaRef, StagedTaxonomy } from './staged-doc-types'

const MEDIA_WRITE_CONTEXT = { [PRESERVE_SOURCE_PUBLISHED_AT]: true } as const

type PayloadRecord = Record<string, unknown>

function asRecord(value: unknown): PayloadRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as PayloadRecord
  return {}
}

function relationId(value: unknown): string | number | null {
  if (typeof value === 'string' || typeof value === 'number') return value
  const id = asRecord(value).id
  return typeof id === 'string' || typeof id === 'number' ? id : null
}
function sameRelationId(left: string | number | null, right: string | number | null): boolean {
  return left !== null && right !== null && String(left) === String(right)
}


export type MediaRef = StagedMediaRef | StagedMedia

export interface MediaUrlIndex {
  allowedHosts: Set<string>
  byExactUrl: Map<string, MediaRef[]>
  byPath: Map<string, MediaRef[]>
}

function hostname(value: string): string | null {
  try {
    return new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`).hostname.toLowerCase().replace(/\.$/, '')
  } catch {
    return null
  }
}

function addHostAliases(hosts: Set<string>, value: string): void {
  const host = hostname(value)
  if (!host) return
  hosts.add(host)
  hosts.add(host.startsWith('www.') ? host.slice(4) : `www.${host}`)
}

/**
 * The allowlist is deliberately derived from the migration config and this
 * site's staged media inventory. It is not a global "same basename on any
 * host" rule: another site's CDN is not accepted unless it is present in
 * this site's reviewed media inventory.
 */
export function mediaHostAliases(cfg: SiteMigrationConfig, refs: readonly MediaRef[]): Set<string> {
  const hosts = new Set<string>()
  addHostAliases(hosts, cfg.wpHost)
  addHostAliases(hosts, sourcePublicHost(cfg))
  for (const ref of refs) addHostAliases(hosts, ref.sourceUrl)
  return hosts
}

function urlParts(value: string): URL | null {
  try {
    const parsed = new URL(value)
    return /^https?:$/i.test(parsed.protocol) ? parsed : null
  } catch {
    return null
  }
}

function pathKey(url: URL): string {
  // Query and hash are intentionally excluded. CDN resizing/query parameters
  // do not change the WP upload path, while a fragment is page-local.
  return url.pathname || '/'
}

function exactKey(url: URL): string {
  return `${url.hostname.toLowerCase()}${pathKey(url)}${url.search}`
}

function pushIndex(map: Map<string, MediaRef[]>, key: string, ref: MediaRef): void {
  const refs = map.get(key)
  if (refs) refs.push(ref)
  else map.set(key, [ref])
}

export function buildMediaUrlIndex(cfg: SiteMigrationConfig, refs: readonly MediaRef[]): MediaUrlIndex {
  const index: MediaUrlIndex = {
    allowedHosts: mediaHostAliases(cfg, refs),
    byExactUrl: new Map(),
    byPath: new Map(),
  }
  for (const ref of refs) {
    const parsed = urlParts(ref.sourceUrl)
    if (!parsed) continue
    pushIndex(index.byExactUrl, exactKey(parsed), ref)
    pushIndex(index.byPath, pathKey(parsed), ref)
  }
  return index
}

function canonicalSourceRef(refs: readonly MediaRef[] | undefined): MediaRef | null {
  if (!refs?.length) return null
  let chosen = refs[0]
  let chosenId = 'wpId' in chosen ? chosen.wpId : chosen.wp.databaseId
  for (let i = 1; i < refs.length; i++) {
    const ref = refs[i]
    // Two WP attachment records may alias the very same captured resource.
    // Different source URIs sharing a path remain ambiguous.
    if (ref.sourceUrl !== chosen.sourceUrl) return null
    const id = 'wpId' in ref ? ref.wpId : ref.wp.databaseId
    if (id !== null && (chosenId === null || id < chosenId)) { chosen = ref; chosenId = id }
  }
  return chosen
}

/**
 * Resolve an image URL to a staged ref only when:
 *   1. its hostname belongs to this site's verified source/CDN hosts; and
 *   2. the upload path maps to one source resource (including attachment aliases).
 *
 * Ambiguous paths are rejected rather than silently choosing a basename match.
 * Hashes never participate in lookup, and query strings only participate in
 * the exact-host lookup before the safer unique-path fallback.
 */
export function resolveMediaRefForUrl(url: string, index: MediaUrlIndex): MediaRef | null {
  const parsed = urlParts(url)
  if (!parsed || !index.allowedHosts.has(parsed.hostname.toLowerCase())) return null
  const exact = canonicalSourceRef(index.byExactUrl.get(exactKey(parsed)))
  return exact ?? canonicalSourceRef(index.byPath.get(pathKey(parsed)))
}

function appendFragment(sourceUrl: string, targetUrl: string): string {
  const source = urlParts(sourceUrl)
  if (!source?.hash) return targetUrl
  const target = urlParts(targetUrl)
  return target?.hash ? targetUrl : `${targetUrl}${source.hash}`
}

/**
 * Rewrite Markdown image destinations (including images in Markdown tables)
 * and preserved inline HTML `<img src>` attributes. The URL itself is the
 * only replaced token, so Markdown titles and HTML attributes remain intact.
 */
export function rewriteImageUrls(
  contentMd: string,
  resolve: (sourceUrl: string) => string | null,
): { content: string; rewrittenUrls: string[] } {
  const rewrittenUrls: string[] = []

  const replace = (full: string, prefix: string, sourceUrl: string, suffix: string | number): string => {
    const targetUrl = resolve(sourceUrl)
    if (!targetUrl) return full
    rewrittenUrls.push(sourceUrl)
    const preservedSuffix = typeof suffix === 'string' ? suffix : ''
    return `${prefix}${appendFragment(sourceUrl, targetUrl)}${preservedSuffix}`
  }

  // The optional angle brackets cover Markdown destinations such as
  // ![caption](<https://cdn.example/foo.webp?size=large#hero>).
  let content = contentMd.replace(/(!\[[^\]]*\]\(\s*<?)(https?:\/\/[^\s)>]+)(>?)/gi, replace)
  content = content.replace(/(<img\b[^>]*?\bsrc\s*=\s*["'])(https?:\/\/[^"']+)(["'])/gi, replace)
  content = content.replace(/(<img\b[^>]*?\bsrc\s*=\s*)(https?:\/\/[^\s>]+)(?=[\s>])/gi, replace)
  return { content, rewrittenUrls }
}

function imageUrls(contentMd: string): string[] {
  const urls: string[] = []
  const collect = (_full: string, _prefix: string, sourceUrl: string) => {
    urls.push(sourceUrl)
    return _full
  }
  // Parse the three supported image syntaxes below without broad URL replacements.
  contentMd.replace(/(!\[[^\]]*\]\(\s*<?)(https?:\/\/[^\s)>]+)(>?)/gi, collect)
  contentMd.replace(/(<img\b[^>]*?\bsrc\s*=\s*["'])(https?:\/\/[^"']+)(["'])/gi, collect)
  contentMd.replace(/(<img\b[^>]*?\bsrc\s*=\s*)(https?:\/\/[^\s>]+)(?=[\s>])/gi, collect)
  return [...new Set(urls)]
}

async function resolveBodyImages(
  ctx: ImportContext,
  body: string,
  index: MediaUrlIndex,
  altFallback: string,
): Promise<{ content: string; known: number; unresolved: number }> {
  const refsByUrl = new Map<string, MediaRef>()
  for (const url of imageUrls(body)) {
    const ref = resolveMediaRefForUrl(url, index)
    if (ref) refsByUrl.set(url, ref)
  }
  if (!refsByUrl.size) return { content: body, known: 0, unresolved: 0 }

  const replacementByUrl = new Map<string, string>()
  let unresolved = 0
  for (const [sourceUrl, ref] of refsByUrl) {
    const mediaId = await ensureMediaDoc(ctx, ref, ('alt' in ref && ref.alt) || altFallback)
    if (!mediaId) {
      if (!ctx.dryRun) unresolved++
      continue
    }
    // Host aliases (e.g. a CDN or backend host) are normalized to the canonical
    // source URL; with mediaUrls='cms' (default) the URL then points at the
    // CMS-hosted copy so the content no longer depends on the WordPress site.
    let target = ref.sourceUrl
    if ((ctx.mediaUrls ?? 'cms') === 'cms') {
      const media = asRecord(await ctx.payload.findByID({ collection: 'media', id: mediaId, depth: 0, overrideAccess: true }))
      if (typeof media.url === 'string' && media.url) target = media.url
    }
    replacementByUrl.set(sourceUrl, target)
  }

  const rewritten = rewriteImageUrls(body, (url) => replacementByUrl.get(url) ?? null)
  return { content: rewritten.content, known: refsByUrl.size, unresolved }
}

function mediaRelationPatch(options: { openGraphImageId?: string | number }): PayloadRecord {
  const patch: PayloadRecord = {}
  if (options.openGraphImageId !== undefined) {
    // Sparse writes let Payload preserve sibling fields and localized values.
    // Spreading a default-locale read can copy fallback text into another locale.
    patch.seo = { openGraph: { image: options.openGraphImageId, twitterMeta: { image: options.openGraphImageId } } }
  }
  return patch
}

interface TaxonomyMediaResult {
  updated: number
  failures: number
}

async function resolveTaxonomyMedia(
  ctx: ImportContext,
  terms: readonly StagedTaxonomy[],
  index: MediaUrlIndex,
  log: (msg: string) => void,
): Promise<TaxonomyMediaResult> {
  let updated = 0
  let failures = 0

  for (const term of terms) {
    const openGraphImage = term.openGraphImage
    const hasBodyImages = Boolean(term.contentMd && imageUrls(term.contentMd).some((url) => resolveMediaRefForUrl(url, index)))
    if (!openGraphImage && !hasBodyImages) continue

    const taxonomyId = await findTaxonomy(ctx, term.type, term.slug)
    if (!taxonomyId) {
      log(`ERROR taxonomy media target missing ${term.type}/${term.slug}`)
      failures++
      continue
    }

    const live: Record<string, unknown> = ctx.dryRun
      ? {}
      : asRecord(await ctx.payload.findByID({ collection: 'taxonomies', id: taxonomyId, depth: 0, overrideAccess: true }))
    const data: PayloadRecord = {}
    let openGraphImageId: string | number | undefined
    let changed = false

    const resolveRef = async (ref: MediaRef, label: string): Promise<string | number | null> => {
      try {
        const mediaId = await ensureMediaDoc(ctx, ref, `${term.name} ${label}`)
        if (!mediaId && !ctx.dryRun) {
          failures++
          log(`ERROR taxonomy ${term.type}/${term.slug} ${label} unresolved: ${ref.sourceUrl}`)
        }
        return mediaId
      } catch (err) {
        failures++
        log(`ERROR taxonomy ${term.type}/${term.slug} ${label}: ${err instanceof Error ? err.message : err}`)
        return null
      }
    }

    if (openGraphImage) {
      const mediaId = await resolveRef(openGraphImage, 'openGraphImage')
      if (mediaId !== null) {
        openGraphImageId = mediaId
        const liveOpenGraph = asRecord(asRecord(live.seo).openGraph)
        changed = changed ||
          !sameRelationId(relationId(liveOpenGraph.image), mediaId) ||
          !sameRelationId(relationId(asRecord(liveOpenGraph.twitterMeta).image), mediaId)
      } else if (ctx.dryRun) {
        log(`DRY taxonomy ${term.type}/${term.slug} openGraphImage ← ${openGraphImage.sourceUrl}`)
      }
    }

    if (hasBodyImages && term.contentMd) {
      const sourceBody = typeof live.contentMd === 'string' ? live.contentMd : term.contentMd
      const body = await resolveBodyImages(ctx, sourceBody, index, term.name)
      if (body.unresolved) {
        failures += body.unresolved
        log(`ERROR taxonomy ${term.type}/${term.slug}: ${body.unresolved} inline image link(s) unresolved`)
      }
      if (body.known && (body.content !== sourceBody || ctx.dryRun)) {
        data.contentMd = body.content
        changed = true
      }
    }

    Object.assign(data, mediaRelationPatch({ openGraphImageId }))
    if (!ctx.dryRun && changed) {
      await ctx.payload.update({
        collection: 'taxonomies',
        id: taxonomyId,
        // Payload's generated collection union cannot express this sparse,
        // relationship-only update; the runtime shape is intentionally narrow.
        data: data as never,
        depth: 0,
        overrideAccess: true,
        context: MEDIA_WRITE_CONTEXT,
      })
      updated++
    } else if (ctx.dryRun && changed) {
      updated++
    }
  }
  return { updated, failures }
}

export async function runMediaPhase(ctx: ImportContext): Promise<void> {
  const log = makeLogger('media')
  const mediaRefs = staged.media(ctx.cfg)
  const mediaIndex = buildMediaUrlIndex(ctx.cfg, mediaRefs)

  // 1) media inventory
  let created = 0
  let existed = 0
  let failed = 0
  for (const m of mediaRefs) {
    try {
      // site-scoped: WP attachment ids are only unique within one WP install
      const before = ctx.dryRun ? null : await ctx.payload.find({
        collection: 'media',
        where: { and: [{ sourceMediaId: { equals: String(m.wp.databaseId) } }, { tenant: { equals: ctx.tenantId } }] },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      if (before?.docs?.length) {
        existed++
        continue
      }
      await ensureMediaDoc(ctx, m, m.alt)
      created++
      if (created % 50 === 0) log(`…${created} media created`)
    } catch (err) {
      log(`ERROR media wp:${m.wp.databaseId} ${m.sourceUrl}: ${err instanceof Error ? err.message : err}`)
      failed++
    }
  }
  log(`inventory — created: ${created}, existed: ${existed}, failed: ${failed}`)

  let linkFailures = 0

  // 2) featuredImage links
  for (const collection of ['pages', 'posts', 'products'] as const) {
    let linked = 0
    let missing = 0
    for (const doc of staged[collection](ctx.cfg)) {
      if (!doc.featuredImage?.sourceUrl) continue
      try {
        const mediaId = await ensureMediaDoc(ctx, doc.featuredImage, doc.title)
        if (!mediaId) {
          if (!ctx.dryRun) {
            missing++
            linkFailures++
          }
          continue
        }
        const docId = await findBySlugTenant(ctx, collection, doc.slug)
        if (!docId) {
          missing++
          linkFailures++
          continue
        }
        if (!ctx.dryRun) {
          const live = asRecord(await ctx.payload.findByID({ collection, id: docId, depth: 0, overrideAccess: true }))
          if (!sameRelationId(relationId(live.featuredImage), mediaId)) {
            await ctx.payload.update({
              collection,
              id: docId,
              data: { featuredImage: mediaId } as never,
              depth: 0,
              overrideAccess: true,
              context: MEDIA_WRITE_CONTEXT,
            })
          }
        }
        linked++
      } catch (err) {
        log(`ERROR featuredImage ${collection}/${doc.slug}: ${err instanceof Error ? err.message : err}`)
        missing++
        linkFailures++
      }
    }
    log(`${collection} featuredImage — linked: ${linked}, missing: ${missing}`)
  }

  // Content social images are explicit source refs, not always featured images.
  for (const collection of ['pages', 'posts', 'products'] as const) {
    for (const doc of staged[collection](ctx.cfg)) {
      if (!doc.openGraphImage) continue
      try {
        const mediaId = await ensureMediaDoc(ctx, doc.openGraphImage, `${doc.title} social image`)
        const docId = await findBySlugTenant(ctx, collection, doc.slug)
        if (!mediaId || !docId) {
          if (!ctx.dryRun) linkFailures++
          continue
        }
        if (ctx.dryRun) continue
        const live = asRecord(await ctx.payload.findByID({ collection, id: docId, depth: 0, overrideAccess: true }))
        const graph = asRecord(asRecord(live.seo).openGraph)
        if (sameRelationId(relationId(graph.image), mediaId) &&
          sameRelationId(relationId(asRecord(graph.twitterMeta).image), mediaId)) continue
        await ctx.payload.update({
          collection,
          id: docId,
          data: mediaRelationPatch({ openGraphImageId: mediaId }) as never,
          depth: 0,
          overrideAccess: true,
          context: MEDIA_WRITE_CONTEXT,
        })
      } catch (err) {
        linkFailures++
        log(`ERROR social image ${collection}/${doc.slug}: ${err instanceof Error ? err.message : err}`)
      }
    }
  }

  // 3) product hero sliders
  let sliders = 0
  for (const product of staged.products(ctx.cfg)) {
    if (!product.gallery.length) continue
    try {
      const items: Array<{ image: string | number }> = []
      let missingSlide = false
      for (const ref of product.gallery) {
        const id = await ensureMediaDoc(ctx, ref, `${product.title} slide`)
        if (id) items.push({ image: id })
        else if (!ctx.dryRun) {
          missingSlide = true
          linkFailures++
        }
      }
      if (missingSlide) continue
      if (ctx.dryRun) {
        sliders++
        continue
      }
      if (!items.length) continue
      const docId = await findBySlugTenant(ctx, 'products', product.slug)
      if (!docId) {
        linkFailures++
        continue
      }
      const existing = asRecord(await ctx.payload.findByID({ collection: 'products', id: docId, depth: 0, overrideAccess: true }))
      const existingHero = asRecord(existing.hero)
      const liveSlider = Array.isArray(existingHero.slider) ? existingHero.slider : []
      const sliderUnchanged =
        liveSlider.length === items.length &&
        liveSlider.every((entry, index) => sameRelationId(relationId(asRecord(entry).image), items[index]?.image ?? null))
      if (sliderUnchanged) {
        sliders++
        continue
      }
      await ctx.payload.update({
        collection: 'products',
        id: docId,
        data: { hero: { ...asRecord(existing.hero), slider: items } } as never,
        depth: 0,
        overrideAccess: true,
        context: MEDIA_WRITE_CONTEXT,
      })
      sliders++
      log(`slider products/${product.slug} → ${items.length} slides`)
    } catch (err) {
      log(`ERROR slider products/${product.slug}: ${err instanceof Error ? err.message : err}`)
      linkFailures++
    }
  }
  log(`sliders set: ${sliders}`)

  const taxonomyResult = await resolveTaxonomyMedia(ctx, staged.taxonomies(ctx.cfg), mediaIndex, log)
  linkFailures += taxonomyResult.failures
  log(`taxonomy media — updated: ${taxonomyResult.updated}`)

  let rewritten = 0
  let unresolved = 0
  for (const collection of ['pages', 'posts', 'products'] as const) {
    for (const doc of staged[collection](ctx.cfg)) {
      const known = imageUrls(doc.contentMd).some((url) => resolveMediaRefForUrl(url, mediaIndex))
      if (!known) continue

      const docId = await findBySlugTenant(ctx, collection, doc.slug)
      if (!docId) {
        if (ctx.dryRun) {
          log(`DRY inline images of ${collection}/${doc.slug} (not imported yet) would be rewritten`)
          continue
        }
        linkFailures++
        log(`ERROR inline image target missing ${collection}/${doc.slug}`)
        continue
      }
      const live = asRecord(await ctx.payload.findByID({ collection, id: docId, depth: 0, overrideAccess: true }))
      const liveBody = typeof live.contentMd === 'string' ? live.contentMd : ''
      const result = await resolveBodyImages(ctx, liveBody, mediaIndex, doc.title)
      unresolved += result.unresolved
      if (result.unresolved) {
        linkFailures += result.unresolved
        log(`ERROR inline image unresolved ${collection}/${doc.slug}: ${result.unresolved} link(s)`)
      }
      const changed = result.content !== liveBody || (ctx.dryRun && result.known > 0)
      if (changed && !ctx.dryRun) {
        await ctx.payload.update({
          collection,
          id: docId,
          data: { contentMd: result.content } as never,
          depth: 0,
          overrideAccess: true,
          context: MEDIA_WRITE_CONTEXT,
        })
      }
      if (changed) rewritten++
    }
  }
  log(`inline URL rewrite — docs rewritten: ${rewritten}, unresolved: ${unresolved}`)

  if (!ctx.dryRun && (failed || linkFailures)) {
    throw new Error(`media phase finished with ${failed} failed binary import(s) and ${linkFailures} failed required media link(s)`)
  }
}
