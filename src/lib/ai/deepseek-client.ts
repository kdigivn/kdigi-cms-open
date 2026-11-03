/**
 * DeepSeek API client built on the `openai` SDK.
 *
 * DeepSeek exposes an OpenAI-compatible REST API, so pointing the SDK's baseURL
 * at https://api.deepseek.com is sufficient — no custom HTTP layer needed.
 *
 * Key design decisions:
 *   - Model ID is NEVER hardcoded; always read from DEEPSEEK_MODEL env so the
 *     operator can pin a specific model version after running verify-deepseek-model.ts.
 *   - chatJson() enforces response_format:{type:'json_object'} and strips any
 *     ```json ... ``` code-fence wrappers the model may emit despite the format flag.
 *   - One automatic retry on JSON parse failure (model sometimes returns malformed
 *     JSON on first attempt; a second call with the same prompt usually succeeds).
 *   - mapLimit() caps parallel AI calls to prevent rate-limit exhaustion; exported
 *     for reuse by the orchestrator (Phase 3).
 */
import OpenAI from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'

// ─── Env Accessors ────────────────────────────────────────────────────────────

/** Returns the DeepSeek API key, throwing a clear error when unset. */
function getApiKey(): string {
  const key = process.env.DEEPSEEK_API_KEY
  if (!key) {
    throw new Error(
      '[deepseek-client] DEEPSEEK_API_KEY is not set. ' +
        'Run src/scripts/verify-deepseek-model.ts to confirm a working model, ' +
        'then add the key to your .env file.',
    )
  }
  return key
}

/**
 * Returns the DeepSeek model ID from env.
 * Throws when unset — no hardcoded default so the operator is forced to verify
 * the model ID explicitly via verify-deepseek-model.ts before deploying.
 */
export function getModel(): string {
  const model = process.env.DEEPSEEK_MODEL
  if (!model) {
    throw new Error(
      '[deepseek-client] DEEPSEEK_MODEL is not set. ' +
        'Run src/scripts/verify-deepseek-model.ts to confirm the model ID, ' +
        'then set DEEPSEEK_MODEL in your .env file.',
    )
  }
  return model
}

// ─── Client Factory ───────────────────────────────────────────────────────────

// Mutable state held in a plain object so tests can swap the client without
// fighting ESM module namespace immutability.
const _state: { client: OpenAI | undefined } = { client: undefined }

/**
 * Returns a shared OpenAI client pointed at DeepSeek's API.
 * Lazily constructed so import-time env checks don't fire during cold boot.
 */
export function getDeepSeek(): OpenAI {
  if (!_state.client) {
    _state.client = new OpenAI({
      baseURL: 'https://api.deepseek.com',
      apiKey: getApiKey(),
      timeout: 90_000,
      maxRetries: 3,
    })
  }
  return _state.client
}

/**
 * Test-only: replace the cached client with a stub and return a reset function.
 * Never call this in production code.
 *
 * @internal
 */
export function _setClientForTest(stub: unknown): () => void {
  const prev = _state.client
  _state.client = stub as OpenAI
  return () => { _state.client = prev }
}

// ─── JSON Fence Stripper ──────────────────────────────────────────────────────

/**
 * Strips optional ```json ... ``` code-fence wrappers from model output.
 * The model sometimes emits these even when response_format:json_object is set.
 */
function stripCodeFence(raw: string): string {
  const fenceMatch = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```\s*$/m)
  return fenceMatch ? fenceMatch[1] : raw
}

// ─── chatJson ─────────────────────────────────────────────────────────────────

export interface ChatJsonOptions {
  /** Optional hint embedded in the system prompt to guide JSON schema shape. */
  schemaHint?: string
}

/**
 * Calls DeepSeek chat completions requesting a JSON object response.
 *
 * Behaviour:
 *   1. Sends messages with response_format:{type:'json_object'}, temperature 0.2.
 *   2. Strips ```json``` code fences from the response.
 *   3. JSON.parse; on parse failure retries once (same messages, fresh API call).
 *   4. Throws a descriptive error if both attempts fail.
 *
 * @param messages  OpenAI-compatible message array
 * @param options   Optional schemaHint appended to system message
 * @returns         Parsed JSON object (unknown — callers must validate shape)
 */
export async function chatJson(
  messages: ChatCompletionMessageParam[],
  options: ChatJsonOptions = {},
): Promise<unknown> {
  const client = getDeepSeek()
  const model = getModel()

  // DeepSeek (like OpenAI) rejects response_format:json_object unless the word
  // "json" appears somewhere in the messages. Always prepend a JSON-instruction
  // system message so callers never have to remember this constraint.
  const jsonInstruction = options.schemaHint
    ? `You must respond with valid JSON only. Schema hint: ${options.schemaHint}`
    : 'You must respond with valid JSON only.'

  const augmentedMessages: ChatCompletionMessageParam[] = [
    { role: 'system', content: jsonInstruction },
    ...messages,
  ]

  async function attempt(): Promise<unknown> {
    const response = await client.chat.completions.create({
      model,
      messages: augmentedMessages,
      response_format: { type: 'json_object' },
      temperature: 0.2,
    })

    const raw = response.choices[0]?.message?.content ?? ''
    const cleaned = stripCodeFence(raw.trim())

    return JSON.parse(cleaned)
  }

  // First attempt
  try {
    return await attempt()
  } catch (firstErr) {
    // Only retry on JSON parse errors — network/API errors propagate immediately
    const isParseError =
      firstErr instanceof SyntaxError ||
      (firstErr instanceof Error && firstErr.message.includes('JSON'))

    if (!isParseError) throw firstErr
  }

  // Single retry on parse failure
  try {
    return await attempt()
  } catch (retryErr) {
    throw new Error(
      `[deepseek-client] chatJson failed after 2 attempts: ${
        retryErr instanceof Error ? retryErr.message : String(retryErr)
      }`,
    )
  }
}

// ─── Concurrency Limiter ──────────────────────────────────────────────────────

/**
 * Maps `items` through `fn` with at most `limit` concurrent calls.
 *
 * Prevents rate-limit exhaustion when bulk-processing many docs that each
 * trigger an AI call. Default limit of 8 matches DeepSeek's recommended burst window.
 *
 * Pure implementation — no extra deps beyond native Promise.
 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number = 8,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const i = nextIndex++
      results[i] = await fn(items[i], i)
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker)
  await Promise.all(workers)
  return results
}
