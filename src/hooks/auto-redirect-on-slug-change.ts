/**
 * beforeChange hook — auto-creates a 301 redirect when a document's slug changes.
 *
 * Guards:
 *  - create operations: no originalDoc → skip.
 *  - slug unchanged: no-op.
 *  - self-loop: /old === /new → skip.
 *  - duplicate: redirect from→to already exists in the same tenant → skip.
 *  - never throws: failure is logged and non-fatal (must not block the save).
 *
 * Uses overrideAccess so the hook works regardless of the logged-in user's role.
 * Tenant is propagated from the document so redirects are properly scoped.
 */
import type { CollectionBeforeChangeHook, Where } from 'payload'

import { toTenantRelationshipId } from '../lib/resolve-upload-tenant'
import { segmentForCollection } from '../fields/slug-url-prefix-map'

export const autoRedirectOnSlugChange: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  req,
  collection,
}) => {
  // Only act on updates where we have an existing document with a slug.
  if (!originalDoc) return data

  const oldSlug = typeof originalDoc.slug === 'string' ? originalDoc.slug : undefined
  const newSlug = typeof data.slug === 'string' ? data.slug : undefined

  if (!oldSlug || !newSlug) return data
  if (oldSlug === newSlug) return data

  // Build public paths matching how URLs are actually served: products under
  // /product/<slug>/, pages/posts/landings at root /<slug>/ — with trailing slash
  // (trailingSlash:true). A bare /<slug> would 404 for products and miss the
  // trailing-slash canonical URL for the others.
  const segment = segmentForCollection(collection.slug, 'vi')
  const toUrlPath = (slug: string) =>
    slug.startsWith('/') ? slug : segment ? `/${segment}/${slug}/` : `/${slug}/`
  const fromPath = toUrlPath(oldSlug)
  const toPath = toUrlPath(newSlug)

  // Self-loop guard (should never happen given oldSlug !== newSlug, but be explicit).
  if (fromPath === toPath) return data

  // Resolve tenant from the persisted document (originalDoc is authoritative on update).
  const tenantRef =
    (originalDoc as { tenant?: string | { id: string } }).tenant ??
    (data as { tenant?: string | { id: string } }).tenant
  const tenantId = typeof tenantRef === 'string' ? tenantRef : tenantRef?.id === undefined || tenantRef?.id === null ? undefined : String(tenantRef.id)

  // Payload's relationship validator requires a NUMBER for `sites` (serial ids);
  // this id may arrive as a string (REST payloads, referers, plugin arrays). A
  // non-numeric id is dropped instead of being sent as a string, because Payload
  // rejects string relationship ids with "invalid relationships" — and this hook
  // swallows create errors by design, so that rejection would silently produce no
  // redirect at all. See toTenantRelationshipId in src/lib/resolve-upload-tenant.ts.
  const tenantValue = toTenantRelationshipId(tenantId)

  try {
    // Duplicate guard: check if a redirect from this path already exists for this tenant.
    const andClauses: Where[] = [{ from: { equals: fromPath } }]
    if (tenantId) andClauses.push({ tenant: { equals: tenantId } })
    const whereClause: Where = { and: andClauses }

    const existing = await req.payload.find({
      collection: 'redirects',
      where: whereClause,
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req, // join caller's transaction — avoid a second pool connection
    })

    if (existing.totalDocs > 0) {
      // Redirect for this old slug already exists — skip to avoid duplicates.
      return data
    }

    await (req.payload.create as (opts: unknown) => Promise<unknown>)({
      collection: 'redirects',
      data: {
        from: fromPath,
        to: toPath,
        statusCode: '301' as const,
        isEnabled: true,
        ...(tenantValue ? { tenant: tenantValue } : {}),
      },
      overrideAccess: true,
      req, // join caller's transaction — avoid a second pool connection
    })
  } catch (err) {
    // Non-fatal: log but never block the slug update.
    req.payload.logger.error(
      `autoRedirectOnSlugChange: failed to create redirect ${fromPath} → ${toPath}: ${String(err)}`,
    )
  }

  return data
}
