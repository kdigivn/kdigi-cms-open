# Nuxt on KDIGI CMS

Verified with Nuxt 4.6 (2026-11). Nuxt 4 keeps the Vue app in `app/`, the Nitro server in `server/`; shared types live in `shared/types/` and are auto-imported in both. Every CMS read happens in Nitro, so the browser never holds a key, a cookie or a CORS dependency.

## Setup

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  runtimeConfig: {
    // server-only: outside `public`, so never serialised into the client payload
    cmsUrl: '',      // NUXT_CMS_URL
    cmsSiteKey: '',  // NUXT_CMS_SITE_KEY
  },
  routeRules: { '/api/**': { cache: false }, '/**': { swr: 300 } },
})
```

`.env` holds `NUXT_CMS_URL=https://cms.example.com` and `NUXT_CMS_SITE_KEY=example-site`; host env vars `CMS_URL` / `CMS_SITE_KEY` map onto those names (Nuxt only overrides `runtimeConfig` from `NUXT_*`). There is no API key. `media.url` is absolute, so plain `<img>` works — or `@nuxt/image` with `image: { domains: ['cms.example.com'] }`.

## Fetch helper

```ts [shared/types/cms.ts]
export interface PageDoc<T> { docs: T[]; totalDocs: number }
export interface CmsSite { id: number; siteKey: string; domain: string; pageGroup?: { key: string; pageSlug: string }[]; seoTitles?: Record<string, any>; knowledgeGraph?: { name?: string }; manifest?: { name?: string }; seoDefaults?: { ogImage?: { url?: string } } }
export interface CmsDoc { title?: string; slug?: string; excerpt?: string; content?: string; notice?: string; featuredImage?: { url: string; alt?: string }; seo?: { title?: string; description?: string; canonicalOverride?: string; robots?: string[]; jsonLd?: { raw?: string }; openGraph?: { title?: string; description?: string; image?: { url?: string }; twitterMeta?: Record<string, string> } }; [key: string]: unknown }
```

```ts [server/utils/cms.ts]
function config() {
  const { cmsUrl, cmsSiteKey } = useRuntimeConfig()
  if (!cmsUrl || !cmsSiteKey) throw createError({ statusCode: 500, statusMessage: 'CMS not configured' })
  return { base: String(cmsUrl).replace(/\/+$/, ''), siteKey: String(cmsSiteKey) }
}

type Params = Record<string, string | number | boolean | undefined>
const read = defineCachedFunction(async (path: string, params: Params) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)]))
  // anonymous: no Authorization header, no cookies, no credentials
  return await $fetch(`${config().base}/api${path}?${qs}`, { headers: { accept: 'application/json' } })
}, { group: 'cms', name: 'read', maxAge: 60, getKey: (path: string, params: object) => path + JSON.stringify(params) })

export const getSite = defineCachedFunction(async (locale = 'vi'): Promise<CmsSite> => {
  const { docs } = (await read('/sites', { 'where[siteKey][equals]': config().siteKey, limit: 1, depth: 1, locale })) as PageDoc<CmsSite>
  if (!docs[0]) throw createError({ statusCode: 500, statusMessage: 'unknown CMS site' })
  return docs[0]
}, { group: 'cms', name: 'site', maxAge: 300, getKey: (locale = 'vi') => `site_${locale}` })

export interface QueryOptions { where?: Record<string, string>; sort?: string; limit?: number; page?: number; depth?: number; locale?: string; fallbackLocale?: string; select?: string[] }

export async function cmsList<T>(collection: string, opts: QueryOptions = {}) {
  const locale = opts.locale ?? 'vi'
  const params: Params = {
    'where[tenant][equals]': (await getSite(locale)).id, // mandatory: slugs are unique per site only
    ...opts.where, limit: opts.limit ?? 12, page: opts.page ?? 1, depth: opts.depth ?? 1, sort: opts.sort, locale, 'fallback-locale': opts.fallbackLocale,
  }
  if (collection === 'landings') params['where[isDisabled][not_equals]'] = 'true' // the CMS serves disabled landings
  for (const field of opts.select ?? []) params[`select[${field}]`] = 'true'
  return (await read(`/${collection}`, params)) as PageDoc<T>
}

export async function cmsOne<T>(collection: string, slug: string, opts: QueryOptions = {}): Promise<T | null> {
  const { docs } = await cmsList<T>(collection, { ...opts, where: { ...opts.where, 'where[slug][equals]': slug }, limit: 1 })
  return docs[0] ?? null
}

export async function resolveEntry(path: string, locale: 'vi' | 'en') {
  const opts = { depth: 2, locale }, wrap = (doc: unknown, group: string) => (doc ? { doc: doc as CmsDoc, group } : null)
  if (path === '/') return wrap(await read(`/sites/${config().siteKey}/env-page`, { key: 'FRONT_PAGE', locale }), 'homepage')
  if (path.startsWith('/product/')) return wrap(await cmsOne<CmsDoc>('products', path.slice(9), opts), 'products')
  const slug = path.slice(1) // landing -> page -> post, first published match wins
  for (const group of ['landings', 'pages', 'posts'] as const) {
    const doc = await cmsOne<CmsDoc>(group, slug, opts)
    if (doc) return wrap(doc, group)
  }
  return null
}
```

`server/api/cms/entry.get.ts` is `defineEventHandler(async (event) => resolveEntry(String(getQuery(event).path ?? '/'), getQuery(event).locale === 'en' ? 'en' : 'vi'))` (`env-page` resolves the key through `Sites.pageGroup` and returns `null` for an unknown key or unpublished page, hence the 404); a listing is another route wrapping `cmsList` with `select: ['title', 'slug', 'excerpt', 'featuredImage']`.

## Layout: site, menu, lang

```ts [app/composables/useCmsPath.ts]
export function useCmsPath() {
  const route = useRoute()
  const path = route.path.replace(/^\/en(?=\/|$)/, '') || '/'
  return { locale: computed<'vi' | 'en'>(() => (route.path === path ? 'vi' : 'en')), path: computed(() => path) }
}
```

```ts [server/api/cms/shell.get.ts]
export default defineEventHandler(async (event) => {
  const locale = getQuery(event).locale === 'en' ? 'en' : 'vi'
  const { docs } = await cmsList<{ items?: any[] }>('menus', { where: { 'where[location][equals]': 'PRIMARY' }, limit: 1, depth: 0, locale })
  return { site: await getSite(locale), menu: docs[0] ?? null }
})
```

```vue [app/layouts/default.vue]
<script setup lang="ts">
const { locale } = useCmsPath()
const { data } = await useAsyncData(`shell:${locale.value}`, () => $fetch<{ site: CmsSite; menu: { items?: any[] } | null }>('/api/cms/shell', { query: { locale: locale.value } }))
useHead({ htmlAttrs: { lang: locale.value } })
</script>

<template>
  <div><CmsNav :items="data?.menu?.items ?? []" :locale="locale" /><slot /></div>
</template>
```

`CmsNav` recurses over `items[].children`: `v-for` the items, `NuxtLink :to="localePath(item.url, locale)">{{ item.label }}</NuxtLink`, then `<CmsNav v-if="item.children?.length" :items="item.children" :locale="locale" />`.

## Catch-all route

```vue [app/pages/[...slug].vue] — app/pages/index.vue and app/pages/product/[slug].vue are the same one-liner
<template><CmsEntryView /></template>
```

```vue [app/components/CmsEntryView.vue]
<script setup lang="ts">
const { locale, path } = useCmsPath()
const { data: entry, error } = await useAsyncData(`entry:${locale.value}:${path.value}`, () => $fetch<{ doc: CmsDoc; group: string } | null>('/api/cms/entry', { query: { path: path.value, locale: locale.value } }))
if (error.value) throw createError({ statusCode: 502, statusMessage: 'CMS unavailable', fatal: true })
if (!entry.value) throw createError({ statusCode: 404, statusMessage: 'Not found', fatal: true })
useDocSeo(entry.value.doc, entry.value.group)
</script>

<template>
  <article v-if="entry">
    <CmsLanding v-if="Array.isArray((entry.doc as any).layout)" :blocks="(entry.doc as any).layout" />
    <div v-if="entry.group === 'products'" v-html="entry.doc.notice" />
    <!-- `content`, landing `body`, FAQ `answer`: HTML rendered by the CMS, so insert it as HTML -->
    <div v-html="entry.doc.content" />
    <CmsJsonLd :raw="entry.doc.seo?.jsonLd?.raw" />
  </article>
</template>
```

## SEO

```ts [app/utils/seo.ts]
const strip = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

export function renderTemplate(template: string, vars: Record<string, string>, sep: string) {
  return template.replace(/%(\w+)%/g, (_, name: string) => vars[name] ?? '').split(sep).map(part => part.trim()).filter(Boolean).join(` ${sep} `)
}
export function resolveSeo(doc: CmsDoc | null | undefined, site: CmsSite | undefined, group: string) {
  const seo = doc?.seo ?? {}, titles = site?.seoTitles ?? {}, sep = titles.separator || '|'
  const vars = { title: doc?.title ?? '', sep, sitename: site?.knowledgeGraph?.name || site?.manifest?.name || site?.domain || '', excerpt: strip(doc?.excerpt ?? '') }
  const fill = (template?: string) => (template ? renderTemplate(template, vars, sep) : '')
  const title = seo.title || fill(titles[group]?.titleTemplate) || renderTemplate(group === 'homepage' ? '%sitename%' : '%title% %sep% %sitename%', vars, sep)
  const description = seo.description || fill(titles[group]?.descriptionTemplate) || vars.excerpt
  const og = seo.openGraph ?? {}, tw = og.twitterMeta ?? {}, image = og.image?.url || doc?.featuredImage?.url || site?.seoDefaults?.ogImage?.url
  const robots = (seo.robots?.length ? seo.robots : ['index', 'follow']).join(',')
  const ogTitle = og.title || title, ogDescription = og.description || description
  return { title, description, image, robots, ogTitle, ogDescription, canonicalOverride: seo.canonicalOverride, twCard: tw.card || 'summary_large_image',
    twTitle: tw.title || ogTitle, twDescription: tw.description || ogDescription, twImage: tw.image || image }
}
```

```ts [app/composables/useDocSeo.ts]
export function useDocSeo(doc: MaybeRefOrGetter<CmsDoc | null | undefined>, group: string) {
  const { locale } = useCmsPath()
  const { data: shell } = useNuxtData<{ site: CmsSite }>(`shell:${locale.value}`)
  const seo = computed(() => resolveSeo(toValue(doc), shell.value?.site, group))
  const canonical = computed(() => seo.value.canonicalOverride || useRequestURL().href)
  useSeoMeta({
    title: () => seo.value.title, description: () => seo.value.description, robots: () => seo.value.robots, ogType: 'article',
    ogTitle: () => seo.value.ogTitle, ogDescription: () => seo.value.ogDescription, ogImage: () => seo.value.image, ogUrl: () => canonical.value,
    twitterCard: () => seo.value.twCard, twitterTitle: () => seo.value.twTitle, twitterDescription: () => seo.value.twDescription, twitterImage: () => seo.value.twImage })
  useHead({ link: [{ rel: 'canonical', href: () => canonical.value }] })
}
```

`seo.jsonLd.raw` is a complete `<script type="application/ld+json">…</script>` element. `useHead({ script: [{ type: 'application/ld+json', innerHTML: raw }] })` always writes its own `<script>` and escapes `</script>`, so it cannot carry the string verbatim: emit it as body HTML instead. `CmsJsonLd.vue` is exactly `<div v-if="raw" v-html="raw" />`, which schema validators and crawlers accept.

## Revalidate webhook

```ts [server/api/cms/revalidate.post.ts]
type Body = { collection?: string; slug?: string; manual?: boolean }

function targets(body: Body) {
  const slug = (body.slug ?? '').replace(/^\/+|\/+$/g, '')
  if (body.manual || !body.collection || !slug) return null // menus, faqs, shortcodes, authors, site settings, unknown
  if (body.collection === 'products') return ['/', `/product/${slug}`, `/en/product/${slug}`]
  return ['posts', 'pages', 'landings'].includes(body.collection) ? ['/', `/${slug}`, `/en/${slug}`] : null
}

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event).catch(() => ({} as Body))
  const paths = targets(body)
  await purgeCmsCache(paths) // local storage only: never fetch the CMS in here
  return { revalidated: true, paths: paths ?? '*' }
})
```

```ts [server/utils/cms-cache.ts]
const escapeKey = (path: string) => path.replace(/\W/g, '') || 'index'

// Route-rule entries are keyed by the first 16 escaped pathname characters plus a hash (prefix match only); data entries sit in the `cms` group.
export async function purgeCmsCache(paths: string[] | null) {
  const cache = useStorage('cache')
  if (!paths) return await cache.clear()
  const needles = paths.map(path => escapeKey(path).slice(0, 16))
  for (const key of await cache.getKeys()) {
    if (key.includes('cms') || (key.includes('routes') && needles.some(needle => key.includes(needle)))) await cache.removeItem(key)
  }
}
```

Nitro 2 (what Nuxt 4 ships) has no `.invalidate()` on `defineCachedFunction` — that is Nitro 3. Purge through `useStorage('cache')`, or copy Nitro's `escapeKey` and remove a key you created yourself.

## Caching strategy

- `getSite` 300 s, data reads 60 s, rendered HTML `swr: 300` — all server-side, none in the browser.
- The webhook drops every `cms:*` data entry plus the route entries matching the affected pathnames; `manual` and unmappable collections clear everything, and nothing is refetched in the handler.
- Short TTLs are the safety net: a scheduled post appears within one TTL even if the webhook never fires, and Nitro refuses to cache non-2xx responses, so an early 404 does not stick. Serverless instances each hold a memory cache — mount `cache` to Redis via `nitro.storage` so one purge reaches them all.

## Redirects

```ts [server/middleware/redirects.ts]
const key = (path: string) => '/' + path.split('/').filter(Boolean).join('/')

export default defineEventHandler(async (event) => {
  if (/^\/(api|_nuxt|__)/.test(event.path)) return
  const { docs } = await cmsList<{ from: string; to: string; statusCode?: string }>('redirects', { where: { 'where[isEnabled][equals]': 'true' }, limit: 1000, depth: 0 })
  const start = key(event.path), byFrom = new Map(docs.map(rule => [key(rule.from), rule])) // canonical: no trailing slash
  let target = start, status = 301
  for (let hop = 0; hop < 5; hop++) {
    const rule = byFrom.get(target)
    if (!rule) break
    const next = /^https?:\/\//.test(rule.to) ? rule.to : key(rule.to)
    if (next === target) break
    target = next
    status = Number(rule.statusCode ?? 301)
  }
  if (target !== start) return sendRedirect(event, target, status)
  if (event.path !== start) return sendRedirect(event, start, 301) // /slug/ -> /slug
})
```

Hops resolve on the server, so the browser sees one redirect and the 5-hop cap breaks chains; normalising before rendering also stops `swr` from caching `/slug` and `/slug/` separately.

## Locales

`vi` at `/`, `en` at `/en/...` with the same slugs and no i18n module: `useCmsPath()` derives the locale from the URL and every query then sends `locale=en`. Missing fields fall back to `vi`; add `fallback-locale=none` where you want to show "not translated". `<html lang>` comes from the layout. `app/pages/index.vue` (`/`), `app/pages/[...slug].vue` (`/{slug}`, `/en`, `/en/{slug}`) and `app/pages/product/[slug].vue` (`/product/{slug}`, `/en/product/{slug}`) are all one-liners around `CmsEntryView`. CMS links stay language-neutral (`/services`), so prefix them on English pages:

```ts [app/utils/locale.ts]
export const localePath = (path: string, locale: 'vi' | 'en') =>
  locale === 'vi' || /^(https?:|mailto:|#)/.test(path) ? path : path === '/' ? '/en' : `/en${path}`
```

## Pitfalls

- `useHead({ script: [...] })` wraps and escapes: JSON-LD only works through `v-html`, as `CmsJsonLd` does.
- `useAsyncData` swallows handler errors into `error.value`; without an explicit `throw createError(...)` you ship a `200` with an empty page instead of a 404.
- `event.$fetch` / `useRequestFetch()` forward the visitor's cookies to the CMS and return drafts. Plain `$fetch` does not — use it.
- `runtimeConfig` keys outside `public` are server-only: reading `cmsUrl` in a component gives `undefined`, which is the signal not to call the CMS from the browser.
- A `/**` route rule also matches `/api/**`; opt the API out with `cache: false` or every response is cached twice.
- Render only `content`, `notice`, landing `body` and FAQ `answer`; `contentMd` and friends are unrendered Markdown.
