/**
 * A post/page as a local Markdown file: YAML frontmatter (metadata) + Markdown body.
 * `kcms posts get -o x.md` writes it; `kcms posts create|update x.md` reads it. Unknown keys are
 * a usage error — a typo must never be silently dropped while the user believes it was saved.
 */
import { parse, stringify } from 'yaml'

import { usageError } from './errors.js'

export type Collection = 'posts' | 'pages'

export interface CategoryRef {
  type: string
  slug: string
}

export interface DocMeta {
  id?: number
  collection?: Collection
  site?: string
  title?: string
  slug?: string
  status?: 'draft' | 'published'
  publishedAt?: string | null
  locale?: 'vi' | 'en'
  /** Media id, or a local image path (uploaded first). */
  featuredImage?: number | string | null
  seo?: { title?: string; description?: string; focusKeywords?: string[]; canonicalOverride?: string }
  updatedAt?: string
  bodySource?: string
  // posts
  type?: 'blog' | 'news' | 'guide'
  excerpt?: string
  categories?: Array<CategoryRef | number | string>
  author?: number | null
  // pages
  pageType?: 'default' | 'blog' | 'landing'
  isPillarPage?: boolean
}

export interface MarkdownDoc {
  meta: DocMeta
  body: string
}

const COMMON_KEYS = ['id', 'collection', 'site', 'title', 'slug', 'status', 'publishedAt', 'locale', 'featuredImage', 'seo', 'updatedAt', 'bodySource']
const KEYS: Record<Collection, string[]> = {
  posts: [...COMMON_KEYS, 'type', 'excerpt', 'categories', 'author'],
  pages: [...COMMON_KEYS, 'pageType', 'isPillarPage'],
}
const SEO_KEYS = ['title', 'description', 'focusKeywords', 'canonicalOverride']
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export function parseMarkdownDoc(text: string, collection: Collection): MarkdownDoc {
  const match = FRONTMATTER.exec(text)
  const raw: unknown = match ? parse(match[1]) : {}
  if (raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) throw usageError('Frontmatter must be a YAML mapping.')
  const meta = (raw ?? {}) as Record<string, unknown>
  const unknown = Object.keys(meta).filter((k) => !KEYS[collection].includes(k))
  if (unknown.length > 0) {
    throw usageError(`Unknown frontmatter key(s) for ${collection}: ${unknown.join(', ')}. Allowed: ${KEYS[collection].join(', ')}.`)
  }
  if (meta.collection !== undefined && meta.collection !== collection) {
    throw usageError(`This file is a ${String(meta.collection)} document; use \`kcms ${String(meta.collection)} …\`.`)
  }
  const seo = meta.seo
  if (seo !== undefined && seo !== null) {
    if (typeof seo !== 'object' || Array.isArray(seo)) throw usageError('`seo` must be a mapping.')
    const badSeo = Object.keys(seo).filter((k) => !SEO_KEYS.includes(k))
    if (badSeo.length > 0) throw usageError(`Unknown seo key(s): ${badSeo.join(', ')}. Allowed: ${SEO_KEYS.join(', ')}.`)
  }
  const body = (match ? text.slice(match[0].length) : text).replace(/^\r?\n/, '').replace(/\s+$/, '')
  return { meta: meta as DocMeta, body }
}

/** `get_content` result → file text. Only keys the file format knows are written. */
export function contentToMarkdownDoc(content: Record<string, unknown>): string {
  const collection = content.collection as Collection
  const featured = content.featuredImage
  const seo = (content.seo ?? {}) as Record<string, unknown>
  const meta: Record<string, unknown> = {
    id: content.id,
    collection,
    site: content.site,
    locale: content.locale,
    title: content.title,
    slug: content.slug,
    status: content.status,
    publishedAt: content.publishedAt ?? null,
    featuredImage: featured && typeof featured === 'object' && 'id' in featured ? featured.id : null,
  }
  if (collection === 'posts') {
    meta.type = content.type
    if (typeof content.excerpt === 'string' && content.excerpt) meta.excerpt = content.excerpt
    const categories = Array.isArray(content.categories) ? content.categories : []
    meta.categories = categories.map((c: { type: string; slug: string }) => ({ type: c.type, slug: c.slug }))
    const author = content.author
    meta.author = author && typeof author === 'object' && 'id' in author ? author.id : null
  } else {
    meta.pageType = content.pageType ?? 'default'
    meta.isPillarPage = content.isPillarPage ?? false
  }
  meta.seo = Object.fromEntries(Object.entries(seo).filter(([k, v]) => SEO_KEYS.includes(k) && v !== null && v !== ''))
  meta.updatedAt = content.updatedAt
  meta.bodySource = content.bodySource
  const markdown = typeof content.markdown === 'string' ? content.markdown : ''
  return `---\n${stringify(meta, { lineWidth: 0 })}---\n\n${markdown.replace(/\s+$/, '')}\n`
}

/** Replace `updatedAt` in an existing file after a successful update (keeps everything else). */
export function withUpdatedAt(text: string, updatedAt: string): string {
  return text.replace(FRONTMATTER, (block) =>
    /^updatedAt:.*$/m.test(block) ? block.replace(/^updatedAt:.*$/m, `updatedAt: ${updatedAt}`) : block.replace(/\r?\n---/, `\nupdatedAt: ${updatedAt}\n---`),
  )
}

const WRITABLE_FIELDS = ['title', 'slug', 'status', 'publishedAt', 'type', 'excerpt', 'author', 'pageType', 'isPillarPage'] as const

function normalizeSeo(seo: DocMeta['seo'] | Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of SEO_KEYS) {
    const value = seo?.[key as keyof typeof seo]
    if (value !== undefined && value !== null && value !== '') out[key] = value
  }
  return out
}

function categoryKey(ref: CategoryRef | number | string): string {
  if (typeof ref === 'number') return `#${ref}`
  if (typeof ref === 'string') return `category:${ref}`
  return `${ref.type}:${ref.slug}`
}

/** Tool arguments for `create_post` / `create_page` (featuredImage already resolved to an id). */
export function createArgs(doc: MarkdownDoc, collection: Collection): Record<string, unknown> {
  const { meta, body } = doc
  if (!meta.title) throw usageError('`title` is required in the frontmatter.')
  const args: Record<string, unknown> = { markdown: body }
  for (const key of ['site', 'locale', 'title', 'slug', 'status', 'publishedAt', 'featuredImage'] as const) {
    if (meta[key] !== undefined && meta[key] !== null) args[key] = meta[key]
  }
  const seo = normalizeSeo(meta.seo)
  if (Object.keys(seo).length > 0) args.seo = seo
  if (collection === 'posts') {
    for (const key of ['type', 'excerpt', 'categories', 'author'] as const) {
      if (meta[key] !== undefined && meta[key] !== null) args[key] = meta[key]
    }
  } else {
    if (meta.pageType !== undefined) args.pageType = meta.pageType
    if (meta.isPillarPage !== undefined) args.isPillarPage = meta.isPillarPage
  }
  return args
}

/**
 * Tool arguments for `update_post` / `update_page`: only what differs from the current server
 * state (`get_content` result), so unrelated fields — and other editors' work — are untouched.
 */
export function updateArgs(doc: MarkdownDoc, current: Record<string, unknown>, collection: Collection): Record<string, unknown> {
  const { meta, body } = doc
  if (meta.id === undefined) throw usageError('`id` is missing from the frontmatter — use `create` for a new document.')
  if (!meta.updatedAt) throw usageError('`updatedAt` is missing from the frontmatter — fetch the file with `kcms … get -o`.')
  const changes: Record<string, unknown> = {}
  const currentFields: Record<string, unknown> = {
    ...current,
    featuredImage: (current.featuredImage as { id?: number } | null)?.id ?? null,
    author: (current.author as { id?: number } | null)?.id ?? null,
  }
  for (const key of WRITABLE_FIELDS) {
    if (!KEYS[collection].includes(key) || meta[key] === undefined) continue
    if (JSON.stringify(meta[key] ?? null) !== JSON.stringify(currentFields[key] ?? null)) changes[key] = meta[key]
  }
  if (meta.featuredImage !== undefined && meta.featuredImage !== currentFields.featuredImage) changes.featuredImage = meta.featuredImage
  if (meta.seo !== undefined) {
    const wanted = normalizeSeo(meta.seo)
    const have = normalizeSeo(current.seo as Record<string, unknown>)
    const seoChanges = Object.fromEntries(Object.entries(wanted).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(have[k])))
    if (Object.keys(seoChanges).length > 0) changes.seo = seoChanges
  }
  if (collection === 'posts' && meta.categories !== undefined) {
    const wanted = meta.categories.map(categoryKey).sort().join()
    const have = ((current.categories ?? []) as CategoryRef[]).map(categoryKey).sort().join()
    if (wanted !== have) changes.categories = meta.categories
  }
  const currentBody = typeof current.markdown === 'string' ? current.markdown.replace(/\s+$/, '') : ''
  if (body !== currentBody) changes.markdown = body
  return { id: meta.id, expectedUpdatedAt: meta.updatedAt, ...(meta.locale ? { locale: meta.locale } : {}), ...changes }
}
