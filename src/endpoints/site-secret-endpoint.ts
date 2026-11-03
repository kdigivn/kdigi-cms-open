import type { Endpoint } from 'payload'

// Generic write-only secret endpoints for the Sites collection.
// Covers any leaf field that must never appear in REST/GraphQL reads.
//
// Allowed dot-paths: explicit whitelist — anything else is rejected with 400.
// Values are NEVER returned or logged; only a boolean presence flag is returned.
// Both endpoints require role === 'super-admin'; all others receive 403.

const ALLOWED_SECRET_PATHS = ['r2.accessKeyId', 'r2.secretAccessKey'] as const
type AllowedPath = (typeof ALLOWED_SECRET_PATHS)[number]

function isAllowedPath(path: unknown): path is AllowedPath {
  return ALLOWED_SECRET_PATHS.includes(path as AllowedPath)
}

// Resolve a two-part dot-path (group.leaf) into { group, leaf }.
// Only single-level nesting is needed for the current whitelist.
function parseDotPath(path: AllowedPath): { group: string; leaf: string } {
  const dot = path.indexOf('.')
  return { group: path.slice(0, dot), leaf: path.slice(dot + 1) }
}

// GET /:id/secret?field=PATH
// Returns { field, hasValue: boolean } — never the value itself.
export const siteSecretGetEndpoint: Endpoint = {
  path: '/:id/secret',
  method: 'get',
  handler: async (req) => {
    const id = req.routeParams?.['id'] as string | undefined
    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 })

    if (req.user?.role !== 'super-admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Extract ?field= from the URL search params (req.url may be undefined on PayloadRequest)
    const rawUrl = req.url ?? ''
    const url = new URL(rawUrl, 'http://localhost')
    const field = url.searchParams.get('field')
    if (!isAllowedPath(field)) {
      return Response.json({ error: 'Invalid or disallowed field path' }, { status: 400 })
    }

    const { payload } = req
    try {
      // overrideAccess:true so the server reads the secret leaf despite access.read:false
      const site = await payload.findByID({ collection: 'sites', id, overrideAccess: true })
      const { group, leaf } = parseDotPath(field)
      const groupData = (site as unknown as Record<string, Record<string, unknown>>)[group]
      const hasValue = Boolean(groupData?.[leaf])
      // Return boolean only — never the value
      return Response.json({ field, hasValue })
    } catch {
      return Response.json({ error: 'Site not found' }, { status: 404 })
    }
  },
}

// POST /:id/secret
// Body: { field: PATH, value: string }
// Deep-merges the new value into the group, preserving all sibling fields.
export const siteSecretPostEndpoint: Endpoint = {
  path: '/:id/secret',
  method: 'post',
  handler: async (req) => {
    const id = req.routeParams?.['id'] as string | undefined
    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 })

    if (req.user?.role !== 'super-admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    let body: { field?: unknown; value?: unknown }
    try {
      // req.json may be absent on PayloadRequest when no body parser is attached
      if (typeof req.json !== 'function') {
        return Response.json({ error: 'Request body not readable' }, { status: 400 })
      }
      body = (await req.json()) as { field?: unknown; value?: unknown }
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (!isAllowedPath(body.field)) {
      return Response.json({ error: 'Invalid or disallowed field path' }, { status: 400 })
    }
    if (typeof body.value !== 'string') {
      return Response.json({ error: 'value must be a string' }, { status: 400 })
    }

    const field = body.field
    const value = body.value
    const { group, leaf } = parseDotPath(field)

    const { payload } = req
    try {
      // Read current doc to preserve all sibling fields in the group (overrideAccess to read secrets)
      const site = await payload.findByID({ collection: 'sites', id, overrideAccess: true })
      const typedSite = site as unknown as Record<string, Record<string, unknown>>
      const currentGroup: Record<string, unknown> = typedSite[group] ?? {}

      // Deep-merge: spread existing group, overwrite only the target leaf
      const updatedGroup = { ...currentGroup, [leaf]: value }

      // Write back — overrideAccess bypasses field-level access.read:false on write too
      await payload.update({
        collection: 'sites',
        id,
        data: { [group]: updatedGroup } as Record<string, unknown>,
        overrideAccess: true,
      })

      return Response.json({ ok: true })
    } catch {
      return Response.json({ error: 'Update failed' }, { status: 500 })
    }
  },
}
