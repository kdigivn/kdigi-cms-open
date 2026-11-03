/**
 * Payload integration-test harness for Postgres-backed integration tests.
 *
 * Rules:
 *   - Only runs against localhost / 127.0.0.1 (refuses non-local databases).
 *   - Requires PAYLOAD_INTEGRATION=1 to execute; skips gracefully otherwise.
 *   - Uses static imports (no dynamic import() expressions).
 *   - No `as Function` casts.
 *   - Cleans up all created rows (sites, users, media, folders).
 */
import { getPayload, type Payload } from 'payload'
import config from '../payload.config'
import type { Site, User, Media } from '../payload-types'

/** Tiny valid 1x1 transparent PNG buffer for media upload fixtures. */
export const TINY_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

/** Allowed database hostnames for integration tests. */
const ALLOWED_HOSTS: Record<string, true> = {
  localhost: true,
  '127.0.0.1': true,
}

/**
 * Asserts that the provided database URI targets a local database.
 * Throws if URI is missing, invalid, or points to an external host.
 *
 * NOTE: the payload config captures `DATABASE_URI` at import time, so this cannot
 * load it late — the caller must provide it before the process starts. Locally use
 * `pnpm test:integration` (which passes `--env-file-if-exists=.env`); in CI the
 * workflow sets the env vars directly.
 */
export function assertLocalDatabaseUri(uri?: string): string {
  const targetUri = uri || process.env.DATABASE_URI
  if (!targetUri) {
    throw new Error(
      'DATABASE_URI is required for integration tests. Run `pnpm test:integration` locally ' +
        '(needs Node >= 22.9 for --env-file-if-exists) or export DATABASE_URI yourself.',
    )
  }

  let parsed: URL
  try {
    parsed = new URL(targetUri)
  } catch (err) {
    throw new Error(`Invalid DATABASE_URI: ${String(err)}`)
  }

  if (!ALLOWED_HOSTS[parsed.hostname]) {
    throw new Error(
      `Refusing to run integration harness against non-local host: ${parsed.hostname}. Allowed hosts: localhost, 127.0.0.1`,
    )
  }

  return targetUri
}

/** Whether the integration test gate is enabled. */
export const isIntegrationEnabled = process.env.PAYLOAD_INTEGRATION === '1'

let cachedPayload: Payload | null = null

/**
 * Get or initialize the Payload instance for integration testing.
 * Refuses to connect if DATABASE_URI host is not in ALLOWED_HOSTS.
 */
export async function getIntegrationPayload(): Promise<Payload> {
  assertLocalDatabaseUri()
  if (!cachedPayload) {
    const resolvedConfig = await config
    const secret =
      process.env.PAYLOAD_SECRET ||
      resolvedConfig.secret ||
      'dummy-secret-32-chars-for-test-suite!'

    cachedPayload = await getPayload({
      config: {
        ...resolvedConfig,
        secret,
      },
    })
  }
  return cachedPayload
}
/**
 * Safely drains and closes the Payload database connection pool
 * so the Node.js event loop can terminate cleanly.
 */
export async function closeIntegrationPayload(payload?: Payload): Promise<void> {
  const p = payload || cachedPayload
  if (!p?.db?.pool) return

  const pool = p.db.pool as {
    _clients?: Array<{ release: () => void }>
    end: () => Promise<void>
  }

  if (Array.isArray(pool._clients)) {
    for (const client of pool._clients) {
      try {
        client.release()
      } catch {
        // Ignore already-released errors
      }
    }
  }

  try {
    await pool.end()
  } catch {
    // Ignore pool-end errors
  }
}

export interface TenantHarness {
  site: Site
  editor: User
  author: User
  media: Media
}

export interface TwoTenantsFixture {
  tenantA: TenantHarness
  tenantB: TenantHarness
  superAdmin: User
  zeroTenantUser: User
  createdSiteIds: number[]
  createdUserIds: number[]
  createdMediaIds: number[]
  createdFolderIds: number[]
  createdPostIds: number[]
  trackMedia: (id: number) => void
  trackFolder: (id: number) => void
  trackUser: (id: number) => void
  trackPost: (id: number) => void
}

/**
 * Sets up 2 tenants (sites), 2 users per tenant (editor + author),
 * one media document per tenant, a super-admin user, and a zero-tenant user.
 * Tracks all created IDs for reliable cleanup.
 */
export async function setupTwoTenants(
  payload: Payload,
  prefix = 'int',
): Promise<TwoTenantsFixture> {
  assertLocalDatabaseUri()

  const runId = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`

  const createdSiteIds: number[] = []
  const createdUserIds: number[] = []
  const createdMediaIds: number[] = []
  const createdFolderIds: number[] = []
  const createdPostIds: number[] = []

  const trackMedia = (id: number) => {
    if (!createdMediaIds.includes(id)) createdMediaIds.push(id)
  }
  const trackFolder = (id: number) => {
    if (!createdFolderIds.includes(id)) createdFolderIds.push(id)
  }
  const trackUser = (id: number) => {
    if (!createdUserIds.includes(id)) createdUserIds.push(id)
  }
  const trackPost = (id: number) => {
    if (!createdPostIds.includes(id)) createdPostIds.push(id)
  }

  // 1. Create Sites (Tenants)
  const siteA = (await payload.create({
    collection: 'sites',
    data: {
      siteKey: `tenant-a-${runId}`,
      domain: `tenant-a-${runId}.local`,
      defaultLanguage: 'vi',
    },
    overrideAccess: true,
  })) as unknown as Site
  createdSiteIds.push(siteA.id)

  const siteB = (await payload.create({
    collection: 'sites',
    data: {
      siteKey: `tenant-b-${runId}`,
      domain: `tenant-b-${runId}.local`,
      defaultLanguage: 'vi',
    },
    overrideAccess: true,
  })) as unknown as Site
  createdSiteIds.push(siteB.id)

  // 2. Create Users for Tenant A (Editor + Author)
  const editorA = (await payload.create({
    collection: 'users',
    data: {
      email: `editor-a-${runId}@example.com`,
      password: 'Password123!',
      role: 'editor',
      tenants: [{ tenant: siteA.id }],
    },
    overrideAccess: true,
  })) as unknown as User
  createdUserIds.push(editorA.id)

  const authorA = (await payload.create({
    collection: 'users',
    data: {
      email: `author-a-${runId}@example.com`,
      password: 'Password123!',
      role: 'author',
      tenants: [{ tenant: siteA.id }],
    },
    overrideAccess: true,
  })) as unknown as User
  createdUserIds.push(authorA.id)

  // 3. Create Users for Tenant B (Editor + Author)
  const editorB = (await payload.create({
    collection: 'users',
    data: {
      email: `editor-b-${runId}@example.com`,
      password: 'Password123!',
      role: 'editor',
      tenants: [{ tenant: siteB.id }],
    },
    overrideAccess: true,
  })) as unknown as User
  createdUserIds.push(editorB.id)

  const authorB = (await payload.create({
    collection: 'users',
    data: {
      email: `author-b-${runId}@example.com`,
      password: 'Password123!',
      role: 'author',
      tenants: [{ tenant: siteB.id }],
    },
    overrideAccess: true,
  })) as unknown as User
  createdUserIds.push(authorB.id)

  // 4. Create Super Admin User
  const superAdmin = (await payload.create({
    collection: 'users',
    data: {
      email: `superadmin-${runId}@example.com`,
      password: 'Password123!',
      role: 'super-admin',
    },
    overrideAccess: true,
  })) as unknown as User
  createdUserIds.push(superAdmin.id)

  // 5. Create Zero-Tenant User
  const zeroTenantUser = (await payload.create({
    collection: 'users',
    data: {
      email: `zerotenant-${runId}@example.com`,
      password: 'Password123!',
      role: 'editor',
      tenants: [],
    },
    overrideAccess: true,
  })) as unknown as User
  createdUserIds.push(zeroTenantUser.id)

  // 6. Create Media Docs (One per tenant)
  const mediaA = (await payload.create({
    collection: 'media',
    data: {
      alt: `Media A ${runId}`,
      tenant: siteA.id,
    },
    file: {
      data: TINY_PNG_BUFFER,
      name: `media-a-${runId}.png`,
      mimetype: 'image/png',
      size: TINY_PNG_BUFFER.length,
    },
    overrideAccess: true,
  })) as unknown as Media
  createdMediaIds.push(mediaA.id)

  const mediaB = (await payload.create({
    collection: 'media',
    data: {
      alt: `Media B ${runId}`,
      tenant: siteB.id,
    },
    file: {
      data: TINY_PNG_BUFFER,
      name: `media-b-${runId}.png`,
      mimetype: 'image/png',
      size: TINY_PNG_BUFFER.length,
    },
    overrideAccess: true,
  })) as unknown as Media
  createdMediaIds.push(mediaB.id)

  return {
    tenantA: {
      site: siteA,
      editor: editorA,
      author: authorA,
      media: mediaA,
    },
    tenantB: {
      site: siteB,
      editor: editorB,
      author: authorB,
      media: mediaB,
    },
    superAdmin,
    zeroTenantUser,
    createdSiteIds,
    createdUserIds,
    createdMediaIds,
    createdFolderIds,
    createdPostIds,
    trackMedia,
    trackFolder,
    trackUser,
    trackPost,
  }
}

/**
 * Clean up all documents created for the fixture.
 */
export async function cleanupTwoTenants(
  payload: Payload,
  fixture: TwoTenantsFixture,
): Promise<void> {
  // Delete media first
  for (const id of fixture.createdMediaIds) {
    try {
      await payload.delete({ collection: 'media', id, overrideAccess: true })
    } catch {
      // Ignore cleanup error if already deleted
    }
  }

  // Delete posts if any were created (`trash: true` so trashed ones are found and removed too)
  for (const id of fixture.createdPostIds) {
    try {
      await payload.delete({ collection: 'posts', id, overrideAccess: true, trash: true })
    } catch {
      // Ignore cleanup error
    }
  }

  // Delete folders
  for (const id of fixture.createdFolderIds) {
    try {
      await payload.delete({ collection: 'payload-folders', id, overrideAccess: true })
    } catch {
      // Ignore cleanup error
    }
  }

  // Delete users
  for (const id of fixture.createdUserIds) {
    try {
      await payload.delete({ collection: 'users', id, overrideAccess: true })
    } catch {
      // Ignore cleanup error
    }
  }

  // Delete sites
  for (const id of fixture.createdSiteIds) {
    try {
      await payload.delete({ collection: 'sites', id, overrideAccess: true })
    } catch {
      // Ignore cleanup error
    }
  }
}
