import type { Where } from 'payload'

import { type AgentContext, agentReq, DEFAULT_AGENT_LOCALE } from './context'
import { AgentError } from './errors'
import type { Input } from './schemas'
import { taxonomySummary } from './shape'
import { assertRefsInSite, resolveSite } from './site'
import { slugifyTitle } from '../fields/slug-field'

const TAXONOMY_SELECT = { type: true, slug: true, name: true, parent: true } as const

export async function listTaxonomies(ctx: AgentContext, input: Input<'listTaxonomies'>) {
  const req = await agentReq(ctx, input.locale)
  const site = await resolveSite(ctx, req, input.site)
  const where: Where[] = [{ tenant: { equals: site.id } }]
  if (input.type) where.push({ type: { equals: input.type } })
  const result = await ctx.payload.find({
    collection: 'taxonomies',
    req,
    overrideAccess: false,
    depth: 0,
    locale: req.locale ?? DEFAULT_AGENT_LOCALE,
    fallbackLocale: false,
    limit: input.limit ?? 200,
    sort: 'slug',
    select: TAXONOMY_SELECT,
    where: { and: where },
  })
  return { site: site.siteKey, totalDocs: result.totalDocs, taxonomies: result.docs.map(taxonomySummary) }
}

export async function createTaxonomy(ctx: AgentContext, input: Input<'createTaxonomy'>) {
  const locale = input.locale ?? DEFAULT_AGENT_LOCALE
  const req = await agentReq(ctx, locale)
  const site = await resolveSite(ctx, req, input.site)
  if (input.parent !== undefined) await assertRefsInSite(ctx, req, 'taxonomies', [input.parent], site.id, 'parent')

  // Slugs are unique per (site, type) — check first so the caller gets `conflict`, not a DB error.
  const slug = input.slug ?? slugifyTitle(input.name)
  const { totalDocs } = await ctx.payload.count({
    collection: 'taxonomies',
    req,
    overrideAccess: false,
    where: { and: [{ tenant: { equals: site.id } }, { type: { equals: input.type } }, { slug: { equals: slug } }] },
  })
  if (totalDocs > 0) throw new AgentError('conflict', `A ${input.type} with slug "${slug}" already exists on ${site.siteKey}.`)

  const doc = await ctx.payload.create({
    collection: 'taxonomies',
    req,
    overrideAccess: false,
    depth: 0,
    locale,
    data: {
      tenant: site.id,
      type: input.type,
      name: input.name,
      slug,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.parent !== undefined ? { parent: input.parent } : {}),
    },
  })
  return { site: site.siteKey, ...taxonomySummary(doc) }
}
