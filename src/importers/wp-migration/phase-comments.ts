/**
 * Phase `comments` — Import user comments from staged/comments/
 * and attach them to their parent post or product in Payload.
 *
 * Idempotency: Checks existing comments for the tenant by parent + authorName + createdAt.
 * If already imported, skips.
 */
import type { Comment } from '../../payload-types'
import { makeLogger, staged, type ImportContext } from './import-context'

export async function runCommentsPhase(ctx: ImportContext): Promise<void> {
  const log = makeLogger('comments')
  const stagedComments = staged.comments(ctx.cfg)

  if (!stagedComments.length) {
    log('no staged comments found — skipping')
    return
  }

  log(`${stagedComments.length} staged comments to import`)

  // Pre-load posts and products for fast ID lookup
  const postsResult = await ctx.payload.find({
    collection: 'posts',
    where: { tenant: { equals: ctx.tenantId } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  const postMap = new Map<string, string | number>()
  for (const doc of postsResult.docs) {
    postMap.set(doc.slug, doc.id)
  }

  const productsResult = await ctx.payload.find({
    collection: 'products',
    where: { tenant: { equals: ctx.tenantId } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  const productMap = new Map<string, string | number>()
  for (const doc of productsResult.docs) {
    productMap.set(doc.slug, doc.id)
  }

  // Pre-load existing comments for this tenant
  const existingResult = await ctx.payload.find({
    collection: 'comments',
    where: { tenant: { equals: ctx.tenantId } },
    limit: 5000,
    depth: 0,
    overrideAccess: true,
  })

  // Key existing comments by parentId:parentType:authorName:isoDate
  const existingSet = new Set<string>()
  for (const doc of existingResult.docs as unknown as Comment[]) {
    const parentKey = doc.post
      ? `post:${typeof doc.post === 'object' && doc.post !== null ? doc.post.id : doc.post}`
      : `product:${typeof doc.product === 'object' && doc.product !== null ? doc.product.id : doc.product}`
    const dateKey = doc.createdAt ? new Date(doc.createdAt).toISOString() : ''
    existingSet.add(`${parentKey}:${doc.authorName}:${dateKey}`)
  }

  let created = 0
  let existed = 0
  let missing = 0
  let errors = 0

  for (const c of stagedComments) {
    const parentId = c.target.type === 'post' ? postMap.get(c.target.slug) : productMap.get(c.target.slug)
    if (!parentId) {
      log(`  ⚠ target ${c.target.type}/${c.target.slug} not found in CMS for comment wp:${c.wp.databaseId}`)
      missing++
      continue
    }

    const parentKey = `${c.target.type}:${parentId}`
    const dateKey = c.createdAt ? new Date(c.createdAt).toISOString() : ''
    const matchKey = `${parentKey}:${c.authorName}:${dateKey}`

    if (existingSet.has(matchKey)) {
      existed++
      continue
    }

    if (ctx.dryRun) {
      log(`  [dry-run] would create comment by "${c.authorName}" on ${c.target.type}/${c.target.slug}`)
      created++
      continue
    }

    try {
      await ctx.payload.create({
        collection: 'comments',
        data: {
          ...(c.target.type === 'post' ? { post: Number(parentId) } : { product: Number(parentId) }),
          authorName: c.authorName,
          authorEmail: c.authorEmail || undefined,
          content: c.content,
          status: c.status,
          createdAt: c.createdAt,
          tenant: Number(ctx.tenantId),
        },
        overrideAccess: true,
      })
      existingSet.add(matchKey)
      created++
    } catch (err) {
      log(`  ✖ comment wp:${c.wp.databaseId}: ${err instanceof Error ? err.message : err}`)
      errors++
    }
  }

  log(`done — created: ${created}, existed: ${existed}, missing target: ${missing}, errors: ${errors}`)
}
