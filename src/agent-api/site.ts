/**
 * Site (tenant) resolution and cross-tenant reference checks.
 *
 * `sites` and `media` are publicly readable (`read: () => true`), so `overrideAccess: false`
 * alone does NOT scope them to the key owner's sites — membership is checked explicitly here.
 */
import type { CollectionSlug, PayloadRequest, Where } from 'payload'

import type { Site } from '../payload-types'
import type { AgentContext } from './context'
import { AgentError } from './errors'

export interface ResolvedSite {
  id: number
  siteKey: string
  domain: string
  defaultLanguage: Site['defaultLanguage']
}

const SITE_SELECT = { siteKey: true, domain: true, defaultLanguage: true } as const

function toResolved(site: Pick<Site, 'id' | 'siteKey' | 'domain' | 'defaultLanguage'>): ResolvedSite {
  return { id: site.id, siteKey: site.siteKey, domain: site.domain, defaultLanguage: site.defaultLanguage }
}

/** Sites the key owner may work on (all for super-admin), sorted by siteKey. */
export async function listAccessibleSites(ctx: AgentContext, req: PayloadRequest): Promise<ResolvedSite[]> {
  if (!ctx.superAdmin && ctx.memberSiteIds.length === 0) return []
  const { docs } = await ctx.payload.find({
    collection: 'sites',
    req,
    overrideAccess: false,
    depth: 0,
    limit: 0,
    pagination: false,
    sort: 'siteKey',
    select: SITE_SELECT,
    where: ctx.superAdmin ? undefined : { id: { in: ctx.memberSiteIds } },
  })
  return docs.map(toResolved)
}

/**
 * Resolve `site` (siteKey first; an all-digit value that matches no siteKey is tried as an id).
 * Omitted → the single site the user belongs to. Non-members get `forbidden`, never an empty result.
 */
export async function resolveSite(ctx: AgentContext, req: PayloadRequest, site?: string): Promise<ResolvedSite> {
  if (site === undefined || site === '') {
    const sites = await listAccessibleSites(ctx, req)
    if (sites.length === 1) return sites[0]
    throw new AgentError(
      'invalid',
      sites.length === 0
        ? 'This API key has no site membership.'
        : `Pass "site" — this key can use several sites: ${sites.map((s) => s.siteKey).join(', ')}.`,
      { sites: sites.map((s) => s.siteKey) },
    )
  }

  const byKey = await ctx.payload.find({
    collection: 'sites',
    req,
    overrideAccess: false,
    depth: 0,
    limit: 1,
    select: SITE_SELECT,
    where: { siteKey: { equals: site } },
  })
  let found = byKey.docs[0]
  if (!found && /^\d+$/.test(site)) {
    const byId = await ctx.payload
      .findByID({ collection: 'sites', id: Number(site), req, overrideAccess: false, depth: 0, select: SITE_SELECT })
      .catch(() => null)
    if (byId) found = byId
  }
  if (!found) throw new AgentError('not_found', `Site "${site}" does not exist.`)
  assertSiteMember(ctx, found.id)
  return toResolved(found)
}

/** Throws `forbidden` unless the key owner is a member of `siteId` (super-admin always is). */
export function assertSiteMember(ctx: AgentContext, siteId: number): void {
  if (ctx.superAdmin) return
  if (!ctx.memberSiteIds.includes(siteId)) {
    throw new AgentError('forbidden', 'This API key is not a member of that site.')
  }
}

/** The tenant id stored on a document (`tenant` is a number at depth 0, an object at depth ≥ 1). */
export function tenantIdOf(doc: { tenant?: number | { id: number } | null }): number | undefined {
  const t = doc.tenant
  return typeof t === 'number' ? t : (t?.id ?? undefined)
}

/**
 * Every id in `ids` must exist in `collection` AND belong to `siteId`. Relationship validation
 * alone does not ensure that: media is public-read and machine clients carry no tenant cookie.
 */
export async function assertRefsInSite(
  ctx: AgentContext,
  req: PayloadRequest,
  collection: CollectionSlug,
  ids: number[],
  siteId: number,
  label: string,
  extra?: Where,
): Promise<void> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return
  const conditions: Where[] = [{ id: { in: unique } }, { tenant: { equals: siteId } }]
  if (extra) conditions.push(extra)
  const { docs } = await ctx.payload.find({
    collection,
    req,
    overrideAccess: false,
    depth: 0,
    limit: unique.length,
    pagination: false,
    select: {},
    where: { and: conditions },
  })
  const found = new Set(docs.map((d) => Number(d.id)))
  const missing = unique.filter((id) => !found.has(id))
  if (missing.length > 0) {
    throw new AgentError('invalid', `${label}: id(s) ${missing.join(', ')} do not exist on this site.`, { missing })
  }
}
