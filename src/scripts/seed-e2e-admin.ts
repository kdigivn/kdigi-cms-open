#!/usr/bin/env node
/**
 * LOCAL-ONLY seed: ensures a fixed-credential super-admin user exists for the
 * Playwright e2e harness (`playwright.config.ts` global setup calls this
 * before every run). The admin UI has no autoLogin — tests need a real,
 * stable login to reach `/admin`.
 *
 * HARD GUARD: aborts when DATABASE_URI points at a non-local host, mirroring
 * `src/seed/seed-local-fake-comments.ts` — these credentials are published in
 * this file and must never exist against a production database.
 *
 * Idempotent: safe to run repeatedly. Creates the user on first run, resets
 * its password/role on every subsequent run so credential drift (e.g. someone
 * changed the password by hand) never breaks the harness.
 *
 * Usage:
 *   node --env-file=.env --import tsx src/scripts/seed-e2e-admin.ts
 */
import { fileURLToPath } from 'node:url'
import { getPayload } from 'payload'
import type { Payload } from 'payload'
import config from '../payload.config'
import { isRemoteDatabase } from '../importers/wp-migration/prod-backup-gate'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from './e2e-admin-fixture'
import {
  E2E_EDITOR_FIXTURE_MARKDOWN,
  E2E_EDITOR_FIXTURE_SLUG,
  E2E_EDITOR_FIXTURE_TITLE,
  E2E_FIXTURE_SITE_DOMAIN,
  E2E_FIXTURE_SITE_KEY,
} from './e2e-editor-fixture'
import {
  E2E_AUTHOR_EMAIL,
  E2E_AUTHOR_PASSWORD,
  E2E_PICKER_DRAFT_SLUG,
  E2E_PICKER_DRAFT_TITLE,
  E2E_PICKER_LIVE_SLUG,
  E2E_PICKER_LIVE_TITLE,
  E2E_PICKER_SCHEDULED_SLUG,
  E2E_PICKER_SCHEDULED_TITLE,
  E2E_PICKER_TENANT_B_DOMAIN,
  E2E_PICKER_TENANT_B_SITE_KEY,
  E2E_PICKER_TENANT_B_SLUG,
  E2E_PICKER_TENANT_B_TITLE,
  E2E_SNIPPET_MARKDOWN,
  E2E_SNIPPET_NAME,
  E2E_SNIPPET_TITLE,
} from './e2e-picker-fixture'

/**
 * Seed the tenant + post the editor specs edit (SP2-1 / phase 4).
 *
 * Deterministic by slug, so specs never hard-code a document id (the old
 * `POST_DOC_ID = 115` broke on any fresh database). Idempotent: re-running resets
 * the body to the level-A fixture content.
 */
async function seedEditorFixture(payload: Payload): Promise<number> {
  const sites = await payload.find({
    collection: 'sites',
    where: { siteKey: { equals: E2E_FIXTURE_SITE_KEY } },
    limit: 1,
    overrideAccess: true,
  })
  let siteId = sites.docs[0]?.id
  if (siteId === undefined) {
    const site = await payload.create({
      collection: 'sites',
      overrideAccess: true,
      data: {
        siteKey: E2E_FIXTURE_SITE_KEY,
        // TEST-NET-1: any accidental revalidate request goes nowhere.
        domain: E2E_FIXTURE_SITE_DOMAIN,
        defaultLanguage: 'vi',
      },
    })
    siteId = site.id
    console.log(`Created fixture site ${E2E_FIXTURE_SITE_KEY} -> id ${String(siteId)}`)
  }

  const postData = {
    title: E2E_EDITOR_FIXTURE_TITLE,
    slug: E2E_EDITOR_FIXTURE_SLUG,
    type: 'blog' as const,
    // Published: specs resolve the fixture id through the admin's REST session, and
    // a draft is invisible to REST reads (access is publishedAndLive-based), so a
    // draft fixture made every matrix row fail at lookup.
    status: 'published' as const,
    publishedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    tenant: siteId,
    contentMd: E2E_EDITOR_FIXTURE_MARKDOWN,
  }

  const posts = await payload.find({
    collection: 'posts',
    where: { slug: { equals: E2E_EDITOR_FIXTURE_SLUG } },
    limit: 1,
    overrideAccess: true,
  })

  if (posts.docs[0]) {
    await payload.update({
      collection: 'posts',
      id: posts.docs[0].id,
      overrideAccess: true,
      // Fixture setup must not ping the outside world: the tenant domain is a
      // TEST-NET black hole, so a queued revalidate job would just burn retries
      // (phase 3 queues one per save). Same flag the importer uses for this.
      context: { __suppressExternalPublishHooks: true },
      data: postData,
    })
    console.log(`Updated fixture post ${E2E_EDITOR_FIXTURE_SLUG} -> id ${String(posts.docs[0].id)}`)
  } else {
    const created = await payload.create({
      collection: 'posts',
      overrideAccess: true,
      context: { __suppressExternalPublishHooks: true },
      data: postData,
    })
    console.log(`Created fixture post ${E2E_EDITOR_FIXTURE_SLUG} -> id ${String(created.id)}`)
  }
  return siteId
}

/** Fixture writes must not ping the outside world (see `seedEditorFixture`). */
const QUIET_CONTEXT = { __suppressExternalPublishHooks: true }

async function ensureSite(payload: Payload, siteKey: string, domain: string): Promise<number> {
  const found = await payload.find({
    collection: 'sites',
    where: { siteKey: { equals: siteKey } },
    limit: 1,
    overrideAccess: true,
  })
  if (found.docs[0]) return found.docs[0].id
  const site = await payload.create({
    collection: 'sites',
    overrideAccess: true,
    data: { siteKey, domain, defaultLanguage: 'vi' },
  })
  console.log(`Created fixture site ${siteKey} -> id ${String(site.id)}`)
  return site.id
}

async function upsertPost(
  payload: Payload,
  data: {
    title: string
    slug: string
    status: 'published' | 'draft'
    publishedAt: string | null
    tenant: number
  },
): Promise<void> {
  const found = await payload.find({
    collection: 'posts',
    where: { slug: { equals: data.slug } },
    limit: 1,
    overrideAccess: true,
  })
  const postData = { ...data, type: 'blog' as const, contentMd: `${data.title}.` }
  if (found.docs[0]) {
    await payload.update({
      collection: 'posts',
      id: found.docs[0].id,
      overrideAccess: true,
      context: QUIET_CONTEXT,
      data: postData,
    })
  } else {
    await payload.create({ collection: 'posts', overrideAccess: true, context: QUIET_CONTEXT, data: postData })
  }
}

/**
 * Phase 8 picker fixtures: the `@` picker's tenant/embargo cases, one tenant shortcode, and a
 * tenant-A author for the [RT-7] forged-cookie check. Idempotent (upsert by slug/name/email).
 */
async function seedPickerFixtures(payload: Payload, tenantA: number): Promise<void> {
  const tenantB = await ensureSite(payload, E2E_PICKER_TENANT_B_SITE_KEY, E2E_PICKER_TENANT_B_DOMAIN)
  const past = '2026-01-01T00:00:00.000Z'
  await upsertPost(payload, { title: E2E_PICKER_LIVE_TITLE, slug: E2E_PICKER_LIVE_SLUG, status: 'published', publishedAt: past, tenant: tenantA })
  await upsertPost(payload, {
    title: E2E_PICKER_SCHEDULED_TITLE,
    slug: E2E_PICKER_SCHEDULED_SLUG,
    status: 'published',
    publishedAt: '2099-01-01T00:00:00.000Z',
    tenant: tenantA,
  })
  await upsertPost(payload, { title: E2E_PICKER_DRAFT_TITLE, slug: E2E_PICKER_DRAFT_SLUG, status: 'draft', publishedAt: null, tenant: tenantA })
  await upsertPost(payload, { title: E2E_PICKER_TENANT_B_TITLE, slug: E2E_PICKER_TENANT_B_SLUG, status: 'published', publishedAt: past, tenant: tenantB })

  const shortcodes = await payload.find({
    collection: 'shortcodes',
    where: { and: [{ name: { equals: E2E_SNIPPET_NAME } }, { tenant: { equals: tenantA } }] },
    limit: 1,
    overrideAccess: true,
  })
  const shortcodeData = { title: E2E_SNIPPET_TITLE, name: E2E_SNIPPET_NAME, contentMd: E2E_SNIPPET_MARKDOWN, tenant: tenantA }
  if (shortcodes.docs[0]) {
    await payload.update({ collection: 'shortcodes', id: shortcodes.docs[0].id, overrideAccess: true, context: QUIET_CONTEXT, data: shortcodeData })
  } else {
    await payload.create({ collection: 'shortcodes', overrideAccess: true, context: QUIET_CONTEXT, data: shortcodeData })
  }

  const authors = await payload.find({
    collection: 'users',
    where: { email: { equals: E2E_AUTHOR_EMAIL } },
    limit: 1,
    overrideAccess: true,
  })
  const authorData = { password: E2E_AUTHOR_PASSWORD, role: 'author' as const, tenants: [{ tenant: tenantA }] }
  if (authors.docs[0]) {
    await payload.update({ collection: 'users', id: authors.docs[0].id, overrideAccess: true, data: authorData })
  } else {
    await payload.create({ collection: 'users', overrideAccess: true, data: { email: E2E_AUTHOR_EMAIL, ...authorData } })
  }
  console.log(`Seeded picker fixtures (tenant A ${String(tenantA)}, tenant B ${String(tenantB)})`)
}

function safeHost(uri: string | undefined): string {
  if (!uri) return '(DATABASE_URI empty)'
  try {
    return new URL(uri).hostname
  } catch {
    return '(unparseable)'
  }
}

async function main() {
  const dbUri = process.env.DATABASE_URI
  if (isRemoteDatabase(dbUri)) {
    console.error('ABORT — seed-e2e-admin is a LOCAL-ONLY script.')
    console.error(`  DATABASE_URI points at a non-local host: ${safeHost(dbUri)}`)
    process.exit(2)
  }
  console.log(`DB host: ${safeHost(dbUri)} — seeding e2e admin user`)

  const payload = await getPayload({ config })

  const existing = await payload.find({
    collection: 'users',
    where: { email: { equals: E2E_ADMIN_EMAIL } },
    limit: 1,
    overrideAccess: true,
  })

  if (existing.docs.length > 0) {
    await payload.update({
      collection: 'users',
      id: existing.docs[0].id,
      data: { password: E2E_ADMIN_PASSWORD, role: 'super-admin' },
      overrideAccess: true,
    })
    console.log(`Updated existing e2e admin ${E2E_ADMIN_EMAIL} -> super-admin, password reset`)
  } else {
    await payload.create({
      collection: 'users',
      data: { email: E2E_ADMIN_EMAIL, password: E2E_ADMIN_PASSWORD, role: 'super-admin' },
      overrideAccess: true,
    })
    console.log(`Created e2e admin ${E2E_ADMIN_EMAIL}`)
  }

  const fixtureSiteId = await seedEditorFixture(payload)
  await seedPickerFixtures(payload, fixtureSiteId)

  process.exit(0)
}

// Guard against side effects when this module is imported for its exports
// elsewhere (it currently is not — kept as defense-in-depth since a script
// that runs `getPayload()`/DB writes at import time is a footgun for future
// imports). Only runs `main()` when invoked directly via `node ... this-file`.
const isDirectlyExecuted = process.argv[1] === fileURLToPath(import.meta.url)
if (isDirectlyExecuted) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
