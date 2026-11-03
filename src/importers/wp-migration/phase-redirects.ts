/**
 * Phase `redirects` — keep old WordPress URLs alive.
 *
 * Two sources are merged (editor-authored rows win on the same `from`):
 *   1. AUTO — every staged page/post/product whose WordPress permalink path
 *      (`sourcePath`) differs from the CMS public path (publicPathFor) gets a
 *      301 old-path → new-path row. Homepage and identical paths are skipped.
 *   2. MANUAL — staged/redirects/*.json (`StagedRedirect`), e.g. exported from
 *      a WordPress redirect plugin or written by the editor.
 *
 * Rows are upserted into the `redirects` collection keyed by (site, from).
 * Status: 301|302 only — 404/410 are reached by unpublishing the target doc.
 * Idempotency: skip-if-unchanged — only writes when `to` or `statusCode`
 * differs. Safe to re-run.
 */
import fs from 'fs'
import path from 'path'
import { publicPathFor } from '../../lib/frontend-public-path'
import { staged, type ImportContext } from './import-context'
import { stagedDir, type SiteMigrationConfig } from './wp-migration-config'
import type { StagedRedirect } from './staged-doc-types'

interface RedirectCandidate {
  collection: 'pages' | 'posts' | 'products'
  slug: string
  sourcePath?: string
  status: 'published' | 'draft'
}

/** `/a/b/` and `/a/b` are the same path; the root stays `/`. */
function trimPath(p: string): string {
  const withSlash = p.startsWith('/') ? p : `/${p}`
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : withSlash
}

/** Auto-generated 301s for documents whose public path changed. Pure — unit tested. */
export function buildContentRedirects(docs: readonly RedirectCandidate[]): StagedRedirect[] {
  const out: StagedRedirect[] = []
  const seen = new Set<string>()
  for (const doc of docs) {
    if (doc.status !== 'published' || !doc.sourcePath || !doc.slug) continue
    const newPath = publicPathFor(doc.collection, doc.slug)
    if (!newPath) continue
    const from = trimPath(doc.sourcePath)
    if (from === '/' || from === trimPath(newPath)) continue
    if (seen.has(from)) continue
    seen.add(from)
    out.push({ collection: 'redirects', from: `${from}/`, to: newPath, statusCode: 301, note: `auto: wp ${doc.collection}/${doc.slug}` })
  }
  return out
}

/** Strip the target domain from absolute destinations so rows stay site-relative. */
export function relativizeTarget(to: string, domain: string): string {
  const host = domain.replace(/^www\./, '').replace(/\./g, '\\.')
  return to.replace(new RegExp(`^https?://(?:www\\.)?${host}(?=/|$)`, 'i'), '') || '/'
}

function readManualRedirects(cfg: SiteMigrationConfig, log: (m: string) => void): StagedRedirect[] {
  const dir = path.join(stagedDir(cfg), 'redirects')
  if (!fs.existsSync(dir)) return []
  const rows: StagedRedirect[] = []
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json') && !n.startsWith('.')).sort()) {
    const row = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as StagedRedirect
    if (!row.from || !row.to || (row.statusCode !== 301 && row.statusCode !== 302)) {
      throw new Error(`staged/redirects/${f}: invalid shape (from/to required, statusCode 301|302)`)
    }
    rows.push(row)
  }
  log(`redirects: ${rows.length} manual staged row(s)`)
  return rows
}

export async function runRedirectsPhase(ctx: ImportContext): Promise<void> {
  const cfg = ctx.cfg
  const log = ctx.log

  const candidates: RedirectCandidate[] = [
    ...staged.pages(cfg).map((d) => ({ collection: 'pages' as const, slug: d.slug, sourcePath: d.sourcePath, status: d.status })),
    ...staged.posts(cfg).map((d) => ({ collection: 'posts' as const, slug: d.slug, sourcePath: d.sourcePath, status: d.status })),
    ...staged.products(cfg).map((d) => ({ collection: 'products' as const, slug: d.slug, sourcePath: d.sourcePath, status: d.status })),
  ]
  const auto = buildContentRedirects(candidates)
  log(`redirects: ${auto.length} auto row(s) from changed permalinks`)
  const manual = readManualRedirects(cfg, log)

  const byFrom = new Map<string, StagedRedirect>()
  for (const row of auto) byFrom.set(trimPath(row.from), row)
  for (const row of manual) byFrom.set(trimPath(row.from), row)
  const rows = [...byFrom.values()]

  let created = 0
  let updated = 0
  let skipped = 0
  let errors = 0

  for (const row of rows) {
    const to = relativizeTarget(row.to, cfg.domain)
    // Payload stores statusCode as a string select ('301' | '302').
    const statusCode = String(row.statusCode) as '301' | '302'

    if (ctx.dryRun) {
      log(`  [dry-run] would upsert from=${row.from} → to=${to} (${row.statusCode})`)
      created += 1
      continue
    }

    try {
      const existing = await ctx.payload.find({
        collection: 'redirects',
        where: { and: [{ from: { equals: row.from } }, { tenant: { equals: ctx.tenantId } }] },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })

      if (existing.docs.length > 0) {
        const current = existing.docs[0] as unknown as { id: string | number; to?: string; statusCode?: string | number }
        if (current.to === to && String(current.statusCode) === statusCode) {
          skipped += 1
          continue
        }
        await ctx.payload.update({
          collection: 'redirects',
          id: current.id,
          data: { to, statusCode },
          overrideAccess: true,
        })
        updated += 1
      } else {
        await ctx.payload.create({
          collection: 'redirects',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: { from: row.from, to, statusCode, tenant: ctx.tenantId } as any,
          overrideAccess: true,
        })
        created += 1
      }
    } catch (err) {
      log(`  ✖ ${row.from}: ${(err as Error).message}`)
      errors += 1
    }
  }
  log(`redirects: done — created=${created} updated=${updated} skipped=${skipped} errors=${errors}`)
  if (errors) throw new Error(`redirects phase finished with ${errors} error(s)`)
}
