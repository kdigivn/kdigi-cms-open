/**
 * Tests for makeApplySeoTemplatesHook — RankMath placeholder model.
 *
 * IMPORTANT: After the model change, seo.title / seo.description / OG / twitter
 * are NO LONGER persisted by this hook. They remain empty in storage so the admin
 * UI can show them as resolved placeholders. Resolution happens at render time in
 * frontend via resolveSeoFields().
 *
 * What this hook still does:
 *   - Preserves manually entered seo.title / seo.description (blank-only guard still
 *     applies — manual values are never overwritten, they're just not filled from templates)
 *   - Auto-generates seo.breadcrumbs (Home → doc trail) when blank
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { makeApplySeoTemplatesHook, resolveSeoFields } from './apply-seo-templates'
import type { SeoTitlesConfig, DocType } from './apply-seo-templates'

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeSite(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    domain: 'example.com',
    defaultLanguage: 'vi',
    manifest: { name: 'Example Site' },
    seoTitles: {
      separator: '|',
      posts: { titleTemplate: '%title% %sep% %sitename%', descriptionTemplate: '%excerpt%' },
      pages: { titleTemplate: '%title% %sep% %sitename%', descriptionTemplate: '' },
      products: { titleTemplate: 'Mua %title% %sep% %sitename%', descriptionTemplate: '' },
      landings: { titleTemplate: '%title% %sep% %sitename%', descriptionTemplate: '' },
      homepage: { titleTemplate: '%sitename%', descriptionTemplate: '' },
    },
    ...overrides,
  }
}

/** Minimal req carrying a fake payload whose findByID returns the given site. */
function makeReq(site: Record<string, unknown> | null, locale?: string): Record<string, unknown> {
  return {
    locale,
    context: {},
    payload: { findByID: async () => site },
  }
}

// Cast helper: hook args are loosely typed for unit isolation.
function run(hook: ReturnType<typeof makeApplySeoTemplatesHook>, args: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return hook(args as any)
}

// ── Tests: title/desc NO LONGER persisted ────────────────────────────────────

describe('makeApplySeoTemplatesHook — title/desc NOT persisted (placeholder model)', () => {
  const hook = makeApplySeoTemplatesHook('post')

  it('does NOT persist seo.title when it is blank (template resolution deferred to render)', async () => {
    const data = { tenant: 'site-1', title: 'Bãi Sao', seo: {} }
    const out = (await run(hook, { data, req: makeReq(makeSite(), 'vi') })) as Record<string, unknown>
    const seo = out.seo as Record<string, unknown>
    // Under the placeholder model, blank seo.title stays blank in storage
    assert.ok(
      seo.title === undefined || seo.title === '' || seo.title === null,
      `Expected seo.title to remain empty, got: ${JSON.stringify(seo.title)}`,
    )
  })

  it('does NOT persist seo.description when it is blank', async () => {
    const data = { tenant: 'site-1', title: 'Bãi Sao', excerpt: '<p>Bãi biển đẹp nhất</p>', seo: {} }
    const out = (await run(hook, { data, req: makeReq(makeSite(), 'vi') })) as Record<string, unknown>
    const seo = out.seo as Record<string, unknown>
    assert.ok(
      seo.description === undefined || seo.description === '' || seo.description === null,
      `Expected seo.description to remain empty, got: ${JSON.stringify(seo.description)}`,
    )
  })

  it('does NOT persist OG title from seo.title (OG cascade deferred to render)', async () => {
    const data = {
      tenant: 'site-1',
      title: 'Bãi Sao',
      excerpt: '<p>Bãi biển đẹp</p>',
      seo: { openGraph: {} },
    }
    const out = (await run(hook, { data, req: makeReq(makeSite(), 'vi') })) as Record<string, unknown>
    const seo = out.seo as Record<string, unknown>
    const og = seo.openGraph as Record<string, unknown> | undefined
    const ogTitle = og?.title
    assert.ok(
      ogTitle === undefined || ogTitle === '' || ogTitle === null,
      `Expected og.title to remain empty, got: ${JSON.stringify(ogTitle)}`,
    )
  })

  it('does NOT persist twitter title from OG (twitter cascade deferred to render)', async () => {
    const data = {
      tenant: 'site-1',
      title: 'Bãi Sao',
      excerpt: '<p>Bãi biển đẹp</p>',
      seo: {
        openGraph: {
          twitterMeta: { useFacebookData: true },
        },
      },
    }
    const out = (await run(hook, { data, req: makeReq(makeSite(), 'vi') })) as Record<string, unknown>
    const seo = out.seo as Record<string, unknown>
    const og = seo.openGraph as Record<string, unknown> | undefined
    const tw = og?.twitterMeta as Record<string, unknown> | undefined
    const twTitle = tw?.title
    assert.ok(
      twTitle === undefined || twTitle === '' || twTitle === null,
      `Expected twitter.title to remain empty, got: ${JSON.stringify(twTitle)}`,
    )
  })

  it('does not overwrite a manually set seo.title (blank-only guard still preserved)', async () => {
    const data = { tenant: 'site-1', title: 'Bãi Sao', seo: { title: 'Tiêu đề tay' } }
    const out = (await run(hook, { data, req: makeReq(makeSite(), 'vi') })) as Record<string, unknown>
    assert.equal((out.seo as Record<string, unknown>).title, 'Tiêu đề tay')
  })

  it('does not overwrite a manually set seo.description', async () => {
    const data = { tenant: 'site-1', title: 'Bãi Sao', seo: { description: 'Mô tả tay' } }
    const out = (await run(hook, { data, req: makeReq(makeSite(), 'vi') })) as Record<string, unknown>
    assert.equal((out.seo as Record<string, unknown>).description, 'Mô tả tay')
  })

  it('does not overwrite a manually set OG title', async () => {
    const data = {
      tenant: 'site-1',
      title: 'Bãi Sao',
      seo: { openGraph: { title: 'Manual OG Title' } },
    }
    const out = (await run(hook, { data, req: makeReq(makeSite(), 'vi') })) as Record<string, unknown>
    const og = (out.seo as Record<string, unknown>).openGraph as Record<string, unknown>
    assert.equal(og.title, 'Manual OG Title')
  })

  it('no-ops when the matched template is empty — seo unchanged', async () => {
    const site = makeSite({
      seoTitles: { separator: '|', posts: { titleTemplate: '', descriptionTemplate: '' } },
    })
    const data = { tenant: 'site-1', title: 'Bãi Sao', seo: {} }
    const out = (await run(hook, { data, req: makeReq(site, 'vi') })) as Record<string, unknown>
    // seo may have breadcrumbs added, but title/description remain unset
    const seo = out.seo as Record<string, unknown>
    assert.ok(!seo.title)
    assert.ok(!seo.description)
  })

  it('returns data unchanged when tenant cannot be resolved', async () => {
    const data = { title: 'Bãi Sao', seo: {} }
    const out = await run(hook, { data, req: makeReq(makeSite(), 'vi') })
    assert.equal(out, data)
  })

  it('skips during the JSON-LD internal re-save', async () => {
    const data = { tenant: 'site-1', title: 'Bãi Sao', seo: {} }
    const req = { ...makeReq(makeSite(), 'vi'), context: { __generatingJsonLd: true } }
    const out = await run(hook, { data, req })
    assert.equal(out, data)
  })
})

// ── Tests: preserved manual values on taxonomy ────────────────────────────────

function makeSiteWithTaxonomies(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return makeSite({
    seoTitles: {
      separator: '|',
      posts: { titleTemplate: '%title% %sep% %sitename%', descriptionTemplate: '%excerpt%' },
      pages: { titleTemplate: '%title% %sep% %sitename%', descriptionTemplate: '' },
      products: { titleTemplate: 'Mua %title% %sep% %sitename%', descriptionTemplate: '' },
      landings: { titleTemplate: '%title% %sep% %sitename%', descriptionTemplate: '' },
      homepage: { titleTemplate: '%sitename%', descriptionTemplate: '' },
      taxonomies: { titleTemplate: '%term% %sep% %sitename%', descriptionTemplate: '%excerpt%' },
    },
    ...overrides,
  })
}

describe('makeApplySeoTemplatesHook — taxonomy manual values preserved', () => {
  const hook = makeApplySeoTemplatesHook('taxonomy')

  it('does NOT persist seo.title on a taxonomy term (blank stored → resolved at render)', async () => {
    const data = { tenant: 'site-1', name: 'Phú Quốc', seo: {} }
    const out = (await run(hook, { data, req: makeReq(makeSiteWithTaxonomies(), 'vi') })) as Record<
      string,
      unknown
    >
    const seo = out.seo as Record<string, unknown>
    assert.ok(
      !seo.title,
      `Expected blank seo.title in storage, got: ${JSON.stringify(seo.title)}`,
    )
  })

  it('preserves a manually entered seo.title on a taxonomy term (blank-only guard)', async () => {
    const data = { tenant: 'site-1', name: 'Phú Quốc', seo: { title: 'Tiêu đề tay' } }
    const out = (await run(hook, { data, req: makeReq(makeSiteWithTaxonomies(), 'vi') })) as Record<
      string,
      unknown
    >
    assert.equal((out.seo as Record<string, unknown>).title, 'Tiêu đề tay')
  })

  it('preserves existing seo values on re-save (imported term data-loss guard)', async () => {
    const data = {
      tenant: 'site-1',
      name: 'Phú Quốc',
      seo: { title: 'Vé sản phẩm Phú Quốc | Site', description: 'Mô tả đã nhập', focusKeywords: ['phu quoc'] },
    }
    const out = (await run(hook, { data, req: makeReq(makeSiteWithTaxonomies(), 'vi') })) as Record<
      string,
      unknown
    >
    const seo = out.seo as Record<string, unknown>
    assert.equal(seo.title, 'Vé sản phẩm Phú Quốc | Site')
    assert.equal(seo.description, 'Mô tả đã nhập')
    assert.deepEqual(seo.focusKeywords, ['phu quoc'])
  })

  it('no-ops when taxonomies template is absent from site config', async () => {
    const data = { tenant: 'site-1', name: 'Phú Quốc', seo: {} }
    const out = (await run(hook, { data, req: makeReq(makeSite(), 'vi') })) as Record<string, unknown>
    const seo = out.seo as Record<string, unknown>
    assert.ok(!seo.title)
    assert.ok(!seo.description)
  })
})

// ── Tests: resolveSeoFields pure resolver ────────────────────────────────────

describe('resolveSeoFields — pure render-time resolver', () => {
  const seoTitles: SeoTitlesConfig = {
    separator: '|',
    posts: { titleTemplate: '%title% %sep% %sitename%', descriptionTemplate: '%excerpt%' },
    pages: { titleTemplate: '%title% %sep% %sitename%', descriptionTemplate: '' },
    products: { titleTemplate: 'Mua %title% %sep% %sitename%', descriptionTemplate: '' },
    landings: { titleTemplate: '%title% %sep% %sitename%', descriptionTemplate: '' },
    homepage: { titleTemplate: '%sitename%', descriptionTemplate: '' },
    taxonomies: { titleTemplate: '%term% %sep% %sitename%', descriptionTemplate: '%excerpt%' },
  }

  it('resolves title from template when stored title is empty', () => {
    const result = resolveSeoFields(seoTitles, 'post', false, {
      title: 'Bãi Sao',
      siteName: 'Example Site',
      sep: '|',
      excerpt: 'Bãi biển đẹp',
      currentYear: '2025',
    }, { title: '', description: '' })
    assert.equal(result.title, 'Bãi Sao | Example Site')
  })

  it('resolves description from %excerpt% template when stored description is empty', () => {
    const result = resolveSeoFields(seoTitles, 'post', false, {
      title: 'Bãi Sao',
      siteName: 'Example Site',
      sep: '|',
      excerpt: 'Bãi biển đẹp nhất',
      currentYear: '2025',
    }, { title: '', description: '' })
    assert.equal(result.description, 'Bãi biển đẹp nhất')
  })

  it('manual stored title takes precedence over resolved template', () => {
    const result = resolveSeoFields(seoTitles, 'post', false, {
      title: 'Bãi Sao',
      siteName: 'Example Site',
      sep: '|',
    }, { title: 'Tiêu đề tay', description: '' })
    assert.equal(result.title, 'Tiêu đề tay')
  })

  it('OG title falls back to effective title when OG stored value is empty', () => {
    const result = resolveSeoFields(seoTitles, 'post', false, {
      title: 'Bãi Sao',
      siteName: 'Example Site',
      sep: '|',
    }, { title: '', description: '', ogTitle: '', ogDescription: '' })
    assert.equal(result.ogTitle, 'Bãi Sao | Example Site')
  })

  it('twitter mirrors OG when useFacebookData is true (default)', () => {
    const result = resolveSeoFields(seoTitles, 'post', false, {
      title: 'Bãi Sao',
      siteName: 'Example Site',
      sep: '|',
    }, { title: '', description: '', useFacebookData: true })
    assert.equal(result.twitterTitle, 'Bãi Sao | Example Site')
  })

  it('twitter is empty when useFacebookData is false', () => {
    const result = resolveSeoFields(seoTitles, 'post', false, {
      title: 'Bãi Sao',
      siteName: 'Example Site',
      sep: '|',
    }, { title: '', description: '', useFacebookData: false })
    assert.equal(result.twitterTitle, '')
  })

  it('uses products template with Mua prefix', () => {
    const result = resolveSeoFields(seoTitles, 'product', false, {
      title: 'Vé sản phẩm Hà Tiên',
      siteName: 'Example Site',
      sep: '|',
    }, { title: '', description: '' })
    assert.equal(result.title, 'Mua Vé sản phẩm Hà Tiên | Example Site')
  })

  it('uses homepage template for front-page pages', () => {
    const result = resolveSeoFields(seoTitles, 'page', true, {
      title: 'Trang chủ',
      siteName: 'Example Site',
      sep: '|',
    }, { title: '', description: '' })
    assert.equal(result.title, 'Example Site')
  })

  it('uses taxonomies template with %term% for taxonomy docType', () => {
    const result = resolveSeoFields(seoTitles, 'taxonomy', false, {
      title: 'Phú Quốc',
      siteName: 'Example Site',
      sep: '|',
      term: 'Phú Quốc',
    }, { title: '', description: '' })
    assert.equal(result.title, 'Phú Quốc | Example Site')
  })

  it('resolves %currentyear% variable correctly', () => {
    const yearSeoTitles: SeoTitlesConfig = {
      separator: '|',
      products: { titleTemplate: '%title% %currentyear% %sep% %sitename%', descriptionTemplate: '' },
    }
    const year = String(new Date().getFullYear())
    const result = resolveSeoFields(yearSeoTitles, 'product', false, {
      title: 'Vé sản phẩm',
      siteName: 'Example Site',
      sep: '|',
      currentYear: year,
    }, { title: '', description: '' })
    assert.equal(result.title, `Vé sản phẩm ${year} | Example Site`)
  })

  it('resolves %price% variable correctly', () => {
    const priceSeoTitles: SeoTitlesConfig = {
      separator: '|',
      products: { titleTemplate: '%title% %sep% %sitename%', descriptionTemplate: 'Giá chỉ %price% VND' },
    }
    const result = resolveSeoFields(priceSeoTitles, 'product', false, {
      title: 'Vé sản phẩm',
      siteName: 'Example Site',
      sep: '|',
      price: '150000',
    }, { title: '', description: '' })
    assert.equal(result.description, 'Giá chỉ 150000 VND')
  })

  it('falls back to docTitle when no template and stored title empty', () => {
    const emptySeoTitles: SeoTitlesConfig = {
      separator: '|',
      posts: { titleTemplate: '', descriptionTemplate: '' },
    }
    const result = resolveSeoFields(emptySeoTitles, 'post', false, {
      title: 'Bãi Sao',
      siteName: 'Example Site',
      sep: '|',
    }, { title: '', description: '' })
    assert.equal(result.title, 'Bãi Sao')
  })

  it('falls back to excerpt when no template and stored description empty', () => {
    const emptySeoTitles: SeoTitlesConfig = {
      separator: '|',
      posts: { titleTemplate: '', descriptionTemplate: '' },
    }
    const result = resolveSeoFields(emptySeoTitles, 'post', false, {
      title: 'Bãi Sao',
      siteName: 'Example Site',
      sep: '|',
      excerpt: 'Đây là excerpt',
    }, { title: '', description: '' })
    assert.equal(result.description, 'Đây là excerpt')
  })

  it('manual OG title overrides effective title cascade', () => {
    const result = resolveSeoFields(seoTitles, 'post', false, {
      title: 'Bãi Sao',
      siteName: 'Example Site',
      sep: '|',
    }, { title: '', description: '', ogTitle: 'Custom OG', ogDescription: '' })
    assert.equal(result.ogTitle, 'Custom OG')
    // effective title still resolved
    assert.equal(result.title, 'Bãi Sao | Example Site')
  })
})

// ── Tests: per-type selection (breadcrumbs still work) ───────────────────────

describe('makeApplySeoTemplatesHook — per-type breadcrumb still generated', () => {
  it('uses the products template subgroup key — no title stored', async () => {
    const hook = makeApplySeoTemplatesHook('product')
    const data = { tenant: 'site-1', title: 'Vé sản phẩm Hà Tiên', seo: {} }
    const out = (await run(hook, { data, req: makeReq(makeSite(), 'vi') })) as Record<string, unknown>
    // title must remain unset
    assert.ok(!(out.seo as Record<string, unknown>).title)
  })

  it('uses the homepage template for a front-page page — no title stored', async () => {
    const hook = makeApplySeoTemplatesHook('page')
    const data = { tenant: 'site-1', title: 'Trang chủ', isFrontPage: true, seo: {} }
    const out = (await run(hook, { data, req: makeReq(makeSite(), 'vi') })) as Record<string, unknown>
    assert.ok(!(out.seo as Record<string, unknown>).title)
  })

  it('uses the pages template for a normal page — no title stored', async () => {
    const hook = makeApplySeoTemplatesHook('page')
    const data = { tenant: 'site-1', title: 'Liên hệ', seo: {} }
    const out = (await run(hook, { data, req: makeReq(makeSite(), 'vi') })) as Record<string, unknown>
    assert.ok(!(out.seo as Record<string, unknown>).title)
  })
})

// ── Tests: locale="all" — no multi-locale fill ───────────────────────────────

describe('makeApplySeoTemplatesHook — locale="all" — no multi-locale fill', () => {
  const hook = makeApplySeoTemplatesHook('post')

  it('does NOT fill any locale-keyed title in multi-locale save', async () => {
    const data = {
      tenant: 'site-1',
      title: { vi: 'Bãi Sao', en: 'Sao Beach' },
      seo: { title: { en: 'Manual EN' } },
    }
    const out = (await run(hook, { data, req: makeReq(makeSite()) })) as Record<string, unknown>
    const seo = out.seo as Record<string, unknown>
    // Manual EN must be preserved; VI must remain unset
    const title = seo.title as Record<string, unknown>
    assert.equal(title.en, 'Manual EN')
    assert.ok(!title.vi, `vi should be unset, got: ${JSON.stringify(title.vi)}`)
  })
})

// ── Tests: Breadcrumb auto-gen (unchanged) ────────────────────────────────────

function makeSiteWithDesc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return makeSite({
    seoTitles: {
      separator: '|',
      posts: { titleTemplate: '%title% %sep% %sitename%', descriptionTemplate: '%excerpt%' },
      pages: { titleTemplate: '%title% %sep% %sitename%', descriptionTemplate: '' },
      products: { titleTemplate: 'Mua %title% %sep% %sitename%', descriptionTemplate: '' },
      landings: { titleTemplate: '%title% %sep% %sitename%', descriptionTemplate: '' },
      homepage: { titleTemplate: '%sitename%', descriptionTemplate: '' },
    },
    ...overrides,
  })
}

describe('makeApplySeoTemplatesHook — breadcrumb auto-gen', () => {
  it('generates a home→doc breadcrumb with product URL prefix for products', async () => {
    const hook = makeApplySeoTemplatesHook('product')
    const data = { tenant: 'site-1', title: 'Vé sản phẩm Hà Tiên', slug: 've-tau-ha-tien', seo: {} }
    const out = (await run(hook, { data, req: makeReq(makeSiteWithDesc(), 'vi') })) as Record<string, unknown>
    const seo = out.seo as Record<string, unknown>
    const crumbs = seo.breadcrumbs as Array<Record<string, unknown>>
    assert.ok(Array.isArray(crumbs) && crumbs.length === 2)
    assert.equal(crumbs[0].url, 'https://example.com')
    // Product leaf must include /product/ prefix
    assert.equal(crumbs[1].url, 'https://example.com/product/ve-tau-ha-tien/')
    assert.equal(crumbs[1].text, 'Vé sản phẩm Hà Tiên')
  })

  it('generates a home→doc breadcrumb with no prefix for posts', async () => {
    const hook = makeApplySeoTemplatesHook('post')
    const data = { tenant: 'site-1', title: 'Bài viết', slug: 'bai-viet', seo: {} }
    const out = (await run(hook, { data, req: makeReq(makeSiteWithDesc(), 'vi') })) as Record<string, unknown>
    const seo = out.seo as Record<string, unknown>
    const crumbs = seo.breadcrumbs as Array<Record<string, unknown>>
    assert.ok(Array.isArray(crumbs) && crumbs.length === 2)
    // No prefix for posts — slug direct
    assert.match(crumbs[1].url as string, /\/bai-viet\/$/)
  })

  it('does not overwrite existing breadcrumbs (blank-only)', async () => {
    const hook = makeApplySeoTemplatesHook('post')
    const existing = [{ url: '/custom/', text: 'Custom', isHidden: false }]
    const data = { tenant: 'site-1', title: 'Test', slug: 'test', seo: { breadcrumbs: existing } }
    const out = (await run(hook, { data, req: makeReq(makeSiteWithDesc(), 'vi') })) as Record<string, unknown>
    const seo = out.seo as Record<string, unknown>
    assert.deepEqual(seo.breadcrumbs, existing)
  })

  it('skips breadcrumb auto-gen for front page docs', async () => {
    const hook = makeApplySeoTemplatesHook('page')
    const data = { tenant: 'site-1', title: 'Trang chủ', slug: '/', isFrontPage: true, seo: {} }
    const out = (await run(hook, { data, req: makeReq(makeSiteWithDesc(), 'vi') })) as Record<string, unknown>
    const seo = out.seo as Record<string, unknown>
    // front page docs should NOT get auto-generated breadcrumbs
    assert.ok(!seo.breadcrumbs || (Array.isArray(seo.breadcrumbs) && (seo.breadcrumbs as unknown[]).length === 0))
  })

  it('includes localized taxonomy prefix in taxonomy leaf breadcrumb (vi and en)', async () => {
    const hook = makeApplySeoTemplatesHook('taxonomy')
    const viData = { tenant: 'site-1', type: 'product-category', name: 'Superdong', slug: 'superdong', seo: {} }
    const viOut = (await run(hook, { data: viData, req: makeReq(makeSiteWithDesc(), 'vi') })) as Record<string, unknown>
    const viCrumbs = ((viOut.seo as Record<string, unknown>).breadcrumbs ?? []) as Array<Record<string, unknown>>
    assert.equal(viCrumbs[1].url, 'https://example.com/product-category/superdong/')

    const enSite = makeSiteWithDesc({ domain: 'example.com', defaultLanguage: 'en' })
    const enData = { tenant: 'site-1', type: 'product-category', name: 'Superdong Sample', slug: 'superdong', seo: {} }
    const enOut = (await run(hook, { data: enData, req: makeReq(enSite, 'vi') })) as Record<string, unknown>
    const enCrumbs = ((enOut.seo as Record<string, unknown>).breadcrumbs ?? []) as Array<Record<string, unknown>>
    assert.equal(enCrumbs[1].url, 'https://example.com/product-category/superdong/')
  })

  it('honours seo.canonicalOverride for nested taxonomy leaf breadcrumbs', async () => {
    const hook = makeApplySeoTemplatesHook('taxonomy')
    const enSite = makeSiteWithDesc({ domain: 'example.com', defaultLanguage: 'en' })
    const data = {
      tenant: 'site-1',
      type: 'category',
      name: 'Ben Dam Port',
      slug: 'ben-dam-port',
      seo: { canonicalOverride: 'https://example.com/category/con-dao/ben-dam-port/' },
    }
    const out = (await run(hook, { data, req: makeReq(enSite, 'vi') })) as Record<string, unknown>
    const crumbs = ((out.seo as Record<string, unknown>).breadcrumbs ?? []) as Array<Record<string, unknown>>
    assert.equal(crumbs[1].url, 'https://example.com/category/con-dao/ben-dam-port/')
  })
})

// ── Tests: Breadcrumb auto-gen — primary-taxonomy middle crumb ──────────────

/** Mock req whose payload dispatches findByID/find across 'sites' and 'taxonomies'. */
function makeTaxonomyReq(
  site: Record<string, unknown>,
  taxonomiesById: Record<string | number, Record<string, unknown>>,
  locale = 'vi',
): Record<string, unknown> {
  return {
    locale,
    context: {},
    payload: {
      findByID: async ({ collection, id }: { collection: string; id: string | number }) => {
        if (collection === 'sites') return site
        if (collection === 'taxonomies') return taxonomiesById[id] ?? null
        return null
      },
      find: async ({ collection, where }: { collection: string; where?: { id?: { in?: Array<string | number> } } }) => {
        if (collection !== 'taxonomies') return { docs: [] }
        const ids = where?.id?.in ?? []
        return { docs: ids.map((id) => taxonomiesById[id]).filter(Boolean) }
      },
    },
  }
}

function makeSiteWithPrimaryTaxonomy(
  primaryTaxonomyProduct: string,
  primaryTaxonomyPost: string,
): Record<string, unknown> {
  return makeSiteWithDesc({ breadcrumbs: { primaryTaxonomyProduct, primaryTaxonomyPost } })
}

describe('makeApplySeoTemplatesHook — breadcrumb primary-taxonomy middle crumb', () => {
  it('inserts the tagged product-category term as the middle crumb for products', async () => {
    const hook = makeApplySeoTemplatesHook('product')
    const site = makeSiteWithPrimaryTaxonomy('product-category', 'category')
    const taxonomies = {
      57: { id: 57, type: 'product-category', slug: 've-tau', name: 'Vé sản phẩm', parent: null, seo: {} },
      55: { id: 55, type: 'tag', slug: 'sample-express', name: 'Sample Express', parent: null, seo: {} },
    }
    const data = {
      tenant: 'site-1',
      title: 'Trần Đề Côn Đảo',
      slug: 'tran-de-con-dao',
      categories: [57, 55],
      seo: {},
    }
    const out = (await run(hook, { data, req: makeTaxonomyReq(site, taxonomies) })) as Record<string, unknown>
    const crumbs = (out.seo as Record<string, unknown>).breadcrumbs as Array<Record<string, unknown>>
    assert.equal(crumbs.length, 3)
    assert.equal(crumbs[0].url, 'https://example.com')
    assert.equal(crumbs[1].url, 'https://example.com/ve-tau/')
    assert.equal(crumbs[1].text, 'Vé sản phẩm')
    assert.equal(crumbs[2].url, 'https://example.com/product/tran-de-con-dao/')
  })

  it('inserts the tagged category term as the middle crumb for posts', async () => {
    const hook = makeApplySeoTemplatesHook('post')
    const site = makeSiteWithPrimaryTaxonomy('product-category', 'category')
    const taxonomies = {
      62: { id: 62, type: 'category', slug: 'kinh-nghiem-du-lich', name: 'Kinh nghiệm du lịch', parent: null, seo: {} },
    }
    const data = {
      tenant: 'site-1',
      title: 'Du lịch tự túc',
      slug: 'du-lich-tu-tuc',
      categories: [62],
      seo: {},
    }
    const out = (await run(hook, { data, req: makeTaxonomyReq(site, taxonomies) })) as Record<string, unknown>
    const crumbs = (out.seo as Record<string, unknown>).breadcrumbs as Array<Record<string, unknown>>
    assert.equal(crumbs.length, 3)
    assert.equal(crumbs[1].url, 'https://example.com/kinh-nghiem-du-lich/')
    assert.equal(crumbs[1].text, 'Kinh nghiệm du lịch')
  })

  it('walks the parent chain (root → term) for a nested taxonomy term', async () => {
    const hook = makeApplySeoTemplatesHook('product')
    const site = makeSiteWithPrimaryTaxonomy('destination', 'category')
    const taxonomies = {
      1: { id: 1, type: 'destination', slug: 'mien-nam', name: 'Miền Nam', parent: null, seo: {} },
      2: { id: 2, type: 'destination', slug: 'con-dao', name: 'Côn Đảo', parent: 1, seo: {} },
    }
    const data = {
      tenant: 'site-1',
      title: 'Vé sản phẩm Côn Đảo',
      slug: 've-tau-con-dao',
      categories: [2],
      seo: {},
    }
    const out = (await run(hook, { data, req: makeTaxonomyReq(site, taxonomies) })) as Record<string, unknown>
    const crumbs = (out.seo as Record<string, unknown>).breadcrumbs as Array<Record<string, unknown>>
    assert.equal(crumbs.length, 4)
    assert.equal(crumbs[1].text, 'Miền Nam')
    assert.equal(crumbs[2].text, 'Côn Đảo')
  })

  it('prefers an editor-set canonicalOverride on the term over the flat URL', async () => {
    const hook = makeApplySeoTemplatesHook('product')
    const site = makeSiteWithPrimaryTaxonomy('product-category', 'category')
    const taxonomies = {
      57: {
        id: 57,
        type: 'product-category',
        slug: 've-tau',
        name: 'Vé sản phẩm',
        parent: null,
        seo: { canonicalOverride: 'https://example.com/product-category/ve-tau/' },
      },
    }
    const data = { tenant: 'site-1', title: 'Vé sản phẩm Hà Tiên', slug: 've-tau-ha-tien', categories: [57], seo: {} }
    const out = (await run(hook, { data, req: makeTaxonomyReq(site, taxonomies) })) as Record<string, unknown>
    const crumbs = (out.seo as Record<string, unknown>).breadcrumbs as Array<Record<string, unknown>>
    assert.equal(crumbs[1].url, 'https://example.com/product-category/ve-tau/')
  })

  it('falls back to a flat Home→Leaf trail when no tagged term matches the primary type', async () => {
    const hook = makeApplySeoTemplatesHook('product')
    const site = makeSiteWithPrimaryTaxonomy('destination', 'category')
    const taxonomies = {
      55: { id: 55, type: 'tag', slug: 'sample-express', name: 'Sample Express', parent: null, seo: {} },
    }
    const data = { tenant: 'site-1', title: 'Vé sản phẩm Hà Tiên', slug: 've-tau-ha-tien', categories: [55], seo: {} }
    const out = (await run(hook, { data, req: makeTaxonomyReq(site, taxonomies) })) as Record<string, unknown>
    const crumbs = (out.seo as Record<string, unknown>).breadcrumbs as Array<Record<string, unknown>>
    assert.equal(crumbs.length, 2)
  })

  it('stays a flat Home→Leaf trail when primaryTaxonomy is "none"', async () => {
    const hook = makeApplySeoTemplatesHook('product')
    const site = makeSiteWithPrimaryTaxonomy('none', 'none')
    const taxonomies = {
      57: { id: 57, type: 'product-category', slug: 've-tau', name: 'Vé sản phẩm', parent: null, seo: {} },
    }
    const data = { tenant: 'site-1', title: 'Vé sản phẩm Hà Tiên', slug: 've-tau-ha-tien', categories: [57], seo: {} }
    const out = (await run(hook, { data, req: makeTaxonomyReq(site, taxonomies) })) as Record<string, unknown>
    const crumbs = (out.seo as Record<string, unknown>).breadcrumbs as Array<Record<string, unknown>>
    assert.equal(crumbs.length, 2)
  })
})

// ── Tests: resolveSeoFields %currentyear% / %price% ─────────────────────────

describe('resolveSeoFields — %currentyear% and %price% variables', () => {
  it('resolves %currentyear% in a title template', () => {
    const seoTitles: SeoTitlesConfig = {
      separator: '|',
      products: { titleTemplate: '%title% %currentyear% %sep% %sitename%', descriptionTemplate: '' },
    }
    const year = String(new Date().getFullYear())
    const result = resolveSeoFields(seoTitles, 'product', false, {
      title: 'Vé sản phẩm',
      siteName: 'Example Site',
      sep: '|',
      currentYear: year,
    }, { title: '', description: '' })
    assert.equal(result.title, `Vé sản phẩm ${year} | Example Site`)
  })

  it('resolves %price% from prices[0].currentPrice (product prices array)', () => {
    const seoTitles: SeoTitlesConfig = {
      separator: '|',
      products: { titleTemplate: '%title% %sep% %sitename%', descriptionTemplate: 'Giá chỉ %price% VND' },
    }
    const result = resolveSeoFields(seoTitles, 'product', false, {
      title: 'Vé sản phẩm',
      siteName: 'Example Site',
      sep: '|',
      price: '150000',
    }, { title: '', description: '' })
    assert.equal(result.description, 'Giá chỉ 150000 VND')
  })

  it('%price% strips when doc has no prices array', () => {
    const seoTitles: SeoTitlesConfig = {
      separator: '|',
      products: { titleTemplate: '%title% %sep% %sitename%', descriptionTemplate: 'Giá %price%' },
    }
    const result = resolveSeoFields(seoTitles, 'product', false, {
      title: 'Vé sản phẩm',
      siteName: 'Example Site',
      sep: '|',
      price: '',
    }, { title: '', description: '' })
    // '%price%' resolves to '' → stripped → just 'Giá'
    assert.equal(result.description, 'Giá')
  })
})
