#!/usr/bin/env node
/**
 * Demo reset — put the public `demo` site back to its pristine seeded state.
 *
 *   pnpm demo:reset       (needs DATABASE_URI + PAYLOAD_SECRET; loads .env if present)
 *
 * Environment:
 *   DEMO_ACCOUNT_EMAILS    comma list of demo user emails (see docs/configuration.md)
 *   DEMO_ACCOUNT_PASSWORD  password every demo account is reset to (required)
 *
 * What it does, in this order:
 *   1. Permanently deletes ALL content of the site with `siteKey = demo` (posts, pages, FAQs, menus,
 *      products, landings, comments, redirects, shortcodes, authors, categories/tags, media files and
 *      media folders), trashed documents included.
 *   2. Re-seeds the site with the normal demo seed (`seedDemo`, same as `pnpm seed:demo`).
 *   3. For each email in DEMO_ACCOUNT_EMAILS: creates the user when missing, then resets the
 *      password, role (`editor`) and sites (`demo` only), so a demo account never keeps access it was
 *      not given.
 *
 * It never touches any other site, the `sites` documents themselves, or users outside
 * DEMO_ACCOUNT_EMAILS. Schedule it nightly (Coolify scheduled task, cron) on the app container.
 */
import { fileURLToPath } from 'node:url'
import { getPayload, type CollectionSlug, type Payload } from 'payload'
import config from '../payload.config'
import { parseDemoAccountEmails } from '../lib/demo-accounts'
import { seedDemo } from './seed-demo'

const SITE_KEY = 'demo'

/**
 * Tenant-scoped collections, children first so no document is deleted while another still points
 * at it (posts → authors/taxonomies/media).
 */
const TENANT_COLLECTIONS: CollectionSlug[] = [
  'comments',
  'posts',
  'pages',
  'products',
  'landings',
  'faqs',
  'menus',
  'shortcodes',
  'redirects',
  'authors',
  'taxonomies',
  'media',
  'payload-folders',
]

const log = (msg: string) => console.log(`[demo:reset] ${msg}`)

async function findDemoSiteId(payload: Payload): Promise<number | undefined> {
  const res = await payload.find({
    collection: 'sites',
    where: { siteKey: { equals: SITE_KEY } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return res.docs[0]?.id
}

async function wipeSiteContent(payload: Payload, tenant: number): Promise<void> {
  for (const collection of TENANT_COLLECTIONS) {
    // `trash: true` = also match trashed rows AND delete permanently instead of moving to the trash.
    const res = await payload.delete({
      collection,
      where: { tenant: { equals: tenant } },
      overrideAccess: true,
      trash: true,
    })
    if (res.errors.length > 0) {
      throw new Error(`failed to delete ${res.errors.length} ${collection} doc(s): ${JSON.stringify(res.errors)}`)
    }
    log(`deleted ${res.docs.length} ${collection}`)
  }
}

async function resetDemoUsers(payload: Payload, tenant: number, emails: string[], password: string): Promise<void> {
  for (const email of emails) {
    const found = await payload.find({
      collection: 'users',
      where: { email: { equals: email } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const existing = found.docs[0]
    if (!existing) {
      await payload.create({
        collection: 'users',
        data: { email, password, role: 'editor', tenants: [{ tenant }] },
        overrideAccess: true,
      })
      log(`created demo user ${email}`)
      continue
    }
    await payload.update({
      collection: 'users',
      id: existing.id,
      data: { password, role: 'editor', tenants: [{ tenant }] },
      overrideAccess: true,
    })
    log(`reset demo user ${email}`)
  }
}

export async function resetDemo(payload: Payload, opts: { emails: string[]; password: string }): Promise<void> {
  const existingTenant = await findDemoSiteId(payload)
  if (existingTenant != null) await wipeSiteContent(payload, existingTenant)
  else log(`site "${SITE_KEY}" does not exist yet — seeding it from scratch`)

  await seedDemo(payload)

  const tenant = await findDemoSiteId(payload)
  if (tenant == null) throw new Error(`site "${SITE_KEY}" missing after seeding`)
  await resetDemoUsers(payload, tenant, opts.emails, opts.password)
}

async function main() {
  const emails = [...parseDemoAccountEmails(process.env.DEMO_ACCOUNT_EMAILS)]
  const password = process.env.DEMO_ACCOUNT_PASSWORD ?? ''
  if (emails.length === 0) throw new Error('DEMO_ACCOUNT_EMAILS is empty — nothing to reset, refusing to run')
  if (password.length < 8) throw new Error('DEMO_ACCOUNT_PASSWORD must be set (at least 8 characters)')

  const payload = await getPayload({ config })
  try {
    await resetDemo(payload, { emails, password })
    log('done')
  } finally {
    await payload.destroy()
  }
}

// Only run when invoked directly, never on import.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
