# React and Angular on KDIGI CMS

Verified with React 19.3 + React Router 7.18 + Vite 8.3 and Angular 22.2 (`@angular/ssr` 22.2) (2026-11).

A client-only SPA is the wrong shape for this CMS: the served HTML is an empty `<div id="root">`, so crawlers and social scrapers see no title, no content and no `seo.jsonLd.raw`, and unknown slugs answer HTTP 200 (soft 404s). Use one of:

- **React + Vite, prerendered** — `scripts/prerender.ts` renders every CMS slug with `react-dom/static` `prerenderToNodeStream`; data comes from React Router loaders.
- **Angular, SSR** — `ng new my-site --ssr`; Express + `@angular/ssr` renders per request and the HTTP transfer cache hydrates without refetching.

Both read the CMS anonymously; see [contract.md](contract.md). No API key, ever.

## Setup

```dotenv
# React — .env
VITE_CMS_URL=https://cms.example.com                      # public by nature: URL + siteKey, no key
VITE_CMS_SITE_KEY=example-site
SITE_URL=https://www.example.com                          # canonical origin for the prerender
DEPLOY_HOOK_URL=https://api.example.com/deploy-hook       # webhook function only, never VITE_*
```

The prerender script loads the same file with `node --env-file=.env`. `media.url` is already absolute: render `<img src={m.url} width={m.width} height={m.height} alt={m.alt ?? ''}>` and allow the CMS host plus any R2/CDN host in your CSP `img-src`.

```ts
// Angular — src/environments/environment.ts (bundled into the browser build; public values only)
export const environment = { cmsUrl: 'https://cms.example.com', cmsSiteKey: 'example-site', siteUrl: 'https://www.example.com' };
```

`server.ts` runs in Node and may read real secrets from `process.env`; the CMS URL and siteKey are not secrets. `HttpClient` already uses the fetch backend — do not add `withFetch()` (deprecated in v22). `NgOptimizedImage` needs a custom `loader` for CMS/R2 hosts; otherwise use a plain `<img>`.

## Fetch helper

Types (`Doc`, `Site`, `List<T>`, `Q`) mirror the contract tables; declare them once in `src/types.ts`.

```ts
// React — src/lib/cms.ts
const CMS = import.meta.env.VITE_CMS_URL;
const SITE_KEY = import.meta.env.VITE_CMS_SITE_KEY;
export type Q = Record<string, string | number | boolean | undefined>;
export type List<T> = { docs: T[]; totalDocs: number; totalPages: number; page: number };
export type Media = { url: string; alt?: string | null; width?: number | null; height?: number | null };
export type Seo = { title?: string | null; description?: string | null; canonicalOverride?: string | null; robots?: string[] | null;
  openGraph?: { title?: string | null; description?: string | null; image?: Media | null;
    twitterMeta?: { card?: string | null; title?: string | null; useFacebookData?: boolean } | null } | null; jsonLd?: { raw?: string | null } | null };
export type Doc = { id: number; title: string; slug: string; excerpt?: string | null; content?: string | null; featuredImage?: Media | null; seo?: Seo | null; [k: string]: unknown };
type SeoGroup = { titleTemplate?: string; descriptionTemplate?: string };
export type Site = { id: number; siteKey: string; domain: string; defaultLanguage: 'vi' | 'en'; pageGroup?: { key: string; pageSlug?: string | null }[];
  seoDefaults?: { ogImage?: Media | null }; knowledgeGraph?: { name?: string | null }; manifest?: { name?: string | null };
  seoTitles?: { separator?: string } & Partial<Record<'homepage' | 'posts' | 'pages' | 'products' | 'landings' | 'taxonomies', SeoGroup>> };

const qs = (p: Q) => new URLSearchParams(Object.entries(p).flatMap(([k, v]) => (v === undefined ? [] : [[k, String(v)]]))).toString();
let siteP: Promise<Site> | undefined;
export function getSite(): Promise<Site> {
  return (siteP ??= (async () => {
    const res = await fetch(`${CMS}/api/sites?${qs({ 'where[siteKey][equals]': SITE_KEY, limit: 1, depth: 1 })}`,
      { headers: { Accept: 'application/json' } });                    // anonymous: no Authorization, no cookies
    const site = res.ok ? ((await res.json()) as List<Site>).docs[0] : undefined;
    if (!site) throw new Error(`CMS ${res.status}`);
    return site;
  })());
}
export async function cmsList<T>(collection: string, params: Q = {}): Promise<List<T>> {
  const site = await getSite();
  const res = await fetch(`${CMS}/api/${collection}?${qs({ 'where[tenant][equals]': site.id, ...params })}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`CMS ${res.status}`);
  return (await res.json()) as List<T>;
}
export const cmsOne = async <T,>(collection: string, params: Q = {}): Promise<T | null> =>
  (await cmsList<T>(collection, { ...params, limit: 1 })).docs[0] ?? null;
export const localeQ = (locale: string, strict = false): Q => (strict ? { locale, 'fallback-locale': 'none' } : { locale });
export async function getEnvPage(key: string, locale = 'vi'): Promise<Doc | null> {
  const res = await fetch(`${CMS}/api/sites/${SITE_KEY}/env-page?${qs({ key, ...localeQ(locale) })}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`CMS ${res.status}`);
  return (await res.json()) as Doc | null;                             // the page document itself, or null when unmapped
}
```

The prerendered file is the build-time cache and the router re-runs loaders in the browser: do not add an HTTP cache that outlives a webhook.

```ts
// Angular — src/app/core/cms.ts
export const localeQ = (locale: string, strict = false): Q => (strict ? { locale, 'fallback-locale': 'none' } : { locale });

@Injectable({ providedIn: 'root' })
export class Cms {
  private readonly http = inject(HttpClient);
  private sitePromise?: Promise<Site>;
  private readonly json = { headers: { Accept: 'application/json' } };

  site(): Promise<Site> {                                              // read once per process
    return (this.sitePromise ??= this.raw<List<Site>>('sites', { 'where[siteKey][equals]': environment.cmsSiteKey, limit: 1, depth: 1 })
      .then(({ docs }) => { if (!docs[0]) throw new Error('unknown siteKey'); return docs[0]; }));
  }
  async list<T>(collection: string, params: Q = {}): Promise<List<T>> {
    const site = await this.site();
    return this.raw<List<T>>(collection, { 'where[tenant][equals]': site.id, ...params });
  }
  async one<T>(collection: string, params: Q = {}): Promise<T | null> {
    return (await this.list<T>(collection, { ...params, limit: 1 })).docs[0] ?? null;
  }
  envPage(key: string, locale = 'vi'): Promise<Doc | null> {
    const url = `${environment.cmsUrl}/api/sites/${environment.cmsSiteKey}/env-page?${new URLSearchParams({ key, locale })}`;
    return firstValueFrom(this.http.get<Doc | null>(url, this.json));
  }
  async resolveSlug(slug: string, l: Q): Promise<Doc | null> {          // landing → page → post
    const landing = await this.one<Doc>('landings', { 'where[slug][equals]': slug, 'where[isDisabled][not_equals]': 'true', ...l });
    if (landing) return landing;
    return (await this.one<Doc>('pages', { 'where[slug][equals]': slug, ...l })) ?? await this.one<Doc>('posts', { 'where[slug][equals]': slug, ...l });
  }
  private async raw<T>(path: string, params: Q): Promise<T> {
    const url = `${environment.cmsUrl}/api/${path}?${new URLSearchParams(Object.entries(params).flatMap(([k, v]) => (v === undefined ? [] : [[k, String(v)]])))}`;
    const hit = readCache(url);                                        // server-process cache, see Caching strategy
    if (hit) return JSON.parse(hit) as T;
    // Accept only: no Authorization header, no cookies, no withCredentials
    const body = await firstValueFrom(this.http.get<T>(url, this.json));
    writeCache(url, JSON.stringify(body));
    return body;
  }
}
```

`provideClientHydration()` transfer-caches these into `TransferState` during SSR, so the first client render does not refetch. Requests carrying `Authorization` or `Cookie` are skipped by that cache — another reason to stay anonymous.

## Layout: site, menu, lang

```tsx
// React — src/app/layout.tsx
export function Layout() {
  const { site, items } = useLoaderData() as { site: Site; items: MenuItem[] };
  const { pathname } = useLocation();
  useEffect(() => { document.documentElement.lang = pathname.startsWith('/en') ? 'en' : 'vi'; }, [pathname]);
  return <><header><a href="/">{site.knowledgeGraph?.name ?? site.domain}</a><Nav items={items} /></header><main><Outlet /></main></>;
}
const Nav = ({ items }: { items: MenuItem[] }) =>                        // items[].children nests up to 10 levels
  <ul>{items.map(it => <li key={it.id}><a href={it.url}>{it.label}</a>
    {it.children?.length ? <Nav items={it.children} /> : null}</li>)}</ul>;

// on the layout route in routes.tsx
loader: async () => ({
  site: await getSite(),
  items: (await cmsOne<Menu>('menus', { 'where[location][equals]': 'PRIMARY', ...localeQ('vi') }))?.items ?? [],
}),
```

React cannot render `<html>`: the prerender template writes `lang` (see Catch-all) and `Layout` keeps it correct on client navigations. A missing `PRIMARY` menu doc means render nothing.

```ts
// Angular — src/app/layout/layout.resolver.ts and nav.component.ts
export const layoutResolver = (locale: Locale): ResolveFn<LayoutData> => () => {
  const cms = inject(Cms);
  inject(DOCUMENT).documentElement.lang = locale;                       // serialised into the SSR response
  return Promise.all([cms.site(), cms.one<Menu>('menus', { 'where[location][equals]': 'PRIMARY', ...localeQ(locale) })])
    .then(([site, menu]) => ({ site, items: menu?.items ?? [] }));
};

@Component({
  selector: 'app-nav',
  imports: [NgTemplateOutlet],
  template: `
    <ng-template #tree let-items><ul>@for (item of items; track item.id) {
      <li><a [href]="item.url">{{ item.label }}</a>
        @if (item.children?.length) { <ng-container [ngTemplateOutlet]="tree" [ngTemplateOutletContext]="{ $implicit: item.children }" /> }
      </li>}</ul></ng-template>
    <ng-container [ngTemplateOutlet]="tree" [ngTemplateOutletContext]="{ $implicit: items() }" />`,
})
export class NavComponent { readonly items = input<MenuItem[]>([]); }
```

`LayoutComponent` reads the resolved data as `readonly layout = input.required<LayoutData>()` (`withComponentInputBinding()`) and renders header + `<router-outlet />`.

## Catch-all route

```ts
// React — src/lib/resolve.ts and the routes.tsx children
const must = <T,>(v: T | null): T => { if (!v) throw new Response('Not found', { status: 404 }); return v; };

export async function resolveDoc(kind: 'product' | null, slug: string, l: Q) {
  if (kind === 'product') return { kind, doc: must(await cmsOne<Doc>('products', { 'where[slug][equals]': slug, ...l })) };
  const landing = await cmsOne<Doc>('landings', { 'where[slug][equals]': slug, 'where[isDisabled][not_equals]': 'true', ...l });
  if (landing) return { kind: 'landing' as const, doc: landing };
  const page = await cmsOne<Doc>('pages', { 'where[slug][equals]': slug, ...l });
  return page ? { kind: 'page' as const, doc: page } : { kind: 'post' as const, doc: must(await cmsOne<Doc>('posts', { 'where[slug][equals]': slug, ...l })) };
}

{ index: true, loader: async () => ({ kind: 'page' as const, doc: must(await getEnvPage('FRONT_PAGE')) }), Component: DocView },
{ path: 'product/:slug', loader: ({ params }) => resolveDoc('product', params.slug!, localeQ('vi')), Component: DocView },
{ path: ':slug', loader: ({ params }) => resolveDoc(null, params.slug!, localeQ('vi')), Component: DocView },
{ path: '*', Component: NotFound },
```

`DocView` renders `doc.title`, `doc.excerpt` and `<div dangerouslySetInnerHTML={{ __html: doc.content ?? '' }} />`. Landings: switch on `blockType` — `content.body` is HTML, `embed` is raw editor HTML; products: `notice` is HTML, `prices[]`/`hero.slider[]` are data. A thrown `Response` reaches the error boundary, and the prerender writes `404.html`.

```tsx
// src/entry-server.tsx (build time) and scripts/prerender.ts
const ORIGIN = process.env.SITE_URL!;

export async function render(url: string) {
  const { query, dataRoutes } = createStaticHandler(routes);
  const context = await query(new Request(`${ORIGIN}${url}`));
  if (context instanceof Response) return { status: context.status, body: '', head: '' };
  const { prelude } = await prerenderToNodeStream(<StaticRouterProvider router={createStaticRouter(dataRoutes, context)} context={context} />);
  let body = '';
  for await (const chunk of prelude) body += chunk;                   // prelude is a Node Readable
  const data = Object.values(context.loaderData) as { doc?: Doc; site?: Site }[];
  const site = data.find(d => d?.site)?.site ?? (await getSite());
  const doc = data.find(d => d?.doc)?.doc;
  const group = url.startsWith('/product/') ? 'products' : 'pages';
  // context.statusCode is 404 when a loader threw its 404 Response
  return { status: context.statusCode, body, head: doc ? renderHead(resolveSeo(site, doc, group, `${ORIGIN}${url}`)) : '' };
}

const template = await readFile('dist/client/index.html', 'utf8');
for (const path of paths) {                                           // '/', '/en/', '/{slug}', '/product/{slug}'
  const { status, body, head } = await render(path);
  if (status !== 200 && status !== 404) continue;                     // loader redirect: emit a redirect rule instead
  const html = template
    .replace('<html lang="vi"', `<html lang="${path.startsWith('/en/') ? 'en' : 'vi'}"`)
    .replace('<!--app-head-->', head)                                 // raw HTML; the JSON-LD script is already an element
    .replace('<!--app-html-->', body);
  const file = join('dist/client', status === 404 ? '404.html' : path === '/' ? 'index.html' : `${path.slice(1)}/index.html`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, html);
}
```

Order: `vite build`, `vite build --ssr src/entry-server.tsx --outDir dist/server`, `node --env-file=.env scripts/prerender.ts`. `paths` comes from the CMS (`limit=1000&depth=0&select[slug]=true` over `landings`, `pages`, `posts`, `products`, both locales). `index.html` holds the two placeholders and `<html lang="vi">`. The client entry hydrates the same `routes` with `createBrowserRouter` + `hydrateRoot`; `StaticRouterProvider` already emitted `window.__staticRouterHydrationData`, so loaders do not refetch on first paint.

```ts
// Angular — src/app/doc/doc.resolver.ts and doc-page.component.ts
export const docResolver: ResolveFn<Doc | null> = async (route) => {
  const init = inject(RESPONSE_INIT, { optional: true });             // null in CSR, prerender and builds
  const cms = inject(Cms);
  const l = localeQ((route.data['locale'] as Locale) ?? 'vi');
  const slug = route.paramMap.get('slug')!;
  const doc = route.data['kind'] === 'product' ? await cms.one<Doc>('products', { 'where[slug][equals]': slug, ...l }) : await cms.resolveSlug(slug, l);
  if (!doc && init) init.status = 404;                                // real 404 status on SSR
  return doc;
};

@Component({ selector: 'app-doc', template: `
  @if (doc(); as d) { <article><h1>{{ d.title }}</h1><div class="prose" [innerHTML]="html()"></div></article> }
  @else { <app-not-found /> }` })
export class DocPage {
  private readonly sanitizer = inject(DomSanitizer);
  readonly doc = input.required<Doc | null>();
  readonly html = computed(() => this.sanitizer.bypassSecurityTrustHtml(this.doc()?.content ?? ''));
}
```

Server routing: `app.routes.server.ts` → `{ path: '**', renderMode: RenderMode.Server }` (add `RenderMode.Prerender` for slugs pinned at build time). Plain `[innerHTML]` sanitises and strips `<iframe>`/`<script>`/`style`; `bypassSecurityTrustHtml` is only for CMS HTML (`content`, `notice`, landing `body`/`embed`), never for user input.

## SEO

```ts
// shared plain TS — src/lib/seo.ts (Angular: src/app/core/seo.ts)
const DEFAULT_TITLE: Record<string, string> = { homepage: '%sitename%', taxonomies: '%term% %sep% %sitename%' };

export function resolveSeo(site: Site, doc: Doc, group: string, url: string) {
  const sep = site.seoTitles?.separator ?? '|';
  const sitename = site.knowledgeGraph?.name ?? site.manifest?.name ?? site.domain;
  const excerpt = (doc.excerpt ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const vars: Record<string, string> = { title: doc.title, sitename, sep, excerpt, currentyear: String(new Date().getFullYear()) };
  const fill = (tpl: string) => tpl
    .replace(/%(\w+)%/g, (_, k: string) => vars[k.toLowerCase()] ?? '')   // unknown variables vanish
    .split(sep).map(s => s.trim()).filter(Boolean).join(` ${sep} `);      // collapse dangling separators
  const tpl = site.seoTitles?.[group as 'pages'], seo = doc.seo ?? {}, og = seo.openGraph ?? {}, tw = og.twitterMeta ?? {};
  const title = seo.title?.trim() || fill(tpl?.titleTemplate || DEFAULT_TITLE[group] || '%title% %sep% %sitename%') || doc.title;
  const description = seo.description?.trim() || fill(tpl?.descriptionTemplate || '%excerpt%');
  return {
    title, description, canonical: seo.canonicalOverride || url, robots: seo.robots?.join(',') ?? '',
    image: og.image?.url ?? doc.featuredImage?.url ?? site.seoDefaults?.ogImage?.url ?? '',
    ogTitle: og.title || title, ogDescription: og.description || description, card: tw.card || 'summary_large_image',
    twTitle: tw.title || (tw.useFacebookData === false ? '' : og.title || title),   // seo.openGraph.twitterMeta, default reuse OG
    jsonLd: seo.jsonLd?.raw ?? '',                                    // already a full <script type="application/ld+json">
  };
}
```

```ts
// React — src/lib/head.ts, injected into <!--app-head-->
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const renderHead = (s: ReturnType<typeof resolveSeo>) => `<title>${esc(s.title)}</title>
<meta name="description" content="${esc(s.description)}">${s.robots ? `\n<meta name="robots" content="${esc(s.robots)}">` : ''}
<link rel="canonical" href="${esc(s.canonical)}">
<meta property="og:title" content="${esc(s.ogTitle)}">
<meta property="og:description" content="${esc(s.ogDescription)}">${s.image ? `\n<meta property="og:image" content="${esc(s.image)}">` : ''}
<meta name="twitter:card" content="${esc(s.card)}">
<meta name="twitter:title" content="${esc(s.twTitle)}">
<meta name="twitter:description" content="${esc(s.ogDescription)}">
${s.jsonLd}`;                                                         // verbatim: never escape, wrap or re-serialise
```

```ts
// Angular — src/app/core/seo.service.ts, called from the document resolver
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly doc = inject(DOCUMENT);

  apply(site: Site, doc: Doc, group: string, url: string) {
    const s = resolveSeo(site, doc, group, url);
    this.title.setTitle(s.title);
    this.meta.updateTag({ name: 'description', content: s.description });
    this.meta.updateTag({ name: 'robots', content: s.robots || 'index,follow' });
    for (const [attr, key, value] of [['property', 'og:title', s.ogTitle], ['property', 'og:description', s.ogDescription], ['property', 'og:image', s.image],
      ['name', 'twitter:card', s.card], ['name', 'twitter:title', s.twTitle], ['name', 'twitter:description', s.ogDescription]] as const) {
      if (value) this.meta.updateTag({ [attr]: key, content: value });
    }
    this.doc.head.querySelector('link[rel="canonical"]')?.remove();
    const link = this.doc.createElement('link');
    link.rel = 'canonical';
    link.href = s.canonical;
    this.doc.head.appendChild(link);
    this.doc.head.querySelector('script[type="application/ld+json"][data-kcms]')?.remove();
    if (s.jsonLd) {
      const holder = this.doc.createElement('div');
      holder.innerHTML = s.jsonLd;                                    // parse the finished element, do not rebuild it
      const script = holder.firstElementChild;
      if (script) { script.setAttribute('data-kcms', ''); this.doc.head.appendChild(script); }
    }
  }
}
```

`[innerHTML]` cannot emit the JSON-LD: the sanitizer drops `<script>`, and nesting it inside your own `<script>` is invalid. Parsing the string into a detached element and appending that node to `DOCUMENT.head` works on the server (SSR serialises it) and in the browser, with no sanitizer bypass. Angular applies it again on every navigation because the resolver runs; in React set `document.title` (and the description meta) in `DocView` after client-side transitions, since `renderHead` only ran at build time.

## Revalidate webhook

```ts
// React — api/cms/revalidate.ts, mounted on the host's function runtime
const SLUGGED = new Set(['posts', 'pages', 'landings', 'products']);
let timer: ReturnType<typeof setTimeout> | undefined;

export async function POST(req: Request): Promise<Response> {
  const hook = process.env.DEPLOY_HOOK_URL;
  if (!hook) return Response.json({ ok: false, reason: 'DEPLOY_HOOK_URL unset' }, { status: 503 });
  let body: { collection?: string; slug?: string } = {};
  try { body = await req.json(); } catch { /* manual */ }
  const path = body.collection && body.slug && SLUGGED.has(body.collection)
    ? body.collection === 'products' ? `/product/${body.slug}` : `/${body.slug}`
    : '*';                                                            // menus, faqs, shortcodes, authors, site, manual, unknown
  clearTimeout(timer);                                                // one save fires several calls: rebuild once
  timer = setTimeout(() => { void fetch(hook, { method: 'POST' }).catch(() => {}); }, 10_000);
  return Response.json({ ok: true, path }, { status: 202 });           // idempotent, no CMS fetch inside
}
```

```ts
// Angular — src/server.ts
const SLUGGED = new Set(['posts', 'pages', 'landings', 'products']);
const app = express();
const angularApp = new AngularNodeAppEngine();

app.post('/api/cms/revalidate', express.json(), (req, res) => {
  const { collection, slug } = (req.body ?? {}) as { collection?: string; slug?: string };
  purge(collection && slug && SLUGGED.has(collection) ? collection === 'products' ? `/product/${slug}` : `/${slug}` : ''); // '' = whole site
  void loadRedirects();                                               // the rule list may have changed too
  res.status(202).json({ ok: true });                                  // no CMS call in the handler
});

app.use((req, res, next) => { angularApp.handle(req).then(r => (r ? writeResponseToNodeResponse(r, res) : next())).catch(next); });
export const reqHandler = createNodeRequestHandler(app);
```

Register the JSON route **before** the Angular middleware or the router swallows it. A pure CSR build with no prerendering: **N/A** — nothing to purge, but every SEO problem above remains.

## Caching strategy

**React** — the build output is the cache: each slug is a file behind the CDN, purged by redeploying from the webhook. Serve HTML with `Cache-Control: public, max-age=0, s-maxage=86400, stale-while-revalidate=600`; run a daily cron rebuild as the TTL fallback so scheduled posts appear, and never treat "absent at build time" as permanently gone.

```ts
// Angular — src/app/core/cms-cache.ts: one Map per server process, shared with server.ts
const TTL = 60_000;
const store = new Map<string, { at: number; body: string }>();
export function readCache(key: string): string | undefined {
  const hit = store.get(key);
  return hit && Date.now() - hit.at < TTL ? hit.body : undefined;
}
export const writeCache = (key: string, body: string) => void store.set(key, { at: Date.now(), body });
export function purge(prefix = '') { for (const key of store.keys()) if (!prefix || key.includes(prefix)) store.delete(key); }
```

Site and menu docs are read once per process (`sitePromise`), documents live 60 s, the webhook purges by path, and the TTL is what surfaces a scheduled post with no webhook at all. Switching `app.routes.server.ts` to `RenderMode.Prerender` + `getPrerenderParams` makes the build output the cache, and the webhook must rebuild instead (as in React). SSR HTML: `Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=300`.

## Redirects

```ts
// shared plain TS — src/lib/redirects.ts (the Angular server imports the same file)
export const norm = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p);
export function resolveRedirect(rules: Redirect[], from: string) {
  const seen = new Set([norm(from)]);
  let rule = rules.find(r => norm(r.from) === norm(from));
  for (let hop = 0; rule && hop < 5; hop++) {                       // hop cap: breaks chains and loops
    const next = rules.find(r => norm(r.from) === norm(rule!.to));
    if (!next || seen.has(norm(next.to))) break;
    seen.add(norm(next.to));
    rule = next;
  }
  return rule;
}

// scripts/redirects.ts, called by the prerender
const rules = (await cmsList<Redirect>('redirects', { 'where[isEnabled][equals]': 'true', limit: 1000, depth: 0 })).docs;
await writeFile('dist/_redirects', rules.map(r => `${norm(r.from)}  ${resolveRedirect(rules, r.from)!.to}  ${r.statusCode}`).join('\n'));
```

Emit the resolved final target, not the chain. Format follows the host (`_redirects` for Netlify/Cloudflare Pages, `vercel.json` for Vercel); normalise trailing slashes on both sides and redirect `/slug/` → `/slug` so each page has one URL. The host still needs an explicit "unknown path → `404.html`, status 404" rule.

```ts
// Angular — src/server/redirects.ts (plain fetch: Express middleware has no DI)
import { norm, resolveRedirect } from '../lib/redirects';
let rules: Redirect[] = [];

export async function loadRedirects() {
  const api = (path: string, params: Record<string, string>) =>
    fetch(`${environment.cmsUrl}/api/${path}?${new URLSearchParams(params)}`, { headers: { Accept: 'application/json' } }).then(r => r.json());
  const { docs } = await api('sites', { 'where[siteKey][equals]': environment.cmsSiteKey, limit: '1' });
  if (docs[0]) rules = (await api('redirects', { 'where[tenant][equals]': String(docs[0].id), 'where[isEnabled][equals]': 'true', limit: '1000', depth: '0' })).docs;
}

export function redirects(req: Request, res: Response, next: NextFunction) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (norm(req.path) !== req.path) return res.redirect(301, norm(req.path) + req.url.slice(req.path.length)); // trailing slash
  const rule = resolveRedirect(rules, req.path);
  return rule ? res.redirect(Number(rule.statusCode) === 302 ? 302 : 301, rule.to) : next();
}
```

`app.use(redirects)` before the Angular middleware; `await loadRedirects()` at boot and again from the webhook. `statusCode` arrives as a string (`'301'`/`'302'`).

## Locales

`vi` at `/`, `en` under `/en/...` — the **same slugs**, because `slug` is not localised.

```tsx
// React — one factory, two trees
const contentRoutes = (locale: Locale): RouteObject[] => [
  { index: true, loader: async () => ({ kind: 'page' as const, doc: must(await getEnvPage('FRONT_PAGE', locale)) }), Component: DocView },
  { path: 'product/:slug', loader: ({ params }) => resolveDoc('product', params.slug!, localeQ(locale)), Component: DocView },
  { path: ':slug', loader: ({ params }) => resolveDoc(null, params.slug!, localeQ(locale)), Component: DocView },
];
// children: [...contentRoutes('vi'), { path: 'en', children: contentRoutes('en') }, { path: '*', Component: NotFound }]

const strict = await cmsOne<Doc>('pages', { 'where[slug][equals]': slug, ...localeQ('en', true) });
const untranslated = Boolean(strict) && !strict!.title;               // fallback-locale=none exposes what is missing
```

The prerender writes `<html lang>` per path; every query sends `locale` (so English requests add `?locale=en`), and `Layout` keeps `lang` correct on client navigation. Show a "not translated yet" notice when the strict query comes back empty.

```ts
// Angular — same two trees, locale carried in route data
const contentRoutes = (locale: Locale): Routes => [
  { path: '', component: HomePage, resolve: { doc: () => inject(Cms).envPage('FRONT_PAGE', locale) } },
  { path: 'product/:slug', component: DocPage, data: { locale, kind: 'product' }, resolve: { doc: docResolver } },
  { path: ':slug', component: DocPage, data: { locale }, resolve: { doc: docResolver } },
];
export const routes: Routes = [
  { path: 'en', component: LayoutComponent, resolve: { layout: layoutResolver('en') }, children: contentRoutes('en') },   // static before :slug
  { path: '', component: LayoutComponent, resolve: { layout: layoutResolver('vi') }, children: contentRoutes('vi') },
  { path: '**', component: NotFoundPage },
];
```

Every query carries `locale`; `layoutResolver` sets `documentElement.lang` on the server. `LOCALE_ID`/`registerLocaleData` matter only for dates and numbers you format yourself — fields come localised from the CMS.

## Pitfalls

- **Shipping `renderToString` output to `createRoot`.** Prerendered markup must be hydrated with `hydrateRoot`, otherwise React discards it and you are back to CSR.
- **Using `<BrowserRouter>` for the prerender.** Loaders only run under the data router (`createStaticHandler` → `createStaticRouter` → `StaticRouterProvider`); with plain `Routes` the serialised page is empty.
- **Assuming the static host 404s.** It serves 200 for anything: write `404.html`, configure the host to serve it with status 404, and never prerender an unpublished slug.
- **HTML/Markdown confusion.** `dangerouslySetInnerHTML` and `bypassSecurityTrustHtml` are for `content`, `notice` and landing `body`/`embed` only — `contentMd`/`noticeMd`/`bodyMd` are Markdown.
- **Calling `provideHttpClient(withFetch())`.** Deprecated in Angular 22; fetch is already the default backend.
- **Branching templates on `isPlatformBrowser`.** Causes hydration mismatches and layout shift; use `afterNextRender`/`afterEveryRender`.
- **Mutating `RESPONSE_INIT` unguarded.** It is `null` in CSR, prerender and builds — inject with `{ optional: true }` first.
- **Authenticated or cross-tenant reads.** No `Authorization`, no cookies, no `credentials: 'include'`; every content query needs `where[tenant][equals]`.
