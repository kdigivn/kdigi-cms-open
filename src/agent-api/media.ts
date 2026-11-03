import type { Where } from 'payload'

import { importMediaFromUrl as runImport, MediaImportError } from '../lib/import-media-from-url'
import { withRowLock } from './concurrency'
import { type AgentContext, agentReq } from './context'
import { AgentError, toAgentError } from './errors'
import { assertNotLocked } from './locks'
import type { Input } from './schemas'
import { mediaSummary } from './shape'
import { assertSiteMember, resolveSite, tenantIdOf } from './site'

const MEDIA_SELECT = { url: true, alt: true, filename: true, mimeType: true, width: true, height: true, updatedAt: true } as const

/** Media of one site only — `media.read` is public, so the tenant filter is explicit. */
export async function searchMedia(ctx: AgentContext, input: Input<'searchMedia'>) {
  const req = await agentReq(ctx)
  const site = await resolveSite(ctx, req, input.site)
  const where: Where[] = [{ tenant: { equals: site.id } }]
  if (input.query) where.push({ or: [{ alt: { like: input.query } }, { filename: { like: input.query } }] })
  if (input.id !== undefined) where.push({ id: { equals: input.id } })
  const result = await ctx.payload.find({
    collection: 'media',
    req,
    overrideAccess: false,
    depth: 0,
    limit: input.limit ?? 20,
    page: input.page ?? 1,
    sort: '-updatedAt',
    select: MEDIA_SELECT,
    where: { and: where },
  })
  return { site: site.siteKey, totalDocs: result.totalDocs, page: result.page ?? 1, media: result.docs.map(mediaSummary) }
}

export async function importMediaFromUrl(ctx: AgentContext, input: Input<'importMediaFromUrl'>) {
  const req = await agentReq(ctx)
  const site = await resolveSite(ctx, req, input.site)
  try {
    const doc = await runImport(req, { url: input.url, alt: input.alt, tenant: site.id, tenantId: String(site.id) }, 'user')
    return { site: site.siteKey, id: doc.id, url: doc.url ?? null, alt: doc.alt ?? null, filename: doc.filename ?? null }
  } catch (err) {
    if (!(err instanceof MediaImportError)) throw toAgentError(err, ctx.log)
    const code = err.status === 403 ? 'forbidden' : err.status >= 500 ? 'internal' : 'invalid'
    throw new AgentError(code, err.detail ? `${err.message}: ${err.detail}` : err.message)
  }
}

export async function updateMediaAlt(ctx: AgentContext, input: Input<'updateMediaAlt'>) {
  const req = await agentReq(ctx)
  const existing = await ctx.payload.findByID({ collection: 'media', id: input.id, req, overrideAccess: false, depth: 0, select: { tenant: true } })
  const siteId = tenantIdOf(existing)
  if (siteId === undefined) throw new AgentError('forbidden', 'This media item belongs to no site and cannot be edited with an API key.')
  assertSiteMember(ctx, siteId)
  await assertNotLocked(ctx, req, 'media', input.id)
  const doc = await withRowLock(req, 'media', input.id, input.expectedUpdatedAt, () =>
    ctx.payload.update({ collection: 'media', id: input.id, req, overrideAccess: false, overrideLock: false, depth: 0, data: { alt: input.alt } }),
  )
  return mediaSummary(doc)
}
