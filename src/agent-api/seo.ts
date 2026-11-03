import type { Where } from 'payload'

import { publicPathFor } from '../lib/frontend-public-path'
import { computeSeoScoreFromDoc, isSeoDeficient, seoDeficiencyReasons } from '../lib/seo-score-server'
import { type AgentContext, agentReq, DEFAULT_AGENT_LOCALE } from './context'
import { CONTENT_COLLECTIONS, type Input } from './schemas'
import { isLive } from './shape'
import { assertSiteMember, resolveSite, tenantIdOf } from './site'

/** Deficient posts/pages of a site in one locale, worst first (metadata checks — use get_seo_report per doc). */
export async function seoAudit(ctx: AgentContext, input: Input<'seoAudit'>) {
  const locale = input.locale ?? DEFAULT_AGENT_LOCALE
  const req = await agentReq(ctx, locale)
  const site = await resolveSite(ctx, req, input.site)
  const where: Where = { tenant: { equals: site.id } }
  const perCollection = await Promise.all(
    CONTENT_COLLECTIONS.map(async (collection) => {
      const { docs } = await ctx.payload.find({
        collection,
        req,
        overrideAccess: false,
        depth: 0,
        locale,
        fallbackLocale: false,
        limit: input.limit ?? 50,
        sort: '-updatedAt',
        select: { title: true, slug: true, seo: true, status: true, updatedAt: true },
        where,
      })
      return docs
        .filter((d) => isSeoDeficient(d))
        .map((d) => ({
          collection,
          id: d.id,
          title: d.title,
          status: d.status,
          score: computeSeoScoreFromDoc(d).score,
          reasons: seoDeficiencyReasons(d),
        }))
    }),
  )
  const deficient = perCollection.flat().sort((a, b) => a.score - b.score)
  return { site: site.siteKey, locale, scanned: 'most recently updated posts and pages', total: deficient.length, deficient }
}

/** Full score + every check for one document, in one locale. */
export async function getSeoReport(ctx: AgentContext, input: Input<'getSeoReport'>) {
  const locale = input.locale ?? DEFAULT_AGENT_LOCALE
  const req = await agentReq(ctx, locale)
  const doc = await ctx.payload.findByID({
    collection: input.collection,
    id: input.id,
    req,
    overrideAccess: false,
    depth: 0,
    locale,
    fallbackLocale: false,
    select: { slug: true, seo: true, contentMd: true, tenant: true },
  })
  const siteId = tenantIdOf(doc)
  if (siteId !== undefined) assertSiteMember(ctx, siteId)
  const { score, checks } = computeSeoScoreFromDoc(doc)
  return { collection: input.collection, id: input.id, locale, score, checks }
}

/**
 * Where a human can see the document: the admin edit URL always; the public URL only when the
 * document is live (drafts and scheduled docs 404 on the frontend — there is no preview mode).
 * Base URL: the document's own site domain first, `FRONTEND_BASE_URL` as the fallback.
 */
export async function getContentUrls(ctx: AgentContext, input: Input<'getContentUrls'>) {
  const req = await agentReq(ctx)
  const doc = await ctx.payload.findByID({
    collection: input.collection,
    id: input.id,
    req,
    overrideAccess: false,
    depth: 1,
    trash: true,
    select: { slug: true, status: true, publishedAt: true, deletedAt: true, tenant: true },
    populate: { sites: { domain: true } },
  })
  const siteId = tenantIdOf(doc)
  if (siteId !== undefined) assertSiteMember(ctx, siteId)
  const tenant = doc.tenant
  const domain = typeof tenant === 'object' && tenant !== null ? tenant.domain : undefined
  const base = domain ? `https://${domain}` : process.env.FRONTEND_BASE_URL
  const path = publicPathFor(input.collection, doc.slug)
  const live = isLive(doc)
  const serverUrl = (ctx.payload.config.serverURL || 'http://localhost:3000').replace(/\/$/, '')
  return {
    collection: input.collection,
    id: input.id,
    live,
    adminUrl: `${serverUrl}/admin/collections/${input.collection}/${input.id}`,
    publicUrl: live && base && path ? `${base.replace(/\/$/, '')}${path}` : null,
    ...(live ? {} : { note: 'Not publicly visible yet (draft, scheduled or trashed) — share adminUrl for review.' }),
  }
}
