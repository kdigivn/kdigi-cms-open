import { postgresAdapter } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'
import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { en } from '@payloadcms/translations/languages/en'
import { vi } from '@payloadcms/translations/languages/vi'
import { cloudStoragePlugin } from '@payloadcms/plugin-cloud-storage'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Authors } from './collections/authors'
import { RatingEvents } from './collections/rating-events'

import { Comments } from './collections/comments'
import { Faqs } from './collections/faqs'
import { Landings } from './collections/landings'
import { Products } from './collections/products'
import { Media } from './collections/media'
import { Menus } from './collections/menus'
import { Pages } from './collections/pages'
import { Posts } from './collections/posts'
import { Redirects } from './collections/redirects'
import { Shortcodes } from './collections/shortcodes'
import { Sites } from './collections/sites'
import { Taxonomies } from './collections/taxonomies'
import { Users } from './collections/users'

import { submitRatingEndpoint } from './endpoints/submit-rating'
import { revalidateFrontendEndpoint } from './endpoints/revalidate-frontend'
import { frontendDocUrlEndpoint } from './endpoints/frontend-doc-url'

import { seoAiGenerateEndpoint } from './endpoints/seo-ai-generate'
import { seoAuditEndpoint } from './endpoints/seo-audit'
import { internalLinkSuggestEndpoint } from './endpoints/internal-link-suggest'
import { r2StorageAdapter } from './lib/r2-storage-adapter'
import { revalidateFrontendTask } from './jobs/revalidate-frontend-task'

import { foldersCollectionOverride } from './collections/payload-folders-tenant-scope'
import { applyPremiumAdminPresentation } from './lib/apply-premium-admin-presentation'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// Startup security warning — does NOT hard-fail deploy (intentional).
// Per validate 12/06: keep deploy going, surface the gap loudly.
if (process.env.NODE_ENV === 'production' && !process.env.RECAPTCHA_SECRET) {
  console.warn(
    '[SECURITY] RECAPTCHA_SECRET not set — /api/comments/create is undefended against spam. ' +
      'Set RECAPTCHA_SECRET to enable reCAPTCHA verification on comment submission.',
  )
}

// Jobs: revalidate is queued, not awaited. If no instance runs
// the scheduler the queue only grows — surface that at boot instead of letting
// content authors wonder why the frontend never refreshes.
if (process.env.NODE_ENV === 'production' && process.env.ENABLE_JOBS_AUTORUN !== 'true') {
  console.warn(
    '[CONFIG] ENABLE_JOBS_AUTORUN is not true — queued revalidate jobs will not run. ' +
      'Set it on exactly one instance (the scheduler is not multi-replica safe).',
  )
}

/**
 * Media storage (always registered): the hybrid adapter uses Cloudflare R2 for sites that
 * have Sites.r2 config (per-site bucket + credentials, access: read: false) and falls back
 * to local disk (./media or MEDIA_DIR) for every other site — so a fresh install needs no
 * R2 at all. R2_OFF=true forces local disk even when a site has R2 config (dev against a
 * copy of production data). The Media beforeChange hook sets req.context.tenantId before upload.
 */
const mediaStoragePlugin = cloudStoragePlugin({
  collections: {
    media: {
      adapter: r2StorageAdapter,
    },
  },
})

// serverURL locks Payload's CORS + CSRF origin list. If the browser's Origin is not
// in this list, Payload silently drops cookie auth → req.user is null → every admin
// API call and server-function fails with 403 "not allowed" / Unauthorized (while
// RSC page loads, which carry no Origin header, still render). Next dev binds :3001
// when :3000 is taken, so the admin origin can differ from serverURL — include the
// localhost dev ports (dev only) so cookie auth is never rejected by a port
// mismatch. :3101 is the dedicated E2E server (playwright.config.ts) which runs with
// NEXT_PUBLIC_E2E=1 and must never be reused from a normal dev server (RT-15).
const serverURL = process.env.PAYLOAD_PUBLIC_SERVER_URL || 'http://localhost:3000'
const adminOrigins = Array.from(
  new Set([
    serverURL,
    ...(process.env.NODE_ENV === 'production'
      ? []
      : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3101']),
  ]),
)

export default buildConfig({
  serverURL,
  // Explicit CORS + CSRF allowlists (superset of serverURL) so the admin works on
  // whichever localhost port Next dev binds. See adminOrigins note above.
  cors: adminOrigins,
  csrf: adminOrigins,
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
    theme: 'all',
    // Whitelabel the admin: browser tab title + favicon → KDIGI CMS (replaces the
    // default "Payload" branding). titleSuffix is appended to every admin page
    // title; icons inject <link rel="icon"> using the KDIGI mark (public/brand).
    meta: {
      title: 'KDIGI CMS',
      titleSuffix: ' — KDIGI CMS',
      description: 'Bảng điều khiển quản trị KDIGI CMS',
      // Absolute URLs: Payload's /api/og route renders these via @vercel/og
      // (Satori), which rejects relative image sources ("Image source must be an
      // absolute URL"). serverURL is the public origin in prod, localhost in dev.
      icons: [
        { rel: 'icon', type: 'image/svg+xml', url: `${serverURL}/brand/kdigi-mark.svg` },
        { rel: 'apple-touch-icon', type: 'image/svg+xml', url: `${serverURL}/brand/kdigi-mark.svg` },
      ],
      openGraph: {
        title: 'KDIGI CMS',
        description: 'Bảng điều khiển quản trị KDIGI CMS',
      },
      // No og:image for admin pages. Payload's default ('dynamic') points
      // og:image at /api/og, which renders the custom Icon component through
      // Satori — and Satori rejects the relative <img src> that component uses
      // for the nav sidebar, throwing mid-stream ("Image source must be an
      // absolute URL" → "failed to pipe response"). A social preview card for
      // a private admin panel has no audience, so turn the route off rather
      // than duplicate the brand mark behind an absolute URL. 'off' also drops
      // the og:image tag entirely, so nothing requests /api/og any more.
      defaultOGImageType: 'off',
    },
    // Suppresses React hydration mismatch warnings caused by browser extensions
    // (e.g. Swiftread) that inject data-* attributes on <html> before React hydrates.
    suppressHydrationWarning: true,
    components: {
      providers: ['@/components/admin/css-injector#CSSInjector'],
      Nav: '@/components/admin/admin-nav#AdminNav',
      graphics: {
        Logo: '@/components/admin/logo#Logo',
        Icon: '@/components/admin/icon#Icon',
      },
      beforeLogin: ['@/components/admin/login-workspace-panel#LoginWorkspacePanel'],
      beforeNavLinks: [
        '@/components/admin/nav-home-link#NavHomeLink',
        '@/components/admin/content-calendar/nav-content-calendar-link#NavContentCalendarLink',
      ],
      views: {
        dashboard: {
          Component: '@/components/admin/editorial-dashboard-view#EditorialDashboardView',
          path: '/',
        },
        // SP1a-3: tenant-scoped month grid / agenda of dated content.
        contentCalendar: {
          Component: '@/components/admin/content-calendar/content-calendar-view#ContentCalendarView',
          path: '/content-calendar',
        },
      },
    },
  },
  collections: [Users, Media, Sites, Taxonomies, Authors, Menus, Faqs, Pages, Posts, Comments, Products, Landings, Shortcodes, Redirects, RatingEvents],
  // create-comment + env-page live on their collections (their URLs sit inside
  // collection namespaces, which the collection REST router owns).
  endpoints: [submitRatingEndpoint, revalidateFrontendEndpoint, frontendDocUrlEndpoint, seoAiGenerateEndpoint, seoAuditEndpoint, internalLinkSuggestEndpoint],
  // Keep folder data on collections (Media uses folders: true) but hide Payload's
  // global "Browse by Folder" nav view — folder browsing is handled by the custom
  // Media grid (media-grid-list-view + media-folder-bar) instead.
  folders: {
    browseByFolder: false,
    collectionOverrides: [foldersCollectionOverride],
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI || '',
      // Raise THIS app's idle-in-transaction ceiling above the managed Postgres
      // default (30s). Payload write operations legitimately hold a transaction open
      // while afterChange hooks / the R2 storage adapter do external I/O (frontend
      // revalidate, R2 upload). pg_stat_activity showed
      // wait_event=ClientRead — the app busy on that I/O, NOT the DB — being force-killed
      // at 30s, which surfaced as the idle-in-transaction crash loop. 2 min gives those
      // operations room while still reaping a genuinely leaked transaction.
      options: '-c idle_in_transaction_session_timeout=120000',
      // node-postgres defaults to max:10 with an unbounded wait for a free
      // connection. Because a media upload holds its connection for the whole
      // transcode + R2 upload, a burst of uploads claimed every connection and
      // left the rest of the admin queued behind them indefinitely — the
      // dashboard simply stopped responding, with no error to point at. A
      // larger ceiling keeps ordinary admin traffic served while a batch
      // uploads (still far under Postgres' max_connections for one app
      // instance), and the connect timeout turns any remaining starvation into
      // a visible error instead of a silent hang.
      max: 20,
      connectionTimeoutMillis: 10_000,
    },
    push: false, // Disable schema push in dev — run migrations manually instead
  }),
  editor: lexicalEditor(),

  // ── Jobs (SP0-R3) ──────────────────────────────────────────────────────────
  // Content saves queue a frontend-revalidate job instead of awaiting it; see
  // src/jobs/*.task.ts and src/hooks/publish-hook-guards.ts.
  //
  // autoRun is gated by ENABLE_JOBS_AUTORUN so exactly ONE instance runs the
  // scheduler: with more than one replica, every replica would poll the same queue
  // (Payload has no cross-instance job lock). The env flag also gates the
  // stale-claim recovery in onInit.
  //
  // `jobs.access.run` is deliberately NOT the permissive default: without it,
  // anyone could call `/api/payload-jobs/run` and trigger duplicate
  // executions (RT-8).
  jobs: {
    tasks: [revalidateFrontendTask],
    deleteJobOnComplete: true,
    autoRun:
      process.env.ENABLE_JOBS_AUTORUN === 'true'
        ? [
            {
              // Payload supports the six-field (seconds-first) cron syntax:
              // every 10 seconds, 25 jobs per pass.
              cron: '*/10 * * * * *',
              queue: 'default',
              limit: 25,
            },
          ]
        : undefined,
    access: {
      run: ({ req }) => (req.user as unknown as { role?: string } | null)?.role === 'super-admin',
    },
  },

  // Public API surface #2 — hardened. REST remains the primary frontend channel.
  // Both keys verified to exist in payload@3.33.0 (node_modules/payload/dist/config/types.d.ts:826-827).
  graphQL: {
    disablePlaygroundInProduction: true,
    maxComplexity: 500,
  },

  // vi (default) + en localization. Fallback: missing en field falls back to vi value.
  localization: {
    locales: ['vi', 'en'],
    defaultLocale: 'vi',
    fallback: true,
  },

  // Admin UI language (separate from `localization`, which is content-level).
  // Without this, Payload defaults the admin chrome + `{ vi, en }` label objects
  // to English. fallbackLanguage applies to users with no saved preference;
  // existing users keep their stored language until reset (see migration).
  i18n: {
    fallbackLanguage: 'vi',
    supportedLanguages: { vi, en },
    // Payload's `vi` bundle ships English defaults for these keys. Override so the
    // header localizer reads "Ngôn ngữ nội dung" and the account menu reads
    // "Ngôn ngữ giao diện" — otherwise the two language choices look identical.
    translations: {
      vi: {
        authentication: { apiKey: 'Khóa API' },
        general: { locale: 'Ngôn ngữ nội dung', language: 'Ngôn ngữ giao diện' },
      },
      en: {
        general: { locale: 'Content language', language: 'Interface language' },
      },
    },
  },

  plugins: [
    multiTenantPlugin({
      // `sites` is the tenant collection (tenantsSlug default is 'sites', override here)
      tenantsSlug: 'sites',
      tenantField: { label: { vi: 'Website', en: 'Website' } },
      // Users may update their own document (password, name), but only a
      // super-admin may change which sites a user belongs to — otherwise any
      // editor could PATCH themselves into every site.
      tenantsArrayField: {
        arrayFieldAccess: { update: ({ req: { user } }) => user?.role === 'super-admin' },
      },
      i18n: {
        translations: {
          vi: {
            'assign-tenant-button-label': 'Gán website',
            'assign-tenant-modal-title': 'Gán website cho "{{title}}"',
            'field-assignedTenant-label': 'Website được gán',
            'nav-tenantSelector-label': 'Chọn website',
          },
        },
      },

      // Content collections that receive the auto-injected `tenant` relationship field.
      // Sites itself is the tenant collection, not a tenant-scoped collection.
      collections: {
        pages: {},
        posts: {},
        taxonomies: {},
        menus: {},
        faqs: {},
        authors: {},
        comments: {},
        products: {},
        landings: {},
        shortcodes: {},
        redirects: {},
      },

      // super-admin bypasses all tenant filters (sees all tenants in list + reads).
      userHasAccessToAllTenants: (user) => {
        const u = user as unknown as { role?: string }
        return u?.role === 'super-admin'
      },
    }),
    mediaStoragePlugin,
    // Apply display metadata after plugins inject their tenant fields.
    (config) => ({ ...config, collections: applyPremiumAdminPresentation(config.collections ?? []) }),
  ],

  secret: process.env.PAYLOAD_SECRET || '',
  // Fail fast at server boot (NOT module top-level — `next build` runs with
  // NODE_ENV=production and no PAYLOAD_SECRET, so a top-level throw would break the build).
  // An empty/short secret signs admin JWTs with a forgeable key → auth bypass.
  onInit: async (payload) => {
    if (process.env.NODE_ENV === 'production' && (process.env.PAYLOAD_SECRET ?? '').length < 32) {
      throw new Error('[FATAL] PAYLOAD_SECRET must be a 32+ char value in production')
    }

    // ── Jobs: recover claims stranded by a process restart (RT-8) ─────────────
    // `runJobs` marks a job `processing: true` before executing it and Payload has
    // no lease expiry, so a container replaced mid-batch leaves those rows
    // `processing` forever and they are never picked up again. Reset claims older
    // than the longest plausible handler run (3 retries × 5s timeout + slack).
    // Gated by the same env flag as autoRun so a non-scheduling replica never
    // races the scheduler.
    if (process.env.ENABLE_JOBS_AUTORUN === 'true') {
      try {
        const result = await payload.db.execute({
          drizzle: (payload.db as unknown as { drizzle: unknown }).drizzle,
          sql: sql`update payload_jobs set processing = false
                    where processing = true
                      and updated_at < now() - interval '5 minutes'`,
        } as never)
        const count = (result as unknown as { rowCount?: number }).rowCount ?? 0
        if (count > 0) {
          payload.logger.warn(`[jobs] reset ${count} stranded 'processing' job(s) after restart`)
        }
      } catch (err) {
        // The jobs tables only exist after the add_payload_jobs migration — skip
        // recovery (loudly) instead of failing boot on a pre-migration database.
        payload.logger.warn(
          `[jobs] stale-claim recovery skipped: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }

    // ── Crash guard for Postgres connection drops ─────────────────────────────
    // Postgres closes an app connection whenever it kills a session that is
    // idle-in-transaction (idle_in_transaction_session_timeout), restarts, or the
    // network blips. node-postgres surfaces that as an error with NO attached
    // listener → Node turns it into an uncaughtException → the ENTIRE Next server
    // dies and Coolify shows Bad Gateway (the observed crash loop). These errors are
    // benign to swallow: Postgres already discarded the transaction, and the request
    // that owned it fails on its own. We keep the server alive instead of crash-looping.

    // (1) Pool-level handler — covers clients sitting idle back in the pool.
    const pool = (
      payload.db as unknown as {
        pool?: { on?: (event: string, cb: (err: Error) => void) => void }
      }
    ).pool
    pool?.on?.('error', (err) => {
      payload.logger.error(`[pg-pool] idle client error suppressed: ${err?.message ?? String(err)}`)
    })

    // (2) Process-level net — covers a connection that dies while still CHECKED OUT
    // mid-transaction (which the pool handler above does NOT catch). Only known pg
    // connection-drop errors are swallowed; anything else is re-thrown so real bugs
    // still crash as normal. Installed once per process.
    const g = globalThis as unknown as { __pgCrashGuard?: boolean }
    if (!g.__pgCrashGuard) {
      g.__pgCrashGuard = true
      const isPgConnDrop = (e: unknown): boolean => {
        const msg = e instanceof Error ? e.message : String(e)
        const code = (e as { code?: string } | null)?.code
        return (
          code === '25P03' ||
          /terminating connection due to idle-in-transaction/i.test(msg) ||
          /Connection terminated unexpectedly/i.test(msg) ||
          /Connection terminated/i.test(msg) ||
          /terminating connection due to administrator command/i.test(msg)
        )
      }
      process.on('uncaughtException', (err) => {
        if (isPgConnDrop(err)) {
          payload.logger.error(`[pg-guard] swallowed pg connection drop: ${err.message}`)
          return
        }
        throw err // not a pg drop → preserve normal crash behavior
      })
      process.on('unhandledRejection', (reason) => {
        if (isPgConnDrop(reason)) {
          payload.logger.error(`[pg-guard] swallowed pg connection rejection: ${String(reason)}`)
          return
        }
        throw reason
      })
    }
  },
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  sharp,
})
