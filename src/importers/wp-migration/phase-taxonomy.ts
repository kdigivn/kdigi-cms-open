/**
 * Phase `taxonomy` — upsert every staged taxonomy term (categories, tags,
 * product categories and custom WordPress taxonomies), then resolve parents.
 *
 * Custom WordPress taxonomies (`genre`, `brand`, …) are stored as
 * `type: 'custom'` with the original WP taxonomy slug in `customType`, so the
 * identity of a term is `(type, customType, slug)` within one site.
 *
 * Optional deletion sweep: `staged/taxonomies/.delete-<name>.json` files
 * (`{ type, slug, customType?, reason?, skipIfReferenced? }`) remove terms the
 * editor decided not to carry over.
 */
import fs from 'fs'
import path from 'path'
import { makeLogger, staged, taxonomyIdMap, taxonomyKey, type ImportContext } from './import-context'
import type { StagedTaxonomy } from './staged-doc-types'
import { stagedDir } from './wp-migration-config'

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  return {}
}

interface DeleteDirective {
  type?: string
  slug?: string
  customType?: string
  reason?: string
  skipIfReferenced?: boolean
}

function readDeleteDirectives(ctx: ImportContext): DeleteDirective[] {
  const dir = path.join(stagedDir(ctx.cfg), 'taxonomies')
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('.delete-') && f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as DeleteDirective)
}

/** Key of a staged term in the CMS id map. */
export function stagedTermKey(term: Pick<StagedTaxonomy, 'type' | 'slug' | 'wp'>): string {
  return taxonomyKey(term.type, term.slug, term.type === 'custom' ? term.wp.taxonomy : null)
}

export async function runTaxonomyPhase(ctx: ImportContext): Promise<void> {
  const log = makeLogger('taxonomy')
  const terms = staged.taxonomies(ctx.cfg)
  if (!terms.length) {
    log('no staged taxonomies — nothing to do')
    return
  }

  // A term marked for deletion must never be upserted first and must not be
  // required to exist by the final gate — deleting it IS the intent.
  const deleteDirectives = readDeleteDirectives(ctx)
  const deletedKeys = new Set(
    deleteDirectives
      .filter((d) => d.type && d.slug)
      .map((d) => taxonomyKey(d.type as string, d.slug as string, d.customType ?? null)),
  )

  const existing = await taxonomyIdMap(ctx)
  let created = 0
  let updated = 0
  let skippedForDeletion = 0

  // Pass 1 — upsert terms (without parent, resolved after all exist)
  for (const term of terms) {
    const key = stagedTermKey(term)
    if (deletedKeys.has(key)) {
      skippedForDeletion++
      continue
    }
    const existingId = existing.get(key)
    const live: Record<string, unknown> =
      existingId && !ctx.dryRun
        ? asRecord(await ctx.payload.findByID({ collection: 'taxonomies', id: existingId, depth: 0, overrideAccess: true }))
        : {}

    const data: Record<string, unknown> = {
      type: term.type,
      name: term.name,
      slug: term.slug,
      tenant: ctx.tenantId,
    }
    if (term.type === 'custom') data.customType = term.wp.taxonomy
    if (term.description) data.description = term.description
    if (term.contentMd) data.contentMd = term.contentMd

    // Upload fields cannot receive source URLs. Keep live media when present;
    // the media phase resolves the reviewed StagedTaxonomy.openGraphImage ref.
    const seo = { ...asRecord(term.seo) }
    const openGraph = asRecord(seo.openGraph)
    const liveOpenGraph = asRecord(asRecord(live.seo).openGraph)
    if (liveOpenGraph.image) openGraph.image = liveOpenGraph.image
    else delete openGraph.image
    if (Object.keys(openGraph).length) seo.openGraph = openGraph
    if (Object.keys(seo).length) data.seo = seo

    if (ctx.dryRun) {
      log(`DRY ${existingId ? 'update' : 'create'} ${key}`)
      if (existingId) updated++
      else created++
      continue
    }
    if (existingId) {
      await ctx.payload.update({
        collection: 'taxonomies',
        id: existingId,
        data: data as never,
        depth: 0,
        overrideAccess: true,
      })
      updated++
    } else {
      const doc = await ctx.payload.create({ collection: 'taxonomies', data: data as never, overrideAccess: true })
      existing.set(key, doc.id)
      created++
    }
  }
  log(`terms — created: ${created}, updated: ${updated}, skipped (pending delete): ${skippedForDeletion} (staged total: ${terms.length})`)

  // Pass 2 — parents (WP term id → staged term → CMS id). A parent lives in the same WP taxonomy.
  const byWpId = new Map(terms.map((t) => [`${t.wp.taxonomy}:${t.wp.databaseId}`, t]))
  let parents = 0
  for (const term of terms) {
    if (!term.parentWpId) continue
    const parentTerm = byWpId.get(`${term.wp.taxonomy}:${term.parentWpId}`)
    if (!parentTerm) {
      log(`WARN ${stagedTermKey(term)}: parent term ${term.parentWpId} not staged — skipped`)
      continue
    }
    const childId = existing.get(stagedTermKey(term))
    const parentId = existing.get(stagedTermKey(parentTerm))
    if (ctx.dryRun) {
      log(`DRY parent ${stagedTermKey(term)} → ${parentTerm.slug}`)
      parents++
      continue
    }
    if (!childId || !parentId) continue
    await ctx.payload.update({
      collection: 'taxonomies',
      id: childId,
      data: { parent: parentId } as never,
      depth: 0,
      overrideAccess: true,
    })
    parents++
  }
  log(`parents resolved: ${parents}`)

  // Deletion sweep — AFTER all upserts/parents so a parent is never removed mid-run.
  let deleted = 0
  let deletedSkipped = 0
  for (const directive of deleteDirectives) {
    if (!directive.slug || !directive.type) continue
    const key = taxonomyKey(directive.type, directive.slug, directive.customType ?? null)
    const id = existing.get(key)
    if (!id) {
      log(`skip delete ${key}: not in CMS`)
      deletedSkipped++
      continue
    }
    if (ctx.dryRun) {
      log(`DRY delete ${key} (reason: ${directive.reason ?? 'unspecified'})`)
      deleted++
      continue
    }
    if (directive.skipIfReferenced) {
      const refs = await ctx.payload.find({
        collection: 'posts',
        where: { and: [{ tenant: { equals: ctx.tenantId } }, { categories: { equals: id } }] },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      if (refs.docs.length > 0) {
        log(`skip delete ${key}: still referenced by ${refs.totalDocs} post(s)`)
        deletedSkipped++
        continue
      }
    }
    await ctx.payload.delete({ collection: 'taxonomies', id, overrideAccess: true })
    log(`deleted ${key} (reason: ${directive.reason ?? 'unspecified'})`)
    deleted++
  }
  if (deleteDirectives.length) log(`delete sweep — deleted: ${deleted}, skipped: ${deletedSkipped}`)

  // Gate: every staged term that is NOT pending deletion must exist in the CMS.
  const after = await taxonomyIdMap(ctx)
  const missing = terms.filter((t) => !deletedKeys.has(stagedTermKey(t)) && !after.has(stagedTermKey(t)))
  if (!ctx.dryRun && missing.length) {
    throw new Error(`taxonomy gate: ${missing.length} staged term(s) missing in CMS: ${missing.map((t) => stagedTermKey(t)).join(', ')}`)
  }
  log('gate OK — counts match staged')
}
