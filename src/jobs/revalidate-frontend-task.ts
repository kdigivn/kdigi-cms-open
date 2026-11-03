/**
 * Job task: ask a tenant's frontend to revalidate one document path.
 *
 * Replaces the awaited `fetch` that used to run inside the afterChange hook, so a
 * slow/unreachable frontend no longer blocks the save (it ran with a 5s timeout on
 * every content save). The job keeps the exact frontend contract the hook had:
 *
 *   POST https://{Sites.domain}/api/cms/revalidate
 *   { "collection": "<slug>", "id": "<doc id>", "slug": "<doc slug>" }
 *
 * Failures throw so Payload retries with backoff and the failure is visible in the
 * jobs table, instead of disappearing into a `.catch()`. A tenant with no
 * `domain` succeeds with `skipped` — retrying it would never help.
 *
 * SECURITY: the job input never carries secrets; the Site document is re-read here
 * with `overrideAccess: true` (the same pattern as the hooks that used to read it).
 */
import type { TaskConfig } from 'payload'

export const REVALIDATE_FRONTEND_TASK_SLUG = 'revalidateFrontend'

/** Timeout for one frontend revalidate request (matches the old in-hook timeout). */
export const REVALIDATE_TIMEOUT_MS = 5000

/** Job input — mirrors the hook's decision output; never carries secrets. */
export interface RevalidateFrontendInput {
  tenantId: string
  collection: string
  id: string
  slug: string
}

export interface RevalidateFrontendOutput {
  skipped?: boolean
  reason?: string
  ok?: boolean
  status?: number
}

export const revalidateFrontendTask: TaskConfig<{
  input: RevalidateFrontendInput
  output: RevalidateFrontendOutput
}> = {
  slug: REVALIDATE_FRONTEND_TASK_SLUG,
  label: 'Revalidate frontend cache',
  retries: { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
  inputSchema: [
    { name: 'tenantId', type: 'text', required: true },
    { name: 'collection', type: 'text', required: true },
    { name: 'id', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true },
  ],
  handler: async ({ input, req }) => {
    const site = await req.payload.findByID({
      collection: 'sites',
      id: input.tenantId,
      overrideAccess: true,
      depth: 0,
      req, // join the job's transaction — avoid a second pool connection
    })

    const domain = (site as { domain?: string } | null)?.domain
    if (!domain) {
      return { output: { skipped: true, reason: 'no-domain' } }
    }

    const url = `https://${domain}/api/cms/revalidate`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collection: input.collection,
        id: input.id,
        slug: input.slug,
      }),
      signal: AbortSignal.timeout(REVALIDATE_TIMEOUT_MS),
    })

    if (!res.ok) {
      throw new Error(`revalidate ${url} returned HTTP ${res.status}`)
    }

    return { output: { ok: true, status: res.status } }
  },
}
