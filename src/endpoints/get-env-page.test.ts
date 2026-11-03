/**
 * Unit tests for get-env-page endpoint.
 *
 * Regression coverage for two bugs:
 * 1. `content` came back as raw/stale Lexical state instead of HTML — the
 *    endpoint's payload.find() calls run through the Local API (payloadAPI:
 *    'local'), so markdownHtmlField's afterRead hook (which only converts
 *    contentMd → HTML when req.payloadAPI === 'REST') never fires.
 * 2. Local API defaults overrideAccess: true, which bypasses field-level
 *    access.read:false on sites secrets (r2 keys) and pages' published+live restriction for
 *    anonymous callers — leaking site secrets/drafts on this public,
 *    unauthenticated endpoint.
 *
 * Runner: node --import tsx --test
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getEnvPageEndpoint } from './get-env-page.js'

function makeReq(opts: {
  siteKey?: string
  key?: string
  findResults?: Record<string, { docs: unknown[] }>
  findCalls?: Array<{ collection: string; overrideAccess?: boolean }>
}): Parameters<typeof getEnvPageEndpoint.handler>[0] {
  const { siteKey, key, findResults = {}, findCalls } = opts
  return {
    routeParams: siteKey ? { siteKey } : undefined,
    query: key ? { key } : {},
    payload: {
      find: async (call: { collection: string; overrideAccess?: boolean }) => {
        findCalls?.push(call)
        return findResults[call.collection] ?? { docs: [] }
      },
    },
  } as unknown as Parameters<typeof getEnvPageEndpoint.handler>[0]
}

async function json(res: Response) {
  return res.json() as Promise<Record<string, unknown> | null>
}

const SITE = {
  id: 1,
  siteKey: 'demo-site',
  pageGroup: [{ key: 'TERM_CONDITION', pageSlug: 'dieu-khoan-va-dieu-kien' }],
}

describe('getEnvPageEndpoint', () => {
  it('returns 400 when siteKey param is missing', async () => {
    const req = makeReq({ key: 'TERM_CONDITION' })
    const res = await getEnvPageEndpoint.handler(req)
    assert.equal((res as Response).status, 400)
  })

  it('returns 400 when key query param is missing', async () => {
    const req = makeReq({ siteKey: 'demo-site' })
    const res = await getEnvPageEndpoint.handler(req)
    assert.equal((res as Response).status, 400)
  })

  it('returns null when site is not found', async () => {
    const req = makeReq({ siteKey: 'nope', key: 'TERM_CONDITION', findResults: { sites: { docs: [] } } })
    const res = await getEnvPageEndpoint.handler(req)
    assert.equal(await json(res as Response), null)
  })

  it('returns null when pageGroup has no entry for key', async () => {
    const req = makeReq({
      siteKey: 'demo-site',
      key: 'BOOKING',
      findResults: { sites: { docs: [SITE] } },
    })
    const res = await getEnvPageEndpoint.handler(req)
    assert.equal(await json(res as Response), null)
  })

  it('converts contentMd to sanitized HTML in the response, overriding stale content', async () => {
    const req = makeReq({
      siteKey: 'demo-site',
      key: 'TERM_CONDITION',
      findResults: {
        sites: { docs: [SITE] },
        pages: {
          docs: [
            {
              id: 41,
              slug: 'dieu-khoan-va-dieu-kien',
              contentMd: 'Sử dụng example.com đồng nghĩa quý khách chấp nhận **điều khoản và điều kiện** dưới đây.',
              // Stale/unconverted Lexical richtext — must not leak through.
              content: { root: { children: [] } },
            },
          ],
        },
      },
    })
    const res = await getEnvPageEndpoint.handler(req)
    const body = await json(res as Response)
    assert.equal(typeof body?.content, 'string')
    assert.ok((body?.content as string).includes('<strong>điều khoản và điều kiện</strong>'))
    assert.ok((body?.content as string).includes('Sử dụng'))
  })

  it('expands shortcodes before converting contentMd to HTML', async () => {
    const req = makeReq({
      siteKey: 'demo-site',
      key: 'TERM_CONDITION',
      findResults: {
        sites: { docs: [SITE] },
        pages: {
          docs: [
            {
              id: 41,
              slug: 'dieu-khoan-va-dieu-kien',
              contentMd: 'Bang gia:\n[sc name="bang-gia"][/sc]',
              content: { root: { children: [] } },
            },
          ],
        },
        shortcodes: {
          docs: [
            {
              id: 9,
              name: 'bang-gia',
              contentMd: '**Tau cao toc**',
            },
          ],
        },
      },
    })
    const res = await getEnvPageEndpoint.handler(req)
    const body = await json(res as Response)
    assert.equal(typeof body?.content, 'string')
    assert.match(body?.content as string, /<strong>Tau cao toc<\/strong>/)
    assert.doesNotMatch(body?.content as string, /\[sc/)
  })

  it('leaves content untouched when contentMd is empty', async () => {
    const req = makeReq({
      siteKey: 'demo-site',
      key: 'TERM_CONDITION',
      findResults: {
        sites: { docs: [SITE] },
        pages: { docs: [{ id: 41, slug: 'dieu-khoan-va-dieu-kien', contentMd: null, content: { root: {} } }] },
      },
    })
    const res = await getEnvPageEndpoint.handler(req)
    const body = await json(res as Response)
    assert.deepEqual(body?.content, { root: {} })
  })

  it('queries sites and pages with overrideAccess: false (respects field/collection access control)', async () => {
    const findCalls: Array<{ collection: string; overrideAccess?: boolean }> = []
    const req = makeReq({
      siteKey: 'demo-site',
      key: 'TERM_CONDITION',
      findCalls,
      findResults: {
        sites: { docs: [SITE] },
        pages: { docs: [{ id: 41, slug: 'dieu-khoan-va-dieu-kien' }] },
      },
    })
    await getEnvPageEndpoint.handler(req)
    assert.equal(findCalls.length, 2)
    for (const call of findCalls) {
      assert.equal(call.overrideAccess, false, `${call.collection} find() must set overrideAccess: false`)
    }
  })
})
