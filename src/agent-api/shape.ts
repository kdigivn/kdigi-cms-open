/**
 * Whitelist output shapes for agents. Never spread a Payload document: new fields (secrets,
 * hashes, legacy Lexical, JSON-LD blobs) must stay invisible until deliberately added here.
 */
import type { Media, Page, Post, Taxonomy } from '../payload-types'

/** Public visibility, mirroring `publishedAndLive()` (status + publish date + not trashed). */
export function isLive(doc: { status?: string | null; publishedAt?: string | null; deletedAt?: string | null }): boolean {
  if (doc.deletedAt || doc.status !== 'published') return false
  return !doc.publishedAt || new Date(doc.publishedAt).getTime() <= Date.now()
}

export function scheduledFor(doc: { status?: string | null; publishedAt?: string | null }): string | undefined {
  if (doc.status !== 'published' || !doc.publishedAt) return undefined
  return new Date(doc.publishedAt).getTime() > Date.now() ? doc.publishedAt : undefined
}

type SummarySource = Pick<Post, 'id' | 'title' | 'slug' | 'status' | 'publishedAt' | 'updatedAt' | 'deletedAt'>

export function contentSummary(doc: SummarySource) {
  return {
    id: doc.id,
    title: doc.title ?? null,
    slug: doc.slug,
    status: doc.status,
    live: isLive(doc),
    publishedAt: doc.publishedAt ?? null,
    updatedAt: doc.updatedAt,
    ...(doc.deletedAt ? { trashed: true } : {}),
  }
}

export function mediaSummary(doc: Pick<Media, 'id' | 'url' | 'alt' | 'filename' | 'mimeType' | 'width' | 'height' | 'updatedAt'>) {
  return {
    id: doc.id,
    url: doc.url ?? null,
    alt: doc.alt,
    filename: doc.filename ?? null,
    mimeType: doc.mimeType ?? null,
    width: doc.width ?? null,
    height: doc.height ?? null,
    updatedAt: doc.updatedAt,
  }
}

export function taxonomySummary(doc: Pick<Taxonomy, 'id' | 'type' | 'slug' | 'name' | 'parent'>) {
  const parent = doc.parent
  return {
    id: doc.id,
    type: doc.type,
    slug: doc.slug,
    name: doc.name ?? null,
    parent: typeof parent === 'object' && parent !== null ? parent.id : (parent ?? null),
  }
}

export function seoSubset(seo: Post['seo'] | Page['seo'] | undefined) {
  return {
    title: seo?.title ?? null,
    description: seo?.description ?? null,
    focusKeywords: seo?.focusKeywords ?? [],
    canonicalOverride: seo?.canonicalOverride ?? null,
  }
}
