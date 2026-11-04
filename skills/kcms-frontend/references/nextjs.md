# Next.js on KDIGI CMS

Verified with Next.js 16.4 (2026-11).

App Router only; every CMS read is server-side and anonymous.

## Setup

`CMS_URL` and `CMS_SITE_KEY` in `.env.local` — server only, never `NEXT_PUBLIC_*`, no API key (`CMS_URL=https://cms.example.com`, `CMS_SITE_KEY=example-site`).

```ts
// next.config.ts — allow the CMS media host (and the R2/CDN host, if used)
import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  images: {
    // no `search` filter: media URLs may carry ?v=<n>
    remotePatterns: [{ protocol: 'https', hostname: 'cms.example.com', pathname: '/api/media/file/**' }],
  },
}
export default nextConfig
```

Next 16 needs Node 20.9+; Turbopack is the default for `dev`/`build`. Leave `cacheComponents` off — this code uses the fetch data cache and route segment configs.

## Fetch helper

```ts
// lib/cms.ts
const CMS_URL = (process.env.CMS_URL ?? '').replace(/\/+$/, '')
const SITE_KEY = process.env.CMS_SITE_KEY ?? ''
const REVALIDATE = 3600
export const TAGS = { site: 'cms', listings: 'cms:listings', path: (p: string) => `cms:path:${p}` }
export type Locale = 'vi' | 'en'
export type Media = { url: string; alt?: string | null }
export type LandingBlock = { id?: string; blockType: string; body?: string | null; code?: string | null }
export type Doc = { id: string | number; title?: string; slug?: string; excerpt?: string | null; content?: string | null; layout?: LandingBlock[] | null; featuredImage?: Media | null; seo?: Seo | null }
export type MenuItem = { id: string; label: string; url: string; children?: MenuItem[] }
export type Seo = { title?: string | null; description?: string | null; canonicalOverride?: string | null; robots?: string[] | null; jsonLd?: { raw?: string | null } | null; openGraph?: { title?: string | null; description?: string | null; image?: Media | null; twitterMeta?: { card?: string; title?: string; description?: string; image?: Media | null } | null } | null }
export type Site = { id: string | number; domain: string; footer?: { subfooter?: string | null } | null; knowledgeGraph?: { name?: string | null } | null; manifest?: { name?: string | null } | null; seoDefaults?: { ogImage?: Media | null } | null; seoTitles?: Record<string, { titleTemplate?: string; descriptionTemplate?: string }> & { separator?: string } }
async function cmsGet<T>(path: string, query: Record<string, string | number | boolean>, tags: string[]): Promise<T> {
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) search.set(k, String(v))
  // Anonymous: no Authorization header, no cookies, no credentials.
  const res = await fetch(`${CMS_URL}${path}?${search}`, {
    headers: { Accept: 'application/json' }, cache: 'force-cache', next: { revalidate: REVALIDATE, tags },
  })
  if (!res.ok) throw new Error(`CMS ${res.status} ${path}`)
  return (await res.json()) as T
}
/** Site document + tenant id, resolved once and cached. */
export async function getSite(): Promise<Site> {
  const { docs } = await cmsGet<{ docs: Site[] }>('/api/sites', { 'where[siteKey][equals]': SITE_KEY, limit: 1, depth: 1 }, [TAGS.site])
  if (!docs[0]) throw new Error(`No CMS site for CMS_SITE_KEY=${SITE_KEY}`)
  return docs[0]
}
type Options = { where?: [string, string, string][]; locale?: Locale; depth?: 0 | 1 | 2; limit?: number; page?: number; sort?: string; select?: string[]; fallbackLocale?: Locale | 'none'; tags?: string[] }
export async function cmsList<T>(collection: string, o: Options = {}) {
  const site = await getSite()
  const query: Record<string, string | number | boolean> = {
    limit: o.limit ?? 12, page: o.page ?? 1, depth: o.depth ?? 1, locale: o.locale ?? 'vi', 'where[tenant][equals]': site.id,
  }
  if (o.sort) query.sort = o.sort
  if (o.fallbackLocale) query['fallback-locale'] = o.fallbackLocale
  for (const [f, op, v] of o.where ?? []) query[`where[${f}][${op}]`] = v
  for (const f of o.select ?? []) query[`select[${f}]`] = true
  return cmsGet<{ docs: T[]; totalDocs: number }>(`/api/${collection}`, query, [TAGS.site, ...(o.tags ?? [])])
}
export const cmsOne = async <T>(collection: string, o: Options = {}) => (await cmsList<T>(collection, { ...o, limit: 1 })).docs[0] ?? null
/** System page (home, blog, …); site-scoped, no tenant filter, `null` when unmapped. */
export const cmsEnvPage = (key: string, locale: Locale) => cmsGet<Doc | null>(`/api/sites/${encodeURIComponent(SITE_KEY)}/env-page`, { key, locale }, [TAGS.site, TAGS.listings])
```

## Layout: site, menu, lang

`app/[locale]/layout.tsx` is the root layout (no `app/layout.tsx`).

```tsx
// app/[locale]/layout.tsx
import Link from 'next/link'
import { cmsOne, getSite, type Locale, type MenuItem } from '@/lib/cms'
const LOCALES: Locale[] = ['vi', 'en']
export const dynamicParams = false // only the segments the proxy rewrites exist
export const generateStaticParams = () => LOCALES.map((locale) => ({ locale }))
export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: Locale }> }) {
  const { locale } = await params
  const [site, menu] = await Promise.all([
    getSite(),
    cmsOne<{ items: MenuItem[] }>('menus', { where: [['location', 'equals', 'PRIMARY']], locale, depth: 1 }),
  ])
  return (
    <html lang={locale}><body>
      <header><MenuNav items={menu?.items ?? []} /></header>
      {children}
      <footer>{site.footer?.subfooter}</footer>
    </body></html>
  )
}
function MenuNav({ items }: { items: MenuItem[] }) {
  return <ul>{items.map((item) => (
    <li key={item.id}>
      {item.url.startsWith('http') ? <a href={item.url}>{item.label}</a> : <Link href={item.url}>{item.label}</Link>}
      {item.children?.length ? <MenuNav items={item.children} /> : null}
    </li>
  ))}</ul>
}
```

Site and PRIMARY menu are memoized per render pass and cached across requests, so each costs one request per TTL.

## Catch-all route

```tsx
// app/[locale]/[[...slug]]/page.tsx
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { cmsEnvPage, cmsOne, TAGS, type Doc, type LandingBlock, type Locale } from '@/lib/cms'
import { buildMetadata } from '@/lib/seo'
import { JsonLd } from '@/components/json-ld'
export const revalidate = 3600
type Params = { locale: Locale; slug?: string[] }
type Group = 'homepage' | 'pages' | 'posts' | 'landings'
const publicPath = (locale: Locale, p: string) => (locale === 'en' ? `/en${p}` : p)
async function resolve(slug: string[], locale: Locale) {
  if (slug.length === 0) {
    const doc = await cmsEnvPage('FRONT_PAGE', locale)
    return doc && { doc, group: 'homepage' as Group, path: '/' }
  }
  if (slug.length > 1) return null
  const path = `/${slug[0]}`
  const where: [string, string, string][] = [['slug', 'equals', slug[0]]]
  const o = { locale, depth: 2 as const, tags: [TAGS.path(path)], where }
  const notDisabled: [string, string, string] = ['isDisabled', 'not_equals', 'true']
  // Landing → page → post, first published match wins; the CMS does not hide disabled landings.
  for (const collection of ['landings', 'pages', 'posts'] as const) {
    const doc = await cmsOne<Doc>(collection, collection === 'landings' ? { ...o, where: [...where, notDisabled] } : o)
    if (doc) return { doc, group: collection as Group, path }
  }
  return null
}
export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { locale, slug = [] } = await params
  const found = await resolve(slug, locale)
  return found ? buildMetadata(found.doc, { group: found.group, path: publicPath(locale, found.path), locale }) : {}
}
export default async function CatchAll({ params }: { params: Promise<Params> }) {
  const { locale, slug = [] } = await params
  const found = await resolve(slug, locale)
  if (!found) notFound() // real 404 status, never an empty 200
  return (
    <article>
      <h1>{found.doc.title}</h1>
      {found.group === 'landings' ? (
        <LandingBlocks blocks={found.doc.layout ?? undefined} />
      ) : found.doc.content ? (
        <div dangerouslySetInnerHTML={{ __html: found.doc.content }} />
      ) : null}
      <JsonLd raw={found.doc.seo?.jsonLd?.raw} />
    </article>
  )
}

// Landings have no `content`: render `layout[]` by blockType (extend with hero, cta, faq, … as the design needs).
function LandingBlocks({ blocks }: { blocks?: LandingBlock[] }) {
  return blocks?.map((b, i) =>
    b.blockType === 'content' && b.body ? <div key={b.id ?? i} dangerouslySetInnerHTML={{ __html: b.body }} />
    : b.blockType === 'embed' && b.code ? <div key={b.id ?? i} dangerouslySetInnerHTML={{ __html: b.code }} />
    : null,
  )
}
```

`generateStaticParams` is optional: pages render on demand and the data cache does the caching.

```tsx
// app/[locale]/product/[slug]/page.tsx
import { notFound } from 'next/navigation'
import { cmsOne, TAGS, type Doc, type Locale } from '@/lib/cms'
import { buildMetadata } from '@/lib/seo'
import { JsonLd } from '@/components/json-ld'
type Params = { locale: Locale; slug: string }
type Product = Doc & { notice?: string | null }
const path = (locale: Locale, slug: string) => (locale === 'en' ? `/en/product/${slug}` : `/product/${slug}`)
const load = (slug: string, locale: Locale) => cmsOne<Product>('products', { where: [['slug', 'equals', slug]], locale, depth: 2, tags: [TAGS.path(`/product/${slug}`)] })
export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { locale, slug } = await params
  const product = await load(slug, locale)
  return product ? buildMetadata(product, { group: 'products', path: path(locale, slug), locale }) : {}
}
export default async function ProductPage({ params }: { params: Promise<Params> }) {
  const { locale, slug } = await params
  const product = await load(slug, locale)
  if (!product) notFound()
  return (
    <article>
      <h1>{product.title}</h1>
      {product.notice ? <div dangerouslySetInnerHTML={{ __html: product.notice }} /> : null}
      {product.content ? <div dangerouslySetInnerHTML={{ __html: product.content }} /> : null}
      <JsonLd raw={product.seo?.jsonLd?.raw} />
    </article>
  )
}
```

## SEO

```ts
// lib/seo.ts
import type { Metadata } from 'next'
import { getSite, type Doc, type Locale } from './cms'
type Group = 'homepage' | 'posts' | 'pages' | 'products' | 'landings' | 'taxonomies'
const strip = (html?: string | null) => (html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
/** Replaces %vars%, drops unknown/empty ones, collapses leftover separators. */
const fill = (template: string, vars: Record<string, string | undefined>, sep: string) =>
  template.replace(/%([a-z]+)%/g, (_, key: string) => vars[key] ?? '')
    .split(sep).map((p) => p.trim()).filter(Boolean).join(` ${sep} `).replace(/\s+/g, ' ')
export async function buildMetadata(doc: Doc, { group, path, locale }: { group: Group; path: string; locale: Locale }): Promise<Metadata> {
  const site = await getSite()
  const seo = doc.seo ?? {}
  const sep = site.seoTitles?.separator || '|'
  const template = site.seoTitles?.[group] ?? {}
  const sitename = site.knowledgeGraph?.name || site.manifest?.name || site.domain
  const vars = { title: doc.title, sitename, sep, excerpt: strip(doc.excerpt ?? doc.content).slice(0, 160) }
  // seo.title/description are often empty by design: template first, then the doc fields.
  const title = seo.title?.trim() || fill(template.titleTemplate || '%title% %sep% %sitename%', vars, sep) || sitename
  const description = seo.description?.trim() || fill(template.descriptionTemplate || '%excerpt%', vars, sep)
  const og = seo.openGraph ?? {}
  const twitter = og.twitterMeta ?? {}
  const image = og.image?.url || doc.featuredImage?.url || site.seoDefaults?.ogImage?.url
  const robots = seo.robots ?? []
  const metadata: Metadata = {
    metadataBase: new URL(`https://${site.domain}`), title, description,
    alternates: { canonical: seo.canonicalOverride?.trim() || path },
    robots: robots.length ? { index: !robots.includes('noindex'), follow: !robots.includes('nofollow') } : undefined,
    openGraph: {
      type: 'website', url: path, siteName: sitename, locale, title: og.title || title,
      description: og.description || description, images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: twitter.card || 'summary_large_image', title: twitter.title || og.title || title,
      description: twitter.description || og.description || description, images: twitter.image?.url || image,
    },
  }
  return metadata
}
```

`seo.jsonLd.raw` is a complete `<script type="application/ld+json">…</script>` element: `metadata` only emits `<meta>`/`<link>`, and the string must not be wrapped again, so emit it in the body:

```tsx
// components/json-ld.tsx
export function JsonLd({ raw }: { raw?: string | null }) {
  if (!raw) return null
  // Verbatim: the string already holds the <script> tag. No JSON.parse, no re-serialise.
  return <div dangerouslySetInnerHTML={{ __html: raw }} />
}
```

It lands in the server-rendered HTML; browsers never execute scripts written through `innerHTML`, and JSON-LD is inert data either way.

## Revalidate webhook

```ts
// app/api/cms/revalidate/route.ts
import { revalidateTag } from 'next/cache'
import { TAGS } from '@/lib/cms'
const DOCS = ['pages', 'posts', 'products', 'landings']
export async function POST(request: Request) {
  let body: { collection?: string; slug?: string; manual?: boolean } = {}
  try { body = await request.json() } catch { /* empty body → manual purge */ }
  // menus, faqs, shortcodes, authors, site settings, manual, unknown → whole site
  if (body.manual || !DOCS.includes(body.collection ?? '')) {
    revalidateTag(TAGS.site, { expire: 0 })
    return Response.json({ revalidated: 'all' })
  }
  const slug = body.slug?.replace(/^\/+|\/+$/g, '')
  const tags = slug ? [TAGS.listings, TAGS.path(body.collection === 'products' ? `/product/${slug}` : `/${slug}`)] : [TAGS.site]
  for (const tag of tags) revalidateTag(tag, { expire: 0 })
  return Response.json({ revalidated: tags })
}
```

No CMS fetch here; the response is immediate and idempotent, and `{ expire: 0 }` makes the next request block until fresh. The body is unauthenticated and can only pick `cms*` tags.

## Caching strategy

- Every CMS `fetch`: `cache: 'force-cache'` + `next: { revalidate: 3600, tags }`. Caching is opt-in in Next 16; without `force-cache` each render hits the CMS.
- Tags: `cms` on every request; `cms:path:/<public path>` on one document; `cms:listings` on home/archive fetches.
- A document change purges `cms:path:…` + `cms:listings`; a structural change (`menus`, `faqs`, `shortcodes`, `authors`, site settings, unknown, `manual`) purges `cms`.
- 3600 s is the fallback TTL: scheduled posts appear when `publishedAt` passes and a missed webhook heals within an hour. Use 300 s if editors expect near-live.
- Listings (`depth=1` + `select`) and detail pages (`depth=2`) have different URLs and are cached separately.
- No `headers()`, `cookies()` or `searchParams` on these routes — a request-time API opts the route out of prerendering and route ISR.

## Redirects

`middleware.ts` is deprecated in Next 16: the file is `proxy.ts` and it exports `proxy`. `revalidateTag` cannot run there, so the rule list is cached in module scope.

```ts
// proxy.ts
import { NextResponse, type NextRequest } from 'next/server'
const CMS_URL = (process.env.CMS_URL ?? '').replace(/\/+$/, '')
const SITE_KEY = process.env.CMS_SITE_KEY ?? ''
type Rule = { from: string; to: string; statusCode?: string }
let cache: { at: number; rules: Map<string, Rule> } = { at: 0, rules: new Map() }
const norm = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p)
const get = (url: string) => fetch(url, { headers: { Accept: 'application/json' } }).then((r) => r.json())
async function loadRules() {
  if (Date.now() - cache.at < 60_000) return cache.rules
  try {
    const sites = await get(`${CMS_URL}/api/sites?${new URLSearchParams({ 'where[siteKey][equals]': SITE_KEY, limit: '1', depth: '0', 'select[id]': 'true' })}`)
    const { docs } = await get(`${CMS_URL}/api/redirects?${new URLSearchParams({ 'where[tenant][equals]': String(sites.docs?.[0]?.id), 'where[isEnabled][equals]': 'true', limit: '1000', depth: '0' })}`)
    cache = { at: Date.now(), rules: new Map((docs as Rule[]).map((r) => [norm(r.from), r] as [string, Rule])) }
  } catch {
    cache = { at: Date.now(), rules: cache.rules } // keep the last good list
  }
  return cache.rules
}
function resolve(rules: Map<string, Rule>, path: string) {
  const seen = new Set<string>()
  let current = path
  let status = '301'
  for (let hop = 0; hop < 5 && !seen.has(current); hop++) {
    const rule = rules.get(current)
    if (!rule) break
    seen.add(current)
    if (hop === 0) status = rule.statusCode ?? '301'
    current = norm(rule.to)
  }
  if (current === path || rules.has(current)) return null // self-redirect or loop
  return { to: current, status: status === '302' ? 302 : 301 }
}
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  // /vi/... is an internal rewrite target, never a public URL.
  if (pathname === '/vi' || pathname.startsWith('/vi/')) {
    const url = request.nextUrl.clone()
    url.pathname = pathname.slice(3) || '/'
    return NextResponse.redirect(url, 308)
  }
  const hit = resolve(await loadRules(), norm(pathname))
  if (hit) return NextResponse.redirect(new URL(hit.to, request.url), hit.status)
  if (pathname === '/en' || pathname.startsWith('/en/')) return NextResponse.next()
  const url = request.nextUrl.clone()
  url.pathname = pathname === '/' ? '/vi' : `/vi${pathname}`
  return NextResponse.rewrite(url)
}
export const config = { matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'] }
```

Next's own trailing-slash redirect runs before the proxy, so `/slug/` and `/slug` render the same page; CMS rules end with `/` more often than not, hence `norm()`.

## Locales

- `vi` is the default at `/`, `en` at `/en/...`; slugs are shared because `slug` is not localized.
- `[locale]` holds both; the proxy rewrites `/slug` → `/vi/slug` internally and redirects `/vi/*` back, so public URLs stay unprefixed.
- Every query passes `locale`; menus, taxonomy names and `pageGroup` labels follow it too.
- `<html lang>` comes from the segment; canonical URLs for `en` include `/en` (pass the public path to `buildMetadata`).
- Untranslated: query with `fallbackLocale: 'none'` and compare against the `vi` doc — empty `title`/`content` means no translation; show a notice or link to `vi`.

## Pitfalls

- `middleware.ts` is deprecated in Next 16: the file is `proxy.ts` and the export is `proxy`. `revalidateTag`/`revalidatePath` cannot be called there.
- `params` is a `Promise`: `const { slug } = await params`. Reading `.slug` directly yields `undefined` and every page 404s.
- Fetch caching is opt-in — `next: { tags }` caches nothing without `cache: 'force-cache'`; conversely `cache: 'no-store'` silently defeats the webhook.
- Single-argument `revalidateTag(tag)` is deprecated: a webhook uses `revalidateTag(tag, { expire: 0 })`; `'max'` is for stale-while-revalidate cases.
- JSON-LD: never wrap `seo.jsonLd.raw` in another `<script>`, never `JSON.parse` it, never pass it to `metadata` — use the body component.
- `revalidatePath` takes route file paths (after the rewrite: `/vi/...`), not public URLs. Prefer tags — they are rewrite- and locale-independent.
- `next/image` rejects unconfigured hosts with a runtime 400: allow the CMS host (`/api/media/file/**`) and the CDN host in `images.remotePatterns`, keeping the `?v=` cache-buster.
- Never add an `Authorization` header or cookies: the CMS would then return drafts and scheduled posts. There is no API key, and `CMS_URL`/`CMS_SITE_KEY` stay out of `NEXT_PUBLIC_*`.
