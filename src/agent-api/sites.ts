import { type AgentContext, AGENT_LOCALES, agentReq } from './context'
import type { Input } from './schemas'
import { TAXONOMY_TYPES } from './schemas'
import { listAccessibleSites, resolveSite } from './site'

const SUPER_ADMIN_WARNING =
  'This is a super-admin key: it bypasses site isolation. Prefer a key owned by a dedicated editor/author user.'

export async function whoami(ctx: AgentContext, _input: Input<'whoami'>) {
  const req = await agentReq(ctx)
  const sites = await listAccessibleSites(ctx, req)
  return {
    id: ctx.user.id,
    email: ctx.user.email,
    role: ctx.user.role,
    strategy: 'api-key',
    sites: sites.map((s) => ({ id: s.id, siteKey: s.siteKey })),
    ...(ctx.superAdmin ? { warning: SUPER_ADMIN_WARNING } : {}),
  }
}

export async function listSites(ctx: AgentContext, _input: Input<'listSites'>) {
  const req = await agentReq(ctx)
  const sites = await listAccessibleSites(ctx, req)
  return { locales: AGENT_LOCALES, sites }
}

export async function getSite(ctx: AgentContext, input: Input<'getSite'>) {
  const req = await agentReq(ctx)
  const site = await resolveSite(ctx, req, input.site)
  const count = (collection: 'posts' | 'pages') =>
    ctx.payload.count({ collection, req, overrideAccess: false, where: { tenant: { equals: site.id } } }).then((r) => r.totalDocs)
  const taxonomyCounts = await Promise.all(
    TAXONOMY_TYPES.map(async (type) => {
      const { totalDocs } = await ctx.payload.count({
        collection: 'taxonomies',
        req,
        overrideAccess: false,
        where: { and: [{ tenant: { equals: site.id } }, { type: { equals: type } }] },
      })
      return [type, totalDocs] as const
    }),
  )
  const [posts, pages] = await Promise.all([count('posts'), count('pages')])
  return { ...site, locales: AGENT_LOCALES, counts: { posts, pages, taxonomies: Object.fromEntries(taxonomyCounts) } }
}
