# SvelteKit on KDIGI CMS

Verified with `@sveltejs/kit` 3.1.1 and `svelte` 5.57 (2026-11).

## Setup

SvelteKit 3 configures itself in `vite.config.ts` (`svelte.config.js` is gone) and replaces `$lib` with the Node subpath alias `#lib`.

```ts
// vite.config.ts
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit({ adapter: adapter() })]
});
```

`package.json` needs `"imports": { "#lib": "./src/lib/index.js", "#lib/*": "./src/lib/*" }`.

```ts
// src/env.ts
import { defineEnvVars } from '@sveltejs/kit/env';
const required = (name: string) => (value: string | undefined) => {
	if (!value) throw new Error(`${name} is missing`);
	return value;
};
export const variables = defineEnvVars({
	CMS_URL: { schema: required('CMS_URL') },
	CMS_SITE_KEY: { schema: required('CMS_SITE_KEY') }
});
```

`.env` (dev): `CMS_URL=https://cms.example.com`, `CMS_SITE_KEY=example-site`. Both stay private — import them from `$app/env/private` in `src/lib/server/**` only, never in a component or universal load. No API key: the site reads anonymously. `$env/dynamic/private` still runs but is deprecated in 3.x (removed in 4). No image allowlist is needed: `media.url` is absolute (CMS or R2/CDN); only `adapter-vercel` image optimisation wants the CMS host in `images.domains`.

## Fetch helper

```ts
// src/lib/server/cms.ts
import { CMS_SITE_KEY, CMS_URL } from '$app/env/private';
import { cached } from '#lib/server/cache.js';

export const DEFAULT_LOCALE = 'vi';
export type Locale = 'vi' | 'en';
type Query = Record<string, string | number | boolean | undefined>;
const BASE = CMS_URL.replace(/\/+$/, '');

async function request<T>(path: string, query: Query): Promise<T> {
	const qs = new URLSearchParams();
	for (const [k, v] of Object.entries(query)) if (v !== undefined) qs.set(k, String(v));
	// anonymous only: no Authorization header, no cookies, no credentials
	const res = await fetch(`${BASE}/api/${path}?${qs}`, { headers: { Accept: 'application/json' } });
	if (res.status === 404) return null as T;
	if (!res.ok) throw new Error(`CMS ${res.status} ${path}`);
	return (await res.json()) as T;
}

export const getSite = () =>
	cached('site', ['site'], 300, async () => {
		const { docs } = await request<{ docs: Site[] }>('sites', {
			'where[siteKey][equals]': CMS_SITE_KEY, limit: 1, depth: 1
		});
		if (!docs[0]) throw new Error(`CMS site ${CMS_SITE_KEY} not found`);
		return docs[0]; // tenant id, defaultLanguage, seoTitles, pageGroup
	});

const tenant = async () => ({ 'where[tenant][equals]': (await getSite()).id });

export const cmsList = async <T>(collection: string, query: Query = {}) =>
	request<{ docs: T[] }>(collection, { ...(await tenant()), ...query });

export async function cmsOne<T>(
	collection: string, slug: string, query: Query = {}, locale: Locale = DEFAULT_LOCALE
) {
	const { docs } = await request<{ docs: T[] }>(collection, {
		...(await tenant()), 'where[slug][equals]': slug, limit: 1, depth: 2, locale, ...query
	});
	return docs[0] ?? null;
}

export const getEnvPage = (key: string, locale: Locale) =>
	request<PageDoc | null>(`sites/${CMS_SITE_KEY}/env-page`, { key, locale });
```

```ts
// src/lib/server/cache.ts
type Entry = { value: unknown; tags: string[]; expires: number };
const store = new Map<string, Entry>();

export async function cached<T>(key: string, tags: string[], ttl: number, load: () => Promise<T>) {
	const hit = store.get(key);
	if (hit && hit.expires > Date.now()) return hit.value as T;
	const value = await load();
	if (store.size >= 500) store.delete(store.keys().next().value!); // bounded
	store.set(key, { value, tags, expires: Date.now() + ttl * 1000 });
	return value;
}
export function invalidateTag(tag: string) {
	for (const [key, entry] of store) if (entry.tags.includes(tag)) store.delete(key);
}
export const invalidateAll = () => store.clear();
```

Site and menu entries are keyed by name, documents by public path, so the webhook purges with the same string it receives. `Site`, `PageDoc`, `Post`, `Landing`, `Product`, `Menu`, `Redirect` are your own minimal types for the fields you read.

## Layout: site, menu, lang

```ts
// src/routes/[[lang]]/+layout.server.ts
import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { DEFAULT_LOCALE, cmsList, getSite } from '#lib/server/cms.js';
import { cached } from '#lib/server/cache.js';

export const load: LayoutServerLoad = async ({ params }) => {
	const locale = params.lang ?? DEFAULT_LOCALE;
	if (locale !== 'vi' && locale !== 'en') error(404, 'Not found');
	const [site, menu] = await Promise.all([
		getSite(),
		cached(`menu:PRIMARY:${locale}`, ['menu'], 300, async () => {
			const { docs } = await cmsList<Menu>('menus', { 'where[location][equals]': 'PRIMARY', limit: 1, locale });
			return docs[0] ?? null;
		})
	]);
	return { site, menu, locale };
};
```

```svelte
<!-- src/routes/[[lang]]/+layout.svelte -->
<script lang="ts">
	import type { LayoutProps } from './$types';
	type Item = { id: string; label: string; url: string; children?: Item[] };
	let { data, children }: LayoutProps = $props();
</script>

{#snippet nav(items: Item[])}
	<ul>{#each items as item (item.id)}
		<li><a href={item.url}>{item.label}</a>{#if item.children}{@render nav(item.children)}{/if}</li>
	{/each}</ul>
{/snippet}

<header>{#if data.menu}{@render nav(data.menu.items as Item[])}{/if}</header>
<main>{@render children()}</main>
```

Menus render `menus.items[]` with nested `children` (never `tree`). `<html lang>` lives in `src/app.html` as `lang="%lang%"`, filled by `handle` (see Locales).

## Catch-all route

```ts
// src/routes/[[lang]]/[slug]/+page.server.ts
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { cmsOne } from '#lib/server/cms.js';
import { cached } from '#lib/server/cache.js';

export const load: PageServerLoad = async ({ params, parent, setHeaders }) => {
	const { locale } = await parent();
	const path = `/${params.slug}`;
	// landing → page → post, first published match wins
	const found = await cached(`page:${locale}:${path}`, [path], 60, async () => {
		const [landing, page, post] = await Promise.all([
			cmsOne<Landing>('landings', params.slug, { 'where[isDisabled][not_equals]': true }, locale),
			cmsOne<PageDoc>('pages', params.slug, {}, locale),
			cmsOne<Post>('posts', params.slug, {}, locale)
		]);
		if (landing) return { kind: 'landing', doc: landing };
		if (page) return { kind: 'page', doc: page };
		if (post) return { kind: 'post', doc: post };
		return null;
	});
	if (!found) error(404, 'Not found');
	setHeaders({ 'cache-control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300' });
	return found;
};
```

```svelte
<!-- src/routes/[[lang]]/[slug]/+page.svelte -->
<script lang="ts">
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<article>
	<h1>{data.doc.title}</h1>
	{#if data.doc.layout}
		<!-- landings: render layout[] blocks; `content` blocks carry HTML in `body`, `embed` carries editor HTML in `code` -->
		{#each data.doc.layout as block (block.id)}
			{#if block.blockType === 'content' && block.body}{@html block.body}
			{:else if block.blockType === 'embed' && block.code}{@html block.code}{/if}
		{/each}
	{:else if data.doc.content}{@html data.doc.content}{/if}
</article>
<!-- CMS HTML is already sanitised: never render contentMd, never re-parse -->
```

Home: `src/routes/[[lang]]/+page.server.ts` → `const page = await getEnvPage('FRONT_PAGE', locale); if (!page) error(404, 'Not found'); return { doc: page };`. Products: `src/routes/[[lang]]/product/[slug]/+page.server.ts` → tag `/product/${slug}`, `cmsOne<Product>('products', slug, {}, locale)`, rendering `content` and `notice` with `{@html}`. Missing document is always a 404 status, never an empty 200.

## SEO

```ts
// src/lib/seo.ts
export type SeoGroup = 'homepage' | 'posts' | 'pages' | 'products' | 'landings' | 'taxonomies';
const plain = (s = '') => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

function fill(tpl: string, vars: Record<string, string>, sep: string) {
	return tpl.split('%sep%')
		.map((p) => p.replace(/%(\w+)%/g, (_, k: string) => vars[k] ?? '').trim())
		.filter(Boolean) // unknown vars vanish, separator runs collapse
		.join(` ${sep} `);
}

export function resolveSeo(doc: Doc, site: Site, group: SeoGroup, url: URL) {
	const seo = doc.seo ?? {}, t = site.seoTitles ?? {}, sep = t.separator ?? '|';
	const vars = {
		title: doc.title ?? '',
		sitename: site.knowledgeGraph?.name || site.manifest?.name || site.domain || '',
		excerpt: plain(doc.excerpt ?? ''),
		currentyear: String(new Date().getFullYear())
	};
	const grp = t[group] ?? {}, ogIn = seo.openGraph ?? {}, twIn = ogIn.twitterMeta ?? {};
	const title = seo.title?.trim() || fill(grp.titleTemplate || '%title% %sep% %sitename%', vars, sep) || doc.title || '';
	const description = seo.description?.trim() || fill(grp.descriptionTemplate || '%excerpt%', vars, sep);
	const image = ogIn.image?.url || doc.featuredImage?.url || site.seoDefaults?.ogImage?.url || '';
	const fb = twIn.useFacebookData !== false; // seo.openGraph.twitterMeta.useFacebookData, default true → reuse OG values
	const og = { title: ogIn.title || title, description: ogIn.description || description, image };
	return {
		title, description, og,
		robots: seo.robots?.length ? seo.robots.join(',') : null,
		canonical: seo.canonicalOverride || url.origin + url.pathname,
		jsonLd: seo.jsonLd?.raw ?? '', // already a complete <script type="application/ld+json">
		twitter: {
			card: twIn.card || 'summary_large_image',
			title: twIn.title || (fb ? og.title : ''),
			description: twIn.description || (fb ? og.description : ''),
			image: twIn.image?.url || (fb ? image : '')
		}
	};
}
```

```svelte
<!-- src/lib/components/Seo.svelte -->
<script lang="ts">
	import { resolveSeo } from '#lib/seo.js';
	let { seo }: { seo: ReturnType<typeof resolveSeo> } = $props();
</script>

<svelte:head>
	<title>{seo.title}</title>
	<meta name="description" content={seo.description} />
	<link rel="canonical" href={seo.canonical} />
	{#if seo.robots}<meta name="robots" content={seo.robots} />{/if}
	<meta property="og:title" content={seo.og.title} />
	<meta property="og:description" content={seo.og.description} />
	{#if seo.og.image}<meta property="og:image" content={seo.og.image} />{/if}
	<meta name="twitter:card" content={seo.twitter.card} />
	<meta name="twitter:title" content={seo.twitter.title} />
	<meta name="twitter:description" content={seo.twitter.description} />
	{#if seo.twitter.image}<meta name="twitter:image" content={seo.twitter.image} />{/if}
	{@html seo.jsonLd}
</svelte:head>
```

`{@html}` inside `<svelte:head>` emits the string verbatim into the SSR `<head>`. `jsonLd` is already the whole script element, so it is never wrapped or re-serialised.

## Revalidate webhook

```ts
// src/routes/api/cms/revalidate/+server.ts
import type { RequestHandler } from './$types';
import { invalidateAll, invalidateTag } from '#lib/server/cache.js';

const publicPath: Record<string, (slug: string) => string> = {
	products: (slug) => `/product/${slug}`,
	posts: (slug) => `/${slug}`,
	pages: (slug) => `/${slug}`,
	landings: (slug) => `/${slug}`
};

export const POST: RequestHandler = async ({ request }) => {
	let body: { collection?: string; slug?: string; manual?: boolean } = {};
	try { body = await request.json(); } catch { return new Response('bad request', { status: 400 }); }
	const toPath = body.collection ? publicPath[body.collection] : undefined;
	if (!toPath || !body.slug) invalidateAll(); // menus, faqs, shortcodes, authors, site, manual, unknown
	else invalidateTag(toPath(body.slug)); // tag === public path → both locales purge
	return new Response(null, { status: 204 });
};
```

Pure cache purge: no CMS fetch, no trust in the body beyond choosing what to drop, rate-limit at the edge. On Vercel ISR also `fetch(url, { headers: { 'x-prerender-revalidate': BYPASS_TOKEN } })`.

## Caching strategy

| What | TTL | Tag | Purged by |
| --- | --- | --- | --- |
| `getSite()` | 300 s | `site` | site settings, `manual` |
| PRIMARY menu | 300 s | `menu` | menus |
| redirects | 300 s | `redirects` | any, `manual` |
| one document | 60 s | `/{slug}`, `/product/{slug}` | that collection + slug |
| `FRONT_PAGE` | 60 s | `/` | posts, pages, landings |

The cache is per process: fine on `adapter-node`, best-effort on serverless (each instance expires on its own). `s-maxage=60, stale-while-revalidate=300` lets a shared CDN hold pages too. TTL is the fallback for scheduled posts and missed webhooks — never cache misses longer. Per-adapter ISR replaces the in-memory layer for stable pages: with `@sveltejs/adapter-vercel`, export `const config: Config = { isr: { expiration: 60, bypassToken } }` from the page module and revalidate it with the `x-prerender-revalidate` header.

## Redirects

CMS `from`/`to` paths usually end with `/` while SvelteKit renders `/slug`; normalise the request path once in `handle` (308), then match trimmed paths. Run the lookup before rendering:

```ts
// src/hooks.server.ts
import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { cmsList } from '#lib/server/cms.js';
import { cached } from '#lib/server/cache.js';

const trim = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p);
const getRedirects = () =>
	cached('redirects', ['redirects'], 300, async () => {
		const { docs } = await cmsList<Redirect>('redirects', { 'where[isEnabled][equals]': true, limit: 1000, depth: 0 });
		return new Map(docs.map((rule) => [trim(rule.from), rule]));
	});

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.locale = event.url.pathname === '/en' || event.url.pathname.startsWith('/en/') ? 'en' : 'vi';
	const { pathname } = event.url;
	if (pathname.length > 1 && pathname.endsWith('/')) {
		redirect(308, pathname.replace(/\/+$/, '') + event.url.search); // /slug/ → /slug
	}
	if (event.request.method === 'GET' && !event.url.pathname.startsWith('/api/')) {
		const rules = await getRedirects(), start = trim(event.url.pathname);
		let target = start, status: 301 | 302 = 301;
		const seen = new Set([start]);
		for (let hop = 0; hop < 5; hop++) {
			const rule = rules.get(target);
			if (!rule) break;
			const next = trim(rule.to);
			if (seen.has(next)) break; // loop or already-visited hop
			seen.add(next);
			target = next;
			status = rule.statusCode === '302' ? 302 : 301;
		}
		if (target !== start) redirect(status, target + event.url.search);
	}
	return resolve(event, { transformPageChunk: ({ html }) => html.replace('%lang%', event.locals.locale) });
};
```

Declare `App.Locals.locale: 'vi' | 'en'` in `src/app.d.ts`. New rules apply after the webhook purge or the 300 s TTL.

## Locales

`vi` is default at `/`, `en` at `/en/...` with the **same slug** (slugs are not localised). The optional `[[lang]]` param serves `/hello` and `/en/hello`; `params.lang` is `undefined` for `vi` and unknown prefixes 404 in the layout. `/product/{slug}` and `/en/product/{slug}` both resolve because the static `product` segment outranks `[slug]`.

- Every CMS query passes `locale`, including `menus` and `env-page`.
- `fallback-locale=none` detects untranslated content: `cmsOne('pages', slug, { 'fallback-locale': 'none' }, 'en')` leaves missing fields empty instead of surfacing `vi` text under `lang="en"`.
- `%lang%` in `src/app.html` is replaced per request from `locals.locale`, so the document element carries the right language on SSR.
- Canonical stays path-based (`/en/...` for English); pair it with `hreflang` alternates.

## Pitfalls

- `$lib` no longer exists in SvelteKit 3: import `#lib/...` (with `.js` even for `.ts`) and declare the map in `package.json` `imports`.
- `$env/dynamic/private` is deprecated; `$app/env/private` needs `src/env.ts` + `defineEnvVars`. Importing it from a `.svelte` file or a universal `+page.ts` breaks the build — keep CMS code in `src/lib/server/`.
- Use `+page.server.ts`/`+layout.server.ts`, not `+page.ts`: universal loads run in the browser and re-fetch on every client navigation.
- `{@html}` for `content`/`notice`/landing `body`/FAQ `answer` only. Never render `contentMd`, never run a Markdown parser, never strip the HTML to text.
- `seo.jsonLd.raw` is already the whole `<script type="application/ld+json">…</script>`: one `{@html}`. Wrapping it in another `<script>` yields invalid, invisible schema.
- `error()` and `redirect()` must be thrown, not returned, and `error()` accepts 400–599 only. `null` from `cmsOne` must become a 404 status.
- `setHeaders` can set a given header once per request (two loads setting `cache-control` throws) and cannot set cookies.
- `cached()` is per instance, so `invalidateAll()` never reaches sibling serverless instances; the TTL makes scheduled posts appear.
