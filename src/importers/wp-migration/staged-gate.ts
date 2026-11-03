/**
 * Step 3 gate — the hard stop between co-editing staged/ and importing.
 *
 *   lint   — schema validator over every staged doc; must be clean to lock
 *   lock   — editor approval: writes .gate-lock { approver, timestamp, contentHash }
 *   status — shows lock state and whether the hash still matches
 *
 * The lock self-invalidates: any change under staged/ shifts contentHash, so
 * the import phases re-verify before running (verifyGateLock).
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import os from 'os'
import {
  SUPPORTED_CURRENCIES,
  gateLockPath,
  stagedDir,
  type SiteMigrationConfig,
} from './wp-migration-config'
import { lintReleaseContentPolicy } from './release-content-policy'
import { kkStarRatingProblems } from './kk-star-rating'

// ── Content hash ──────────────────────────────────────────────────────────────

/** Deterministic hash of every *.json under staged/ (path + bytes). */
export function hashStagedContent(cfg: SiteMigrationConfig): string {
  const root = stagedDir(cfg)
  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(p)
      else if (entry.isFile() && entry.name.endsWith('.json')) files.push(p)
    }
  }
  if (!fs.existsSync(root)) throw new Error(`staged/ missing: ${root}`)
  walk(root)
  const h = crypto.createHash('sha256')
  for (const f of files) {
    h.update(path.relative(root, f))
    h.update('\0')
    h.update(fs.readFileSync(f))
    h.update('\0')
  }
  return h.digest('hex')
}

export interface GateLock {
  approver: string
  timestamp: string
  contentHash: string
}

export function readGateLock(cfg: SiteMigrationConfig): GateLock | null {
  const p = gateLockPath(cfg)
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as GateLock
  } catch {
    return null
  }
}

/** Valid lock = file exists AND hash matches current staged content. */
export function verifyGateLock(cfg: SiteMigrationConfig): { ok: boolean; reason?: string; lock?: GateLock } {
  const lock = readGateLock(cfg)
  if (!lock) return { ok: false, reason: '.gate-lock not found — editor must run --gate lock' }
  const current = hashStagedContent(cfg)
  if (current !== lock.contentHash) {
    return { ok: false, reason: `staged/ changed after lock (hash mismatch) — re-run --gate lint + lock`, lock }
  }
  return { ok: true, lock }
}

// ── Lint ──────────────────────────────────────────────────────────────────────

export interface LintIssue {
  file: string
  level: 'error' | 'warn'
  message: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = Record<string, any>

const VALID_STATUS = new Set(['published', 'draft'])
const MENU_LOCATIONS = new Set(['PRIMARY', 'SECONDARY_MENU', 'MOBILE_MENU', 'FOOTER_MENU', 'LOGGEDIN_ACCOUNT_MENU'])
const TAXONOMY_TYPES = new Set(['category', 'tag', 'product-category', 'custom'])
/** Menus nested deeper than this are cut at read time by the CMS (menu-tree-to-rest MAX_DEPTH). */
const MAX_MENU_DEPTH = 10

/** Identity of a taxonomy term: `type:slug`, `custom:<wpTaxonomy>:slug` for custom taxonomies. */
function termKey(type: string, slug: string, wpTaxonomy?: string): string {
  return type === 'custom' ? `custom:${wpTaxonomy ?? ''}:${slug}` : `${type}:${slug}`
}

/**
 * Validate every staged doc. Errors block the lock; warns are surfaced for the
 * editor but do not block (e.g. empty media alt on decorative images).
 */
export function lintStaged(cfg: SiteMigrationConfig): LintIssue[] {
  const root = stagedDir(cfg)
  const issues: LintIssue[] = []
  const push = (file: string, level: LintIssue['level'], message: string) => issues.push({ file, level, message })

  const readDocs = (collection: string): Array<{ file: string; doc: Doc }> => {
    const dir = path.join(root, collection)
    if (!fs.existsSync(dir)) return []
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json') && !f.startsWith('.'))
      .map((f) => {
        const rel = `${collection}/${f}`
        try {
          return { file: rel, doc: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as Doc }
        } catch (err) {
          push(rel, 'error', `invalid JSON: ${err instanceof Error ? err.message : err}`)
          return null
        }
      })
      .filter((x): x is { file: string; doc: Doc } => !!x)
  }

  // When the CMS will be served from the same host as the WordPress backend
  // (in-place cutover) there is no "old host" left to leak, so the checks are off.
  const sameHost = cfg.wpHost.replace(/^www\./, '') === cfg.domain.replace(/^www\./, '')
  const wpHostRe = sameHost ? /$^/ : new RegExp(cfg.wpHost.replace(/\./g, '\\.'), 'i')

  // Media inventory for reference checks
  const mediaDocs = readDocs('media')
  const mediaByUrl = new Set(mediaDocs.map((m) => m.doc.sourceUrl))
  for (const { file, doc } of mediaDocs) {
    if (!doc.sourceUrl) push(file, 'error', 'media missing sourceUrl')
    if (!doc.alt || !String(doc.alt).trim()) push(file, 'warn', 'media alt empty (required at import — importer falls back to filename)')
  }

  // Taxonomy inventory for parent/ref checks. Exclude `.delete-<name>.json`
  // directives — they're consumed by phase-taxonomy's delete sweep, not
  // by the importer's upsert path. Check the basename only (file is
  // "<collection>/<name>").
  const taxonomyDocs = readDocs('taxonomies').filter(({ file }) => {
    const name = file.split('/').pop() ?? file
    return !name.startsWith('.delete-')
  })
  const taxonomyByWpId = new Map<string, Doc>()
  const taxonomyKeys = new Set<string>()
  for (const { file, doc } of taxonomyDocs) {
    if (!doc.type || !TAXONOMY_TYPES.has(doc.type)) push(file, 'error', `taxonomy type invalid: ${doc.type}`)
    if (!doc.name) push(file, 'error', 'taxonomy missing name')
    if (!doc.slug) push(file, 'error', 'taxonomy missing slug')
    if (doc.type === 'custom' && !doc.wp?.taxonomy) push(file, 'error', 'custom taxonomy missing wp.taxonomy')
    if (doc.wp?.databaseId != null) taxonomyByWpId.set(`${doc.wp.taxonomy}:${doc.wp.databaseId}`, doc)
    taxonomyKeys.add(termKey(doc.type, doc.slug, doc.wp?.taxonomy))
  }
  for (const { file, doc } of taxonomyDocs) {
    if (doc.parentWpId && !taxonomyByWpId.has(`${doc.wp?.taxonomy}:${doc.parentWpId}`)) {
      push(file, 'error', `parent term ${doc.parentWpId} not found among staged taxonomies`)
    }
  }

  const authorSlugs = new Set(readDocs('authors').map((a) => a.doc.slug))

  // Content collections
  for (const collection of ['pages', 'posts', 'products'] as const) {
    for (const { file, doc } of readDocs(collection)) {
      if (!doc.title) push(file, 'error', 'missing title')
      // slug: '' is a deliberate, valid value for the homepage doc (pages
      // collection only) — only an absent key is an actual error.
      if (doc.slug === undefined || doc.slug === null) push(file, 'error', 'missing slug')
      if (!VALID_STATUS.has(doc.status)) push(file, 'error', `status must be published|draft (got: ${doc.status})`)
      if (!doc.date) push(file, 'error', 'missing WP date (publishedAt would default to import time)')
      if (!doc.contentMd || !doc.contentMd.trim()) push(file, 'warn', 'contentMd empty')
      if (doc.featuredImage?.sourceUrl && !mediaByUrl.has(doc.featuredImage.sourceUrl)) {
        push(file, 'warn', `featuredImage not in staged media inventory: ${doc.featuredImage.sourceUrl}`)
      }
      const canonical = doc.seo?.canonicalOverride
      if (canonical && wpHostRe.test(canonical)) push(file, 'error', `canonical still points at the WordPress host: ${canonical}`)
      if (canonical && !canonical.includes(cfg.domain)) push(file, 'warn', `canonical not on ${cfg.domain}: ${canonical}`)
      const ogUrl = doc.seo?.openGraph?.url
      if (ogUrl && wpHostRe.test(ogUrl)) push(file, 'error', `og:url still points at the WordPress host: ${ogUrl}`)
      if (doc.seo?.jsonLd?.raw) push(file, 'error', 'seo.jsonLd.raw must not be staged — the hook regenerates it')
      if (doc.kkStarRating !== undefined) {
        for (const problem of kkStarRatingProblems(doc.kkStarRating)) push(file, 'error', problem)
      }

      if (collection === 'posts') {
        if (doc.authorSlug && !authorSlugs.has(doc.authorSlug)) push(file, 'warn', `authorSlug ${doc.authorSlug} not in staged authors`)
      }
      if (collection === 'posts' || collection === 'products') {
        const catType = collection === 'products' ? 'product-category' : 'category'
        for (const c of doc.categories ?? []) {
          if (!taxonomyKeys.has(termKey(catType, c.slug)) && !taxonomyKeys.has(termKey('category', c.slug))) {
            push(file, 'warn', `category ${c.slug} not in staged taxonomies`)
          }
        }
        for (const t of doc.tags ?? []) {
          if (!taxonomyKeys.has(termKey('tag', t.slug))) push(file, 'warn', `tag ${t.slug} not in staged taxonomies`)
        }
        for (const t of (doc.customTerms ?? []) as Doc[]) {
          if (!taxonomyKeys.has(termKey('custom', t.slug, t.taxonomy))) {
            push(file, 'warn', `${t.taxonomy} term ${t.slug} not in staged taxonomies`)
          }
        }
      }
      if (collection === 'products') {
        const currency = doc.price?.currency
        if (currency && !SUPPORTED_CURRENCIES.includes(String(currency).toUpperCase())) {
          push(file, 'warn', `price currency ${currency} is not supported by products.prices (VND|USD|EUR|GBP|JPY) — the importer will default to VND; fix the price by hand`)
        }
        for (const s of doc.gallery ?? []) {
          if (s.sourceUrl && !mediaByUrl.has(s.sourceUrl)) push(file, 'warn', `gallery image not in staged media: ${s.sourceUrl}`)
        }
      }
    }
  }

  // Menus
  for (const { file, doc } of readDocs('menus')) {
    if (!MENU_LOCATIONS.has(doc.location)) push(file, 'error', `menu location invalid: ${doc.location}`)
    if (!Array.isArray(doc.tree) || !doc.tree.length) push(file, 'warn', 'menu tree empty')
    const walkNodes = (nodes: Doc[], depth: number) => {
      for (const n of nodes ?? []) {
        if (!n.label) push(file, 'error', 'menu node missing label')
        if (!n.url) push(file, 'error', `menu node missing url (label: ${n.label})`)
        if (n.url && wpHostRe.test(n.url)) push(file, 'error', `menu url points at WP host: ${n.url}`)
        if (depth >= MAX_MENU_DEPTH && n.children?.length) push(file, 'error', `menu deeper than ${MAX_MENU_DEPTH} levels — flatten`)
        walkNodes(n.children ?? [], depth + 1)
      }
    }
    walkNodes(doc.tree ?? [], 0)
  }

  // FAQs
  for (const { file, doc } of readDocs('faqs')) {
    if (!doc.group) push(file, 'error', 'faq missing group')
    for (const item of doc.items ?? []) {
      if (!item.question || !item.answer) push(file, 'error', 'faq item missing question/answer')
    }
  }

  // Comments
  for (const { file, doc } of readDocs('comments')) {
    if (!doc.authorName || !String(doc.authorName).trim()) push(file, 'error', 'comment missing authorName')
    if (!doc.content || !String(doc.content).trim()) push(file, 'error', 'comment missing content')
    if (!doc.target?.slug || !doc.target?.type) push(file, 'error', 'comment missing valid target')
    if (!['approved', 'pending', 'spam'].includes(doc.status)) push(file, 'error', `comment invalid status: ${doc.status}`)
  }

  // Site config
  const siteDocs = readDocs('site')
  if (!siteDocs.length) {
    push('site/site-config.json', 'error', 'site-config missing — normalize did not produce staged/site/')
  }
  for (const { file, doc } of siteDocs) {
    if (doc.siteKey !== cfg.site) push(file, 'error', `siteKey ${doc.siteKey} != site ${cfg.site}`)
    if (doc.domain !== cfg.domain) push(file, 'error', `domain ${doc.domain} != ${cfg.domain}`)
  }

  // Optional per-site release policy (denylisted media) is blocking, not advisory.
  issues.push(...lintReleaseContentPolicy(cfg))

  return issues
}

// ── Lock / status commands ────────────────────────────────────────────────────

export function runGateLint(cfg: SiteMigrationConfig): boolean {
  const issues = lintStaged(cfg)
  const errors = issues.filter((i) => i.level === 'error')
  const warns = issues.filter((i) => i.level === 'warn')
  for (const i of issues) {
    console.log(`  ${i.level === 'error' ? '✖' : '⚠'} [${i.file}] ${i.message}`)
  }
  console.log(`\ngate lint: ${errors.length} error(s), ${warns.length} warning(s)`)
  return errors.length === 0
}

export function runGateLock(cfg: SiteMigrationConfig): boolean {
  if (!runGateLint(cfg)) {
    console.error('\n⛔ lint errors present — fix them before locking')
    return false
  }
  const lock: GateLock = {
    approver: process.env.GATE_APPROVER || os.userInfo().username,
    timestamp: new Date().toISOString(),
    contentHash: hashStagedContent(cfg),
  }
  fs.writeFileSync(gateLockPath(cfg), JSON.stringify(lock, null, 2) + '\n', 'utf-8')
  console.log(`\n✔ gate locked by ${lock.approver} @ ${lock.timestamp}`)
  console.log(`  contentHash: ${lock.contentHash}`)
  return true
}

export function runGateStatus(cfg: SiteMigrationConfig): void {
  const result = verifyGateLock(cfg)
  if (result.ok && result.lock) {
    console.log(`✔ gate LOCKED — approver=${result.lock.approver} @ ${result.lock.timestamp}`)
    console.log(`  contentHash: ${result.lock.contentHash} (matches staged/)`)
  } else {
    console.log(`✖ gate NOT locked: ${result.reason}`)
    if (result.lock) console.log(`  (stale lock by ${result.lock.approver} @ ${result.lock.timestamp})`)
  }
}
