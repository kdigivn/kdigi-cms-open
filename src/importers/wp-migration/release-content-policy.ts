/**
 * Optional per-site media denylist for the WordPress migration.
 *
 * A site owner drops `wp-archive/<site>/denylist.json` next to `raw/` and
 * `staged/` to keep assets that must never cross the migration gate (private
 * screenshots, receipts, attachments whose binary 404s on the source):
 *
 *   { "media": [ { "wpId": 123, "filenameStem": "order-receipt", "reason": "contains customer data" } ] }
 *
 * A rule matches by immutable WP attachment id OR by filename stem (case
 * insensitive, searched in the source URL and local path) so a CDN/host rewrite
 * cannot bypass it. Without the file nothing is denied.
 *
 * Consumers: normalize (skips denied attachments) and the staged gate
 * (`lintReleaseContentPolicy` errors on any staged doc that still references one).
 */
import fs from 'fs'
import path from 'path'
import { archiveRoot, stagedDir, type SiteMigrationConfig } from './wp-migration-config'

export interface ReleasePolicyIssue {
  file: string
  level: 'error'
  message: string
}

export interface MediaDenyRule {
  /** WP attachment databaseId. */
  wpId?: number
  /** Lower-case substring of the file name (without extension), e.g. `order-receipt`. */
  filenameStem?: string
  reason: string
}

export interface MediaCandidate {
  wpId?: number | null
  sourceUrl?: string | null
  localPath?: string | null
}

type JsonDoc = Record<string, unknown>

/** What `deniedMediaReason` accepts: a site (loads its denylist file) or already-loaded rules. */
export type MediaDenylistSource = Pick<SiteMigrationConfig, 'site'> | readonly MediaDenyRule[]

/** `wp-archive/<site>/denylist.json` */
export function denylistPath(cfg: Pick<SiteMigrationConfig, 'site'>): string {
  return path.join(archiveRoot(cfg), 'denylist.json')
}

function parseRule(value: unknown, index: number): MediaDenyRule {
  const where = `denylist.json media[${index}]`
  if (!value || typeof value !== 'object') throw new Error(`${where} must be an object`)
  const { wpId, filenameStem, reason } = value as Record<string, unknown>
  if (typeof reason !== 'string' || !reason.trim()) throw new Error(`${where}.reason is required`)
  const hasId = typeof wpId === 'number' && Number.isInteger(wpId)
  const hasStem = typeof filenameStem === 'string' && filenameStem.trim().length > 0
  if (wpId !== undefined && !hasId) throw new Error(`${where}.wpId must be an integer`)
  if (filenameStem !== undefined && !hasStem) throw new Error(`${where}.filenameStem must be a non-empty string`)
  if (!hasId && !hasStem) throw new Error(`${where} needs wpId and/or filenameStem`)
  return {
    ...(hasId ? { wpId } : {}),
    ...(hasStem ? { filenameStem: filenameStem.trim().toLowerCase() } : {}),
    reason: reason.trim(),
  }
}

/** Validate untrusted denylist JSON into rules. Throws a descriptive error on a malformed file. */
export function parseMediaDenylist(json: unknown): MediaDenyRule[] {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error('denylist.json must be an object: { "media": [ ... ] }')
  }
  const media = 'media' in json ? json.media : undefined
  if (media === undefined) return []
  if (!Array.isArray(media)) throw new Error('denylist.json "media" must be an array')
  return media.map(parseRule)
}

const denylistCache = new Map<string, { mtimeMs: number; rules: MediaDenyRule[] }>()

/** Load the optional per-site denylist ([] when the file does not exist). */
export function loadMediaDenylist(cfg: Pick<SiteMigrationConfig, 'site'>): MediaDenyRule[] {
  const file = denylistPath(cfg)
  let mtimeMs: number
  try {
    mtimeMs = fs.statSync(file).mtimeMs
  } catch {
    return []
  }
  const cached = denylistCache.get(file)
  if (cached && cached.mtimeMs === mtimeMs) return cached.rules
  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch (err) {
    throw new Error(`${file} is not valid JSON: ${(err as Error).message}`)
  }
  const rules = parseMediaDenylist(parsed)
  denylistCache.set(file, { mtimeMs, rules })
  return rules
}

/** Human-readable reason when the candidate matches a denylist rule, else undefined. */
export function deniedMediaReason(source: MediaDenylistSource, candidate: MediaCandidate): string | undefined {
  const rules: readonly MediaDenyRule[] = 'site' in source ? loadMediaDenylist(source) : source
  const text = `${candidate.sourceUrl ?? ''}\n${candidate.localPath ?? ''}`.toLowerCase()
  for (const rule of rules) {
    const byId = rule.wpId !== undefined && candidate.wpId === rule.wpId
    const byName = rule.filenameStem !== undefined && text.includes(rule.filenameStem)
    if (byId || byName) {
      const label = [rule.wpId !== undefined ? `WP id=${rule.wpId}` : '', rule.filenameStem ?? '']
        .filter(Boolean)
        .join(' / ')
      return `denylisted media ${label}: ${rule.reason}`
    }
  }
  return undefined
}

function nestedMediaReferenceReasons(rules: readonly MediaDenyRule[], value: unknown): string[] {
  const reasons = new Set<string>()
  const visit = (node: unknown): void => {
    if (typeof node === 'string') {
      const reason = deniedMediaReason(rules, { sourceUrl: node })
      if (reason) reasons.add(reason)
      return
    }
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    if (!node || typeof node !== 'object') return
    const obj = node as JsonDoc
    const reason = deniedMediaReason(rules, {
      wpId: typeof obj.wpId === 'number' ? obj.wpId : undefined,
      sourceUrl: typeof obj.sourceUrl === 'string' ? obj.sourceUrl : undefined,
      localPath: typeof obj.localPath === 'string' ? obj.localPath : undefined,
    })
    if (reason) reasons.add(reason)
    Object.values(obj).forEach(visit)
  }
  visit(value)
  return [...reasons]
}

/** Gate issues for one staged doc: any reference (own media doc, featured/gallery refs, inline Markdown URLs) to denylisted media. */
export function lintReleaseDocument(
  rules: readonly MediaDenyRule[],
  collection: string,
  file: string,
  doc: JsonDoc,
): ReleasePolicyIssue[] {
  if (rules.length === 0) return []
  const reasons = new Set(nestedMediaReferenceReasons(rules, doc))

  if (collection === 'media') {
    const wp = doc.wp && typeof doc.wp === 'object' ? (doc.wp as JsonDoc) : {}
    const reason = deniedMediaReason(rules, {
      wpId: typeof wp.databaseId === 'number' ? wp.databaseId : undefined,
      sourceUrl: typeof doc.sourceUrl === 'string' ? doc.sourceUrl : undefined,
      localPath: typeof doc.localPath === 'string' ? doc.localPath : undefined,
    })
    if (reason) reasons.add(reason)
  }
  return [...reasons].map((reason) => ({ file, level: 'error' as const, message: `release policy: ${reason}` }))
}

/** Scan staged JSON independently; invalid JSON remains the core gate's job. */
export function lintReleaseContentPolicy(cfg: SiteMigrationConfig): ReleasePolicyIssue[] {
  const rules = loadMediaDenylist(cfg)
  if (rules.length === 0) return []
  const root = stagedDir(cfg)
  if (!fs.existsSync(root)) return []
  const issues: ReleasePolicyIssue[] = []
  for (const collection of ['media', 'pages', 'posts', 'products', 'taxonomies', 'site']) {
    const dir = path.join(root, collection)
    if (!fs.existsSync(dir)) continue
    for (const name of fs.readdirSync(dir).filter((entry) => entry.endsWith('.json') && !entry.startsWith('.')).sort()) {
      const file = `${collection}/${name}`
      try {
        const doc = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as JsonDoc
        issues.push(...lintReleaseDocument(rules, collection, file, doc))
      } catch {
        // Core staged-gate reports invalid JSON once with its parse error.
      }
    }
  }
  return issues
}
