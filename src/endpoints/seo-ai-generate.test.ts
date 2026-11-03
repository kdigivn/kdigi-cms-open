/**
 * Unit tests for seo-ai-generate endpoint.
 *
 * All DeepSeek calls are intercepted via _setClientForTest — no real HTTP traffic.
 * Rate-limit is driven via _seedRateLimitForTest (in-process store only, no DB).
 * Payload is faked with a minimal logger stub.
 *
 * Coverage:
 *  1. Unauthenticated request → 401
 *  2. Missing required fields (field / docTitle) → 400
 *  3. Unknown field type → 400
 *  4. Valid title request → 200 { suggestion }
 *  5. Valid description request → 200 { suggestion }
 *  6. Valid faq request → 200 { suggestion } (array stringified)
 *  7. Valid alt request → 200 { suggestion }
 *  8. Per-user soft rate-limit exceeded → 429 (store-driven, no DB involved)
 *  9. Rate-limit key is derived from user.id, not body fields → body.tenantId ignored
 * 10. DeepSeek client error → 502
 * 11. chatJson returns wrong shape → 502 (no crash)
 */
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { _setClientForTest } from '../lib/ai/deepseek-client'
import { seoAiGenerateEndpoint, _seedRateLimitForTest } from './seo-ai-generate'

// ─── Env setup ────────────────────────────────────────────────────────────────

let savedApiKey: string | undefined
let savedModel: string | undefined
let resetClient: (() => void) | undefined

beforeEach(() => {
  savedApiKey = process.env.DEEPSEEK_API_KEY
  savedModel = process.env.DEEPSEEK_MODEL
  process.env.DEEPSEEK_API_KEY = 'test-key'
  process.env.DEEPSEEK_MODEL = 'deepseek-chat'
})

afterEach(() => {
  if (savedApiKey === undefined) delete process.env.DEEPSEEK_API_KEY
  else process.env.DEEPSEEK_API_KEY = savedApiKey

  if (savedModel === undefined) delete process.env.DEEPSEEK_MODEL
  else process.env.DEEPSEEK_MODEL = savedModel

  if (resetClient) {
    resetClient()
    resetClient = undefined
  }
})

// ─── Stub factory ─────────────────────────────────────────────────────────────

/** Returns a DeepSeek client stub that returns `content` JSON string on every call. */
function makeDeepSeekStub(content: string) {
  return {
    chat: {
      completions: {
        async create(): Promise<{ choices: Array<{ message: { content: string } }> }> {
          return { choices: [{ message: { content } }] }
        },
      },
    },
  }
}

/** Returns a stub that throws on every call. */
function makeFailingDeepSeekStub(msg = 'upstream error') {
  return {
    chat: {
      completions: {
        async create(): Promise<never> {
          throw new Error(msg)
        },
      },
    },
  }
}

function injectStub(stub: unknown): void {
  resetClient = _setClientForTest(stub)
}

// ─── Request builder ──────────────────────────────────────────────────────────

const noopLogger = {
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
}

interface MakeReqOpts {
  user?: { id: string; role?: string } | null
  body?: unknown
}

/**
 * Builds a minimal PayloadRequest stub for seo-ai-generate endpoint tests.
 * The handler only reads req.user, req.json(), and req.payload.logger.
 * No payload.find() or payload.create() calls needed — rate-limit is store-only.
 */
function makeReq(opts: MakeReqOpts = {}) {
  const { user = { id: 'user-1', role: 'editor' }, body = {} } = opts

  return {
    user,
    json: async () => body,
    payload: {
      logger: noopLogger,
    },
  } as unknown as Parameters<typeof seoAiGenerateEndpoint.handler>[0]
}

// ─── Shared valid body ────────────────────────────────────────────────────────

const VALID_TITLE_BODY = {
  field: 'title',
  docTitle: 'Vé sản phẩm cao tốc Cần Thơ – Phú Quốc',
  docContent: 'Đặt vé tàu cao tốc...',
  focusKeyword: 'tàu cao tốc',
}

// ─── Test 1: Unauthenticated → 401 ───────────────────────────────────────────

describe('seo-ai-generate — auth', () => {
  it('returns 401 when req.user is null', async () => {
    const req = makeReq({ user: null, body: VALID_TITLE_BODY })
    const res = await seoAiGenerateEndpoint.handler(req)
    assert.equal(res.status, 401)
  })
})

// ─── Test 2: Missing required fields → 400 ────────────────────────────────────

describe('seo-ai-generate — validation', () => {
  it('returns 400 when field is missing', async () => {
    const req = makeReq({ body: { docTitle: 'Test' } })
    const res = await seoAiGenerateEndpoint.handler(req)
    assert.equal(res.status, 400)
  })

  it('returns 400 when docTitle is missing', async () => {
    const req = makeReq({ body: { field: 'title' } })
    const res = await seoAiGenerateEndpoint.handler(req)
    assert.equal(res.status, 400)
  })

  it('returns 400 for unknown field type', async () => {
    const req = makeReq({ body: { field: 'robots', docTitle: 'Test' } })
    const res = await seoAiGenerateEndpoint.handler(req)
    assert.equal(res.status, 400)
  })
})

// ─── Test 3: Valid title → 200 with suggestion ────────────────────────────────

describe('seo-ai-generate — title', () => {
  it('returns 200 { suggestion } for title field', async () => {
    injectStub(makeDeepSeekStub(JSON.stringify({ suggestion: 'Mua Example Org Cần Thơ Phú Quốc' })))
    const req = makeReq({ body: VALID_TITLE_BODY })
    const res = await seoAiGenerateEndpoint.handler(req)
    assert.equal(res.status, 200)
    const json = await res.json() as { suggestion: string }
    assert.equal(typeof json.suggestion, 'string')
    assert.ok(json.suggestion.length > 0)
  })
})

// ─── Test 4: Valid description → 200 ─────────────────────────────────────────

describe('seo-ai-generate — description', () => {
  it('returns 200 { suggestion } for description field', async () => {
    injectStub(makeDeepSeekStub(JSON.stringify({ suggestion: 'Đặt vé tàu cao tốc Cần Thơ – Phú Quốc giá rẻ nhất.' })))
    const req = makeReq({
      body: { field: 'description', docTitle: 'Vé Cần Thơ Phú Quốc', docContent: 'content...' },
    })
    const res = await seoAiGenerateEndpoint.handler(req)
    assert.equal(res.status, 200)
    const json = await res.json() as { suggestion: string }
    assert.equal(typeof json.suggestion, 'string')
  })
})

// ─── Test 5: Valid faq → 200 ─────────────────────────────────────────────────

describe('seo-ai-generate — faq', () => {
  it('returns 200 { suggestion } for faq field (suggestion is JSON array string)', async () => {
    const faqItems = [{ question: 'Tàu chạy mấy giờ?', answer: '8 giờ sáng' }]
    injectStub(makeDeepSeekStub(JSON.stringify({ items: faqItems })))
    const req = makeReq({
      body: { field: 'faq', docTitle: 'Vé sản phẩm Cần Thơ', docContent: 'content...', count: 1 },
    })
    const res = await seoAiGenerateEndpoint.handler(req)
    assert.equal(res.status, 200)
    const json = await res.json() as { suggestion: string }
    assert.equal(typeof json.suggestion, 'string')
    // suggestion should be parseable as JSON array
    const parsed = JSON.parse(json.suggestion) as unknown[]
    assert.ok(Array.isArray(parsed))
  })
})

// ─── Test 6: Valid alt → 200 ─────────────────────────────────────────────────

describe('seo-ai-generate — alt', () => {
  it('returns 200 { suggestion } for alt field', async () => {
    injectStub(makeDeepSeekStub(JSON.stringify({ suggestion: 'Tàu cao tốc Cần Thơ Phú Quốc trên sông Hậu' })))
    const req = makeReq({
      body: { field: 'alt', docTitle: 'Vé sản phẩm Cần Thơ', imageContext: 'Tàu trên sông' },
    })
    const res = await seoAiGenerateEndpoint.handler(req)
    assert.equal(res.status, 200)
    const json = await res.json() as { suggestion: string }
    assert.equal(typeof json.suggestion, 'string')
  })
})

// ─── Test 7: Soft rate-limit → 429 (store-driven, no DB) ─────────────────────

describe('seo-ai-generate — rate limit', () => {
  it('returns 429 when in-process store shows limit exceeded (no DB involved)', async () => {
    // Seed the store directly — proves rate-limit is driven by rateLimitStore, not any DB query.
    const resetStore = _seedRateLimitForTest('user-rl', 999)
    try {
      injectStub(makeDeepSeekStub(JSON.stringify({ suggestion: 'should not reach AI' })))
      const req = makeReq({ user: { id: 'user-rl' }, body: VALID_TITLE_BODY })
      const res = await seoAiGenerateEndpoint.handler(req)
      assert.equal(res.status, 429)
      const json = await res.json() as { error: string }
      assert.ok(
        json.error.toLowerCase().includes('rate') || json.error.toLowerCase().includes('giới hạn'),
        `expected rate-limit error message, got: ${json.error}`,
      )
    } finally {
      resetStore()
    }
  })

  it('allows request when store is empty for that user', async () => {
    // Different user — store is clean, must succeed
    injectStub(makeDeepSeekStub(JSON.stringify({ suggestion: 'Tiêu đề thử nghiệm' })))
    const req = makeReq({ user: { id: 'user-clean' }, body: VALID_TITLE_BODY })
    const res = await seoAiGenerateEndpoint.handler(req)
    assert.equal(res.status, 200)
  })
})

// ─── Test 8: Rate-limit key is server-side only (body.tenantId ignored) ───────

describe('seo-ai-generate — rate-limit key security', () => {
  it('body.tenantId does not influence the rate-limit bucket', async () => {
    // Seed the rate-limit store for 'attacker-user' (the verified JWT id)
    const resetStore = _seedRateLimitForTest('attacker-user', 999)
    try {
      injectStub(makeDeepSeekStub(JSON.stringify({ suggestion: 'ignored' })))

      // Attacker supplies a different tenantId hoping to bypass their own bucket
      const req = makeReq({
        user: { id: 'attacker-user' },
        body: { ...VALID_TITLE_BODY, tenantId: 'fresh-bucket-id' },
      })
      const res = await seoAiGenerateEndpoint.handler(req)
      // Must still be 429 — body.tenantId is ignored; key comes from user.id
      assert.equal(res.status, 429,
        'body.tenantId must not bypass the rate-limit keyed by user.id')
    } finally {
      resetStore()
    }
  })
})

// ─── Test 9: DeepSeek error → 502 ────────────────────────────────────────────

describe('seo-ai-generate — upstream error', () => {
  it('returns 502 when DeepSeek client throws', async () => {
    injectStub(makeFailingDeepSeekStub('DeepSeek timeout'))
    const req = makeReq({ body: VALID_TITLE_BODY })
    const res = await seoAiGenerateEndpoint.handler(req)
    assert.equal(res.status, 502)
    const json = await res.json() as { error: string }
    assert.ok(typeof json.error === 'string')
  })
})

// ─── Test 10: Wrong shape from chatJson → 502 ────────────────────────────────

describe('seo-ai-generate — malformed AI response', () => {
  it('returns 502 when AI returns no suggestion field', async () => {
    injectStub(makeDeepSeekStub(JSON.stringify({ result: 'no suggestion key here' })))
    const req = makeReq({ body: VALID_TITLE_BODY })
    const res = await seoAiGenerateEndpoint.handler(req)
    assert.equal(res.status, 502)
  })
})
