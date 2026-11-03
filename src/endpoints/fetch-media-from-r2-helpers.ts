/**
 * Pure helpers for the Fetch-from-R2 endpoint.
 *
 * Extracted from fetch-media-from-r2.ts so the unit tests can import them
 * without pulling in the AWS SDK (which has many transitive deps that the
 * node --test runner handles fine but the test would not exercise).
 */

/**
 * Parse an R2 key into its parts.
 *
 * Two key shapes occur on a full-bucket scan:
 *   1. Adapter-written objects: `media/<tenantId>/<folder-path>?/<ts>-<file>`.
 *      The `media/<tenantId>/` prefix is structural (not a real folder), so it
 *      is dropped — the remaining path becomes the folder tree.
 *   2. Out-of-band objects with any other path, e.g. `wp-content/uploads/x.png`.
 *      The full path becomes the folder tree (`wp-content/uploads` → filename).
 *
 * Returns the filename and the folder segments (empty = import to root).
 */
export function parseMediaKey(key: string): {
  filename: string
  folderSegments: string[]
} {
  const segments = key.split('/').filter(Boolean)
  // Drop the structural `media/<tenantId>/` prefix on adapter-written keys.
  const rest =
    segments[0] === 'media' && segments.length >= 2 ? segments.slice(2) : segments
  const filename = rest[rest.length - 1] ?? ''
  const folderSegments = rest.slice(0, -1)
  return { filename, folderSegments }
}

/** Default alt derived from a filename: strip the last extension. */
export function defaultAltFromFilename(name: string): string {
  const idx = name.lastIndexOf('.')
  if (idx <= 0) return name
  return name.slice(0, idx)
}

/**
 * Cache of created/found Payload folder ids, keyed by `${tenantId}:${path}`.
 * Lifetime = single request. Avoids duplicate creates within the run.
 *
 * **P0-1 mitigation note (red-team pass):** the `payload-folders` table is
 * global (no tenant column). Without tenant-prefixing the cache key, a
 * request for tenant A followed by tenant B with the same path segments
 * would reuse A's folder id and write B's media doc into A's folder —
 * a cross-tenant data leak. The `keyFor` helper bakes the tenantId in,
 * so a single FolderCache instance cannot serve two tenants in the same
 * request. Combined with the `folderType:['media']` filter on the find
 * (which keeps the global table per-collection-namespaced), this is
 * defense in depth. We do NOT rename folders to include the tenant id
 * (e.g. `t1/promos`) because that would be a user-visible regression for
 * folder names — the security boundary is enforced by the cache key +
 * filter, not by the display name.
 */
export class FolderCache {
  private map = new Map<string, string>()

  /** Compose a stable cache key for the (tenantId, segments) tuple. */
  static keyFor(tenantId: string, segments: readonly string[]): string {
    return `${tenantId}:${segments.join('/')}`
  }

  get(tenantId: string, segments: readonly string[]): string | undefined {
    return this.map.get(FolderCache.keyFor(tenantId, segments))
  }

  set(tenantId: string, segments: readonly string[], id: string): void {
    this.map.set(FolderCache.keyFor(tenantId, segments), id)
  }

  size(): number {
    return this.map.size
  }

  /** Test helper: clear the cache. */
  clear(): void {
    this.map.clear()
  }
}
