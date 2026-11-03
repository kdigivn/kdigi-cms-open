'use client'

/**
 * Modal-scoped fetch/pagination controller for the Milkdown editor's "Insert
 * image" modal (Phase 8 of the Lark editor stabilization plan).
 *
 * Mirrors `media-grid-list-view.tsx`'s proven query semantics — `credentials:
 * 'include'`, `limit=24`, page/search/folder/tenant `where` params, abort on
 * stale requests — WITHOUT touching that component or extracting shared
 * primitives from it (Red Team F9: extraction is deferred until a second real
 * consumer exists). The query-string builders (`buildMediaWhere`,
 * `buildFolderWhere`) are imported from `./media-p3-helpers`, which already
 * holds that proven, unit-tested logic — reusing them here IS the
 * "mirroring" the plan asks for, not a re-implementation.
 *
 * Split for testability:
 *   - Pure functions/reducer (`mediaModalReducer`, `normalizeTenantId`,
 *     `hasTenantMismatch`) — no DOM, no fetch, unit-tested directly.
 *   - `useMediaModalController`, a thin hook wrapper that runs the reducer,
 *     performs the actual `fetch()` calls, and wires `AbortController` for
 *     stale-request cancellation. This hook contains no branching logic of
 *     its own beyond "build a URL, fetch it, dispatch the result" — all
 *     race/reset/error decisions live in the reducer.
 *
 * Race safety model: every action that changes what the library should show
 * (search/folder/tab/tenant/page/refresh) bumps `requestSeq` in the SAME
 * reducer transition that changes the filter. The fetch effect closes over
 * the `requestSeq` value current at the time it fires and tags every
 * dispatched result with it; `REQUEST_SUCCESS`/`REQUEST_ERROR` are dropped by
 * the reducer if `state.requestSeq` has since moved on. `AbortController` is
 * layered on top as the network-level defense (stops the request outright);
 * the requestSeq gate is a second, pure-logic defense that also covers a
 * response that resolves before an in-flight abort takes effect.
 */
import { useEffect, useMemo, useReducer, type Dispatch } from 'react'

import { buildFolderWhere, buildMediaWhere } from './media-p3-helpers'

export const LIBRARY_PAGE_SIZE = 24

export type MediaDoc = {
  id: string | number
  alt?: string
  filename: string
  mimeType?: string
  url?: string
  externalUrl?: string
}

export type SubFolder = { id: number; name: string }
export type FolderCrumb = { id: number; name: string }

export type MediaModalTab = 'upload' | 'library' | 'url'

export interface MediaModalState {
  tab: MediaModalTab
  search: string
  currentFolder: number | null
  folderPath: FolderCrumb[]
  page: number
  totalPages: number
  hasPrevPage: boolean
  hasNextPage: boolean
  docs: MediaDoc[]
  subfolders: SubFolder[]
  loading: boolean
  error: string | null
  /** Monotonic id of the request currently considered authoritative — see
   *  module doc comment for the race-safety model. */
  requestSeq: number
  /** Bumped on `REFRESH` (post-upload / manual retry) to force a refetch of
   *  the current page even when no filter actually changed. */
  refreshSeq: number
}

export type MediaModalAction =
  | { type: 'SET_TAB'; tab: MediaModalTab }
  | { type: 'SET_SEARCH'; search: string }
  | { type: 'OPEN_FOLDER'; folder: SubFolder }
  | { type: 'GOTO_ROOT' }
  | { type: 'GOTO_CRUMB'; index: number }
  | { type: 'SET_PAGE'; page: number }
  | { type: 'RESET_FOR_TENANT_CHANGE' }
  | { type: 'REQUEST_START'; requestSeq: number }
  | {
      type: 'REQUEST_SUCCESS'
      requestSeq: number
      docs: MediaDoc[]
      page: number
      totalPages: number
      hasPrevPage: boolean
      hasNextPage: boolean
    }
  | { type: 'REQUEST_ERROR'; requestSeq: number; message: string }
  | { type: 'FOLDERS_SUCCESS'; subfolders: SubFolder[] }
  | { type: 'REFRESH' }

export const initialMediaModalState: MediaModalState = {
  tab: 'upload',
  search: '',
  currentFolder: null,
  folderPath: [],
  page: 1,
  totalPages: 1,
  hasPrevPage: false,
  hasNextPage: false,
  docs: [],
  subfolders: [],
  loading: false,
  error: null,
  requestSeq: 0,
  refreshSeq: 0,
}

export function mediaModalReducer(state: MediaModalState, action: MediaModalAction): MediaModalState {
  switch (action.type) {
    case 'SET_TAB':
      if (action.tab === state.tab) return state
      return { ...state, tab: action.tab, page: 1, error: null, requestSeq: state.requestSeq + 1 }

    case 'SET_SEARCH':
      if (action.search === state.search) return state
      return {
        ...state,
        search: action.search,
        page: 1,
        docs: [],
        error: null,
        requestSeq: state.requestSeq + 1,
      }

    case 'OPEN_FOLDER':
      return {
        ...state,
        currentFolder: action.folder.id,
        folderPath: [...state.folderPath, { id: action.folder.id, name: action.folder.name }],
        page: 1,
        docs: [],
        subfolders: [],
        error: null,
        requestSeq: state.requestSeq + 1,
      }

    case 'GOTO_ROOT':
      if (state.currentFolder === null) return state
      return {
        ...state,
        currentFolder: null,
        folderPath: [],
        page: 1,
        docs: [],
        subfolders: [],
        error: null,
        requestSeq: state.requestSeq + 1,
      }

    case 'GOTO_CRUMB': {
      const target = state.folderPath[action.index]
      if (!target) return state
      return {
        ...state,
        currentFolder: target.id,
        folderPath: state.folderPath.slice(0, action.index + 1),
        page: 1,
        docs: [],
        subfolders: [],
        error: null,
        requestSeq: state.requestSeq + 1,
      }
    }

    case 'SET_PAGE': {
      const page = Math.max(1, Math.min(state.totalPages, action.page))
      if (page === state.page) return state
      return { ...state, page, error: null, requestSeq: state.requestSeq + 1 }
    }

    // F10: the document's tenant changed (or the admin tenant-switcher moved
    // while the modal was open) — invalidate any in-flight request and clear
    // folder/page/results so no cross-tenant item can flash. The search text
    // is intentionally preserved (it is user input, not tenant-derived state).
    case 'RESET_FOR_TENANT_CHANGE':
      return {
        ...state,
        page: 1,
        docs: [],
        subfolders: [],
        currentFolder: null,
        folderPath: [],
        error: null,
        requestSeq: state.requestSeq + 1,
      }

    case 'REQUEST_START':
      if (action.requestSeq !== state.requestSeq) return state // superseded before it could even start
      return { ...state, loading: true }

    case 'REQUEST_SUCCESS':
      if (action.requestSeq !== state.requestSeq) return state // stale response — ignore
      return {
        ...state,
        loading: false,
        error: null,
        docs: action.docs,
        page: action.page,
        totalPages: action.totalPages,
        hasPrevPage: action.hasPrevPage,
        hasNextPage: action.hasNextPage,
      }

    case 'REQUEST_ERROR':
      if (action.requestSeq !== state.requestSeq) return state // stale response — ignore
      return { ...state, loading: false, error: action.message, docs: [] }

    case 'FOLDERS_SUCCESS':
      return { ...state, subfolders: action.subfolders }

    case 'REFRESH':
      return { ...state, refreshSeq: state.refreshSeq + 1, requestSeq: state.requestSeq + 1, error: null }

    default:
      return state
  }
}

// ─── Tenant helpers (F10 — UI correctness contract, not a server boundary;
// Media's `read: () => true` is intentional, see phase-08 Overview) ────────

/** Normalize a relationship value (id | { id } | number | null) to a
 *  comparable string id, or `undefined` when nothing is resolvable. */
export function normalizeTenantId(value: unknown): string | undefined {
  if (value == null) return undefined
  if (typeof value === 'string') return value || undefined
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : undefined
  if (typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
    const inner = (value as { id: unknown }).id
    return inner == null ? undefined : String(inner)
  }
  return undefined
}

/**
 * True when the admin tenant-switcher's current selection disagrees with the
 * tenant of the document being edited. Both values must resolve to a
 * concrete id — if either is absent (no site selected, or a legacy document
 * with no tenant recorded) there is nothing to compare, so no warning.
 */
export function hasTenantMismatch(documentTenantId: unknown, switcherTenantId: unknown): boolean {
  const doc = normalizeTenantId(documentTenantId)
  const switcher = normalizeTenantId(switcherTenantId)
  if (!doc || !switcher) return false
  return doc !== switcher
}

// ─── Hook wrapper (fetch I/O only — no branching logic beyond dispatch) ────

type MediaFindResponse = {
  docs?: MediaDoc[]
  page?: number
  prevPage?: number | null
  hasNextPage?: boolean
  nextPage?: number | null
  totalPages?: number
}

type FolderFindResponse = { docs?: SubFolder[] }

export interface UseMediaModalControllerOptions {
  /** Only fetches while the modal is open — closed-but-mounted is idle. */
  open: boolean
  /** Tenant of the DOCUMENT being edited (F10) — scopes every query and is
   *  the value uploads should be tagged with. `undefined`/`null` means no
   *  tenant scoping is applied (legacy content, or the field couldn't
   *  resolve one) — mirrors `buildMediaWhere`'s existing "omit when absent"
   *  contract. */
  tenantId?: string | number | null
}

export interface MediaModalActions {
  setTab: (tab: MediaModalTab) => void
  setSearch: (search: string) => void
  openFolder: (folder: SubFolder) => void
  gotoRoot: () => void
  gotoCrumb: (index: number) => void
  setPage: (page: number) => void
  refresh: () => void
}

function buildActions(dispatch: Dispatch<MediaModalAction>): MediaModalActions {
  return {
    setTab: (tab) => dispatch({ type: 'SET_TAB', tab }),
    setSearch: (search) => dispatch({ type: 'SET_SEARCH', search }),
    openFolder: (folder) => dispatch({ type: 'OPEN_FOLDER', folder }),
    gotoRoot: () => dispatch({ type: 'GOTO_ROOT' }),
    gotoCrumb: (index) => dispatch({ type: 'GOTO_CRUMB', index }),
    setPage: (page) => dispatch({ type: 'SET_PAGE', page }),
    refresh: () => dispatch({ type: 'REFRESH' }),
  }
}

export function useMediaModalController({
  open,
  tenantId,
}: UseMediaModalControllerOptions): { state: MediaModalState; actions: MediaModalActions } {
  const [state, dispatch] = useReducer(mediaModalReducer, initialMediaModalState)
  // Stable across renders (only changes if `dispatch` itself did, which
  // `useReducer` never does) — lets consumers depend on `actions` in their
  // own effects without an exhaustive-deps escape hatch or spurious re-runs.
  const actions = useMemo(() => buildActions(dispatch), [dispatch])

  // F10: tenant changed (document changed under the modal, or a future prop
  // wiring flips it) while the modal was mounted — reset so no cross-tenant
  // item can flash before the next fetch resolves. Runs once per distinct
  // tenant value; the effect's dependency array is the "did it change" gate.
  const normalizedTenantId = normalizeTenantId(tenantId)
  useEffect(() => {
    dispatch({ type: 'RESET_FOR_TENANT_CHANGE' })
  }, [normalizedTenantId])

  // Library results fetch — races handled per the module doc comment.
  useEffect(() => {
    if (!open || state.tab !== 'library') return
    const requestSeq = state.requestSeq
    const abortController = new AbortController()

    dispatch({ type: 'REQUEST_START', requestSeq })

    const mediaWhere = buildMediaWhere(state.currentFolder, 'image', state.search, tenantId)
    const params = new URLSearchParams({
      depth: '0',
      limit: String(LIBRARY_PAGE_SIZE),
      page: String(state.page),
      sort: '-updatedAt',
    })

    fetch(`/api/media?${params.toString()}&${mediaWhere}`, {
      credentials: 'include',
      signal: abortController.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = (await response.json()) as MediaFindResponse
        dispatch({
          type: 'REQUEST_SUCCESS',
          requestSeq,
          docs: Array.isArray(data.docs) ? data.docs : [],
          page: Math.max(1, data.page ?? state.page),
          totalPages: Math.max(1, data.totalPages ?? 1),
          hasPrevPage: Boolean(data.prevPage),
          hasNextPage: Boolean(data.hasNextPage && data.nextPage),
        })
      })
      .catch((err: unknown) => {
        if (abortController.signal.aborted) return
        dispatch({
          type: 'REQUEST_ERROR',
          requestSeq,
          message: err instanceof Error ? err.message : 'Failed to load media',
        })
      })

    return () => abortController.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `actions`/`dispatch` are stable; `tenantId` (raw) is used for the where-clause, `state.requestSeq` is read via closure intentionally (see module doc).
  }, [open, state.tab, state.currentFolder, state.search, state.page, state.refreshSeq, tenantId])

  // Folder listing — its own effect (not gated by page/search) so paging or
  // searching within a folder doesn't re-fetch the folder list. Failures are
  // silent/non-fatal (mirrors media-grid-list-view.tsx): a missing subfolder
  // list degrades to "no subfolders shown", not a blocked modal.
  useEffect(() => {
    if (!open || state.tab !== 'library') return
    const abortController = new AbortController()
    const folderWhere = buildFolderWhere(state.currentFolder, tenantId)

    fetch(`/api/payload-folders?limit=100&depth=0&sort=name&${folderWhere}`, {
      credentials: 'include',
      signal: abortController.signal,
    })
      .then(async (response) => {
        if (!response.ok) return
        const data = (await response.json()) as FolderFindResponse
        if (abortController.signal.aborted) return
        dispatch({ type: 'FOLDERS_SUCCESS', subfolders: Array.isArray(data.docs) ? data.docs : [] })
      })
      .catch(() => undefined)

    return () => abortController.abort()
  }, [open, state.tab, state.currentFolder, state.refreshSeq, tenantId])

  return { state, actions }
}
