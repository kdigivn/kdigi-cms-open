/**
 * Pure, side-effect-free helper for SEO bulk-update logic.
 * Decides WHAT to patch for each doc — no I/O, no fetch, no Payload imports.
 *
 * Used by seo-bulk-action.tsx (client component) which calls Payload's built-in
 * PATCH /api/{collection} bulk update endpoint.
 *
 * Tenant scope is enforced by Payload's own access control on the PATCH endpoint.
 * This helper only sees the IDs the caller passes in — it never widens the set.
 */

export const DEFAULT_BATCH_SIZE = 50

export type RobotsValue = 'index' | 'follow' | 'noindex' | 'nofollow'

/**
 * The fields editable via bulk action.
 * All are optional — only fields with values present will be applied.
 */
export interface SeoBulkFields {
  /** If set, overrides seo.title */
  title?: string
  /** If set, overrides seo.description */
  description?: string
  /** If set, overrides seo.robots */
  robots?: RobotsValue[]
}

/**
 * Minimal view of a doc's existing SEO fields used for blank-only decisions.
 * Only `id` is required — seo fields may be absent.
 */
export interface DocSeoSnapshot {
  id: string | number
  seo?: {
    title?: string | null
    description?: string | null
    robots?: RobotsValue[] | null
  }
}

export type BulkMode = 'blankOnly' | 'overwrite'

export interface BulkPatch {
  id: string | number
  /** Partial update body — contains only the fields being changed */
  data: {
    'seo.title'?: string
    'seo.description'?: string
    'seo.robots'?: RobotsValue[]
  }
}

export interface BulkUpdatePlan {
  patches: BulkPatch[]
  /** IDs skipped because every field already had a value (blankOnly mode) */
  skipped: (string | number)[]
  /** IDs dropped because batch cap was reached — caller should paginate */
  truncated: (string | number)[]
}

/**
 * Determine per-doc patch objects given the provided docs + mode + desired fields.
 *
 * Rules:
 * - `overwrite`: apply all non-undefined fields to every doc in the batch.
 * - `blankOnly`: apply a field only when the doc's existing value is blank
 *   (null / undefined / empty string / empty array).
 * - Batch cap: at most `batchSize` patches are returned; remaining IDs go to
 *   `truncated` so the caller can paginate.
 * - A doc with nothing to patch (because every field already has a value in
 *   blankOnly mode) is added to `skipped`.
 * - Fields not present on `fields` (undefined) are never included in any patch.
 *
 * @param docs     - Docs with their current seo snapshot.
 * @param fields   - Desired SEO field values. Undefined fields are ignored.
 * @param mode     - 'blankOnly' (default) or 'overwrite'.
 * @param batchSize - Max patches to return (default DEFAULT_BATCH_SIZE).
 */
export function computeSeoBulkPatches(
  docs: DocSeoSnapshot[],
  fields: SeoBulkFields,
  mode: BulkMode = 'blankOnly',
  batchSize: number = DEFAULT_BATCH_SIZE,
): BulkUpdatePlan {
  const patches: BulkPatch[] = []
  const skipped: (string | number)[] = []
  const truncated: (string | number)[] = []

  for (const doc of docs) {
    // Once we've reached the cap, the rest go to truncated
    if (patches.length >= batchSize) {
      truncated.push(doc.id)
      continue
    }

    const data: BulkPatch['data'] = {}

    if (fields.title !== undefined) {
      if (mode === 'overwrite' || isBlank(doc.seo?.title)) {
        data['seo.title'] = fields.title
      }
    }

    if (fields.description !== undefined) {
      if (mode === 'overwrite' || isBlank(doc.seo?.description)) {
        data['seo.description'] = fields.description
      }
    }

    if (fields.robots !== undefined) {
      if (mode === 'overwrite' || isBlankArray(doc.seo?.robots)) {
        data['seo.robots'] = fields.robots
      }
    }

    if (Object.keys(data).length === 0) {
      skipped.push(doc.id)
    } else {
      patches.push({ id: doc.id, data })
    }
  }

  return { patches, skipped, truncated }
}

function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === ''
}

function isBlankArray(value: RobotsValue[] | null | undefined): boolean {
  return value === null || value === undefined || value.length === 0
}
