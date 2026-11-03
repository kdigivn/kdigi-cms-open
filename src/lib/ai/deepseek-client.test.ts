/**
 * Unit tests for deepseek-client — all network calls are intercepted via the
 * exported _setClientForTest escape hatch; no real HTTP traffic is made.
 */
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  chatJson,
  getModel,
  mapLimit,
  _setClientForTest,
} from './deepseek-client'

// ─── Env Helpers ──────────────────────────────────────────────────────────────

let savedApiKey: string | undefined
let savedModel: string | undefined
let resetClient: (() => void) | undefined

beforeEach(() => {
  savedApiKey = process.env.DEEPSEEK_API_KEY
  savedModel = process.env.DEEPSEEK_MODEL
  // Set valid defaults so most tests don't need to worry about env
  process.env.DEEPSEEK_API_KEY = 'test-key'
  process.env.DEEPSEEK_MODEL = 'deepseek-chat'
})

afterEach(() => {
  // Restore env
  if (savedApiKey === undefined) delete process.env.DEEPSEEK_API_KEY
  else process.env.DEEPSEEK_API_KEY = savedApiKey

  if (savedModel === undefined) delete process.env.DEEPSEEK_MODEL
  else process.env.DEEPSEEK_MODEL = savedModel

  // Reset injected stub if one was set
  if (resetClient) {
    resetClient()
    resetClient = undefined
  }
})

// ─── Stub Factory ─────────────────────────────────────────────────────────────

/**
 * Builds a minimal OpenAI client stub whose chat.completions.create returns
 * the provided sequence of values in order (each call pops the next entry).
 */
function makeClientStub(responses: Array<{ content: string } | Error>) {
  let callCount = 0
  return {
    chat: {
      completions: {
        async create(): Promise<{ choices: Array<{ message: { content: string } }> }> {
          const response = responses[callCount++ % responses.length]
          if (response instanceof Error) throw response
          return { choices: [{ message: { content: response.content } }] }
        },
      },
    },
  }
}

/** Injects a stub client via the exported test escape hatch. */
function injectStub(stub: unknown): void {
  resetClient = _setClientForTest(stub)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getModel', () => {
  it('returns DEEPSEEK_MODEL env value', () => {
    process.env.DEEPSEEK_MODEL = 'deepseek-reasoner'
    assert.equal(getModel(), 'deepseek-reasoner')
  })

  it('throws when DEEPSEEK_MODEL is not set', () => {
    delete process.env.DEEPSEEK_MODEL
    assert.throws(
      () => getModel(),
      (err: unknown) => {
        assert.ok(err instanceof Error)
        assert.ok(err.message.includes('DEEPSEEK_MODEL'))
        return true
      },
    )
  })
})

describe('chatJson', () => {
  it('parses a valid JSON response', async () => {
    injectStub(makeClientStub([{ content: '{"ok":true}' }]))
    const result = await chatJson([{ role: 'user', content: 'test' }])
    assert.deepEqual(result, { ok: true })
  })

  it('strips ```json code fence before parsing', async () => {
    injectStub(makeClientStub([{ content: '```json\n{"value":42}\n```' }]))
    const result = await chatJson([{ role: 'user', content: 'test' }])
    assert.deepEqual(result, { value: 42 })
  })

  it('strips plain ``` code fence before parsing', async () => {
    injectStub(makeClientStub([{ content: '```\n{"x":1}\n```' }]))
    const result = await chatJson([{ role: 'user', content: 'test' }])
    assert.deepEqual(result, { x: 1 })
  })

  it('retries once on parse failure and succeeds on second attempt', async () => {
    injectStub(
      makeClientStub([
        { content: 'not valid json {{{' }, // first attempt fails
        { content: '{"retried":true}' },   // second attempt succeeds
      ]),
    )
    const result = await chatJson([{ role: 'user', content: 'test' }])
    assert.deepEqual(result, { retried: true })
  })

  it('throws a descriptive error after two parse failures', async () => {
    injectStub(
      makeClientStub([
        { content: 'bad json' },
        { content: 'still bad json' },
      ]),
    )
    await assert.rejects(
      () => chatJson([{ role: 'user', content: 'test' }]),
      (err: unknown) => {
        assert.ok(err instanceof Error)
        assert.ok(
          err.message.includes('chatJson failed') || err.message.includes('JSON'),
          `expected descriptive error, got: ${err.message}`,
        )
        return true
      },
    )
  })

  it('throws immediately on non-parse API errors (no retry)', async () => {
    const apiError = new Error('API rate limit exceeded')
    // Mark as a non-JSON error so the retry branch is not taken
    injectStub(makeClientStub([apiError, { content: '{"ok":true}' }]))
    await assert.rejects(
      () => chatJson([{ role: 'user', content: 'test' }]),
      (err: unknown) => {
        assert.ok(err instanceof Error)
        assert.equal(err.message, 'API rate limit exceeded')
        return true
      },
    )
  })

  it('throws when DEEPSEEK_MODEL is unset', async () => {
    delete process.env.DEEPSEEK_MODEL
    injectStub(makeClientStub([{ content: '{"ok":true}' }]))
    await assert.rejects(
      () => chatJson([{ role: 'user', content: 'test' }]),
      (err: unknown) => {
        assert.ok(err instanceof Error)
        assert.ok(err.message.includes('DEEPSEEK_MODEL'))
        return true
      },
    )
  })

  it('prepends schemaHint as system message', async () => {
    const captured: Array<{ role: string; content: string }> = []
    const stub = {
      chat: {
        completions: {
          async create(params: {
            messages: Array<{ role: string; content: string }>
          }): Promise<{ choices: Array<{ message: { content: string } }> }> {
            captured.push(...params.messages)
            return { choices: [{ message: { content: '{"ok":true}' } }] }
          },
        },
      },
    }
    injectStub(stub)
    await chatJson([{ role: 'user', content: 'hello' }], {
      schemaHint: '{ ok: boolean }',
    })
    assert.ok(captured[0].role === 'system')
    assert.ok(captured[0].content.includes('{ ok: boolean }'))
  })

  it('always prepends a JSON-instruction system message even without schemaHint', async () => {
    // DeepSeek 400s if the word "json" is absent when response_format is json_object.
    const captured: Array<{ role: string; content: string }> = []
    const stub = {
      chat: {
        completions: {
          async create(params: {
            messages: Array<{ role: string; content: string }>
          }): Promise<{ choices: Array<{ message: { content: string } }> }> {
            captured.push(...params.messages)
            return { choices: [{ message: { content: '{"ok":true}' } }] }
          },
        },
      },
    }
    injectStub(stub)
    await chatJson([{ role: 'user', content: 'hello' }])
    assert.ok(captured[0].role === 'system')
    assert.ok(captured[0].content.toLowerCase().includes('json'))
  })
})

describe('mapLimit', () => {
  it('processes all items and returns results in order', async () => {
    const results = await mapLimit([1, 2, 3, 4, 5], 2, async (n) => n * 2)
    assert.deepEqual(results, [2, 4, 6, 8, 10])
  })

  it('respects concurrency limit (at most N concurrent)', async () => {
    let concurrent = 0
    let maxSeen = 0
    const limit = 3

    await mapLimit(
      Array.from({ length: 10 }, (_, i) => i),
      limit,
      async () => {
        concurrent++
        maxSeen = Math.max(maxSeen, concurrent)
        await new Promise((r) => setTimeout(r, 5))
        concurrent--
      },
    )

    assert.ok(maxSeen <= limit, `max concurrent ${maxSeen} exceeded limit ${limit}`)
  })

  it('handles empty array', async () => {
    const results = await mapLimit([], 4, async (x: number) => x)
    assert.deepEqual(results, [])
  })
})
