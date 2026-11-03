/**
 * Phase 3 — pure helpers used by the media grid view + dropzone.
 *
 * Extracted from media-grid-list-view.tsx and media-upload-dropzone.tsx so
 * unit tests can import them without pulling in the React component chain
 * (which transitively imports react-image-crop's CSS file via
 * @payloadcms/ui, breaking node --test under tsx).
 *
 * The functions here have no React/DOM dependencies:
 *   - deriveAltFromFilename: required alt for new uploads
 *   - buildMediaWhere: REST `where` query string for the media list
 *   - runWithConcurrency: bounded fan-out for the dropzone's uploads
 */

/** MIME filter chip values (kept in sync with media-grid-list-view.tsx). */
export type MimeFilter = 'all' | 'image' | 'video' | 'document'

/**
 * Derive a default `alt` from a filename. Splits on the last '.' and
 * falls back to the full filename when no extension is present. Always
 * returns a non-empty string — alt is required by the Media schema, so
 * the upload would 400 without this.
 */
export function deriveAltFromFilename(name: string): string {
  const idx = name.lastIndexOf('.')
  if (idx <= 0) return name
  return name.slice(0, idx)
}

/**
 * Build the `where` clause for the media REST query. Combines the folder
 * scope, the MIME chip, the (optional) text search across filename + alt,
 * and the (optional) selected-site scope. Returns a URL-encoded query string
 * (without the leading '?').
 *
 * The search is encoded as a nested `or` over two `like` predicates — the
 * Payload REST API evaluates these case-insensitively on the underlying DB.
 *
 * Phase 3: the search clause is appended with index [2] (after the folder
 * [0] and mime [1] clauses) so the three filters compose with `and`.
 *
 * `tenantId` scopes the list to the currently selected admin site (mirrors
 * the `payload-tenant` cookie the multi-tenant plugin sets) — appended as
 * index [3] so it composes with the rest via `and`. Docs with no tenant
 * (legacy/externalUrl imports that predate the tenant field) are excluded
 * once a site is selected — they only show when no site is selected.
 */
export function buildMediaWhere(
  folder: number | null,
  filter: MimeFilter,
  search: string,
  tenantId?: string | number | null,
): string {
  const parts: string[] = [
    folder == null
      ? 'where[and][0][folder][exists]=false'
      : `where[and][0][folder][equals]=${folder}`,
  ]
  if (filter === 'image') parts.push('where[and][1][mimeType][contains]=image%2F')
  else if (filter === 'video') parts.push('where[and][1][mimeType][contains]=video%2F')
  else if (filter === 'document') {
    parts.push('where[and][1][or][0][mimeType][contains]=application%2Fpdf')
    parts.push('where[and][1][or][1][mimeType][contains]=application%2Fmsword')
    parts.push('where[and][1][or][2][mimeType][contains]=application%2Fvnd')
  }
  if (search) {
    const q = encodeURIComponent(search)
    parts.push(`where[and][2][or][0][filename][like]=${q}`)
    parts.push(`where[and][2][or][1][alt][like]=${q}`)
  }
  if (tenantId != null && tenantId !== '') {
    parts.push(`where[and][3][tenant][equals]=${encodeURIComponent(String(tenantId))}`)
  }
  return parts.join('&')
}

/**
 * Build the `where` clause for the payload-folders REST query used by both
 * the subfolder listing (scoped to a parent folder) and the flat "move to
 * folder" dropdown (unscoped by folder). `folder === undefined` skips the
 * folder-parent clause entirely; `null` means "root" (folder[exists]=false).
 * `tenantId` scopes to the currently selected admin site — without it, the
 * folder tree/dropdown lists every tenant's folders regardless of the
 * selected site, even though the media items themselves are correctly
 * scoped by `buildMediaWhere`. Returns '' when neither filter applies.
 */
export function buildFolderWhere(
  folder: number | null | undefined,
  tenantId?: string | number | null,
): string {
  const parts: string[] = []
  if (folder !== undefined) {
    parts.push(
      folder == null
        ? `where[and][${parts.length}][folder][exists]=false`
        : `where[and][${parts.length}][folder][equals]=${folder}`,
    )
  }
  if (tenantId != null && tenantId !== '') {
    parts.push(`where[and][${parts.length}][tenant][equals]=${encodeURIComponent(String(tenantId))}`)
  }
  return parts.join('&')
}

/**
 * Run an async worker over `items` with at most `limit` of them in flight.
 *
 * Why the media dropzone needs this: Payload opens the Postgres transaction
 * for a `POST /api/media` BEFORE any file work, and only commits after the
 * WebP transcode (sharp) and the R2 PutObject have both finished. For most of
 * that window the session issues no SQL, so Postgres sees it as
 * `idle in transaction`. Firing every dropped file at once therefore parked
 * one pool connection per file in that state: the rest of the admin then
 * blocked waiting for a free connection (the dashboard appearing to hang),
 * and Postgres eventually force-killed the sessions via
 * `idle_in_transaction_session_timeout`. Bounding the fan-out caps pool usage,
 * sharp's CPU/memory load, and R2 upload bandwidth in one place.
 *
 * `limit` runners pull from a shared cursor, so items start in order but a
 * slow one only occupies its own slot. `worker` is expected to handle its own
 * failures — a rejection propagates and stops that runner.
 */
export async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  const runnerCount = Math.max(1, Math.min(Math.floor(limit), items.length))
  let cursor = 0
  const runners = Array.from({ length: runnerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      await worker(items[index]!, index)
    }
  })
  await Promise.all(runners)
}
