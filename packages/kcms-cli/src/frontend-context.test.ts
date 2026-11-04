import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { CliError } from './errors.js'
import {
  collectSiteFacts,
  encodeParams,
  type FetchLike,
  fetchAnonymousJson,
  type JsonFetcher,
  listUrl,
  renderKcmsMd,
  trimForSample,
  writeContextFile,
} from './frontend-context.js'

const BASE = 'http://cms.example.com'
const NOW = new Date('2026-01-01T12:00:00.000Z')
const SECRET = 'super-secret-key-do-not-leak'

const siteDoc = {
  id: 7,
  siteKey: 'demo',
  domain: 'example.com',
  defaultLanguage: 'vi',
  pageGroup: [
    { key: 'FRONT_PAGE', pageSlug: 'trang-chu' },
    { key: 'ABOUT', pageSlug: 'gioi-thieu' },
  ],
  knowledgeGraph: { name: 'Demo Co' },
  // Must never reach the output.
  r2: { accessKeyId: 'r2-id', secretAccessKey: 'r2-secret' },
}

const pageDoc = {
  id: 11,
  title: 'Trang chủ',
  slug: 'trang-chu',
  status: 'published',
  contentMd: '# source markdown that is dropped',
  content: `<p>${'x'.repeat(500)}</p>`,
  categories: [{ id: 1 }, { id: 2 }, { id: 3 }],
}

interface Route {
  /** Substring of the requested URL. First match wins. */
  match: string
  body?: unknown
  status?: number
}

/** Fake JSON fetcher: records every URL, answers from `routes`, empty list otherwise. */
function fakeFetch(routes: Route[]): { fetchJson: JsonFetcher; urls: string[] } {
  const urls: string[] = []
  const fetchJson: JsonFetcher = async (url) => {
    urls.push(url)
    const route = routes.find(({ match }) => url.includes(match))
    if (route?.status) {
      const err = new Error(`${url} answered ${route.status}`) as Error & { status?: number }
      err.status = route.status
      throw err
    }
    return route?.body ?? { docs: [], totalDocs: 0 }
  }
  return { fetchJson, urls }
}

const defaultRoutes = (overrides: Route[] = []): Route[] => [
  ...overrides,
  { match: '/api/sites?', body: { docs: [siteDoc], totalDocs: 1 } },
  { match: '/api/pages?', body: { docs: [pageDoc], totalDocs: 3 } },
  { match: '/api/posts?', body: { docs: [], totalDocs: 0 } },
]

describe('collectSiteFacts', () => {
  it('works without a key and never sends one, even when KCMS_API_KEY is set', async () => {
    process.env.KCMS_API_KEY = SECRET
    try {
      const { fetchJson, urls } = fakeFetch(defaultRoutes())
      const facts = await collectSiteFacts(fetchJson, BASE, 'demo', { now: NOW })
      const markdown = renderKcmsMd(facts)

      assert.equal(facts.tenantId, 7)
      assert.doesNotMatch(markdown, new RegExp(SECRET))
      assert.doesNotMatch(urls.join('\n'), new RegExp(SECRET))
      assert.doesNotMatch(markdown, /r2-secret/, 'the sites document is whitelisted, not dumped')
    } finally {
      delete process.env.KCMS_API_KEY
    }
  })

  it('sends only Accept: application/json', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fake: FetchLike = async (url, init) => {
      calls.push({ url, ...(init ? { init } : {}) })
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
    }

    assert.deepEqual(await fetchAnonymousJson(`${BASE}/api/health`, fake), { ok: true })
    assert.equal(calls.length, 1)
    const headers = new Headers(calls[0]?.init?.headers)
    assert.equal(headers.get('authorization'), null)
    assert.equal(headers.get('cookie'), null)
    assert.equal(headers.get('accept'), 'application/json')
    assert.deepEqual(Object.keys(calls[0]?.init?.headers ?? {}), ['Accept'])
  })

  it('fails with a usage error when the siteKey does not exist', async () => {
    const { fetchJson } = fakeFetch([])
    await assert.rejects(
      () => collectSiteFacts(fetchJson, BASE, 'missing', { now: NOW }),
      (err: unknown) =>
        err instanceof CliError && err.exitCode === 2 && err.message === `Site "missing" not found at ${BASE}`,
    )
  })

  it('counts an empty collection as 0 and renders no sample for it', async () => {
    const { fetchJson } = fakeFetch(defaultRoutes())
    const facts = await collectSiteFacts(fetchJson, BASE, 'demo', { now: NOW })
    const markdown = renderKcmsMd(facts)

    assert.equal(facts.counts.posts, 0)
    assert.equal(facts.samples.some((sample) => sample.label === 'posts'), false)
    assert.match(markdown, /\| posts \| 0 \|/)
    assert.doesNotMatch(markdown, /### posts —/)
  })

  it('skips a collection that answers 403/404', async () => {
    const { fetchJson } = fakeFetch(defaultRoutes([{ match: '/api/products?', status: 403 }]))
    const facts = await collectSiteFacts(fetchJson, BASE, 'demo', { now: NOW })

    assert.equal(facts.counts.products, null)
    assert.match(renderKcmsMd(facts), /\| products \| — \|/)
  })

  it('collects locales, menus, pageGroup, counts and samples', async () => {
    const { fetchJson, urls } = fakeFetch(
      defaultRoutes([
        { match: `where%5Btitle%5D%5Bexists%5D=true`, body: { docs: [{ title: 'Home' }], totalDocs: 2 } },
        { match: '/api/landings?', body: { docs: [{ id: 5, slug: 'promo', isDisabled: false }], totalDocs: 1 } },
        { match: '/api/taxonomies?', body: { docs: [{ id: 2, type: 'category', slug: 'news' }], totalDocs: 4 } },
        {
          match: '/api/menus?',
          body: {
            docs: [{ location: 'FOOTER_MENU' }, { location: 'PRIMARY' }],
            totalDocs: 2,
          },
        },
        { match: '/api/authors?', body: { docs: [{ id: 1, name: 'Author' }], totalDocs: 1 } },
        { match: '/api/faqs?', body: { docs: [{ id: 1, group: 'faq' }], totalDocs: 1 } },
        { match: '/api/redirects?', body: { docs: [{ from: '/old', to: '/new' }], totalDocs: 2 } },
      ]),
    )

    const facts = await collectSiteFacts(fetchJson, BASE, 'demo', { now: NOW })
    const markdown = renderKcmsMd(facts)

    assert.deepEqual(facts.menuLocations, ['PRIMARY', 'FOOTER_MENU'])
    assert.deepEqual(facts.pageGroup, [
      { key: 'FRONT_PAGE', pageSlug: 'trang-chu' },
      { key: 'ABOUT', pageSlug: 'gioi-thieu' },
    ])
    assert.equal(facts.locales[1]?.hasContent, true)
    assert.equal(facts.counts.landings, 1)
    assert.equal(facts.counts.taxonomies.category, 4)
    assert.equal(facts.counts.redirects, 2)
    assert.equal(facts.samples.length, 6) // pages, landings, taxonomies, authors, faqs, redirects
    assert.match(
      urls.join('\n'),
      /landings\?.*where%5BisDisabled%5D%5Bnot_equals%5D=true/,
      'landings filter out isDisabled documents',
    )

    for (const needle of [
      '# KCMS.md — demo',
      'safe to commit (no secrets)',
      `where[tenant][equals]=7`,
      'https://example.com/api/cms/revalidate',
      '| FRONT_PAGE | trang-chu |',
      'Menu locations with a document: `PRIMARY`, `FOOTER_MENU`',
      '`/{slug}` — catch-all',
      '`/product/{slug}`',
      `${BASE}/llms.txt`,
      'kcms 0.1.0',
      facts.generatedAt,
    ]) {
      assert.ok(markdown.includes(needle), `KCMS.md is missing: ${needle}`)
    }
  })

  it('names the URL when the network fails', async () => {
    const fetchJson: JsonFetcher = async (url) => {
      throw new CliError(`Cannot reach ${url}: connect ECONNREFUSED`, 1)
    }
    await assert.rejects(
      () => collectSiteFacts(fetchJson, BASE, 'demo', { now: NOW }),
      (err: unknown) => err instanceof CliError && err.message.includes(BASE) && err.message.includes('ECONNREFUSED'),
    )
  })
})

describe('trimForSample', () => {
  it('drops Markdown sources and legacy rich text, truncates long strings and arrays', () => {
    const trimmed = trimForSample({
      id: 1,
      contentMd: 'source',
      content: { root: { children: [] } },
      body: '<p>html</p>',
      tenant: { id: 7, siteKey: 'example-site', seoTitles: { separator: '|' } },
      seo: { jsonLd: { raw: '<script></script>' }, title: 'ok' },
      long: 'y'.repeat(450),
      list: [1, 2, 3, 4],
    }) as Record<string, unknown>

    assert.equal('contentMd' in trimmed, false)
    assert.equal('content' in trimmed, false)
    assert.equal(trimmed.body, '<p>html</p>')
    assert.deepEqual(trimmed.seo, { title: 'ok' })
    assert.equal((trimmed.long as string).length, 401)
    assert.ok((trimmed.long as string).endsWith('…'))
    assert.deepEqual(trimmed.list, [1, 2, '… 2 more'])
    assert.equal(trimmed.tenant, 7, 'a populated Sites doc collapses to its id')
  })
})

describe('url building', () => {
  it('form-encodes Payload bracket keys', () => {
    assert.equal(
      encodeParams([
        ['where[tenant][equals]', '7'],
        ['locale', 'en'],
      ]),
      'where%5Btenant%5D%5Bequals%5D=7&locale=en',
    )
    assert.equal(
      listUrl(BASE, 'posts', [
        ['where[tenant][equals]', '7'],
        ['where[isEnabled][equals]', 'true'],
      ]),
      `${BASE}/api/posts?where%5Btenant%5D%5Bequals%5D=7&where%5BisEnabled%5D%5Bequals%5D=true`,
    )
  })
})

describe('writeContextFile', () => {
  it('refuses to overwrite without --force and leaves the file untouched', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'kcms-context-')), 'KCMS.md')
    writeContextFile(file, '# first')

    assert.throws(
      () => writeContextFile(file, '# second'),
      (err: unknown) => err instanceof CliError && err.exitCode === 2 && /--force/.test(err.message),
    )
    assert.equal(readFileSync(file, 'utf8'), '# first\n')

    writeContextFile(file, '# second', true)
    assert.equal(readFileSync(file, 'utf8'), '# second\n')
  })
})
