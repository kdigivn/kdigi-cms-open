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
import { randomUUID } from 'node:crypto'
import { getPayload, handleEndpoints, type Payload } from 'payload'
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
  /** API key of `editor` (`enableAPIKey: true`). */
  editorKey: string
  author: User
  /** API key of `author`. */
  authorKey: string
  media: Media
}

export interface TwoTenantsFixture {
  /** Unique suffix of this fixture (also inside every site key / email). */
  runId: string
  tenantA: TenantHarness
  tenantB: TenantHarness
  superAdmin: User
  superAdminKey: string
  zeroTenantUser: User
  zeroTenantKey: string
  /** Editor who is a member of BOTH site A and site B. */
  multiEditor: User
  multiEditorKey: string
  createdSiteIds: number[]
  createdUserIds: number[]
  createdMediaIds: number[]
  createdFolderIds: number[]
  createdPostIds: number[]
  createdPageIds: number[]
  createdTaxonomyIds: number[]
  createdShortcodeIds: number[]
  trackMedia: (id: number) => void
  trackFolder: (id: number) => void
  trackUser: (id: number) => void
  trackPost: (id: number) => void
  trackPage: (id: number) => void
  trackTaxonomy: (id: number) => void
  trackShortcode: (id: number) => void
}

/**
 * Sets up 2 tenants (sites), 2 users per tenant (editor + author), a multi-site editor, one
 * media document per tenant, a super-admin user, and a zero-tenant user. Every user has an API
 * key (`enableAPIKey: true`, key exposed on the fixture). Tracks all created IDs for reliable
 * cleanup.
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
  const createdPageIds: number[] = []
  const createdTaxonomyIds: number[] = []
  const createdShortcodeIds: number[] = []

  const tracker = (list: number[]) => (id: number) => {
    if (!list.includes(id)) list.push(id)
  }
  const trackMedia = tracker(createdMediaIds)
  const trackFolder = tracker(createdFolderIds)
  const trackUser = tracker(createdUserIds)
  const trackPost = tracker(createdPostIds)
  const trackPage = tracker(createdPageIds)
  const trackTaxonomy = tracker(createdTaxonomyIds)
  const trackShortcode = tracker(createdShortcodeIds)

  const createSite = async (label: 'a' | 'b'): Promise<Site> => {
    const site = (await payload.create({
      collection: 'sites',
      data: {
        siteKey: `tenant-${label}-${runId}`,
        domain: `tenant-${label}-${runId}.local`,
        defaultLanguage: 'vi',
      },
      overrideAccess: true,
    })) as unknown as Site
    createdSiteIds.push(site.id)
    return site
  }

  const createUser = async (
    label: string,
    role: 'editor' | 'author' | 'super-admin',
    siteIds?: number[],
  ): Promise<{ user: User; key: string }> => {
    const key = randomUUID()
    const user = (await payload.create({
      collection: 'users',
      data: {
        email: `${label}-${runId}@example.com`,
        password: 'Password123!',
        role,
        enableAPIKey: true,
        apiKey: key,
        ...(siteIds ? { tenants: siteIds.map((tenant) => ({ tenant })) } : {}),
      },
      overrideAccess: true,
    })) as unknown as User
    trackUser(user.id)
    return { user, key }
  }

  const createMedia = async (label: 'a' | 'b', site: Site): Promise<Media> => {
    const media = (await payload.create({
      collection: 'media',
      data: {
        alt: `Media ${label.toUpperCase()} ${runId}`,
        tenant: site.id,
      },
      file: {
        data: TINY_PNG_BUFFER,
        name: `media-${label}-${runId}.png`,
        mimetype: 'image/png',
        size: TINY_PNG_BUFFER.length,
      },
      overrideAccess: true,
    })) as unknown as Media
    trackMedia(media.id)
    return media
  }

  // 1. Sites (tenants)
  const siteA = await createSite('a')
  const siteB = await createSite('b')

  // 2. Users: editor + author per tenant, multi-site editor, super-admin, zero-tenant editor
  const editorA = await createUser('editor-a', 'editor', [siteA.id])
  const authorA = await createUser('author-a', 'author', [siteA.id])
  const editorB = await createUser('editor-b', 'editor', [siteB.id])
  const authorB = await createUser('author-b', 'author', [siteB.id])
  const multiEditor = await createUser('multi-editor', 'editor', [siteA.id, siteB.id])
  const superAdmin = await createUser('superadmin', 'super-admin')
  const zeroTenant = await createUser('zerotenant', 'editor', [])

  // 3. Media docs (one per tenant)
  const mediaA = await createMedia('a', siteA)
  const mediaB = await createMedia('b', siteB)

  return {
    runId,
    tenantA: {
      site: siteA,
      editor: editorA.user,
      editorKey: editorA.key,
      author: authorA.user,
      authorKey: authorA.key,
      media: mediaA,
    },
    tenantB: {
      site: siteB,
      editor: editorB.user,
      editorKey: editorB.key,
      author: authorB.user,
      authorKey: authorB.key,
      media: mediaB,
    },
    superAdmin: superAdmin.user,
    superAdminKey: superAdmin.key,
    zeroTenantUser: zeroTenant.user,
    zeroTenantKey: zeroTenant.key,
    multiEditor: multiEditor.user,
    multiEditorKey: multiEditor.key,
    createdSiteIds,
    createdUserIds,
    createdMediaIds,
    createdFolderIds,
    createdPostIds,
    createdPageIds,
    createdTaxonomyIds,
    createdShortcodeIds,
    trackMedia,
    trackFolder,
    trackUser,
    trackPost,
    trackPage,
    trackTaxonomy,
    trackShortcode,
  }
}

type DeletableCollection = 'posts' | 'pages' | 'taxonomies' | 'shortcodes' | 'media' | 'payload-folders' | 'users' | 'sites'

/** Delete one document with access overridden; already-gone / constrained rows are ignored. */
async function deleteQuietly(payload: Payload, collection: DeletableCollection, id: number): Promise<void> {
  try {
    // `trash: true` so trashed documents are found and removed too (ignored on non-trash collections).
    await payload.delete({ collection, id, overrideAccess: true, trash: true })
  } catch {
    // Ignore cleanup error if already deleted
  }
}

/** Delete every row of `collection` whose `tenant` is one of `siteIds` (docs created by ops under test). */
async function deleteByTenant(
  payload: Payload,
  collection: 'posts' | 'pages' | 'taxonomies' | 'shortcodes' | 'media',
  siteIds: number[],
): Promise<void> {
  if (siteIds.length === 0) return
  try {
    await payload.delete({
      collection,
      where: { tenant: { in: siteIds } },
      overrideAccess: true,
      trash: true,
    })
  } catch {
    // Ignore cleanup error
  }
}

/**
 * Clean up all documents created for the fixture: admin lock rows, tracked ids, then everything
 * still attached to the fixture's sites (documents created through the MCP surface, imports).
 */
export async function cleanupTwoTenants(
  payload: Payload,
  fixture: TwoTenantsFixture,
): Promise<void> {
  // Admin document locks held by fixture users.
  if (fixture.createdUserIds.length > 0) {
    try {
      await payload.delete({
        collection: 'payload-locked-documents',
        where: { 'user.value': { in: fixture.createdUserIds } },
        overrideAccess: true,
      })
    } catch {
      // Ignore cleanup error
    }
  }

  for (const id of fixture.createdPostIds) await deleteQuietly(payload, 'posts', id)
  for (const id of fixture.createdPageIds) await deleteQuietly(payload, 'pages', id)
  for (const id of fixture.createdTaxonomyIds) await deleteQuietly(payload, 'taxonomies', id)
  for (const id of fixture.createdShortcodeIds) await deleteQuietly(payload, 'shortcodes', id)
  for (const id of fixture.createdMediaIds) await deleteQuietly(payload, 'media', id)

  // Anything created by ops under test and not tracked (MCP creates, imported media).
  await deleteByTenant(payload, 'posts', fixture.createdSiteIds)
  await deleteByTenant(payload, 'pages', fixture.createdSiteIds)
  await deleteByTenant(payload, 'taxonomies', fixture.createdSiteIds)
  await deleteByTenant(payload, 'shortcodes', fixture.createdSiteIds)
  await deleteByTenant(payload, 'media', fixture.createdSiteIds)

  for (const id of fixture.createdFolderIds) await deleteQuietly(payload, 'payload-folders', id)
  for (const id of fixture.createdUserIds) await deleteQuietly(payload, 'users', id)
  for (const id of fixture.createdSiteIds) await deleteQuietly(payload, 'sites', id)
}

// ── MCP / REST through Payload's real request pipeline ──────────────────────────────────────

export interface McpCallOptions {
  /** API key; sent as `Authorization: <scheme> <key>` unless `scheme` is `none`. */
  key?: string
  /** `Bearer` (default) or Payload's native `users API-Key`. */
  scheme?: 'Bearer' | 'users API-Key'
  /** Raw `Cookie` header (e.g. `payload-token=<jwt>`). */
  cookie?: string
  /** JSON-serialised unless already a string. */
  body?: unknown
  headers?: Record<string, string>
  method?: string
}

/**
 * Runs one request through `handleEndpoints` — the function behind Next's `/api/[...slug]` route —
 * so Payload's own `createPayloadRequest` (strategies, `req.user`, transaction, endpoint matching)
 * runs exactly as in production, then the real `mcpEndpoints` handler.
 */
export async function callApi(
  payload: Payload,
  path: string,
  { key, scheme = 'Bearer', cookie, body, headers = {}, method = 'POST' }: McpCallOptions = {},
): Promise<Response> {
  const requestHeaders = new Headers({
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    ...headers,
  })
  if (key) requestHeaders.set('Authorization', `${scheme} ${key}`)
  if (cookie) requestHeaders.set('Cookie', cookie)
  const hasBody = body !== undefined && method !== 'GET' && method !== 'HEAD'
  const request = new Request(`http://localhost${path}`, {
    method,
    headers: requestHeaders,
    body: hasBody ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  })
  return handleEndpoints({ config: payload.config, request })
}

/** `POST /api/mcp` through the real pipeline (see {@link callApi}). */
export function callMcp(payload: Payload, options: McpCallOptions = {}): Promise<Response> {
  return callApi(payload, '/api/mcp', options)
}

export interface ToolOutcome {
  isError: boolean
  /** Agent error code (`unauthorized|forbidden|…`), `schema` for SDK input-validation errors, `null` on success. */
  code: string | null
  /** Error text without the `<code>: ` prefix and details line; `''` on success. */
  message: string
  /** Parsed JSON details line of an error result, if any. */
  details: Record<string, unknown> | null
  /** `structuredContent` of a successful result (`{}` for errors). */
  data: Record<string, unknown>
  /** Raw text of the first content block. */
  text: string
}

let rpcId = 0

/** Calls one MCP tool as the owner of `key` and flattens the result. */
export async function callTool(
  payload: Payload,
  key: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<ToolOutcome> {
  rpcId += 1
  const response = await callMcp(payload, {
    key,
    body: { jsonrpc: '2.0', id: rpcId, method: 'tools/call', params: { name, arguments: args } },
  })
  const rpc = (await response.json()) as {
    result?: { isError?: boolean; content?: Array<{ text?: string }>; structuredContent?: Record<string, unknown> }
    error?: { code: number; message: string }
  }
  if (response.status !== 200 || !rpc.result) {
    throw new Error(`MCP ${name}: HTTP ${response.status} ${JSON.stringify(rpc)}`)
  }
  const text = rpc.result.content?.[0]?.text ?? ''
  if (!rpc.result.isError) {
    return { isError: false, code: null, message: '', details: null, data: rpc.result.structuredContent ?? {}, text }
  }
  if (text.startsWith('MCP error')) {
    return { isError: true, code: 'schema', message: text, details: null, data: {}, text }
  }
  const [head, ...rest] = text.split('\n')
  const sep = head.indexOf(': ')
  let details: Record<string, unknown> | null = null
  if (rest.length > 0) {
    try {
      details = JSON.parse(rest.join('\n')) as Record<string, unknown>
    } catch {
      details = null
    }
  }
  return {
    isError: true,
    code: head.slice(0, sep),
    message: head.slice(sep + 2),
    details,
    data: {},
    text,
  }
}
