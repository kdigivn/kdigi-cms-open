import { type AgentContext, agentReq } from './context'
import type { Input } from './schemas'
import { resolveSite } from './site'

/** Shortcodes are per-site rows; agents discover usable names here (unknown names render empty). */
export async function listShortcodes(ctx: AgentContext, input: Input<'listShortcodes'>) {
  const req = await agentReq(ctx)
  const site = await resolveSite(ctx, req, input.site)
  const { docs } = await ctx.payload.find({
    collection: 'shortcodes',
    req,
    overrideAccess: false,
    depth: 0,
    limit: 0,
    pagination: false,
    sort: 'name',
    select: { name: true, title: true },
    where: { tenant: { equals: site.id } },
  })
  return {
    site: site.siteKey,
    syntax: '[sc name="<name>"][/sc]',
    shortcodes: docs.map((d) => ({ name: d.name, title: d.title, usage: `[sc name="${d.name}"][/sc]` })),
  }
}
