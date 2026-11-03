/**
 * Tests for makeResolveOgImageFallbackHook — virtual RankMath-style og:image
 * fallback applied at read time.
 *
 * Cascade: seo.openGraph.image (editor) → doc.featuredImage → Sites.seoDefaults.ogImage.
 * The stored value is never mutated; the hook only augments the read result.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { makeResolveOgImageFallbackHook } from './resolve-og-image-fallback'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const FEATURED = { id: 10, url: 'https://cdn.test/featured.jpg', width: 1200, height: 630 }
const SITE_DEFAULT = { id: 99, url: 'https://cdn.test/site-default.jpg', width: 1200, height: 630 }
const EXPLICIT_OG = { id: 5, url: 'https://cdn.test/explicit-og.jpg', width: 1200, height: 630 }

/**
 * Minimal req whose payload returns a Sites doc with the given seoDefaults.ogImage.
 * payloadAPI: 'REST' matches a genuine public REST read — the hook is a no-op for
 * any other payloadAPI (Local API, incl. admin Document view / create+update's
 * internal read-back) — see the REST-only guard in resolve-og-image-fallback.ts.
 */
function makeReq(siteOgImage: unknown = SITE_DEFAULT, payloadAPI: string | undefined = 'REST') {
  const calls: Array<{ collection: string; id: unknown }> = []
  return {
    calls,
    payloadAPI,
    context: {} as Record<string, unknown>,
    payload: {
      findByID: async ({ collection, id }: { collection: string; id: unknown }) => {
        calls.push({ collection, id })
        if (collection === 'sites') return { id, seoDefaults: { ogImage: siteOgImage } }
        return null
      },
    },
  }
}

function docWith(
  overrides: { openGraphImage?: unknown; featuredImage?: unknown; seo?: unknown } = {},
): Record<string, unknown> {
  const { openGraphImage, featuredImage, seo } = overrides
  return {
    tenant: 1,
    featuredImage,
    seo:
      seo === undefined
        ? { openGraph: { title: 'x', image: openGraphImage } }
        : seo,
  }
}

async function run(
  hook: ReturnType<typeof makeResolveOgImageFallbackHook>,
  doc: Record<string, unknown>,
  req: ReturnType<typeof makeReq>,
) {
  // Only the arguments the hook actually reads are provided.
  return (await hook({ doc, req } as never)) as Record<string, unknown>
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('makeResolveOgImageFallbackHook', () => {
  it('is a no-op for any non-REST payloadAPI (Local API, incl. admin Document view and create/update internal read-back)', async () => {
    // Regression test for a real production data-loss bug: generate-jsonld's
    // afterChange hook spreads `...seo` from the exact `doc` this hook mutates,
    // then persists it (to save jsonLd.raw) — so ANY create/update's internal
    // read-back (which is Local API, not REST) running this hook would silently
    // bake the virtual fallback into permanent storage on every single save,
    // undoing any script or editor action that intentionally cleared this
    // field. Verified against production: clearing seo.openGraph.image to null
    // was immediately overwritten back by this exact chain until this guard
    // was added.
    const hook = makeResolveOgImageFallbackHook(true)
    const req = makeReq(SITE_DEFAULT, 'local')
    const out = await run(hook, docWith({ featuredImage: FEATURED }), req)

    assert.equal((out.seo as any).openGraph.image, undefined, 'must not inject anything for a non-REST read')
    assert.equal(req.calls.length, 0, 'must not even query the Site for a non-REST read')
  })

  it('keeps a genuinely editor-set OG image untouched (differs from the site default)', async () => {
    const hook = makeResolveOgImageFallbackHook(true)
    const req = makeReq()
    const out = await run(hook, docWith({ openGraphImage: EXPLICIT_OG, featuredImage: FEATURED }), req)

    assert.deepEqual((out.seo as any).openGraph.image, EXPLICIT_OG)
    // Distinguishing "editor-set" from "stale site default" requires one Site read.
    assert.deepEqual(req.calls, [{ collection: 'sites', id: 1 }])
  })

  it('leaves a present-but-UNPOPULATED OG image untouched (depth:0 — e.g. admin Document view SSR)', async () => {
    // Regression test for a real production bug: Payload's own admin Document
    // view fetches the doc at depth:0, so relationship/upload fields arrive as
    // bare IDs, not populated objects. isPopulatedMedia(rawId) is false, which
    // must NOT be treated as "field is empty" — that previously made the hook
    // overwrite a real stored value (any raw id, even one from an unrelated,
    // legitimate custom OG image) with a freshly-fetched, fully-populated site
    // default — corrupting the admin preview and risking a silent DB overwrite
    // if the editor saved without touching the field.
    const hook = makeResolveOgImageFallbackHook(true)
    const req = makeReq()
    const out = await run(hook, docWith({ openGraphImage: 980, featuredImage: 1092 }), req)

    assert.equal((out.seo as any).openGraph.image, 980, 'raw og image id must be left exactly as read')
    assert.equal(req.calls.length, 0, 'must not fetch the Site when the field cannot be safely resolved')
  })

  it('leaves a present-but-UNPOPULATED OG image untouched even with no featuredImage at all', async () => {
    const hook = makeResolveOgImageFallbackHook(true)
    const req = makeReq()
    const out = await run(hook, docWith({ openGraphImage: 980 }), req)

    assert.equal((out.seo as any).openGraph.image, 980)
    assert.equal(req.calls.length, 0)
  })

  it('does not load the Site to check staleness when there is no featuredImage to prefer', async () => {
    const hook = makeResolveOgImageFallbackHook(true)
    const req = makeReq()
    const out = await run(hook, docWith({ openGraphImage: EXPLICIT_OG }), req)

    assert.deepEqual((out.seo as any).openGraph.image, EXPLICIT_OG)
    assert.equal(req.calls.length, 0, 'nothing to fall back to — no need to check staleness')
  })

  it('prefers featuredImage when the stored OG image is just a stale copy of the site default', async () => {
    const hook = makeResolveOgImageFallbackHook(true)
    const req = makeReq() // site default id=99, url=site-default.jpg
    const staleOg = { ...SITE_DEFAULT } // same media the site default resolves to
    const out = await run(hook, docWith({ openGraphImage: staleOg, featuredImage: FEATURED }), req)

    assert.deepEqual((out.seo as any).openGraph.image, FEATURED)
  })

  it('resolves correctly for two sibling docs processed CONCURRENTLY on a shared req/context', async () => {
    // Regression test for a real production bug: a single find/list request runs
    // this hook for many docs of the same tenant concurrently sharing one
    // req.context (e.g. a product's own afterRead alongside its populated
    // `categories` taxonomy docs' afterRead calls). A prior implementation used a
    // req.context boolean re-entry flag that one doc's in-flight site lookup would
    // set, wrongly short-circuiting a SIBLING doc's entirely unrelated hook call
    // while that flag was true — verified against production data where a
    // product's stale-default correction was silently skipped this way.
    const hook = makeResolveOgImageFallbackHook(true)
    const calls: Array<{ collection: string; id: unknown }> = []
    let resolveSite!: (v: unknown) => void
    const sharedReq = {
      payloadAPI: 'REST',
      context: {} as Record<string, unknown>,
      payload: {
        findByID: async ({ collection, id }: { collection: string; id: unknown }) => {
          calls.push({ collection, id })
          if (collection === 'sites') {
            return new Promise((resolve) => {
              resolveSite = () => resolve({ id, seoDefaults: { ogImage: SITE_DEFAULT } })
            })
          }
          return null
        },
      },
    }

    // Doc A: stale OG image (== site default) + its own featuredImage → must
    // switch to featuredImage. Doc B: empty OG image → must fall back to
    // featuredImage too. Both start before the shared site lookup resolves.
    const docA = docWith({ openGraphImage: { ...SITE_DEFAULT }, featuredImage: FEATURED })
    const docB = docWith({ featuredImage: { id: 11, url: 'https://cdn.test/b-featured.jpg' } })

    const resultA = run(hook, docA, sharedReq as never)
    const resultB = run(hook, docB, sharedReq as never)
    // Let both hook invocations run past their (now extra) microtask ticks —
    // resolveFeaturedImage() awaits before loadSiteDefault() gets called — so
    // `resolveSite` is assigned before we invoke it.
    await new Promise((r) => setTimeout(r, 0))
    resolveSite(undefined)
    const [outA, outB] = await Promise.all([resultA, resultB])

    assert.deepEqual((outA.seo as any).openGraph.image, FEATURED, 'doc A must switch to its own featuredImage')
    assert.deepEqual(
      (outB.seo as any).openGraph.image,
      { id: 11, url: 'https://cdn.test/b-featured.jpg' },
      'doc B must fall back to its own featuredImage, unaffected by doc A being mid-lookup',
    )
  })

  it('keeps the stale-default OG image when the tenant has no default to compare against', async () => {
    const hook = makeResolveOgImageFallbackHook(true)
    const req = makeReq(null) // site has no default configured
    const staleOg = { ...SITE_DEFAULT }
    const out = await run(hook, docWith({ openGraphImage: staleOg, featuredImage: FEATURED }), req)

    // Nothing to compare against — treat the stored value as editor-set.
    assert.deepEqual((out.seo as any).openGraph.image, staleOg)
  })

  it('falls back to featuredImage when OG image is empty', async () => {
    const hook = makeResolveOgImageFallbackHook(true)
    const req = makeReq()
    const out = await run(hook, docWith({ featuredImage: FEATURED }), req)

    assert.deepEqual((out.seo as any).openGraph.image, FEATURED)
    assert.equal(req.calls.length, 0, 'featuredImage present → no Site load needed')
  })

  it('falls back to the site default when OG image and featuredImage are both empty', async () => {
    const hook = makeResolveOgImageFallbackHook(true)
    const req = makeReq()
    const out = await run(hook, docWith({}), req)

    assert.deepEqual((out.seo as any).openGraph.image, SITE_DEFAULT)
    assert.deepEqual(req.calls, [{ collection: 'sites', id: 1 }])
  })

  it('leaves OG image absent when nothing in the cascade resolves', async () => {
    const hook = makeResolveOgImageFallbackHook(true)
    const req = makeReq(null) // site has no default
    const out = await run(hook, docWith({}), req)

    assert.equal((out.seo as any).openGraph.image, undefined)
  })

  it('ignores featuredImage for taxonomies (hasFeaturedImage=false) → site default only', async () => {
    const hook = makeResolveOgImageFallbackHook(false)
    const req = makeReq()
    // Even if a stray featuredImage is present, it must not be used.
    const out = await run(hook, docWith({ featuredImage: FEATURED }), req)

    assert.deepEqual((out.seo as any).openGraph.image, SITE_DEFAULT)
  })

  it('treats a bare id (unpopulated) featuredImage as empty and falls through', async () => {
    const hook = makeResolveOgImageFallbackHook(true)
    const req = makeReq()
    const out = await run(hook, docWith({ featuredImage: 10 }), req)

    assert.deepEqual((out.seo as any).openGraph.image, SITE_DEFAULT)
  })

  it('memoizes the site-default load across docs sharing a request context', async () => {
    const hook = makeResolveOgImageFallbackHook(true)
    const req = makeReq()
    await run(hook, docWith({}), req)
    await run(hook, docWith({}), req)

    assert.equal(req.calls.length, 1, 'Site should be loaded once per request context')
  })


  it('returns the doc unchanged when there is no seo group', async () => {
    const hook = makeResolveOgImageFallbackHook(true)
    const req = makeReq()
    const doc = { tenant: 1 } as Record<string, unknown>
    const out = await run(hook, doc, req)

    assert.equal(out.seo, undefined)
    assert.equal(req.calls.length, 0)
  })
})
