#!/usr/bin/env node
/**
 * Phase 3 — assign featuredImage + inline images to staged content by
 * matching StagedMedia alt text against doc title/slug/heading tokens.
 * Editorial collections only (posts, products) — pages imagery is curated
 * at the human gate.
 *
 * Read-only against staged/media + staged/{posts,products}; writes
 * ONLY into staged/ (featuredImage ref + inline markdown `![alt](sourceUrl)`),
 * never touches the DB. Inline URLs stay as the crawled sourceUrl — the
 * `media` import phase rewrites them to the real media URL after import
 * (see phase-media.ts's inline-URL-rewrite step).
 *
 * This is an assist, not a decision: every assignment is a proposal written
 * into staged/ + summarized in image-assignment-report.md for the human
 * gate reviewer (Phase 5) to accept, fix, or clear.
 *
 * Idempotent: re-run skips docs that already have a featuredImage, and skips
 * inline insertion for any media sourceUrl already present in contentMd.
 *
 * Usage:
 *   pnpm tsx src/importers/wp-migration/assign-images-from-alt-text.ts --site my-site
 */
import fs from 'fs'
import path from 'path'
import { archiveRoot, stagedDir, type SiteMigrationConfig } from './wp-migration-config'
import type { StagedMedia, StagedMediaRef, StagedPage, StagedPost, StagedProduct } from './staged-doc-types'

function argValue(name: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`))
  if (eq) return eq.split('=').slice(1).join('=')
  const idx = process.argv.indexOf(`--${name}`)
  if (idx !== -1 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('--')) return process.argv[idx + 1]
  return undefined
}

// Vietnamese (ASCII-folded) + English function words and file-extension noise.
const STOPWORDS = new Set([
  'va', 'la', 'cua', 'cac', 'mot', 'nhung', 'khi', 'cho', 'den', 'tai', 'voi', 'nay', 'the',
  'trong', 'tren', 'duoc', 'nhu', 'hay', 'do', 'co', 'khong', 've', 'anh', 'hinh', 'photo', 'image',
  'and', 'for', 'with', 'from', 'this', 'that', 'are', 'was', 'you', 'your', 'our', 'img', 'picture',
  'webp', 'jpg', 'jpeg', 'png', 'gif', 'avif',
])

/**
 * ASCII-fold a Vietnamese token (Đ/đ has no Unicode canonical decomposition —
 * NFD won't touch it, so it's mapped to d/D explicitly before stripping).
 * Used only for stopword/length checks, never for matching.
 */
function foldDiacritics(s: string): string {
  return s
    .replace(/[Đđ]/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

/**
 * Lowercase + split into significant tokens, KEEPING Vietnamese diacritics.
 * Folding tokens to ASCII made tone-mark homographs collide — mấy/máy,
 * đất/đặt, vé/về all became the same token, so "Mấy hòn đảo… mũi đất…"
 * scored 2 against "Đặt vé… qua máy tính…" and a booking screenshot became
 * the featured image of a travel article. Stopword + length checks run on
 * the folded form so the ASCII stopword list still applies.
 */
export function tokenize(s: string): Set<string> {
  const lower = s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ')
  const tokens: string[] = []
  for (const w of lower.split(/\s+/)) {
    const folded = foldDiacritics(w)
    if (folded.length > 2 && !STOPWORDS.has(folded)) tokens.push(w)
  }
  return new Set(tokens)
}

export function tokenOverlapScore(a: Set<string>, b: Set<string>): number {
  let hits = 0
  for (const t of a) if (b.has(t)) hits++
  return hits
}

/**
 * Tokens that appear in a large share of the media alts carry no matching
 * signal for this site (e.g. the place or brand name on a single-destination
 * site — every alt has it, so a 2-token threshold was trivially met by any
 * (doc, media) pair and images landed in unrelated content). Built from the
 * actual alt corpus instead of a hand-kept stopword list so it adapts per
 * site. Frequencies are counted on FOLDED tokens and the returned set is
 * folded: some alts are typed without diacritics ("ninh binh"), and their
 * ASCII twins must count as the same common token or they slip through.
 */
export function buildDomainCommonTokens(mediaList: StagedMedia[], ratio = 0.3): Set<string> {
  const df = new Map<string, number>()
  for (const m of mediaList) {
    for (const t of tokenize(m.alt)) {
      const folded = foldDiacritics(t)
      df.set(folded, (df.get(folded) ?? 0) + 1)
    }
  }
  const cutoff = Math.max(3, Math.ceil(mediaList.length * ratio))
  return new Set([...df.entries()].filter(([, n]) => n >= cutoff).map(([t]) => t))
}

/**
 * Overlap counted only on distinctive tokens — domain-common tokens score 0.
 * Matching is exact (diacritics preserved); the commonality check folds,
 * because `common` holds folded forms.
 */
export function distinctiveOverlapScore(query: Set<string>, alt: Set<string>, common: Set<string>): number {
  let hits = 0
  for (const t of query) if (alt.has(t) && !common.has(foldDiacritics(t))) hits++
  return hits
}

/**
 * Remove markdown link/image targets and bare URLs so slug tokens inside
 * hrefs ("/huong-dan-dat-ve-tau", "/tran-de-con-dao") don't leak into the
 * section's token set and fake-match unrelated alt text.
 */
export function stripUrls(s: string): string {
  return s.replace(/\]\([^)]*\)/g, ']').replace(/https?:\/\/\S+/g, ' ')
}

export interface Section {
  heading: string
  headingIndex: number
  bodyPreview: string
}

/** Split a markdown body into `## `/`### ` heading sections for inline-match targeting. */
export function splitSections(body: string): Section[] {
  const out: Section[] = []
  const re = /(^|\n)(#{2,3})\s+([^\n]+)\n/g
  let m: RegExpExecArray | null
  const matches: Array<{ index: number; end: number; heading: string }> = []
  while ((m = re.exec(body))) matches.push({ index: m.index + m[1].length, end: re.lastIndex, heading: m[3].trim() })
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].end
    const end = i + 1 < matches.length ? matches[i + 1].index : body.length
    out.push({ heading: matches[i].heading, headingIndex: matches[i].index, bodyPreview: body.slice(start, end).slice(0, 400) })
  }
  return out
}

interface AssignSummary {
  slug: string
  collection: string
  featured: string | null
  inline: string[]
  warn: string[]
}

// Thresholds count DISTINCTIVE diacritic-preserving tokens only (domain-common
// tokens such as the site's place/brand name score 0). Both need 3: at 2, a single generic bigram
// ("chi tiết", "giới thiệu") shared between a title and an unrelated alt was
// enough to attach an order-page screenshot to a travel article. Precision
// beats recall here — unmatched slots are filled by the Phase 5 human gate,
// wrong matches ship to production.
const FEATURED_MIN_SCORE = 3
const INLINE_MIN_SCORE = 3
const MAX_INLINE_PER_DOC = 4

function pickFeatured(
  mediaList: StagedMedia[],
  queryTokens: Set<string>,
  usedAsFeatured: Set<string>,
  common: Set<string>,
): StagedMedia | null {
  let best: StagedMedia | null = null
  let bestScore = FEATURED_MIN_SCORE - 1
  for (const m of mediaList) {
    if (usedAsFeatured.has(m.sourceUrl)) continue
    const score = distinctiveOverlapScore(queryTokens, tokenize(m.alt), common)
    if (score > bestScore) {
      best = m
      bestScore = score
    }
  }
  return bestScore >= FEATURED_MIN_SCORE ? best : null
}

export function insertInline(
  body: string,
  mediaList: StagedMedia[],
  usedInDoc: Set<string>,
  common: Set<string> = new Set(),
): { body: string; picked: string[] } {
  const sections = splitSections(body)
  const picked: string[] = []
  const lines = body
  const insertions: Array<{ afterIndex: number; markdown: string }> = []
  // usedInDoc already holds every sourceUrl present in the doc from prior
  // runs — the cap must count those too, or a re-run keeps adding more
  // inline images every time instead of converging (non-idempotent).
  const alreadyInlined = usedInDoc.size

  for (const section of sections) {
    if (alreadyInlined + picked.length >= MAX_INLINE_PER_DOC) break
    const queryTokens = tokenize(stripUrls(`${section.heading} ${section.bodyPreview}`))
    let best: StagedMedia | null = null
    let bestScore = INLINE_MIN_SCORE - 1
    for (const m of mediaList) {
      if (usedInDoc.has(m.sourceUrl)) continue
      const score = distinctiveOverlapScore(queryTokens, tokenize(m.alt), common)
      if (score > bestScore) {
        best = m
        bestScore = score
      }
    }
    if (best && bestScore >= INLINE_MIN_SCORE) {
      // insert right after the heading line (headingIndex points at the '#').
      const headingLineEnd = lines.indexOf('\n', section.headingIndex) + 1
      insertions.push({ afterIndex: headingLineEnd, markdown: `\n![${best.alt}](${best.sourceUrl})\n` })
      usedInDoc.add(best.sourceUrl)
      picked.push(`${section.heading} → ${best.alt}`)
    }
  }

  if (!insertions.length) return { body, picked }
  insertions.sort((a, b) => b.afterIndex - a.afterIndex) // insert from the end so earlier indices stay valid
  let out = body
  for (const ins of insertions) out = out.slice(0, ins.afterIndex) + ins.markdown + out.slice(ins.afterIndex)
  return { body: out, picked }
}

export function existingInlineUrls(body: string): Set<string> {
  const out = new Set<string>()
  const re = /!\[[^\]]*\]\((https?:\/\/[^)]+)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) out.add(m[1])
  return out
}

function readStaged<T>(cfg: Pick<SiteMigrationConfig, 'site'>, collection: string): Array<{ file: string; doc: T }> {
  const dir = path.join(stagedDir(cfg), collection)
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ file: f, doc: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as T }))
}

function writeStaged(cfg: Pick<SiteMigrationConfig, 'site'>, collection: string, file: string, doc: unknown): void {
  fs.writeFileSync(path.join(stagedDir(cfg), collection, file), JSON.stringify(doc, null, 2) + '\n', 'utf-8')
}

/**
 * Auto-assignment only applies to editorial content (posts, products).
 * Pages are mostly legal/utility surfaces (privacy, terms, FAQ, sign-in,
 * quy định…) where the vision audit judged nearly every auto-picked image —
 * featured included — unrelated; their imagery is a human-gate decision.
 */
export async function runAssignImages(site: string): Promise<AssignSummary[]> {
  const cfg: Pick<SiteMigrationConfig, 'site'> = { site }
  const mediaList = readStaged<StagedMedia>(cfg, 'media').map((d) => d.doc)
  const common = buildDomainCommonTokens(mediaList)
  const usedAsFeatured = new Set<string>()
  const summaries: AssignSummary[] = []

  for (const collection of ['products', 'posts'] as const) {
    for (const { file, doc } of readStaged<StagedPage | StagedPost | StagedProduct>(cfg, collection)) {
      const summary: AssignSummary = { slug: doc.slug, collection, featured: null, inline: [], warn: [] }
      let changed = false

      const titleTokens = tokenize(`${doc.title} ${doc.slug.replace(/-/g, ' ')}`)
      if (!doc.featuredImage?.sourceUrl) {
        const match = pickFeatured(mediaList, titleTokens, usedAsFeatured, common)
        if (match) {
          const ref: StagedMediaRef = { wpId: match.wp.databaseId, sourceUrl: match.sourceUrl, alt: match.alt }
          ;(doc as StagedPage | StagedPost | StagedProduct).featuredImage = ref
          usedAsFeatured.add(match.sourceUrl)
          summary.featured = match.alt
          changed = true
        } else {
          summary.warn.push('no featuredImage match')
        }
      } else {
        summary.featured = `${doc.featuredImage.alt ?? ''} (already set)`
        usedAsFeatured.add(doc.featuredImage.sourceUrl)
      }

      const usedInDoc = existingInlineUrls(doc.contentMd)
      const before = usedInDoc.size
      const { body, picked } = insertInline(doc.contentMd, mediaList, usedInDoc, common)
      if (picked.length) {
        doc.contentMd = body
        summary.inline = picked
        changed = true
      } else if (before > 0) {
        summary.inline = [`(${before} inline image(s) already present)`]
      } else {
        summary.warn.push('no inline image matched')
      }

      if (changed) writeStaged(cfg, collection, file, doc)
      summaries.push(summary)
    }
  }

  const reportLines = [
    `# Image assignment report — ${site}`,
    '',
    'Proposals only — review and correct at the gate (Phase 5) before lock.',
    '',
    '| Collection | Slug | Featured | Inline | Warnings |',
    '|---|---|---|---|---|',
    ...summaries.map(
      (s) =>
        `| ${s.collection} | ${s.slug} | ${s.featured ?? '—'} | ${s.inline.length ? s.inline.join('; ') : '—'} | ${s.warn.join('; ') || '—'} |`,
    ),
    '',
  ]
  fs.writeFileSync(path.join(archiveRoot(cfg), 'staged', 'image-assignment-report.md'), reportLines.join('\n'), 'utf-8')

  return summaries
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const site = argValue('site')
  if (!site) {
    console.error('Usage: --site <key>')
    process.exit(2)
  }
  runAssignImages(site)
    .then((summaries) => {
      const unmatched = summaries.filter((s) => s.warn.length)
      console.log(`\n✓ Done — ${summaries.length} docs processed, ${unmatched.length} with unresolved warnings`)
      process.exit(0)
    })
    .catch((err) => {
      console.error('[assign-images] FATAL', err)
      process.exit(1)
    })
}
