import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { PgDialect } from '@payloadcms/db-postgres/drizzle/pg-core'
import type { PayloadRequest } from 'payload'

import { buildJsonLdColumnsUpdate, persistJsonLdRaw } from './persist-jsonld-raw'

const dialect = new PgDialect()
const render = (query: Parameters<PgDialect['sqlToQuery']>[0]) => dialect.sqlToQuery(query)

describe('persistJsonLdRaw — [RT-3] scalar columns only', () => {
  it('writes exactly the four derived scalar columns, parameterized, on the main table', () => {
    const { sql, params } = render(
      buildJsonLdColumnsUpdate('posts', 7, {
        raw: '{"@graph":[]}',
        updatedTime: '2026-09-26T10:00:00.000Z',
        articleMeta: { publishedTime: '2026-01-01T00:00:00.000Z', modifiedTime: '2026-09-26T10:00:00.000Z' },
      }),
    )
    assert.equal(
      sql,
      'UPDATE "posts" SET "seo_json_ld_raw" = $1, "seo_updated_time" = $2, ' +
        '"seo_article_meta_published_time" = $3, "seo_article_meta_modified_time" = $4 WHERE "id" = $5',
    )
    assert.deepEqual(params, [
      '{"@graph":[]}',
      '2026-09-26T10:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
      '2026-09-26T10:00:00.000Z',
      7,
    ])
  })

  it('leaves the timestamp columns alone when the hook did not derive them', () => {
    const { sql, params } = render(buildJsonLdColumnsUpdate('taxonomies', 3, { raw: 'x' }))
    assert.equal(sql, 'UPDATE "taxonomies" SET "seo_json_ld_raw" = $1 WHERE "id" = $2')
    assert.deepEqual(params, ['x', 3])
  })

  it('refuses a collection without JSON-LD columns (no identifier from caller input)', () => {
    assert.throws(() => buildJsonLdColumnsUpdate('users', 1, { raw: 'x' }), /no JSON-LD columns/)
  })

  it('runs on the request transaction session when one is open', async () => {
    const executed: string[] = []
    const onSession = { execute: async () => void executed.push('session') }
    const onPool = { execute: async () => void executed.push('pool') }
    const req = {
      transactionID: 'tx-1',
      payload: { db: { sessions: { 'tx-1': { db: onSession } }, drizzle: onPool } },
    } as unknown as PayloadRequest

    await persistJsonLdRaw(req, 'pages', 1, { raw: 'x' })
    await persistJsonLdRaw({ ...req, transactionID: undefined } as unknown as PayloadRequest, 'pages', 1, { raw: 'x' })
    assert.deepEqual(executed, ['session', 'pool'])
  })
})
