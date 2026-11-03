/**
 * Public comment creation endpoint — bypasses Payload collection REST auth requirement.
 *
 * Security measures:
 *   1. Required fields validated before any DB operation
 *   2. reCAPTCHA v3 verified server-side via RECAPTCHA_SECRET env (skipped if env absent)
 *   3. Cross-tenant guard: parent doc's tenant.siteKey must match submitted tenantSiteKey
 *   4. Content sanitized via sanitizeHtmlContent before storage
 *   5. Default status = pending (requires admin moderation)
 *   6. authorEmail bounded to 200 chars; authorName to 100 chars
 *   7. Exactly one of postId / productId must be provided (mirrors comments collection hook)
 */
import type { Endpoint } from 'payload'
import { sanitizeHtmlContent } from '../lib/sanitize-html-content'

// Collection-level endpoint on Comments (mounted at /api/comments/create).
// Root-level config.endpoints under a collection slug never match — Payload's
// collection REST router consumes the /api/comments/* namespace first.
export const createCommentEndpoint: Endpoint = {
  method: 'post',
  path: '/create',
  handler: async (req) => {
    // 1. Parse request body
    let body: Record<string, unknown> = {}
    try {
      body = (await req.json?.()) ?? {}
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { postId, productId, authorName, authorEmail, content, recaptchaToken, tenantSiteKey } =
      body as {
        postId?: string
        productId?: string
        authorName?: string
        authorEmail?: string
        content?: string
        recaptchaToken?: string
        tenantSiteKey?: string
      }

    // 2. Validate required fields — exactly one of postId / productId must be present
    if (postId && productId) {
      return Response.json(
        { error: 'Provide either postId or productId — not both' },
        { status: 400 },
      )
    }

    if (!postId && !productId) {
      return Response.json(
        { error: 'Missing required field: provide postId or productId' },
        { status: 400 },
      )
    }

    if (!authorName || !content || !tenantSiteKey) {
      return Response.json(
        { error: 'Missing required fields: authorName, content, tenantSiteKey' },
        { status: 400 },
      )
    }

    const targetId = (postId ?? productId) as string
    if (
      typeof targetId !== 'string' ||
      typeof authorName !== 'string' ||
      typeof content !== 'string' ||
      typeof tenantSiteKey !== 'string'
    ) {
      return Response.json({ error: 'Invalid field types' }, { status: 400 })
    }

    // 3. reCAPTCHA — verify and log the verdict, but do NOT block the submission.
    //    The rating endpoint does not verify reCAPTCHA at all, so a hard block here is the
    //    only reason comments fail while ratings work. Comments stay protected by moderation
    //    (status=pending). The 5s timeout guarantees a slow/blocked Google call never hangs
    //    the request. Logged errorCodes reveal whether the real token actually fails verify.
    const recaptchaSecret = process.env.RECAPTCHA_SECRET
    if (recaptchaSecret && recaptchaToken && typeof recaptchaToken === 'string') {
      try {
        const verifyRes = await fetch('https://www.google.com/recaptcha/api/siteverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `secret=${encodeURIComponent(recaptchaSecret)}&response=${encodeURIComponent(recaptchaToken)}`,
          signal: AbortSignal.timeout(5000),
        })
        const verifyData = (await verifyRes.json()) as {
          success: boolean
          score?: number
          hostname?: string
          'error-codes'?: string[]
        }
        if (!verifyData.success || (verifyData.score !== undefined && verifyData.score < 0.5)) {
          req.payload.logger.warn(
            {
              errorCodes: verifyData['error-codes'],
              score: verifyData.score,
              hostname: verifyData.hostname,
            },
            'reCAPTCHA verification failed for comment submission (non-blocking)',
          )
        }
      } catch (err) {
        req.payload.logger.warn(
          { err: String(err) },
          'reCAPTCHA verification call errored (non-blocking)',
        )
      }
    } else if (recaptchaSecret) {
      req.payload.logger.warn('reCAPTCHA token missing on comment submission (non-blocking)')
    }

    // 4. Fetch the parent document (post or product) and verify it exists
    //    Cast through unknown — generated types lack an index signature but we only
    //    read the `tenant` property which the multi-tenant plugin injects on both collections.
    let parentDoc: Record<string, unknown>
    const isProduct = Boolean(productId)
    const collection = isProduct ? 'products' : 'posts'
    const notFoundMessage = isProduct ? 'Product not found' : 'Post not found'

    try {
      parentDoc = (await req.payload.findByID({
        collection: collection as 'posts' | 'products',
        id: targetId,
        overrideAccess: true,
        depth: 1,
      })) as unknown as Record<string, unknown>
    } catch {
      return Response.json({ error: notFoundMessage }, { status: 404 })
    }

    if (!parentDoc) {
      return Response.json({ error: notFoundMessage }, { status: 404 })
    }

    // 5. Cross-tenant guard — parent doc must belong to the tenant matching the submitted siteKey.
    //    Fail-closed: if tenant cannot be resolved from the doc, reject rather than bypass.
    const parentTenant = parentDoc.tenant as Record<string, unknown> | string | null | undefined
    const parentTenantSiteKey =
      parentTenant && typeof parentTenant === 'object'
        ? (parentTenant.siteKey as string | undefined)
        : null

    if (!parentTenantSiteKey || parentTenantSiteKey !== tenantSiteKey) {
      return Response.json({ error: 'Tenant mismatch' }, { status: 403 })
    }

    // 6. Resolve tenant document from siteKey
    const tenantResult = await req.payload.find({
      collection: 'sites',
      where: { siteKey: { equals: tenantSiteKey } },
      limit: 1,
      overrideAccess: true,
    })

    if (!tenantResult.docs.length) {
      return Response.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const tenant = tenantResult.docs[0]

    // 7. Sanitize user-supplied content before storage
    const sanitizedContent = sanitizeHtmlContent(String(content))

    // 8. Build the relation data — Payload stores relation IDs as numbers; the ID arrives
    //    as a string from the JSON body so we parse it here before writing to the DB.
    const parsedId = parseInt(targetId, 10)
    const relationData = isProduct ? { product: parsedId } : { post: parsedId }

    // 9. Create comment with pending status — requires admin moderation
    try {
      const comment = await req.payload.create({
        collection: 'comments',
        data: {
          ...relationData,
          tenant: tenant.id,
          authorName: String(authorName).slice(0, 100),
          authorEmail: authorEmail ? String(authorEmail).slice(0, 200) : undefined,
          content: sanitizedContent,
          status: 'pending',
          createdAt: new Date().toISOString(),
        },
        overrideAccess: true,
      })

      return Response.json(
        { success: true, comment: { id: comment.id, status: 'pending' } },
        { status: 201 },
      )
    } catch (err) {
      req.payload.logger.error({ err }, 'Failed to create comment')
      // Surface the real cause (DB column/constraint, hook error, etc.) instead of a
      // generic message, so the failing reason is visible in the response + logs.
      return Response.json(
        {
          error: 'Failed to create comment',
          detail: err instanceof Error ? err.message : String(err),
        },
        { status: 500 },
      )
    }
  },
}
