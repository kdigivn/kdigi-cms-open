/**
 * Builds `public/llms.txt` (llmstxt.org index) and `public/llms-full.txt` (the frontend contract in
 * one file) so an AI agent given only the CMS URL finds the REST contract. The outputs are
 * committed; `generate-llms.test.ts` fails when they drift from the sources.
 *
 * Run: `pnpm generate:llms`
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, posix } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** Repo-relative paths concatenated into llms-full.txt, in this order. */
export const FULL_SOURCES = [
  'skills/kcms-frontend/SKILL.md',
  'skills/kcms-frontend/references/contract.md',
  'docs/rest-api.md',
  'docs/seo.md',
] as const

export const LLMS_OUTPUTS = { index: 'public/llms.txt', full: 'public/llms-full.txt' } as const

export type ReadRepoFile = (repoRelativePath: string) => string

/** `git+https://github.com/o/r.git` → `https://github.com/o/r/blob/main/` */
export function githubBlobBase(repositoryUrl: string): string {
  const url = repositoryUrl.replace(/^git\+/, '').replace(/\.git$/, '').replace(/\/+$/, '')
  if (!/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(url)) throw new Error(`Unsupported repository url: ${repositoryUrl}`)
  return `${url}/blob/main/`
}

/** Rewrites relative Markdown link targets to absolute GitHub URLs (anchors and absolute URLs untouched). */
export function absolutizeLinks(markdown: string, sourcePath: string, blobBase: string): string {
  const dir = posix.dirname(sourcePath)
  return markdown.replace(/\]\(([^)\s]+)\)/g, (match, target: string) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(target)) return match
    return `](${blobBase}${posix.normalize(posix.join(dir, target))})`
  })
}

function buildIndex(blobBase: string): string {
  const doc = (path: string, title: string, note: string) => `- [${title}](${blobBase}${path}): ${note}`
  return [
    '# KDIGI CMS',
    '',
    '> Open-source headless multi-site CMS (Payload 3 + Next.js + PostgreSQL). Public websites read content over an anonymous REST API filtered by site (`where[tenant][equals]=<site id>`) and expose a revalidate webhook; editors and AI agents write content through the authenticated MCP endpoint `/api/mcp`, which a public website never calls.',
    '',
    'Building a website on this CMS: read the frontend contract below (or the single-file version at /llms-full.txt) and install the `kcms-frontend` agent skill. Per-site facts (site id, locales, menus, routes) come from `kcms frontend context --site <siteKey>`, which writes a KCMS.md file.',
    '',
    '## Frontend contract',
    '',
    '- [Full frontend contract](/llms-full.txt): kcms-frontend skill, contract digest, REST API and SEO docs in one file',
    doc('docs/rest-api.md', 'REST API', 'anonymous reads, site filter, locales, HTML fields, SEO fields, menus, comments, ratings, redirects, media, revalidate webhook'),
    doc('docs/seo.md', 'SEO', 'title/description templates resolved by the frontend, JSON-LD, Open Graph fallbacks, slugs and redirects'),
    doc('docs/multi-site.md', 'Multi-site', 'the Sites document, site selection, per-site settings'),
    doc('docs/frontend-with-ai.md', 'Building a frontend with AI', 'step-by-step guide and prompts for AI coding agents'),
    '',
    '## Agent skills',
    '',
    doc('skills/kcms-frontend/SKILL.md', 'kcms-frontend', 'rules and per-framework references (Next.js, Astro, SvelteKit, Nuxt, React/Angular) for building a public site'),
    doc('skills/kcms/SKILL.md', 'kcms', 'creating, editing and publishing content through MCP or the kcms CLI'),
    '',
    '## Optional',
    '',
    doc('docs/ai-integration.md', 'AI integration', 'MCP endpoint, API keys, the kcms CLI'),
    '',
  ].join('\n')
}

function buildFull(readFile: ReadRepoFile, blobBase: string): string {
  const parts = FULL_SOURCES.map((path) => {
    let body = readFile(path).replace(/\r\n/g, '\n')
    // YAML frontmatter is for agent skill loaders, not for readers of the full file.
    if (path.endsWith('SKILL.md')) body = body.replace(/^---\n[\s\S]*?\n---\n+/, '')
    body = absolutizeLinks(body, path, blobBase).trim()
    return `<!-- source: ${blobBase}${path} -->\n\n${body}\n`
  })
  const header = [
    '# KDIGI CMS — frontend contract (full)',
    '',
    '> Generated from the repository by `pnpm generate:llms`. Sources are separated by `<!-- source: … -->` lines. Index: /llms.txt',
    '',
  ].join('\n')
  return `${header}\n${parts.join('\n---\n\n')}`
}

export function buildLlms(readFile: ReadRepoFile): { index: string; full: string } {
  const pkg = JSON.parse(readFile('package.json')) as { repository?: { url?: string } | string }
  const repoUrl = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url
  if (!repoUrl) throw new Error('package.json has no repository url')
  const blobBase = githubBlobBase(repoUrl)
  return { index: buildIndex(blobBase), full: buildFull(readFile, blobBase) }
}

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

export const readRepoFile: ReadRepoFile = (path) => readFileSync(join(REPO_ROOT, path), 'utf8')

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { index, full } = buildLlms(readRepoFile)
  writeFileSync(join(REPO_ROOT, LLMS_OUTPUTS.index), index)
  writeFileSync(join(REPO_ROOT, LLMS_OUTPUTS.full), full)
  process.stdout.write(`wrote ${LLMS_OUTPUTS.index} (${index.length} B), ${LLMS_OUTPUTS.full} (${full.length} B)\n`)
}
