import type { Endpoint } from 'payload'
import { markdownToHtml } from '../lib/markdown-to-html'
import { expandShortcodesInMarkdown } from '../lib/shortcodes/expand-shortcodes'

// Collection-level endpoint on Sites (mounted at /api/sites/:siteKey/env-page).
// Root-level config.endpoints under a collection slug never match — Payload's
// collection REST router consumes the /api/sites/* namespace first.
//
// `content`'s markdown→HTML conversion normally happens in markdownHtmlField's
// afterRead hook, but that hook only fires when req.payloadAPI === 'REST' —
// the payload.find() calls below run through the Local API (payloadAPI:
// 'local'), so it's skipped and `content` comes back as raw/stale Lexical
// state instead of HTML. Convert contentMd here to match what the real
// REST endpoint (/api/pages/:id) would return.
//
// SECURITY: this endpoint is public/unauthenticated, so both find() calls
// pass `overrideAccess: false` — Local API defaults to overrideAccess: true,
// which bypasses field-level access.read:false (sites r2 secret keys) and collection-level read access
// (pages.access.read restricts anonymous callers to published+live docs).
// Without this, the endpoint leaks site secrets and draft page content.
export const getEnvPageEndpoint: Endpoint = {
  path: '/:siteKey/env-page',
  method: 'get',
  handler: async (req) => {
    // routeParams is typed as Record<string, unknown> | undefined — extract as string
    const siteKey = req.routeParams?.['siteKey'] as string | undefined
    if (!siteKey) return Response.json({ error: 'Missing siteKey param' }, { status: 400 })
    const key = req.query.key as string | undefined
    if (!key) return Response.json({ error: 'Missing key param' }, { status: 400 })

    const { payload } = req
    const sites = await payload.find({
      collection: 'sites',
      where: { siteKey: { equals: siteKey } },
      limit: 1,
      overrideAccess: false,
      req,
    })
    const site = sites.docs[0]
    if (!site) return Response.json(null)

    const pg = (site.pageGroup as Array<{ key: string; pageSlug?: string }> | undefined)
      ?.find(g => g.key === key)
    if (!pg?.pageSlug) return Response.json(null)

    const pages = await payload.find({
      collection: 'pages',
      where: {
        and: [
          { slug: { equals: pg.pageSlug } },
          // Two sites can use the same slug (e.g. "booking") — scope to the
          // resolved site's tenant so we never serve another tenant's page.
          { tenant: { equals: site.id } },
        ],
      },
      limit: 1,
      overrideAccess: false,
      req,
    })
    const page = pages.docs[0] as unknown as ({ contentMd?: string | null; content?: unknown } & Record<string, unknown>) | undefined
    if (!page) return Response.json(null)

    if (page.contentMd) {
      const expandedMd = page.contentMd.includes('[sc')
        ? await expandShortcodesInMarkdown(page.contentMd, {
            payload,
            req,
            tenantId: site.id,
            locale: req.locale,
          })
        : page.contentMd
      page.content = markdownToHtml(expandedMd)
    }
    return Response.json(page)
  },
}
