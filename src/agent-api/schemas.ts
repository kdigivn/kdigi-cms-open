/**
 * Strict input schemas for every agent op — the single validation source for MCP tools (their
 * JSON Schema is generated from these) and for direct callers. `.strict()` everywhere: an
 * unknown key (e.g. `tenant`, or `excerpt` on a page) is an `invalid` error, never silently
 * dropped while the caller believes it was saved.
 */
import { z } from 'zod'

import { AGENT_LOCALES } from './context'

export const CONTENT_COLLECTIONS = ['posts', 'pages'] as const
export const TAXONOMY_TYPES = ['category', 'tag', 'product-category', 'custom'] as const
export const POST_TYPES = ['blog', 'news', 'guide'] as const
export const PAGE_TYPES = ['default', 'blog', 'landing'] as const
export const STATUSES = ['draft', 'published'] as const

const id = z.number().int().positive()
const isoDate = z.iso.datetime({ offset: true })
const site = z
  .string()
  .min(1)
  .optional()
  .describe('Site key (see list_sites). Optional when the API key belongs to exactly one site.')
const locale = z.enum(AGENT_LOCALES).optional().describe('Content locale; default "vi".')
const collection = z.enum(CONTENT_COLLECTIONS)
const expectedUpdatedAt = z.iso
  .datetime({ offset: true, error: 'required: call get_content first and pass its `updatedAt` as expectedUpdatedAt' })
  .describe('The `updatedAt` you got from get_content. The write is rejected with `conflict` if the document changed since.')
const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase letters, digits and single hyphens')
  .max(200)
const markdown = z.string().max(500_000).describe('Body as Markdown (GFM). Shortcodes: see list_shortcodes.')
const publishedAt = isoDate
  .nullable()
  .describe('Publish date. A future date with status "published" schedules the document (live:false until then).')

const seo = z
  .object({
    title: z.string().max(200).optional(),
    description: z.string().max(500).optional(),
    focusKeywords: z.array(z.string().min(1).max(100)).max(10).optional(),
    canonicalOverride: z.union([z.url(), z.literal('')]).optional(),
  })
  .strict()
  .describe('SEO fields to set. Omitted keys keep their stored value.')

const taxonomyRef = z
  .union([
    id,
    z.object({ type: z.enum(TAXONOMY_TYPES), slug: z.string().min(1) }).strict(),
    z.string().min(1).describe('A bare slug means a taxonomy of type "category".'),
  ])
  .describe('Taxonomy id, {type, slug}, or a bare category slug.')

const postFields = {
  type: z.enum(POST_TYPES).optional(),
  excerpt: z.string().max(2000).optional(),
  categories: z.array(taxonomyRef).max(50).optional().describe('Replaces the full list of categories and tags.'),
  author: id.nullable().optional().describe('Id of an `authors` entry of the same site (byline).'),
}
const pageFields = {
  pageType: z.enum(PAGE_TYPES).optional(),
  isPillarPage: z.boolean().optional(),
}
const sharedCreate = {
  site,
  locale,
  title: z.string().min(1).max(300),
  markdown,
  slug: slug.optional().describe('Derived from the title when omitted.'),
  status: z.enum(STATUSES).optional().describe('Default "draft". Publish only when the user asks.'),
  publishedAt: publishedAt.optional(),
  featuredImage: id.nullable().optional().describe('Media id of the same site.'),
  seo: seo.optional(),
}
const legacyFlags = {
  acknowledgeLegacyConversion: z
    .boolean()
    .optional()
    .describe('Required to write `markdown` to a document whose body is still legacy rich text (bodySource "legacy-converted").'),
  clearBody: z.boolean().optional().describe('Required to save an empty `markdown` body.'),
}
const sharedUpdate = {
  id,
  expectedUpdatedAt,
  locale,
  title: z.string().min(1).max(300).optional(),
  markdown: markdown.optional(),
  slug: slug.optional(),
  status: z.enum(STATUSES).optional(),
  publishedAt: publishedAt.optional(),
  featuredImage: id.nullable().optional(),
  seo: seo.optional(),
  ...legacyFlags,
}

export const schemas = {
  whoami: z.object({}).strict(),
  listSites: z.object({}).strict(),
  getSite: z.object({ site }).strict(),
  searchContent: z
    .object({
      collection,
      site,
      locale,
      query: z.string().max(200).optional().describe('Case-insensitive match on title or slug.'),
      status: z.enum(STATUSES).optional(),
      type: z.enum(POST_TYPES).optional().describe('Posts only.'),
      taxonomy: taxonomyRef.optional().describe('Posts only: filter by category/tag.'),
      limit: z.number().int().min(1).max(50).optional(),
      page: z.number().int().min(1).optional(),
    })
    .strict(),
  getContent: z
    .object({
      collection,
      id: id.optional(),
      site,
      slug: z.string().min(1).max(300).optional().describe('Look up by slug (with site) instead of id.'),
      locale,
    })
    .strict()
    .refine((v) => v.id !== undefined || v.slug !== undefined, 'Pass either id or slug.'),
  createPost: z.object({ ...sharedCreate, ...postFields }).strict(),
  createPage: z.object({ ...sharedCreate, ...pageFields }).strict(),
  updatePost: z.object({ ...sharedUpdate, ...postFields }).strict(),
  updatePage: z.object({ ...sharedUpdate, ...pageFields }).strict(),
  setStatus: z.object({ collection, id, status: z.enum(STATUSES), publishedAt: publishedAt.optional(), expectedUpdatedAt }).strict(),
  trashContent: z.object({ collection, id, expectedUpdatedAt }).strict(),
  restoreFromTrash: z.object({ collection, id }).strict(),
  listVersions: z.object({ collection, id, limit: z.number().int().min(1).max(30).optional() }).strict(),
  restoreVersion: z.object({ collection, versionId: z.union([id, z.string().min(1)]), expectedUpdatedAt }).strict(),
  listTaxonomies: z
    .object({ site, locale, type: z.enum(TAXONOMY_TYPES).optional(), limit: z.number().int().min(1).max(500).optional() })
    .strict(),
  createTaxonomy: z
    .object({
      site,
      locale,
      type: z.enum(TAXONOMY_TYPES),
      name: z.string().min(1).max(200),
      slug: slug.optional(),
      description: z.string().max(5000).optional(),
      parent: id.optional(),
    })
    .strict(),
  searchMedia: z
    .object({
      site,
      id: id.optional().describe('Fetch one media item (e.g. to get its updatedAt before update_media_alt).'),
      query: z.string().max(200).optional(),
      limit: z.number().int().min(1).max(50).optional(),
      page: z.number().int().min(1).optional(),
    })
    .strict(),
  importMediaFromUrl: z
    .object({ site, url: z.url().max(500), alt: z.string().min(1).max(300).optional() })
    .strict(),
  updateMediaAlt: z.object({ id, alt: z.string().min(1).max(300), expectedUpdatedAt }).strict(),
  listShortcodes: z.object({ site }).strict(),
  seoAudit: z.object({ site, locale, limit: z.number().int().min(1).max(50).optional() }).strict(),
  getSeoReport: z.object({ collection, id, locale }).strict(),
  getContentUrls: z.object({ collection, id }).strict(),
}

export type Schemas = typeof schemas
export type Input<K extends keyof Schemas> = z.infer<Schemas[K]>
export type TaxonomyRef = z.infer<typeof taxonomyRef>
export type ContentCollection = (typeof CONTENT_COLLECTIONS)[number]
