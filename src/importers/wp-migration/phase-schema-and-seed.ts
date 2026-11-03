/**
 * Phase `schema` — run payload migrations, then verify the enum values the
 * importer depends on actually exist (CREATE TYPE is not idempotent, so
 * verification is the gate, not the migration run).
 *
 * Phase `seed` — ensure the Sites doc exists (create-only: an existing site,
 * e.g. one with storage credentials configured, is NEVER clobbered) + upsert authors.
 */
import { spawnSync } from 'child_process'
import pg from 'pg'
import type { SiteMigrationConfig } from './wp-migration-config'
import { makeLogger, staged, findBySlugTenant, type ImportContext } from './import-context'

// ── schema ────────────────────────────────────────────────────────────────────

export async function runSchemaPhase(_cfg: SiteMigrationConfig, dryRun: boolean): Promise<void> {
  const log = makeLogger('schema')
  if (dryRun) {
    log('DRY: would run `pnpm payload migrate` then verify enums')
  } else {
    log('running pnpm payload migrate…')
    const result = spawnSync('pnpm', ['payload', 'migrate'], { stdio: 'inherit', env: process.env })
    if (result.status !== 0) throw new Error(`payload migrate exited ${result.status}`)
  }

  // Gate: robots max-* + taxonomy enum values the importer writes must exist.
  const client = new pg.Client({ connectionString: process.env.DATABASE_URI })
  await client.connect()
  try {
    const robots = await client.query(
      `SELECT e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
       WHERE t.typname = 'enum_products_seo_robots'`,
    )
    const robotLabels = robots.rows.map((r) => r.enumlabel)
    for (const needed of ['max-snippet:-1', 'max-image-preview:large', 'max-video-preview:-1']) {
      if (!robotLabels.includes(needed)) throw new Error(`schema gate: robots enum missing '${needed}' — migration not applied`)
    }
    const taxo = await client.query(
      `SELECT e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
       WHERE t.typname = 'enum_taxonomies_type'`,
    )
    const taxoLabels = taxo.rows.map((r) => r.enumlabel)
    for (const needed of ['category', 'tag', 'product-category', 'custom']) {
      if (!taxoLabels.includes(needed)) throw new Error(`schema gate: taxonomies type enum missing '${needed}'`)
    }
    log(`gate OK — robots enum has max-* (${robotLabels.length} values), taxonomy types complete`)
  } finally {
    await client.end()
  }
}

// ── seed ──────────────────────────────────────────────────────────────────────

/**
 * Create the Sites doc when absent. Existing docs are left untouched — theme,
 * branding, storage credentials, pageGroup etc. are admin-managed.
 */
export interface SeedSiteResult {
  tenantId: string | number
  /** True only when this call created the Sites doc (didn't already exist). */
  created: boolean
}

export async function seedSiteDoc(ctx: ImportContext): Promise<SeedSiteResult> {
  const log = makeLogger('seed')
  const existing = await ctx.payload.find({
    collection: 'sites',
    where: { siteKey: { equals: ctx.cfg.site } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (existing.docs.length) {
    log(`site ${ctx.cfg.site} exists (id=${existing.docs[0].id}) — leaving as-is`)
    return { tenantId: existing.docs[0].id, created: false }
  }
  if (ctx.dryRun) {
    log(`DRY: would create site ${ctx.cfg.site} → ${ctx.cfg.domain}`)
    return { tenantId: -1, created: false }
  }
  const created = await ctx.payload.create({
    collection: 'sites',
    data: {
      siteKey: ctx.cfg.site,
      domain: ctx.cfg.domain,
      defaultLanguage: ctx.cfg.language,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    overrideAccess: true,
  })
  log(`created site ${ctx.cfg.site} → id=${created.id}`)
  return { tenantId: created.id, created: true }
}

export async function runSeedPhase(ctx: ImportContext): Promise<void> {
  const log = makeLogger('seed')
  await seedSiteDoc(ctx)

  let created = 0
  let existed = 0
  for (const author of staged.authors(ctx.cfg)) {
    const existing = await findBySlugTenant(ctx, 'authors', author.slug)
    if (existing) {
      existed++
      // WP-sourced authors carry no bio and stay untouched; draft-authored
      // profiles own name + bio.
      if (author.bio && !ctx.dryRun) {
        await ctx.payload.update({
          collection: 'authors',
          id: existing,
          data: { name: author.name, bio: author.bio },
          overrideAccess: true,
        })
        log(`updated authors/${author.slug} (name, bio)`)
      }
      continue
    }
    if (ctx.dryRun) {
      log(`DRY create authors/${author.slug} "${author.name}"`)
      created++
      continue
    }
    await ctx.payload.create({
      collection: 'authors',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { name: author.name, slug: author.slug, tenant: ctx.tenantId, ...(author.bio ? { bio: author.bio } : {}) } as any,
      overrideAccess: true,
    })
    log(`created authors/${author.slug}`)
    created++
  }
  log(`authors — created: ${created}, existed: ${existed}`)
}
