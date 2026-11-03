/**
 * afterChange / afterDelete hooks that notify your frontend to revalidate cached content.
 *
 * The network call itself lives in the `revalidateFrontend` job task
 * (`src/jobs/revalidate-frontend-task.ts`); these hooks only decide what to
 * revalidate and `queue` the job on the caller's request, so the job row is part of
 * the save's transaction (a rolled-back save leaves no orphan job) and the save does
 * not wait on the frontend.
 *
 * Preserved behaviour:
 *   - identical frontend contract (same URL, same `{collection, id, slug}` body)
 *   - identical skip guards (see publish-hook-guards.ts)
 *   - a tenant without a `domain` queues nothing (checked here so we do not create a
 *     no-op job row on every save; the task re-checks at run time)
 *   - a slug rename revalidates the OLD path as well as the new one
 *
 * Collections without a `slug` (menus, faqs) revalidate with the document id as the slug
 * (the frontend revalidates the whole site and ignores the body).
 */
import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import { REVALIDATE_FRONTEND_TASK_SLUG } from '../jobs/revalidate-frontend-task'
import { isRevalidateSuppressed } from './publish-hook-guards'

/** Extract the tenant id from a relationship value (id | { id } | number). */
function tenantIdOf(doc: Record<string, unknown>): string | undefined {
  const ref = doc.tenant as string | number | { id?: string | number } | undefined | null
  if (ref === null || ref === undefined) return undefined
  const id = typeof ref === 'object' ? ref.id : ref
  return id === null || id === undefined || id === '' ? undefined : String(id)
}

interface TenantSite {
  /** The tenant's frontend domain, or undefined when it is missing. */
  domain?: string
}

/** The tenant's Site facts needed here, or undefined when it is missing/unresolvable. */
async function resolveTenantSite(
  req: Parameters<CollectionAfterChangeHook>[0]['req'],
  tenantId: string,
): Promise<TenantSite | undefined> {
  try {
    const site = await req.payload.findByID({
      collection: 'sites',
      id: tenantId,
      overrideAccess: true,
      depth: 0,
      req, // join caller's transaction — avoid a second pool connection
    })
    const value = site as { domain?: string } | null
    return { domain: value?.domain || undefined }
  } catch {
    // Site lookup failure must never block the save — same as the old hook.
    return undefined
  }
}

/** The doc's URL identifier: `slug`, or `key` for collections keyed that way. */
function identifierOf(doc: unknown): string | undefined {
  if (!doc || typeof doc !== 'object') return undefined
  const { slug, key } = doc as { slug?: unknown; key?: unknown }
  if (typeof slug === 'string' && slug) return slug
  if (typeof key === 'string' && key) return key
  return undefined
}

/**
 * Decide + queue. Queues one job for the current slug, plus one for the previous
 * slug when this save renamed the document.
 */
export async function queueRevalidations(args: {
  doc: Record<string, unknown>
  collection: { slug: string }
  req: Parameters<CollectionAfterChangeHook>[0]['req']
  previousSlug?: string
  /** Override for docs that are not tenant-scoped through `doc.tenant` (the Sites doc itself). */
  tenantId?: string
}): Promise<void> {
  const { doc, collection, req, previousSlug } = args
  const tenantId = args.tenantId ?? tenantIdOf(doc)
  const id = doc.id
  if (!tenantId || id === undefined || id === null) return
  const idString = String(id)
  const slug = identifierOf(doc) ?? idString

  const site = await resolveTenantSite(req, tenantId)
  if (!site?.domain) return

  await req.payload.jobs.queue({
    task: REVALIDATE_FRONTEND_TASK_SLUG,
    input: { tenantId, collection: collection.slug, id: idString, slug },
    req,
  })

  // Slug rename: the old URL keeps serving a cached page until it is revalidated
  // too (the redirect created by auto-redirect-on-slug-change only takes effect
  // for requests that reach the frontend).
  if (previousSlug && previousSlug !== slug) {
    await req.payload.jobs.queue({
      task: REVALIDATE_FRONTEND_TASK_SLUG,
      input: { tenantId, collection: collection.slug, id: idString, slug: previousSlug },
      req,
    })
  }
}

export const triggerRevalidate: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  collection,
  req,
}) => {
  const context = req?.context as Record<string, unknown> | undefined
  if (isRevalidateSuppressed(context)) return doc

  const previousSlug = identifierOf(previousDoc)
  await queueRevalidations({
    doc: doc as unknown as Record<string, unknown>,
    collection,
    req,
    ...(previousSlug ? { previousSlug } : {}),
  })

  return doc
}

export const triggerRevalidateAfterDelete: CollectionAfterDeleteHook = async ({
  doc,
  collection,
  req,
}) => {
  const context = req?.context as Record<string, unknown> | undefined
  if (isRevalidateSuppressed(context)) return doc

  await queueRevalidations({
    doc: doc as unknown as Record<string, unknown>,
    collection,
    req,
  })
  return doc
}

/**
 * Sites afterChange: site settings (branding, navigation defaults, SEO defaults…) are rendered on every
 * page, so any change revalidates the frontend.
 */
export const triggerSiteRevalidate: CollectionAfterChangeHook = async ({
  doc,
  collection,
  req,
}) => {
  const context = req?.context as Record<string, unknown> | undefined
  if (isRevalidateSuppressed(context)) return doc

  const record = doc as unknown as Record<string, unknown>
  const id = record.id
  if (id === undefined || id === null) return doc

  await queueRevalidations({ doc: record, collection, req, tenantId: String(id) })
  return doc
}
