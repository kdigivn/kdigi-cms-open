/**
 * POST /api/seo/ai-generate
 *
 * Generates an AI suggestion for a single SEO field using DeepSeek.
 * The API key stays server-side — client never sees it.
 *
 * Request body (JSON):
 *   {
 *     field:        'title' | 'description' | 'faq' | 'alt'
 *     docTitle:     string   (required — primary context anchor)
 *     docContent?:  string   (plain-text body excerpt, trimmed server-side)
 *     focusKeyword?: string
 *     imageContext?: string  (alt field only — what the image shows)
 *     count?:       number   (faq only — number of items, default 3)
 *   }
 *
 * Response 200:
 *   { suggestion: string }
 *   (For faq: suggestion is a JSON-stringified array of { question, answer } objects
 *    that the client can JSON.parse before displaying.)
 *
 * Error responses:
 *   401  — not authenticated
 *   400  — missing/invalid field or docTitle; unknown field type
 *   429  — per-user soft rate-limit exceeded (RATE_LIMIT_PER_MINUTE calls/min)
 *   502  — DeepSeek upstream error or malformed AI response
 *
 * Rate-limit strategy (SOFT — no hard monthly cap per plan validation):
 *   In-process rolling-window Map keyed by `String(user.id)` (server-side only;
 *   never derived from body). Entries older than RATE_WINDOW_MS are pruned on
 *   each check. Resets on server restart — intentional for a SOFT limit.
 *   Sufficient for single-instance deployments; Redis can replace it when needed.
 *
 * Security: rate-limit key is always derived from req.user.id (verified JWT),
 * never from client-supplied body fields. This prevents bypass by supplying
 * an arbitrary tenantId in the request body.
 */
import type { Endpoint } from 'payload'
import { chatJson } from '../lib/ai/deepseek-client'
import {
  buildTitlePrompt,
  buildDescriptionPrompt,
  buildFaqPrompt,
  buildAltPrompt,
  SEO_FIELD_SCHEMAS,
} from '../lib/ai/seo-prompts'

// ─── Rate-limit config ────────────────────────────────────────────────────────

/**
 * Maximum AI calls per user per 60-second window (soft limit).
 * Adjust via SEO_AI_RATE_LIMIT env var for tuning without code changes.
 */
const RATE_LIMIT_PER_MINUTE = parseInt(process.env.SEO_AI_RATE_LIMIT ?? '20', 10)

/** Rolling window in ms (60 s). */
const RATE_WINDOW_MS = 60_000

/**
 * In-process usage log: userKey → array of call timestamps (ms).
 * Entries older than RATE_WINDOW_MS are pruned on each check.
 * Resets on server restart — intentional; this is a SOFT limit, not billing-grade.
 *
 * Key is always derived from the verified JWT user.id (server-side).
 * Never keyed by any client-supplied value.
 */
const rateLimitStore = new Map<string, number[]>()

/**
 * Returns true when the user has exceeded the soft rate-limit.
 * Prunes stale entries as a side-effect.
 * Driven exclusively by the in-process store — no DB query involved.
 */
export function checkRateLimit(userKey: string): boolean {
  const now = Date.now()
  const calls = rateLimitStore.get(userKey) ?? []
  const recent = calls.filter(ts => now - ts < RATE_WINDOW_MS)
  rateLimitStore.set(userKey, recent)
  return recent.length >= RATE_LIMIT_PER_MINUTE
}

/** Records one call in the rate-limit store for the given user. */
export function recordCall(userKey: string): void {
  const now = Date.now()
  const calls = rateLimitStore.get(userKey) ?? []
  calls.push(now)
  rateLimitStore.set(userKey, calls)
}

/**
 * Test-only: seed the rate-limit store so unit tests can exercise the 429 path
 * without making real AI calls. Returns a reset function.
 *
 * @internal
 */
export function _seedRateLimitForTest(userKey: string, count: number): () => void {
  const now = Date.now()
  rateLimitStore.set(userKey, Array.from({ length: count }, () => now))
  return () => rateLimitStore.delete(userKey)
}

// ─── Allowed field types ──────────────────────────────────────────────────────

const ALLOWED_FIELDS = ['title', 'description', 'faq', 'alt'] as const
type SeoAiField = (typeof ALLOWED_FIELDS)[number]

// ─── Request body type ────────────────────────────────────────────────────────

interface SeoAiGenerateBody {
  field?: string
  docTitle?: string
  docContent?: string
  focusKeyword?: string
  imageContext?: string
  count?: number
  // NOTE: tenantId in the body is intentionally ignored for the rate-limit key.
  // The key is always derived from the verified JWT user.id to prevent bypass.
}

// ─── Endpoint ─────────────────────────────────────────────────────────────────

export const seoAiGenerateEndpoint: Endpoint = {
  method: 'post',
  path: '/seo/ai-generate',
  handler: async (req) => {
    // 1. Auth guard — any logged-in user may generate suggestions
    const user = req.user as { id: string | number; role?: string } | null
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Parse body
    let body: SeoAiGenerateBody = {}
    try {
      const jsonFn = (req as unknown as { json?: () => Promise<unknown> }).json
      if (typeof jsonFn === 'function') {
        body = (await jsonFn.call(req)) as SeoAiGenerateBody
      }
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { field, docTitle, docContent, focusKeyword, imageContext, count } = body

    // 3. Validate required fields
    if (!field || typeof field !== 'string') {
      return Response.json({ error: 'field is required (title | description | faq | alt)' }, { status: 400 })
    }
    if (!docTitle || typeof docTitle !== 'string' || !docTitle.trim()) {
      return Response.json({ error: 'docTitle is required' }, { status: 400 })
    }
    if (!(ALLOWED_FIELDS as readonly string[]).includes(field)) {
      return Response.json(
        { error: `Unknown field type "${field}". Must be one of: ${ALLOWED_FIELDS.join(', ')}` },
        { status: 400 },
      )
    }

    // 4. Soft per-user rate-limit check.
    //    Key is ALWAYS derived from the verified JWT user.id — never from any
    //    client-supplied body field. This prevents bypass via a crafted tenantId.
    const userKey = String(user.id)

    if (checkRateLimit(userKey)) {
      return Response.json(
        { error: `Đã vượt giới hạn ${RATE_LIMIT_PER_MINUTE} lần/phút. Vui lòng thử lại sau.` },
        { status: 429 },
      )
    }

    // 5. Build prompt and call DeepSeek
    const docCtx = {
      docTitle: docTitle.trim(),
      docContent: typeof docContent === 'string' ? docContent.slice(0, 600) : undefined,
      focusKeyword: typeof focusKeyword === 'string' ? focusKeyword : undefined,
    }

    let suggestion: string
    try {
      const seoField = field as SeoAiField
      const schemaHint = SEO_FIELD_SCHEMAS[seoField]

      let rawResult: unknown

      switch (seoField) {
        case 'title':
          rawResult = await chatJson(buildTitlePrompt(docCtx), { schemaHint })
          break
        case 'description':
          rawResult = await chatJson(buildDescriptionPrompt(docCtx), { schemaHint })
          break
        case 'faq': {
          const faqCount = typeof count === 'number' && count > 0 ? Math.min(count, 10) : 3
          rawResult = await chatJson(buildFaqPrompt({ ...docCtx, count: faqCount }), { schemaHint })
          break
        }
        case 'alt':
          rawResult = await chatJson(
            buildAltPrompt({
              ...docCtx,
              imageContext: typeof imageContext === 'string' ? imageContext : undefined,
            }),
            { schemaHint },
          )
          break
      }

      // 6. Extract suggestion from AI response
      const result = rawResult as Record<string, unknown>

      if (seoField === 'faq') {
        // FAQ returns { items: [...] } — serialize array to string for the uniform response shape
        const items = result?.items
        if (!Array.isArray(items) || items.length === 0) {
          req.payload.logger.warn({ result }, '[seo-ai-generate] FAQ response missing items array')
          return Response.json({ error: 'AI returned unexpected response for faq' }, { status: 502 })
        }
        suggestion = JSON.stringify(items)
      } else {
        // title / description / alt all return { suggestion: string }
        const s = result?.suggestion
        if (typeof s !== 'string' || !s.trim()) {
          req.payload.logger.warn({ result }, '[seo-ai-generate] response missing suggestion string')
          return Response.json({ error: 'AI returned unexpected response' }, { status: 502 })
        }
        suggestion = s.trim()
      }
    } catch (err) {
      req.payload.logger.error({ err }, '[seo-ai-generate] DeepSeek call failed')
      return Response.json(
        { error: 'AI generation failed. Please try again.' },
        { status: 502 },
      )
    }

    // 7. Record usage in the in-process rate-limit store + structured log.
    //    The in-process Map is the authoritative rate-limit store; the logger line
    //    creates an audit trail in whatever log aggregation is configured.
    recordCall(userKey)
    req.payload.logger.info(
      { userKey, field, userId: String(user.id) },
      '[seo-ai-generate] usage',
    )

    return Response.json({ suggestion }, { status: 200 })
  },
}
