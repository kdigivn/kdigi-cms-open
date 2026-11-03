#!/usr/bin/env node
/**
 * Seed one default editorial author per site and assign it to every post that
 * has no author. Posts imported from WordPress may carry no author, so public
 * bylines render empty until this runs. Idempotent — safe to re-run.
 *
 * Usage:
 *   node --env-file=.env --import tsx src/importers/seed-default-authors.ts \
 *     [--site <siteKey>] [--author-name "Editorial Team"] [--author-slug editorial-team] [--dry-run]
 *
 *   --site <siteKey>      : limit to one site (default: all sites)
 *   --author-name <name>  : display name of the author (default: Editorial Team)
 *   --author-slug <slug>  : slug of the author (default: editorial-team)
 *   --dry-run             : report what would change without writing
 */
import { getPayload, type Where } from 'payload'
import config from '../payload.config'

const DEFAULT_AUTHOR_NAME = 'Editorial Team'
const DEFAULT_AUTHOR_SLUG = 'editorial-team'

/** Read `--name value` or `--name=value` from argv. */
function argValue(name: string): string | undefined {
  const argv = process.argv
  const eq = argv.find((a) => a.startsWith(`${name}=`))
  if (eq) return eq.slice(name.length + 1) || undefined
  const i = argv.indexOf(name)
  if (i === -1) return undefined
  const next = argv[i + 1]
  return next && !next.startsWith('--') ? next : undefined
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const siteKeyFilter = argValue('--site')
  const authorName = argValue('--author-name') ?? DEFAULT_AUTHOR_NAME
  const authorSlug = argValue('--author-slug') ?? DEFAULT_AUTHOR_SLUG

  const payload = await getPayload({ config })
  const sites = await payload.find({
    collection: 'sites',
    where: siteKeyFilter ? { siteKey: { equals: siteKeyFilter } } : undefined,
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })

  if (siteKeyFilter && sites.docs.length === 0) {
    console.error(`ERROR: no sites doc for siteKey=${siteKeyFilter}`)
    process.exit(1)
  }

  for (const site of sites.docs) {
    const tenantId = site.id
    const label = site.siteKey ?? tenantId

    const found = await payload.find({
      collection: 'authors',
      where: { and: [{ tenant: { equals: tenantId } }, { slug: { equals: authorSlug } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    let authorId = found.docs[0]?.id
    if (!authorId && !dryRun) {
      const created = await payload.create({
        collection: 'authors',
        data: { name: authorName, slug: authorSlug, tenant: tenantId },
        overrideAccess: true,
      })
      authorId = created.id
      console.log(`  [${label}] created author ${authorId}`)
    }

    const where: Where = { and: [{ tenant: { equals: tenantId } }, { author: { exists: false } }] }
    const pending = await payload.count({ collection: 'posts', where, overrideAccess: true })

    if (dryRun || !authorId) {
      console.log(
        `  [${label}] [dry-run] author ${authorId ? `exists (${authorId})` : `"${authorSlug}" would be created`}; ` +
          `${pending.totalDocs} author-less posts would be assigned`,
      )
      continue
    }

    // Each pass assigns an author to a page of author-less posts, so the next
    // pass over the same filter sees the remainder; stop when none are left.
    let assigned = 0
    while (true) {
      const posts = await payload.find({
        collection: 'posts',
        where,
        limit: 200,
        depth: 0,
        overrideAccess: true,
      })
      if (posts.docs.length === 0) break
      for (const p of posts.docs) {
        await payload.update({
          collection: 'posts',
          id: p.id,
          data: { author: authorId },
          overrideAccess: true,
        })
        assigned++
      }
    }
    console.log(`  [${label}] author=${authorId} → assigned ${assigned} of ${pending.totalDocs} author-less posts`)
  }
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
