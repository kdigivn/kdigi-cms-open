/**
 * Unit tests for the pure parts of the editor media modal's controller:
 * `mediaModalReducer` (state transitions, pagination reset, stale-request
 * gating) and the tenant-mismatch helpers. No DOM/fetch — the hook wrapper
 * (`useMediaModalController`) is exercised implicitly by the modal component
 * and is intentionally free of branching logic of its own.
 *
 * Runner: node --import tsx --test
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  hasTenantMismatch,
  initialMediaModalState,
  mediaModalReducer,
  normalizeTenantId,
  type MediaDoc,
  type MediaModalState,
} from './milkdown-media-modal-controller'

const doc = (id: string | number, filename = `${id}.jpg`): MediaDoc => ({ id, filename })

describe('normalizeTenantId', () => {
  it('passes through non-empty strings', () => {
    assert.equal(normalizeTenantId('42'), '42')
  })
  it('stringifies finite numbers', () => {
    assert.equal(normalizeTenantId(42), '42')
  })
  it('unwraps a relationship object with an id', () => {
    assert.equal(normalizeTenantId({ id: 42 }), '42')
    assert.equal(normalizeTenantId({ id: 'site-a' }), 'site-a')
  })
  it('returns undefined for null/undefined/empty-string/NaN', () => {
    assert.equal(normalizeTenantId(null), undefined)
    assert.equal(normalizeTenantId(undefined), undefined)
    assert.equal(normalizeTenantId(''), undefined)
    assert.equal(normalizeTenantId(NaN), undefined)
  })
  it('returns undefined for an object with no id', () => {
    assert.equal(normalizeTenantId({}), undefined)
  })
})

describe('hasTenantMismatch (F10 UI contract)', () => {
  it('false when either side is unresolvable (nothing to compare)', () => {
    assert.equal(hasTenantMismatch(null, '3'), false)
    assert.equal(hasTenantMismatch('3', null), false)
    assert.equal(hasTenantMismatch(undefined, undefined), false)
  })
  it('false when both resolve to the same tenant', () => {
    assert.equal(hasTenantMismatch('3', 3), false)
    assert.equal(hasTenantMismatch({ id: 3 }, '3'), false)
  })
  it('true when they resolve to different tenants', () => {
    assert.equal(hasTenantMismatch('3', '4'), true)
    assert.equal(hasTenantMismatch({ id: 3 }, { id: 4 }), true)
  })
})

describe('mediaModalReducer — pagination reset (search/folder/tab/tenant)', () => {
  it('SET_SEARCH resets page to 1, clears docs, bumps requestSeq', () => {
    const withPage3: MediaModalState = { ...initialMediaModalState, page: 3, docs: [doc(1)] }
    const next = mediaModalReducer(withPage3, { type: 'SET_SEARCH', search: 'sunset' })
    assert.equal(next.page, 1)
    assert.deepEqual(next.docs, [])
    assert.equal(next.search, 'sunset')
    assert.equal(next.requestSeq, withPage3.requestSeq + 1)
  })

  it('SET_SEARCH with the same value is a no-op (no unnecessary refetch)', () => {
    const state: MediaModalState = { ...initialMediaModalState, search: 'sunset' }
    const next = mediaModalReducer(state, { type: 'SET_SEARCH', search: 'sunset' })
    assert.equal(next, state)
  })

  it('OPEN_FOLDER resets page, appends breadcrumb, bumps requestSeq', () => {
    const state: MediaModalState = { ...initialMediaModalState, page: 2 }
    const next = mediaModalReducer(state, { type: 'OPEN_FOLDER', folder: { id: 7, name: 'Promos' } })
    assert.equal(next.currentFolder, 7)
    assert.deepEqual(next.folderPath, [{ id: 7, name: 'Promos' }])
    assert.equal(next.page, 1)
    assert.equal(next.requestSeq, state.requestSeq + 1)
  })

  it('GOTO_ROOT clears folder + breadcrumb + page', () => {
    const state: MediaModalState = {
      ...initialMediaModalState,
      currentFolder: 7,
      folderPath: [{ id: 7, name: 'Promos' }],
      page: 3,
    }
    const next = mediaModalReducer(state, { type: 'GOTO_ROOT' })
    assert.equal(next.currentFolder, null)
    assert.deepEqual(next.folderPath, [])
    assert.equal(next.page, 1)
  })

  it('GOTO_CRUMB truncates the breadcrumb trail to the clicked index', () => {
    const state: MediaModalState = {
      ...initialMediaModalState,
      currentFolder: 9,
      folderPath: [
        { id: 7, name: 'Promos' },
        { id: 8, name: '2026' },
        { id: 9, name: 'Summer' },
      ],
    }
    const next = mediaModalReducer(state, { type: 'GOTO_CRUMB', index: 0 })
    assert.equal(next.currentFolder, 7)
    assert.deepEqual(next.folderPath, [{ id: 7, name: 'Promos' }])
  })

  it('GOTO_CRUMB with an out-of-range index is a no-op', () => {
    const state: MediaModalState = { ...initialMediaModalState, folderPath: [{ id: 7, name: 'Promos' }] }
    const next = mediaModalReducer(state, { type: 'GOTO_CRUMB', index: 5 })
    assert.equal(next, state)
  })

  it('RESET_FOR_TENANT_CHANGE clears folder/page/results but preserves search text', () => {
    const state: MediaModalState = {
      ...initialMediaModalState,
      search: 'sunset',
      currentFolder: 7,
      folderPath: [{ id: 7, name: 'Promos' }],
      page: 3,
      docs: [doc(1)],
      subfolders: [{ id: 7, name: 'Promos' }],
    }
    const next = mediaModalReducer(state, { type: 'RESET_FOR_TENANT_CHANGE' })
    assert.equal(next.currentFolder, null)
    assert.deepEqual(next.folderPath, [])
    assert.equal(next.page, 1)
    assert.deepEqual(next.docs, [])
    assert.deepEqual(next.subfolders, [])
    assert.equal(next.search, 'sunset', 'search text is user input, not tenant-derived — must survive')
    assert.equal(next.requestSeq, state.requestSeq + 1)
  })

  it('SET_TAB resets page and bumps requestSeq only when the tab actually changes', () => {
    const state: MediaModalState = { ...initialMediaModalState, tab: 'upload', page: 3 }
    const changed = mediaModalReducer(state, { type: 'SET_TAB', tab: 'library' })
    assert.equal(changed.page, 1)
    assert.equal(changed.requestSeq, state.requestSeq + 1)

    const unchanged = mediaModalReducer(state, { type: 'SET_TAB', tab: 'upload' })
    assert.equal(unchanged, state)
  })

  it('SET_PAGE clamps into [1, totalPages] and no-ops when the page is unchanged', () => {
    const state: MediaModalState = { ...initialMediaModalState, totalPages: 5, page: 2 }
    assert.equal(mediaModalReducer(state, { type: 'SET_PAGE', page: 99 }).page, 5)
    assert.equal(mediaModalReducer(state, { type: 'SET_PAGE', page: -3 }).page, 1)
    assert.equal(mediaModalReducer(state, { type: 'SET_PAGE', page: 2 }), state)
  })
})

describe('mediaModalReducer — stale-request gating (race safety)', () => {
  it('ignores a REQUEST_SUCCESS tagged with a superseded requestSeq', () => {
    // Search #1 fires (seq 0 -> 1) …
    let state = mediaModalReducer(initialMediaModalState, { type: 'SET_SEARCH', search: 'first' })
    const staleSeq = state.requestSeq
    state = mediaModalReducer(state, { type: 'REQUEST_START', requestSeq: staleSeq })
    assert.equal(state.loading, true)

    // … then search #2 fires before #1's response arrives (seq 1 -> 2).
    state = mediaModalReducer(state, { type: 'SET_SEARCH', search: 'second' })
    assert.equal(state.loading, true, 'a fresh SET_SEARCH does not itself flip loading off')

    // Search #1's late response arrives — must be dropped (page/search should
    // reflect search #2's request, not #1's stale payload).
    const afterStaleSuccess = mediaModalReducer(state, {
      type: 'REQUEST_SUCCESS',
      requestSeq: staleSeq,
      docs: [doc('stale-result')],
      page: 1,
      totalPages: 1,
      hasPrevPage: false,
      hasNextPage: false,
    })
    assert.equal(afterStaleSuccess, state, 'stale success must be a complete no-op')
    assert.deepEqual(afterStaleSuccess.docs, [], 'no stale item may flash into view')

    // Search #2's response arrives with the CURRENT requestSeq — applies.
    const currentSeq = state.requestSeq
    const afterCurrentSuccess = mediaModalReducer(state, {
      type: 'REQUEST_SUCCESS',
      requestSeq: currentSeq,
      docs: [doc('fresh-result')],
      page: 1,
      totalPages: 1,
      hasPrevPage: false,
      hasNextPage: false,
    })
    assert.equal(afterCurrentSuccess.loading, false)
    assert.deepEqual(afterCurrentSuccess.docs, [doc('fresh-result')])
  })

  it('ignores a stale REQUEST_ERROR the same way', () => {
    let state = mediaModalReducer(initialMediaModalState, { type: 'SET_SEARCH', search: 'first' })
    const staleSeq = state.requestSeq
    state = mediaModalReducer(state, { type: 'OPEN_FOLDER', folder: { id: 1, name: 'A' } })

    const afterStaleError = mediaModalReducer(state, {
      type: 'REQUEST_ERROR',
      requestSeq: staleSeq,
      message: 'stale failure',
    })
    assert.equal(afterStaleError, state)
    assert.equal(afterStaleError.error, null)
  })

  it('a fresh REQUEST_ERROR clears docs and surfaces the message', () => {
    const state: MediaModalState = { ...initialMediaModalState, docs: [doc(1)] }
    const next = mediaModalReducer(state, {
      type: 'REQUEST_ERROR',
      requestSeq: state.requestSeq,
      message: 'HTTP 500',
    })
    assert.equal(next.loading, false)
    assert.equal(next.error, 'HTTP 500')
    assert.deepEqual(next.docs, [])
  })
})

describe('mediaModalReducer — folders + refresh', () => {
  it('FOLDERS_SUCCESS sets the subfolder list without touching pagination/requestSeq', () => {
    const state = initialMediaModalState
    const next = mediaModalReducer(state, {
      type: 'FOLDERS_SUCCESS',
      subfolders: [{ id: 1, name: 'Promos' }],
    })
    assert.deepEqual(next.subfolders, [{ id: 1, name: 'Promos' }])
    assert.equal(next.requestSeq, state.requestSeq)
  })

  it('REFRESH bumps both requestSeq and refreshSeq (forces a refetch of the same page/filter)', () => {
    const state: MediaModalState = { ...initialMediaModalState, page: 2, search: 'sunset' }
    const next = mediaModalReducer(state, { type: 'REFRESH' })
    assert.equal(next.page, 2, 'refresh must not silently reset the current page/search')
    assert.equal(next.search, 'sunset')
    assert.equal(next.requestSeq, state.requestSeq + 1)
    assert.equal(next.refreshSeq, state.refreshSeq + 1)
  })
})
