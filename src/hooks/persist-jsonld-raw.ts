/**
 * Scalar-only persistence for what `generate-jsonld` derives (SP1a-1, [RT-3]).
 *
 * The hook used to save `{ seo: { ...seo, jsonLd: { raw } } }` through a nested
 * `payload.update()`. With versions enabled that wrote a second version per save, and it routed
 * a locale-RESOLVED copy of the whole `seo` group (localized breadcrumb text, arrays) through the
 * drizzle upsert, which rebuilds locale/array storage — a path that can overwrite the other
 * locale. Everything the hook derives is a NON-localized scalar column on the collection's main
 * table (verified in the migration snapshots: `seo_json_ld_raw` varchar,
 * `seo_article_meta_{published,modified}_time` / `seo_updated_time` timestamptz), so one
 * parameterized UPDATE of exactly those columns replaces it: no version row, no hooks, no
 * `updatedAt` change (the admin reload invariant holds trivially), same transaction as the save.
 */
import type { PayloadRequest } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import type { SQL } from '@payloadcms/db-postgres/drizzle'

import { requestDb } from '../lib/request-db-session'

/** Collections `generate-jsonld` serves; the slug IS the table name for each. */
const JSONLD_TABLES = {
  pages: 'pages',
  posts: 'posts',
  landings: 'landings',
  products: 'products',
  taxonomies: 'taxonomies',
} as const

export type JsonLdCollection = keyof typeof JSONLD_TABLES

export interface JsonLdColumns {
  raw: string
  /** Omitted → column untouched. */
  updatedTime?: string | null
  /** Omitted → both columns untouched (the hook only derives them when `publishedAt` is set). */
  articleMeta?: { publishedTime?: string | null; modifiedTime?: string | null }
}

export function buildJsonLdColumnsUpdate(
  collection: string,
  id: number | string,
  columns: JsonLdColumns,
): SQL {
  const table = JSONLD_TABLES[collection as JsonLdCollection]
  if (!table) throw new Error(`persistJsonLdRaw: ${collection} has no JSON-LD columns`)
  const assignments: SQL[] = [sql`${sql.identifier('seo_json_ld_raw')} = ${columns.raw}`]
  if (columns.updatedTime !== undefined) {
    assignments.push(sql`${sql.identifier('seo_updated_time')} = ${columns.updatedTime}`)
  }
  if (columns.articleMeta) {
    assignments.push(
      sql`${sql.identifier('seo_article_meta_published_time')} = ${columns.articleMeta.publishedTime ?? null}`,
      sql`${sql.identifier('seo_article_meta_modified_time')} = ${columns.articleMeta.modifiedTime ?? null}`,
    )
  }
  return sql`UPDATE ${sql.identifier(table)} SET ${sql.join(assignments, sql`, `)} WHERE ${sql.identifier('id')} = ${id}`
}

export async function persistJsonLdRaw(
  req: PayloadRequest,
  collection: string,
  id: number | string,
  columns: JsonLdColumns,
): Promise<void> {
  await requestDb(req).execute(buildJsonLdColumnsUpdate(collection, id, columns))
}
