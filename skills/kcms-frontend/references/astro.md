# Astro on KDIGI CMS

Verified with astro 7.4 (2026-11).

## Setup

```bash
# .env — server-only (no PUBLIC_ prefix), NEVER an API key
CMS_URL=https://cms.example.com
CMS_SITE_KEY=example-site
DEPLOY_HOOK_URL=https://api.example.com/build_hooks/xxxx   # SSG mode only
```
```js
// astro.config.mjs
import { defineConfig, memoryCache } from 'astro/config';
import node from '@astrojs/node'; // omit for a pure SSG build
export default defineConfig({
  site: 'https://www.example.com',
  output: 'static', // per-route on-demand (`prerender = false`) needs an adapter
  adapter: node({ mode: 'standalone' }),
  image: { remotePatterns: [{ protocol: 'https', hostname: 'cms.example.com' }] },
  i18n: { locales: ['vi', 'en'], defaultLocale: 'vi', routing: { prefixDefaultLocale: false } },
  cache: { provider: memoryCache() }, // SSR only; the adapter's CDN provider in production
});
```
`CMS_*` without the `PUBLIC_` prefix is server-only: inlined at build in SSG, read at runtime in SSR (add `env.schema` + `envField` for types). `media.url` is absolute; the allow-list is only for `<Image>`.

## Fetch helper

```ts
// src/lib/cms.ts
const { CMS_URL, CMS_SITE_KEY } = import.meta.env; // server-only, never in a client bundle
export type Locale = 'vi' | 'en';
export type Media = { url: string; alt?: string | null; width?: number; height?: number };
export type MenuItem = { label: string; url: string; children?: MenuItem[] };
export type Seo = { title?: string; description?: string; canonicalOverride?: string; robots?: string[];
  jsonLd?: { raw?: string }; openGraph?: { title?: string; description?: string; image?: Media | null; twitterMeta?: { card?: string; title?: string; description?: string; image?: Media | null; useFacebookData?: boolean } } };
export type Doc = { id: number; title: string; slug: string; excerpt?: string | null; content?: string | null; featuredImage?: Media | null; seo?: Seo };
export type Site = { id: number; siteKey: string; domain: string; defaultLanguage: Locale; pageGroup: { key: string; pageSlug: string }[];
  seoTitles?: Record<'homepage' | 'posts' | 'pages' | 'products' | 'landings' | 'taxonomies', { titleTemplate?: string; descriptionTemplate?: string } | undefined> & { separator?: string };
  seoDefaults?: { ogImage?: Media | null }; knowledgeGraph?: { name?: string }; manifest?: { name?: string } };
const BASE = CMS_URL.replace(/\/+$/, '');
async function json<T>(path: string, params: URLSearchParams): Promise<T> {
  const res = await fetch(`${BASE}/api/${path}?${params}`, { headers: { Accept: 'application/json' } }); // no Authorization/cookies/credentials
  if (!res.ok) throw new Error(`CMS ${res.status} /api/${path}`);
  return (await res.json()) as T;
}
let site: Promise<Site> | undefined; // tenant id, once per process (per build in SSG)
export const getSite = () => (site ??= (async () => {
  const q = new URLSearchParams({ 'where[siteKey][equals]': CMS_SITE_KEY, limit: '1', depth: '1' });
  const { docs } = await json<{ docs: Site[] }>('sites', q);
  if (!docs[0]) throw new Error(`unknown siteKey ${CMS_SITE_KEY}`);
  return docs[0];
})());
export async function cmsList<T>(c: string, params: Record<string, string>, locale: Locale): Promise<T[]> {
  const q = new URLSearchParams({ limit: '12', depth: '1', ...params, locale });
  q.set('where[tenant][equals]', String((await getSite()).id)); // slugs are unique per site only
  return (await json<{ docs: T[] }>(c, q)).docs;
}
export async function cmsOne<T>(c: string, slug: string, locale: Locale, extra: Record<string, string> = {}): Promise<T | null> {
  const q = new URLSearchParams({ ...extra, limit: '1', depth: '2', locale });
  q.set('where[tenant][equals]', String((await getSite()).id));
  q.set('where[slug][equals]', slug);
  return (await json<{ docs: T[] }>(c, q)).docs[0] ?? null;
}
```
Astro has no per-`fetch` cache, so nothing is tagged here: cache whole responses on the route (`Astro.cache.set` in Caching strategy) and keep the helper uncached.

## Layout: site, menu, lang

```astro
---
// src/layouts/Base.astro
import Nav from '../components/Nav.astro';
import Seo from '../components/Seo.astro';
import { getSite, cmsList, type Locale, type MenuItem } from '../lib/cms';
const site = await getSite();
const locale = (Astro.currentLocale ?? site.defaultLanguage) as Locale;
const menus = await cmsList<{ items?: MenuItem[] }>('menus', { 'where[location][equals]': 'PRIMARY', limit: '1' }, locale);
---
<!doctype html>
<html lang={locale}>
  <head><meta charset="utf-8" /><Seo data={Astro.props.seo} /></head>
  <body>
    <header><Nav items={menus[0]?.items ?? []} /></header>
    <main><slot /></main>
  </body>
</html>
```
```astro
---
// src/components/Nav.astro — items[] nest in `children`; no PRIMARY doc = no nav
import type { MenuItem } from '../lib/cms';
const { items } = Astro.props as { items: MenuItem[] };
---
<ul>
  {items.map((item) => (
    <li><a href={item.url}>{item.label}</a>{item.children?.length ? <Astro.self items={item.children} /> : null}</li>
  ))}
</ul>
```

## Catch-all route

```ts
// src/lib/content.ts
import { cmsList, cmsOne, type Doc, type Locale } from './cms';
export type Landing = Doc & { layout?: { blockType: string; body?: string | null }[] };
export const listSlugs = (c: string, locale: Locale, extra: Record<string, string> = {}) =>
  cmsList<{ slug: string }>(c, { limit: '1000', depth: '0', 'select[slug]': 'true', ...extra }, locale).then((d) => d.map((x) => x.slug));
export async function allSlugs(locale: Locale): Promise<string[]> {
  const [landings, pages, posts] = await Promise.all([
    listSlugs('landings', locale, { 'where[isDisabled][not_equals]': 'true' }), // CMS does not hide disabled landings
    listSlugs('pages', locale), listSlugs('posts', locale),
  ]);
  return [...new Set([...landings, ...pages, ...posts])];
}
export async function resolvePath(slug: string, locale: Locale) { // landing → page → post
  for (const [kind, c] of [['landing', 'landings'], ['page', 'pages'], ['post', 'posts']] as const) {
    const doc = await cmsOne<Landing>(c, slug, locale, kind === 'landing' ? { 'where[isDisabled][not_equals]': 'true' } : {});
    if (doc) return { kind, doc };
  }
  return null;
}
```
```astro
---
// src/pages/[...slug].astro
import type { GetStaticPaths } from 'astro';
import Base from '../layouts/Base.astro';
import { getSite } from '../lib/cms';
import { allSlugs, resolvePath } from '../lib/content';
import { resolveSeo } from '../lib/seo';
export const prerender = true; // SSR: `= false`, drop getStaticPaths, Astro.props no longer exists
export const getStaticPaths = (async () => (await allSlugs('vi')).map((slug) => ({ params: { slug } }))) satisfies GetStaticPaths;
const found = await resolvePath(Astro.params.slug!, 'vi');
if (!found) return new Response(null, { status: 404 }); // unreachable in SSG, required in SSR
const group = { landing: 'landings', page: 'pages', post: 'posts' } as const;
---
<Base seo={resolveSeo(found.doc, await getSite(), group[found.kind], Astro.url.pathname)}>
  {found.kind === 'landing'
    ? found.doc.layout?.map((b) => (b.blockType === 'content' ? <Fragment set:html={b.body ?? ''} /> : null))
    : <article><h1>{found.doc.title}</h1><Fragment set:html={found.doc.content ?? ''} /></article>}
</Base>
```
`src/pages/en/[...slug].astro` is the same with `'en'`. `src/pages/product/[slug].astro`: `listSlugs('products', 'vi')` + `cmsOne<Product>('products', …)` at `/product/{slug}`, rendering `content` and `notice` with `set:html`. Home: `GET /api/sites/{SITE}/env-page?key=FRONT_PAGE&locale={locale}` — the key resolves through `Sites.pageGroup`; throw on `null`, then `page.content` via `set:html`.

## SEO

```ts
// src/lib/seo.ts
import type { Doc, Site } from './cms';
type Group = 'homepage' | 'posts' | 'pages' | 'products' | 'landings' | 'taxonomies';
const strip = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const collapse = (s: string) => s.replace(/\s*([|·–—])(\s*[|·–—])+/g, '$1') // separators left by empty vars
  .replace(/^[\s|·–—]+|[\s|·–—]+$/g, '').replace(/\s{2,}/g, ' ').trim();
export function resolveSeo(doc: Doc, site: Site, group: Group, path: string) {
  const fill = (tpl: string) => collapse(tpl.replace(/%([a-z]+)%/g, (_, k) => ({ // unknown vars vanish
    title: doc.title, sitename: site.knowledgeGraph?.name ?? site.manifest?.name ?? site.domain,
    sep: site.seoTitles?.separator ?? '|', excerpt: strip(doc.excerpt ?? ''),
  } as Record<string, string>)[k] ?? ''));
  const t = site.seoTitles?.[group] ?? {}, seo = doc.seo ?? {}, og = seo.openGraph ?? {}, tw = og.twitterMeta ?? {};
  const fb = tw.useFacebookData !== false; // default: reuse OG values
  const title = seo.title || fill(t.titleTemplate || '%title% %sep% %sitename%') || doc.title;
  const description = seo.description || fill(t.descriptionTemplate || '%excerpt%');
  const image = og.image?.url ?? doc.featuredImage?.url ?? site.seoDefaults?.ogImage?.url;
  return {
    title, description, image, canonical: seo.canonicalOverride ?? path,
    robots: seo.robots?.length ? seo.robots.join(', ') : 'index, follow',
    ogType: group === 'posts' ? 'article' : 'website',
    ogTitle: og.title || title, ogDescription: og.description || description,
    twCard: tw.card ?? 'summary_large_image', twTitle: tw.title || (fb ? og.title || title : ''),
    twDescription: tw.description || (fb ? og.description || description : ''), twImage: tw.image?.url || (fb ? image : ''),
    jsonLd: seo.jsonLd?.raw ?? '',
  };
}
```
```astro
---
// src/components/Seo.astro — rendered inside <head>
const { data } = Astro.props;
---
<title>{data.title}</title>
<meta name="description" content={data.description} />
<meta name="robots" content={data.robots} /><link rel="canonical" href={new URL(data.canonical, Astro.site ?? Astro.url.origin)} />
<meta property="og:title" content={data.ogTitle} /><meta property="og:type" content={data.ogType} />
<meta property="og:description" content={data.ogDescription} />
{data.image && <meta property="og:image" content={data.image} />}
<meta name="twitter:card" content={data.twCard} /><meta name="twitter:title" content={data.twTitle} />
<meta name="twitter:description" content={data.twDescription} />
{data.twImage && <meta name="twitter:image" content={data.twImage} />}
<!-- seo.jsonLd.raw is already a complete <script type="application/ld+json"> element: no wrapper, no re-serialising -->
<Fragment set:html={data.jsonLd} />
```

## Revalidate webhook

SSR (or static + adapter, where `prerender = false` keeps one route on demand):

```ts
// src/pages/api/cms/revalidate.ts
import type { APIRoute } from 'astro';
export const prerender = false;
const DOCS = new Set(['posts', 'pages', 'landings', 'products']); // collections publicPathFor maps to one path
const pathFor = (c: string, slug: string) => (c === 'products' ? `/product/${slug}` : `/${slug}`); // publicPathFor
export const POST: APIRoute = async ({ request, cache }) => {
  const body: { collection?: string; slug?: string; manual?: boolean } = (await request.json().catch(() => ({}))) ?? {};
  const { collection = '', slug, manual } = body;
  if (!cache.enabled) return new Response(null, { status: 204 }); // dev / no provider
  // taxonomies, menus, faqs, shortcodes, authors, sites, manual, missing slug, unknown → whole site
  if (manual || !slug || !DOCS.has(collection)) await cache.invalidate({ tags: ['site'] });
  else await cache.invalidate({ tags: [`doc:${pathFor(collection, slug)}`] }); // tag carries no locale prefix
  return new Response(null, { status: 204 }); // 2xx in ms, idempotent, no CMS fetch, body only picks the purge
};
```
Pure SSG has no `/api/cms/revalidate`: without an adapter the endpoint is prerendered into a static file and the CMS's POST gets a static response. Route `POST /api/cms/revalidate` to the host's function instead; it only calls the build hook, since a rebuild republishes the whole site:

```ts
// host function (Workers shape; adapt to Netlify/Vercel signatures)
export default { fetch: async (request: Request, env: { DEPLOY_HOOK_URL: string }) => request.method === 'POST'
  ? (await fetch(env.DEPLOY_HOOK_URL, { method: 'POST' }), new Response(null, { status: 202 }))
  : new Response(null, { status: 405 }) };
```
The CMS calls `https://{Sites.domain}/api/cms/revalidate`: set the site `domain` and `ENABLE_JOBS_AUTORUN=true` on one CMS instance.

## Caching strategy

- SSG: the cache is the deployed artifact; the webhook triggers a full rebuild. Schedule a nightly build so posts whose `publishedAt` passes appear without an edit.
- SSR: whole responses, not fetches. In the page frontmatter:

```ts
if (Astro.cache.enabled) Astro.cache.set({ maxAge: 300, swr: 86400,
  tags: ['site', `doc:${Astro.url.pathname.replace(/^\/en(?=\/|$)/, '')}`] });
```
The webhook purges these tags (`site` = whole site). `swr: 86400` serves stale while revalidating, so a missed webhook costs one `maxAge` (300 s) — the fallback that also makes scheduled posts appear. `memoryCache()` is per instance; on serverless use `cacheCloudflare()` / `cacheNetlify()` / `cacheVercel()`, or a purge reaches one isolate only. Group TTLs can live in `routeRules`; `cache.enabled` is false in `astro dev`.

## Redirects

SSR: middleware, before any route renders.

```ts
// src/middleware.ts — request-time only; in SSG this runs once at build
import { defineMiddleware } from 'astro:middleware';
import { cmsList } from './lib/cms';
const norm = (p: string) => (p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p);
type Rule = { to: string; status: number };
let rules: { at: number; map: Map<string, Rule> } | undefined; // 60 s TTL
async function getRedirects() {
  if (rules && Date.now() - rules.at < 60_000) return rules.map;
  const rows = await cmsList<{ from: string; to: string; statusCode: string }>('redirects',
    { limit: '1000', depth: '0', 'where[isEnabled][equals]': 'true' }, 'vi');
  return (rules = { at: Date.now(), map: new Map(rows.map((r) => [norm(r.from), { to: r.to, status: Number(r.statusCode) || 301 }])) }).map;
}
export const onRequest = defineMiddleware(async (ctx, next) => {
  const path = norm(ctx.url.pathname);
  if (path !== ctx.url.pathname) return ctx.redirect(path + ctx.url.search, 301); // trailing slash
  const map = await getRedirects();
  let rule = map.get(path);
  for (let hops = 0; rule && hops < 5; hops++) rule = map.get(norm(rule.to)) ?? rule; // cap chains/loops
  return rule ? ctx.redirect(rule.to, rule.status) : next();
});
```
SSG: no per-request middleware, so generate the host file during the build (`_redirects` for Netlify/Cloudflare Pages, `vercel.json` elsewhere). A `prebuild` script reads `CMS_URL`/`CMS_SITE_KEY` from `process.env`, fetches `sites` → tenant id → `redirects` (`isEnabled=true`), normalises `from` with the same `norm`, and writes `"<from> <to> <status>"` lines to `public/_redirects`, which `astro build` copies out. In SSG, trailing-slash handling is the host's (`build.format: 'directory'` plus the platform setting); `trailingSlash` only governs dev and on-demand routes.

## Locales

`i18n` above: `vi` at `/…`, `en` at `/en/…`, identical slugs. `src/pages/[...slug].astro` and `src/pages/en/[...slug].astro` build from `allSlugs(locale)` and pass `locale` into every helper, so queries carry `locale=en`; `Astro.currentLocale` feeds `<html lang>`. Build links with `getRelativeLocaleUrl(locale, slug)` from `astro:i18n`. Missing `en` fields already fall back to `vi`; pass `{'fallback-locale': 'none'}` as `cmsOne`'s `extra` to render only translated fields and show a "not translated" notice. Skip `i18n.fallback`: it redirects or rewrites on route existence, while both locale routes always exist and the CMS decides whether content is translated.

## Pitfalls

- `getStaticPaths` is build-time only: on an on-demand route (`prerender = false`) it is ignored and `Astro.props` is empty. Read `Astro.params`; do not copy the SSG page into SSR mode untouched.
- `export const prerender = false` requires an adapter. Without one, Astro emits a static file for that route — hence no webhook endpoint on a pure static site.
- Middleware does not run per request in a static build; CMS redirects must be baked into the host file, not resolved at request time.
- Non-`PUBLIC_` vars are inlined at build in SSG and read at runtime in SSR. Never rename `CMS_*` to `PUBLIC_*`: that ships them to the browser.
- `Astro.cache` caches the response, not `fetch`; there are no per-fetch tags. `cache.invalidate()` throws when no provider is configured — guard with `cache.enabled`.
- HTML fields (`content`, `notice`, landing `body`) go through `set:html` on their original key. Never render `contentMd`/`noticeMd`/`bodyMd`, never run a Markdown parser.
- `seo.jsonLd.raw` already contains its `<script type="application/ld+json">` element: `<Fragment set:html={raw} />`, never `<script set:html={raw}>`.
- `Astro.site` is `undefined` without the `site` config option; canonical URLs then break silently.
