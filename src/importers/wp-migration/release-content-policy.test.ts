import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  deniedMediaReason,
  lintReleaseContentPolicy,
  lintReleaseDocument,
  loadMediaDenylist,
  parseMediaDenylist,
  type MediaDenyRule,
} from './release-content-policy'
import { buildSiteConfig } from './wp-migration-config'

const RULES: MediaDenyRule[] = [
  { wpId: 2901, filenameStem: 'order-receipt', reason: 'screenshot contains customer data' },
  { filenameStem: 'broken-banner', reason: 'binary 404s on the source' },
]

describe('parseMediaDenylist', () => {
  it('accepts a valid file and normalizes stems to lower case', () => {
    const rules = parseMediaDenylist({ media: [{ wpId: 7, filenameStem: ' Order-Receipt ', reason: ' private ' }] })
    assert.deepEqual(rules, [{ wpId: 7, filenameStem: 'order-receipt', reason: 'private' }])
    assert.deepEqual(parseMediaDenylist({}), [])
  })

  it('rejects malformed rules with a precise message', () => {
    assert.throws(() => parseMediaDenylist([]), /must be an object/)
    assert.throws(() => parseMediaDenylist({ media: 'x' }), /must be an array/)
    assert.throws(() => parseMediaDenylist({ media: [{ reason: 'no selector' }] }), /needs wpId and\/or filenameStem/)
    assert.throws(() => parseMediaDenylist({ media: [{ wpId: 1 }] }), /reason is required/)
    assert.throws(() => parseMediaDenylist({ media: [{ wpId: '1', reason: 'x' }] }), /wpId must be an integer/)
  })
})

describe('deniedMediaReason', () => {
  it('matches by immutable WP id or by filename stem (case-insensitive, host independent)', () => {
    assert.match(deniedMediaReason(RULES, { wpId: 2901 }) ?? '', /customer data/)
    assert.match(
      deniedMediaReason(RULES, { sourceUrl: 'https://new-cdn.example.com/media/Order-Receipt-1.webp' }) ?? '',
      /customer data/,
    )
    assert.match(deniedMediaReason(RULES, { localPath: '2024/05/broken-banner.png' }) ?? '', /404s/)
    assert.equal(deniedMediaReason(RULES, { wpId: 1, sourceUrl: 'https://example.com/ok.jpg' }), undefined)
  })

  it('denies nothing without rules', () => {
    assert.equal(deniedMediaReason([], { wpId: 2901 }), undefined)
  })
})

describe('lintReleaseDocument', () => {
  it('blocks denylisted media docs and nested media references', () => {
    const media = lintReleaseDocument(RULES, 'media', 'media/2901.json', {
      collection: 'media',
      sourceUrl: 'https://cdn.example.com/safe-name.webp',
      wp: { databaseId: 2901 },
    })
    assert.ok(media.some((issue) => issue.message.includes('WP id=2901')))

    const page = lintReleaseDocument(RULES, 'pages', 'pages/booking.json', {
      title: 'Booking',
      featuredImage: { wpId: 2901, sourceUrl: 'https://cdn.example.com/renamed.webp' },
    })
    assert.ok(page.some((issue) => issue.message.includes('WP id=2901')))

    const inline = lintReleaseDocument(RULES, 'pages', 'pages/guide.json', {
      title: 'Guide',
      contentMd: '![Alt](https://cdn.example.com/order-receipt.webp)',
    })
    assert.ok(inline.some((issue) => issue.level === 'error' && issue.message.startsWith('release policy:')))
  })

  it('reports nothing for clean docs or an empty denylist', () => {
    const doc = { title: 'Clean', contentMd: '![Alt](https://cdn.example.com/fine.webp)' }
    assert.deepEqual(lintReleaseDocument(RULES, 'posts', 'posts/clean.json', doc), [])
    assert.deepEqual(lintReleaseDocument([], 'posts', 'posts/clean.json', doc), [])
  })
})

describe('per-site denylist file', () => {
  let tmp: string
  let prevCwd: string
  beforeEach(() => {
    prevCwd = process.cwd()
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kdigi-denylist-'))
    process.chdir(tmp)
  })
  afterEach(() => {
    process.chdir(prevCwd)
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  const cfg = buildSiteConfig({ site: 'demo', wpUrl: 'https://wp.example.com', domain: 'example.com' })

  it('is optional: no file means no rules and no issues', () => {
    assert.deepEqual(loadMediaDenylist(cfg), [])
    assert.deepEqual(lintReleaseContentPolicy(cfg), [])
    assert.equal(deniedMediaReason(cfg, { wpId: 2901 }), undefined)
  })

  it('loads wp-archive/<site>/denylist.json and gates staged docs', () => {
    const root = path.join(tmp, 'wp-archive', 'demo')
    fs.mkdirSync(path.join(root, 'staged', 'posts'), { recursive: true })
    fs.writeFileSync(path.join(root, 'denylist.json'), JSON.stringify({ media: RULES }))
    fs.writeFileSync(
      path.join(root, 'staged', 'posts', 'a.json'),
      JSON.stringify({ title: 'A', featuredImage: { wpId: 2901, sourceUrl: 'https://example.com/x.jpg' } }),
    )
    fs.writeFileSync(path.join(root, 'staged', 'posts', 'b.json'), JSON.stringify({ title: 'B' }))

    assert.equal(loadMediaDenylist(cfg).length, 2)
    assert.match(deniedMediaReason(cfg, { wpId: 2901 }) ?? '', /customer data/)
    const issues = lintReleaseContentPolicy(cfg)
    assert.equal(issues.length, 1)
    assert.equal(issues[0].file, 'posts/a.json')
  })

  it('fails loudly on invalid JSON', () => {
    const root = path.join(tmp, 'wp-archive', 'demo')
    fs.mkdirSync(root, { recursive: true })
    fs.writeFileSync(path.join(root, 'denylist.json'), '{nope')
    assert.throws(() => loadMediaDenylist(cfg), /not valid JSON/)
  })
})
