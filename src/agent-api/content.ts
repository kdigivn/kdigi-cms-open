/**
 * Posts/pages operations for agents.
 *
 * Invariants (see plans/261103-1600-ai-native-mcp-cli/phase-01-…):
 *   - own Local-API request per op, `overrideAccess: false`, `overrideLock: false` on writes;
 *   - every write that changes an existing document needs `expectedUpdatedAt` (row-locked CAS);
 *   - `data` carries only the keys the caller sent (Payload keeps the rest);
 *   - referenced ids must belong to the document's own site;
 *   - trash = `update({ deletedAt })`, never `payload.delete` (that is the permanent delete);
 *   - a legacy Lexical body is converted on read and only overwritten with explicit consent.
 */
import type { PayloadRequest, Where } from 'payload'

import { legacyLexicalToHtml } from '../fields/markdown-html-field'
import { slugifyTitle } from '../fields/slug-field'
import { htmlToGfm } from '../lib/html-to-gfm'
import type { Author, Page, Post, Taxonomy } from '../payload-types'
import { withRowLock } from './concurrency'
import { type AgentContext, type AgentLocale, agentReq, DEFAULT_AGENT_LOCALE } from './context'
import { AgentError } from './errors'
import { assertNotLocked } from './locks'
import type { ContentCollection, Input, TaxonomyRef } from './schemas'
import { contentSummary, scheduledFor, seoSubset } from './shape'
import { assertRefsInSite, assertSiteMember, resolveSite, tenantIdOf } from './site'

type ContentDoc = Post | Page
type Body = { contentMd?: string | null; content?: Post['content'] }

const SUMMARY_SELECT = { title: true, slug: true, status: true, publishedAt: true, updatedAt: true, deletedAt: true } as const

/** `markdown` + where it came from. Legacy docs (contentMd never set) are converted for reading. */
async function readBody(doc: Body, req: PayloadRequest): Promise<{ markdown: string; bodySource: 'markdown' | 'legacy-converted' | 'empty' }> {
  if (typeof doc.contentMd === 'string') {
    return { markdown: doc.contentMd, bodySource: doc.contentMd === '' ? 'empty' : 'markdown' }
  }
  if (!hasLegacyBody(doc)) return { markdown: '', bodySource: 'empty' }
  const html = await legacyLexicalToHtml(doc.content!, req)
  return { markdown: htmlToGfm(html, { maxImages: 0 }).markdown, bodySource: 'legacy-converted' }
}

function hasLegacyBody(doc: Body): boolean {
  return (doc.contentMd === null || doc.contentMd === undefined) && Boolean(doc.content?.root?.children?.length)
}

async function findDoc(ctx: AgentContext, req: PayloadRequest, collection: ContentCollection, id: number, depth = 0): Promise<ContentDoc> {
  const doc = await ctx.payload.findByID({ collection, id, req, overrideAccess: false, depth, locale: req.locale ?? DEFAULT_AGENT_LOCALE, fallbackLocale: false, trash: true })
  const siteId = tenantIdOf(doc)
  if (siteId !== undefined) assertSiteMember(ctx, siteId)
  return doc
}

function requireSiteId(doc: ContentDoc): number {
  const siteId = tenantIdOf(doc)
  if (siteId === undefined) throw new AgentError('invalid', `Document #${doc.id} has no site.`)
  return siteId
}

/** Resolve taxonomy refs (ids, {type, slug}, bare category slug) to ids of `siteId`. */
async function resolveTaxonomyIds(ctx: AgentContext, req: PayloadRequest, siteId: number, refs: TaxonomyRef[]): Promise<number[]> {
  const ids = refs.filter((r): r is number => typeof r === 'number')
  await assertRefsInSite(ctx, req, 'taxonomies', ids, siteId, 'categories')
  const bySlug = refs
    .filter((r) => typeof r !== 'number')
    .map((r) => (typeof r === 'string' ? { type: 'category' as const, slug: r } : r))
  if (bySlug.length === 0) return ids

  const { docs } = await ctx.payload.find({
    collection: 'taxonomies',
    req,
    overrideAccess: false,
    depth: 0,
    limit: 0,
    pagination: false,
    select: { type: true, slug: true },
    where: { and: [{ tenant: { equals: siteId } }, { slug: { in: bySlug.map((r) => r.slug) } }] },
  })
  const resolved: number[] = [...ids]
  for (const ref of bySlug) {
    const hit = docs.find((d) => d.type === ref.type && d.slug === ref.slug)
    if (hit) {
      resolved.push(hit.id)
      continue
    }
    const others = docs.filter((d) => d.slug === ref.slug).map((d) => ({ type: d.type, slug: d.slug, id: d.id }))
    throw new AgentError(
      'invalid',
      others.length
        ? `No ${ref.type} "${ref.slug}" on this site; found ${others.map((o) => o.type).join(', ')} — pass {type, slug}.`
        : `No ${ref.type} "${ref.slug}" on this site (create_taxonomy first).`,
      { candidates: others },
    )
  }
  return [...new Set(resolved)]
}

/** `conflict` when another non-trashed document of the site already uses `slug`. */
async function assertSlugFree(ctx: AgentContext, req: PayloadRequest, collection: ContentCollection, siteId: number, slug: string, selfId?: number): Promise<void> {
  const where: Where[] = [{ tenant: { equals: siteId } }, { slug: { equals: slug } }]
  if (selfId !== undefined) where.push({ id: { not_equals: selfId } })
  const { totalDocs } = await ctx.payload.count({ collection, req, overrideAccess: false, where: { and: where } })
  if (totalDocs > 0) {
    throw new AgentError('conflict', `Slug "${slug}" is already used by another ${collection === 'posts' ? 'post' : 'page'} on this site.`)
  }
}

type WriteInput = Partial<Input<'createPost'> & Input<'createPage'>> & { categories?: TaxonomyRef[] }

/** Build the Payload `data` from exactly the keys the caller sent (+ relationship checks). */
async function buildData(ctx: AgentContext, req: PayloadRequest, collection: ContentCollection, siteId: number, input: WriteInput): Promise<Record<string, unknown>> {
  const data: Record<string, unknown> = {}
  if (input.title !== undefined) data.title = input.title
  if (input.markdown !== undefined) data.contentMd = input.markdown
  if (input.slug !== undefined) data.slug = input.slug
  if (input.status !== undefined) data.status = input.status
  if (input.publishedAt !== undefined) data.publishedAt = input.publishedAt
  if (input.featuredImage !== undefined) {
    if (input.featuredImage !== null) await assertRefsInSite(ctx, req, 'media', [input.featuredImage], siteId, 'featuredImage')
    data.featuredImage = input.featuredImage
  }
  if (input.seo !== undefined) data.seo = { ...input.seo }
  if (collection === 'posts') {
    if (input.type !== undefined) data.type = input.type
    if (input.excerpt !== undefined) data.excerpt = input.excerpt
    if (input.categories !== undefined) data.categories = await resolveTaxonomyIds(ctx, req, siteId, input.categories)
    if (input.author !== undefined) {
      if (input.author !== null) await assertRefsInSite(ctx, req, 'authors', [input.author], siteId, 'author')
      data.author = input.author
    }
  } else {
    if (input.pageType !== undefined) data.pageType = input.pageType
    if (input.isPillarPage !== undefined) data.isPillarPage = input.isPillarPage
  }
  return data
}

function writeResult(collection: ContentCollection, doc: ContentDoc) {
  return { collection, ...contentSummary(doc), scheduledFor: scheduledFor(doc) ?? null }
}

// ── reads ────────────────────────────────────────────────────────────────────

export async function searchContent(ctx: AgentContext, input: Input<'searchContent'>) {
  const req = await agentReq(ctx, input.locale)
  const site = await resolveSite(ctx, req, input.site)
  const where: Where[] = [{ tenant: { equals: site.id } }]
  if (input.query) where.push({ or: [{ title: { like: input.query } }, { slug: { like: input.query } }] })
  if (input.status) where.push({ status: { equals: input.status } })
  if (input.collection === 'posts') {
    if (input.type) where.push({ type: { equals: input.type } })
    if (input.taxonomy !== undefined) {
      const [taxonomyId] = await resolveTaxonomyIds(ctx, req, site.id, [input.taxonomy])
      where.push({ categories: { contains: taxonomyId } })
    }
  } else if (input.type || input.taxonomy !== undefined) {
    throw new AgentError('invalid', '`type` and `taxonomy` filters apply to posts only.')
  }
  const result = await ctx.payload.find({
    collection: input.collection,
    req,
    overrideAccess: false,
    depth: 0,
    locale: req.locale ?? DEFAULT_AGENT_LOCALE,
    fallbackLocale: false,
    limit: input.limit ?? 20,
    page: input.page ?? 1,
    sort: '-updatedAt',
    select: SUMMARY_SELECT,
    where: { and: where },
  })
  return {
    site: site.siteKey,
    collection: input.collection,
    totalDocs: result.totalDocs,
    page: result.page ?? 1,
    totalPages: result.totalPages,
    docs: result.docs.map(contentSummary),
  }
}

export async function getContent(ctx: AgentContext, input: Input<'getContent'>) {
  const locale: AgentLocale = input.locale ?? DEFAULT_AGENT_LOCALE
  const req = await agentReq(ctx, locale)
  let id = input.id
  if (id === undefined) {
    const site = await resolveSite(ctx, req, input.site)
    const { docs } = await ctx.payload.find({
      collection: input.collection,
      req,
      overrideAccess: false,
      depth: 0,
      limit: 1,
      select: {},
      where: { and: [{ tenant: { equals: site.id } }, { slug: { equals: input.slug } }] },
    })
    if (!docs[0]) throw new AgentError('not_found', `No ${input.collection} with slug "${input.slug}" on site ${site.siteKey}.`)
    id = docs[0].id
  }
  const doc = await findDoc(ctx, req, input.collection, id, 1)
  const body = await readBody(doc, req)
  const featured = doc.featuredImage
  const tenant = doc.tenant
  const base = {
    collection: input.collection,
    ...contentSummary(doc),
    site: typeof tenant === 'object' && tenant !== null ? tenant.siteKey : null,
    locale,
    translated: Boolean(doc.title),
    scheduledFor: scheduledFor(doc) ?? null,
    ...body,
    featuredImage:
      typeof featured === 'object' && featured !== null ? { id: featured.id, url: featured.url ?? null, alt: featured.alt } : null,
    seo: seoSubset(doc.seo),
    createdAt: doc.createdAt,
  }
  if (input.collection === 'pages') {
    const page = doc as Page
    return { ...base, pageType: page.pageType ?? null, isPillarPage: page.isPillarPage ?? false }
  }
  const post = doc as Post
  const author = post.author
  return {
    ...base,
    type: post.type,
    excerpt: post.excerpt ?? null,
    wordCount: post.wordCount ?? null,
    author: typeof author === 'object' && author !== null ? { id: author.id, name: (author as Author).name } : null,
    categories: (post.categories ?? [])
      .filter((c): c is Taxonomy => typeof c === 'object' && c !== null)
      .map((c) => ({ id: c.id, type: c.type, slug: c.slug, name: c.name ?? null })),
  }
}

// ── writes ───────────────────────────────────────────────────────────────────

export async function createContent(ctx: AgentContext, collection: ContentCollection, input: Input<'createPost'> | Input<'createPage'>) {
  const locale = input.locale ?? DEFAULT_AGENT_LOCALE
  const req = await agentReq(ctx, locale)
  const site = await resolveSite(ctx, req, input.site)
  const slug = input.slug ?? slugifyTitle(input.title)
  if (slug) await assertSlugFree(ctx, req, collection, site.id, slug)
  const data = await buildData(ctx, req, collection, site.id, input)
  const doc = await ctx.payload.create({
    collection,
    req,
    overrideAccess: false,
    depth: 0,
    locale,
    data: { ...data, status: input.status ?? 'draft', tenant: site.id } as never,
  })
  return { site: site.siteKey, ...writeResult(collection, doc) }
}

export async function updateContent(ctx: AgentContext, collection: ContentCollection, input: Input<'updatePost'> | Input<'updatePage'>) {
  const { id, expectedUpdatedAt, acknowledgeLegacyConversion, clearBody, ...fields } = input
  const locale = input.locale ?? DEFAULT_AGENT_LOCALE
  const req = await agentReq(ctx, locale)
  const existing = await findDoc(ctx, req, collection, id)
  if (existing.deletedAt) throw new AgentError('invalid', 'The document is in the trash — restore_from_trash first.')
  const siteId = requireSiteId(existing)

  if (fields.markdown !== undefined) {
    if (fields.markdown === '' && !clearBody) {
      throw new AgentError('invalid', 'Empty markdown would erase the body. Pass clearBody: true if that is intended.')
    }
    if (hasLegacyBody(existing) && !acknowledgeLegacyConversion) {
      throw new AgentError(
        'invalid',
        'This document still stores its body as legacy rich text. Writing markdown replaces it (the old version stays in history). Confirm with the user, then pass acknowledgeLegacyConversion: true.',
      )
    }
  }
  if (fields.slug !== undefined && fields.slug !== existing.slug) await assertSlugFree(ctx, req, collection, siteId, fields.slug, id)

  const data = await buildData(ctx, req, collection, siteId, fields)
  if (Object.keys(data).length === 0) throw new AgentError('invalid', 'Nothing to update — pass at least one field.')

  await assertNotLocked(ctx, req, collection, id)
  const doc = await withRowLock(req, collection, id, expectedUpdatedAt, () =>
    ctx.payload.update({ collection, id, req, overrideAccess: false, overrideLock: false, depth: 0, locale, data: data as never }),
  )
  return writeResult(collection, doc)
}

export async function setStatus(ctx: AgentContext, input: Input<'setStatus'>) {
  const req = await agentReq(ctx)
  const existing = await findDoc(ctx, req, input.collection, input.id)
  if (existing.deletedAt) throw new AgentError('invalid', 'The document is in the trash — restore_from_trash first.')
  const data: Record<string, unknown> = { status: input.status }
  if (input.publishedAt !== undefined) data.publishedAt = input.publishedAt
  await assertNotLocked(ctx, req, input.collection, input.id)
  const doc = await withRowLock(req, input.collection, input.id, input.expectedUpdatedAt, () =>
    ctx.payload.update({ collection: input.collection, id: input.id, req, overrideAccess: false, overrideLock: false, depth: 0, data: data as never }),
  )
  return writeResult(input.collection, doc)
}

export async function trashContent(ctx: AgentContext, input: Input<'trashContent'>) {
  const req = await agentReq(ctx)
  const existing = await findDoc(ctx, req, input.collection, input.id)
  if (existing.deletedAt) return { ...writeResult(input.collection, existing), trashed: true }
  await assertNotLocked(ctx, req, input.collection, input.id)
  const doc = await withRowLock(req, input.collection, input.id, input.expectedUpdatedAt, () =>
    ctx.payload.update({
      collection: input.collection,
      id: input.id,
      req,
      overrideAccess: false,
      overrideLock: false,
      depth: 0,
      data: { deletedAt: new Date().toISOString() } as never,
    }),
  )
  return { ...writeResult(input.collection, doc), trashed: true, undo: 'restore_from_trash' }
}

export async function restoreFromTrash(ctx: AgentContext, input: Input<'restoreFromTrash'>) {
  const req = await agentReq(ctx)
  const existing = await findDoc(ctx, req, input.collection, input.id)
  if (!existing.deletedAt) return writeResult(input.collection, existing)
  await assertSlugFree(ctx, req, input.collection, requireSiteId(existing), existing.slug, input.id)
  await assertNotLocked(ctx, req, input.collection, input.id)
  const doc = await ctx.payload.update({
    collection: input.collection,
    id: input.id,
    req,
    overrideAccess: false,
    overrideLock: false,
    trash: true,
    depth: 0,
    data: { deletedAt: null } as never,
  })
  return writeResult(input.collection, doc)
}

export async function listVersions(ctx: AgentContext, input: Input<'listVersions'>) {
  const req = await agentReq(ctx)
  await findDoc(ctx, req, input.collection, input.id)
  const result = await ctx.payload.findVersions({
    collection: input.collection,
    req,
    overrideAccess: false,
    depth: 0,
    limit: input.limit ?? 10,
    sort: '-updatedAt',
    select: { updatedAt: true, version: { title: true, status: true, slug: true } },
    where: { parent: { equals: input.id } },
  })
  return {
    collection: input.collection,
    id: input.id,
    totalVersions: result.totalDocs,
    versions: result.docs.map((v) => ({
      versionId: v.id,
      updatedAt: v.updatedAt,
      title: v.version?.title ?? null,
      status: v.version?.status ?? null,
      slug: v.version?.slug ?? null,
    })),
  }
}

export async function restoreVersion(ctx: AgentContext, input: Input<'restoreVersion'>) {
  const req = await agentReq(ctx)
  const version = await ctx.payload.findVersionByID({
    collection: input.collection,
    id: String(input.versionId),
    req,
    overrideAccess: false,
    depth: 0,
  })
  const parentRef: unknown = version.parent
  const parentId = typeof parentRef === 'object' && parentRef !== null && 'id' in parentRef ? Number(parentRef.id) : Number(parentRef)
  const existing = await findDoc(ctx, req, input.collection, parentId)
  if (existing.deletedAt) throw new AgentError('invalid', 'The document is in the trash — restore_from_trash first.')
  const versionSlug = version.version?.slug
  if (versionSlug && versionSlug !== existing.slug) {
    await assertSlugFree(ctx, req, input.collection, requireSiteId(existing), versionSlug, parentId)
  }
  await assertNotLocked(ctx, req, input.collection, parentId)
  const doc = await withRowLock(req, input.collection, parentId, input.expectedUpdatedAt, () =>
    ctx.payload.restoreVersion({ collection: input.collection, id: String(input.versionId), req, overrideAccess: false, depth: 0 }),
  )
  return writeResult(input.collection, doc)
}
