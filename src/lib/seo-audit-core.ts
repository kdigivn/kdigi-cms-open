/**
 * Core SEO audit logic, shared by the /api/seo/audit endpoint and the dashboard
 * SeoAuditWidget so BOTH run it in-process through the Payload local API.
 *
 * Why this exists: the widget previously called `fetch('https://<host>/api/seo/audit')`
 * during dashboard SSR. Inside the Coolify container that hairpins out to the public
 * domain, and with no reliable route back it hangs indefinitely (no timeout) — blocking
 * the dashboard render ("login treo") and leaving the request's DB connection
 * idle-in-transaction until Postgres kills it (idle_in_transaction_session_timeout),
 * which crashed the server. Running the audit in-process removes the self-HTTP call
 * entirely.
 */
import type { BasePayload } from 'payload'
import {
  computeSeoScoreFromDoc,
  isSeoDeficient,
  seoDeficiencyReasons,
  type SeoableDoc,
} from './seo-score-server'

/** Collections that carry the seo field group. */
export const SEO_AUDIT_COLLECTIONS = ['posts', 'pages', 'products', 'landings'] as const
export type SeoAuditCollection = (typeof SEO_AUDIT_COLLECTIONS)[number]

/** Max docs inspected per collection to prevent unbounded scans. */
export const MAX_DOCS_PER_COLLECTION = 200

/** Minimal projection needed for scoring (avoids pulling full content). */
const SCORE_FIELDS = ['id', 'seo', 'slug', 'title', 'status', 'updatedAt'] as const

export interface AuditDoc {
  id: string
  collection: SeoAuditCollection
  title: string
  score: number
  reasons: string[]
  adminUrl: string
}

export interface SeoAuditResult {
  total: number
  deficient: AuditDoc[]
}

/**
 * Query each SEO collection (tenant-scoped, bounded, projected), score every doc,
 * and return the deficient ones worst-first. Pure Payload local API — no HTTP.
 */
export async function runSeoAudit(
  payload: BasePayload,
  tenantId: string,
  limit = 50,
): Promise<SeoAuditResult> {
  const boundedLimit = Math.min(Math.max(limit, 1), MAX_DOCS_PER_COLLECTION)
  const tenantWhere = { tenant: { equals: tenantId } }

  // Query all SEO collections in parallel — shallow depth to avoid N+1.
  const results = await Promise.all(
    SEO_AUDIT_COLLECTIONS.map(async (collection) => {
      const found = await payload.find({
        collection,
        where: tenantWhere,
        limit: boundedLimit,
        depth: 0,
        sort: '-updatedAt',
        select: Object.fromEntries(SCORE_FIELDS.map((f) => [f, true])) as Record<string, true>,
        overrideAccess: true,
      })
      return { collection, docs: found.docs }
    }),
  )

  // Score + filter to deficient docs only.
  const deficient: AuditDoc[] = []
  for (const { collection, docs } of results) {
    for (const doc of docs) {
      const d = doc as unknown as SeoableDoc & {
        id: string
        title?: string
        updatedAt?: string
      }
      if (!isSeoDeficient(d)) continue
      const { score } = computeSeoScoreFromDoc(d)
      const reasons = seoDeficiencyReasons(d)
      deficient.push({
        id: String(d.id),
        collection,
        title: d.title ?? d.seo?.title ?? '(no title)',
        score,
        reasons,
        adminUrl: `/admin/collections/${collection}/${d.id}`,
      })
    }
  }

  // Sort deficient by score ascending (worst first).
  deficient.sort((a, b) => a.score - b.score)

  return { total: deficient.length, deficient }
}
