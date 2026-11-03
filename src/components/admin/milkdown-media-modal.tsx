'use client'

/**
 * Editor "Insert image" modal (Phase 8, Lark editor stabilization plan).
 *
 * An editor-specific shell, not a copy of the full Media Library
 * (`media-grid-list-view.tsx`, left untouched — see phase-08 Overview/F9).
 * Fetch/pagination/race logic lives in `milkdown-media-modal-controller.ts`;
 * this component owns presentation, tab/selection/alt-text UI, the
 * SSRF-safe URL-insert flow (F12), and the document-tenant scoping contract
 * (F10).
 *
 * Props are intentionally unchanged from the pre-Phase-8 shape
 * (`open` / `onClose` / `onSelect`) so `milkdown-editor-core.tsx` — owned by
 * another in-flight phase — needs no edit to keep working. `documentTenantId`
 * is a new OPTIONAL prop; until a future integration pass threads it through
 * `MarkdownEditorField` → `MilkdownEditorCore` → here, the modal degrades to
 * "no tenant scoping available" (identical to its pre-Phase-8 behavior) —
 * see the report for the exact wiring diff.
 */
import React, { useEffect, useRef, useState } from 'react'
import { useEditorCopy } from './milkdown-ui-copy'
import { useTenantSelection } from '@payloadcms/plugin-multi-tenant/client'

import { deriveAltFromFilename } from './media-p3-helpers'
import {
  hasTenantMismatch,
  LIBRARY_PAGE_SIZE,
  useMediaModalController,
  type MediaDoc,
} from './milkdown-media-modal-controller'
import { uploadFileToPayloadMedia } from './upload-to-payload-media'
import { usePanelFocusTrap } from './use-panel-focus-trap'
import { useBodyScrollLock } from './use-body-scroll-lock'
import './milkdown-layer-tokens.css'
import './milkdown-media-modal.css'

type Props = {
  open: boolean
  onClose: () => void
  onSelect: (payload: { alt: string; src: string }) => void
  /** Tenant of the document being edited (F10). Optional + backward
   *  compatible — see module doc comment. */
  documentTenantId?: string | number | null
}

type SelectedItem = { doc: MediaDoc; alt: string }

/** Response shape from POST /api/media (multipart upload) and
 *  POST /api/media/from-url — both return enough to populate a MediaDoc. */
type CreatedMediaResult = {
  id?: string | number
  url?: string
  alt?: string
  filename?: string
}

function deriveAltFromUrl(value: string): string {
  try {
    const pathname = new URL(value).pathname
    const lastSegment = pathname.split('/').filter(Boolean).at(-1)
    if (lastSegment) return deriveAltFromFilename(decodeURIComponent(lastSegment))
  } catch {
    return deriveAltFromFilename(value)
  }
  return 'Image'
}

function getImageAlt(alt: string | undefined, fallback: string): string {
  const trimmedAlt = alt?.trim()
  return trimmedAlt ? trimmedAlt : deriveAltFromFilename(fallback)
}

function docUrl(doc: MediaDoc): string {
  return doc.externalUrl ?? doc.url ?? ''
}

export function MilkdownMediaModal({ open, onClose, onSelect, documentTenantId = null }: Props) {
  const copy = useEditorCopy()
  const { state, actions } = useMediaModalController({ open, tenantId: documentTenantId })

  // The admin's global tenant-switcher selection — read directly via the
  // multi-tenant plugin's own hook (same seam `media-grid-list-view.tsx`
  // uses), NOT threaded through props. This is deliberately independent from
  // `documentTenantId`: the whole point of F10 is that they can disagree.
  const { selectedTenantID: switcherTenantId } = useTenantSelection()
  const tenantMismatch = hasTenantMismatch(documentTenantId, switcherTenantId)

  const [searchInput, setSearchInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const [selected, setSelected] = useState<SelectedItem | null>(null)
  const [remoteUrl, setRemoteUrl] = useState('')
  const [remoteAlt, setRemoteAlt] = useState('')
  const [remoteSubmitting, setRemoteSubmitting] = useState(false)
  const [remoteError, setRemoteError] = useState<string | null>(null)
  // Local (non-controller) error slot for upload failures — the controller's
  // `state.error` is reserved for library-listing failures.
  const [localError, setUploadErrorState] = useState<string | null>(null)

  // Debounce the search box → controller (300ms, matches the reference
  // gallery's debounce window).
  useEffect(() => {
    const t = setTimeout(() => actions.setSearch(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [actions, searchInput])

  // Clear transient (non-controller) UI state whenever the modal opens.
  // Focus trap + focus-return-on-close is delegated to `usePanelFocusTrap`
  // below (the same hook the three phase-7a panels use) instead of a
  // bespoke `document.activeElement` snapshot — this modal previously had no
  // trap at all despite `aria-modal="true"` (Tab could reach the toolbar/
  // editor behind the backdrop), a real accessibility regression against
  // that ARIA contract.
  const wasOpenRef = useRef(open)
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      // Just opened.
      setSelected(null)
      setSearchInput('')
      setRemoteUrl('')
      setRemoteAlt('')
      setRemoteError(null)
    }
    wasOpenRef.current = open
  }, [open])

  const containerRef = useRef<HTMLDivElement | null>(null)
  const { handleKeyDown } = usePanelFocusTrap({ containerRef, onEscape: onClose, open })
  useBodyScrollLock(open)

  // F10: selection tied to a specific listing is no longer valid once the
  // folder/tenant scope moves out from under it. Deliberate reset-on-prop-
  // change, same accepted pattern as media-grid-list-view.tsx's
  // tenant-change page reset.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(null)
  }, [state.currentFolder, documentTenantId])

  if (!open) return null

  const onFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const result = (await uploadFileToPayloadMedia(file, {
        folder: state.currentFolder,
        ...(documentTenantId != null ? { tenant: documentTenantId } : {}),
      })) as CreatedMediaResult
      selectCreatedDoc(result, file.name)
    } catch (err) {
      setUploadError(err)
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  function setUploadError(err: unknown) {
    setUploadErrorState(err instanceof Error ? err.message : 'Upload failed')
  }

  /** Common path for "a new media doc now exists" (upload success or
   *  URL-tab rehost success, F12): switch to the library tab, force a
   *  refresh, and pre-select the new doc so it can be inserted immediately —
   *  matches the phase's "new item can be selected" contract. */
  function selectCreatedDoc(result: CreatedMediaResult, fallbackName: string) {
    if (!result.id) return
    const created: MediaDoc = {
      id: result.id,
      alt: result.alt,
      filename: result.filename ?? fallbackName,
      url: result.url,
    }
    actions.setTab('library')
    actions.refresh()
    setSelected({ doc: created, alt: getImageAlt(created.alt, created.filename) })
  }

  const submitRemoteUrl = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmedUrl = remoteUrl.trim()
    if (!trimmedUrl) return
    setRemoteSubmitting(true)
    setRemoteError(null)
    try {
      // F12: never store a raw pasted URL — always route through the
      // SSRF-guarded rehost endpoint (src/lib/ssrf-guard.ts), which downloads
      // the bytes server-side and creates a first-party media doc.
      const response = await fetch('/api/media/from-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          url: trimmedUrl,
          alt: remoteAlt.trim() || undefined,
          folder: state.currentFolder,
          ...(documentTenantId != null ? { tenant: documentTenantId } : {}),
        }),
      })
      const data = (await response.json().catch(() => null)) as (CreatedMediaResult & { error?: string }) | null
      if (!response.ok) {
        throw new Error(data?.error ?? `HTTP ${response.status}`)
      }
      if (!data) throw new Error('Empty response from server')
      selectCreatedDoc(data, deriveAltFromUrl(trimmedUrl))
      setRemoteUrl('')
      setRemoteAlt('')
    } catch (err) {
      setRemoteError(err instanceof Error ? err.message : 'Không thêm được ảnh từ URL')
    } finally {
      setRemoteSubmitting(false)
    }
  }

  const confirmInsert = () => {
    if (!selected) return
    const src = docUrl(selected.doc)
    if (!src.trim()) return
    onSelect({ alt: selected.alt.trim() || getImageAlt(undefined, selected.doc.filename), src })
  }

  return (
    <div
      ref={containerRef}
      className="milkdown-media-modal"
      role="dialog"
      aria-modal="true"
      aria-label={copy('Insert image')}
      onKeyDown={handleKeyDown}
    >
      <div className="milkdown-media-modal__backdrop" onClick={onClose} />
      <div className="milkdown-media-modal__panel">
        <div className="milkdown-media-modal__header">
          <div>
            <h2>{copy('Insert image')}</h2>
            <p>{copy('Upload a new image, reuse media library assets, or paste a URL.')}</p>
          </div>
          <button
            type="button"
            className="milkdown-media-modal__close"
            onClick={onClose}
            aria-label={copy('Close image modal')}
          >
            ×
          </button>
        </div>

        <div className="milkdown-media-modal__tabs">
          <button
            type="button"
            className={state.tab === 'upload' ? 'is-active' : ''}
            onClick={() => actions.setTab('upload')}
          >
            {copy('Upload')}
          </button>
          <button
            type="button"
            className={state.tab === 'library' ? 'is-active' : ''}
            onClick={() => actions.setTab('library')}
          >
            {copy('Library')}
          </button>
          <button
            type="button"
            className={state.tab === 'url' ? 'is-active' : ''}
            onClick={() => actions.setTab('url')}
          >
            URL
          </button>
        </div>

        {tenantMismatch ? (
          <p className="milkdown-media-modal__tenant-warning">
            {copy('The library follows the document website, which differs from the selected admin website.')}
          </p>
        ) : null}

        {localError ? <p className="milkdown-media-modal__error">{localError}</p> : null}

        <div className="milkdown-media-modal__body">
          {state.tab === 'upload' ? (
            <label className="milkdown-media-modal__upload-card">
              <input type="file" accept="image/*" onChange={onFileChange} disabled={uploading} />
              <strong>{copy(uploading ? 'Uploading…' : 'Choose an image')}</strong>
              <span>{copy('Creates a new media doc, then lets you confirm alt text before inserting.')}</span>
            </label>
          ) : null}

          {state.tab === 'library' ? (
            <>
              <div className="milkdown-media-modal__toolbar">
                <input
                  type="search"
                  placeholder={copy('Search filename or alt text')}
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                />
              </div>

              <div className="milkdown-media-modal__folder-crumbs">
                <button
                  type="button"
                  className={state.folderPath.length === 0 ? 'is-current' : ''}
                  onClick={actions.gotoRoot}
                >
                  {copy('Root')}
                </button>
                {state.folderPath.map((crumb, index) => (
                  <React.Fragment key={crumb.id}>
                    <span aria-hidden="true">/</span>
                    <button
                      type="button"
                      className={index === state.folderPath.length - 1 ? 'is-current' : ''}
                      onClick={() => actions.gotoCrumb(index)}
                    >
                      {crumb.name}
                    </button>
                  </React.Fragment>
                ))}
              </div>

              {state.subfolders.length > 0 ? (
                <div className="milkdown-media-modal__subfolders">
                  {state.subfolders.map((folder) => (
                    <button
                      key={folder.id}
                      type="button"
                      className="milkdown-media-modal__subfolder"
                      onClick={() => actions.openFolder(folder)}
                    >
                      {folder.name}
                    </button>
                  ))}
                </div>
              ) : null}

              {state.error ? (
                <p className="milkdown-media-modal__error">
                  {state.error}{' '}
                  <button type="button" onClick={actions.refresh}>
                    {copy('Retry')}
                  </button>
                </p>
              ) : null}

              {state.loading ? (
                <div className="milkdown-media-modal__results milkdown-media-modal__results--empty">
                  <p>{copy('Loading media…')}</p>
                </div>
              ) : state.docs.length === 0 && !state.error ? (
                <div className="milkdown-media-modal__results milkdown-media-modal__results--empty">
                  <p>{copy('No image found.')}</p>
                </div>
              ) : (
                <div className="milkdown-media-modal__results">
                  {state.docs.map((doc) => {
                    const url = docUrl(doc)
                    const isSelected = selected?.doc.id === doc.id
                    return (
                      <button
                        key={String(doc.id)}
                        type="button"
                        className={`milkdown-media-modal__item${isSelected ? ' is-selected' : ''}`}
                        onClick={() => setSelected({ doc, alt: getImageAlt(doc.alt, doc.filename) })}
                      >
                        {url ? (
                          // eslint-disable-next-line @next/next/no-img-element -- admin-only thumbnail grid, not a Core Web Vitals surface (matches media-grid-list-view.tsx's own suppression).
                          <img src={url} alt={getImageAlt(doc.alt, doc.filename)} />
                        ) : null}
                        <strong>{getImageAlt(doc.alt, doc.filename)}</strong>
                        <span>{doc.filename}</span>
                      </button>
                    )
                  })}
                </div>
              )}

              <div className="milkdown-media-modal__pagination">
                <button
                  type="button"
                  onClick={() => actions.setPage(state.page - 1)}
                  disabled={state.loading || !state.hasPrevPage}
                >
                  {copy('Previous')}
                </button>
                <span>
                  {copy('Page')} {state.page} / {state.totalPages} ({copy('up to')} {LIBRARY_PAGE_SIZE} {copy('per page')})
                </span>
                <button
                  type="button"
                  onClick={() => actions.setPage(state.page + 1)}
                  disabled={state.loading || !state.hasNextPage}
                >
                  {copy('Next')}
                </button>
              </div>
            </>
          ) : null}

          {state.tab === 'url' ? (
            <form className="milkdown-media-modal__remote-form" onSubmit={submitRemoteUrl}>
              <label>
                {copy('Image URL')}
                <input
                  type="url"
                  placeholder="https://example.com/image.webp"
                  value={remoteUrl}
                  onChange={(event) => setRemoteUrl(event.target.value)}
                  disabled={remoteSubmitting}
                />
              </label>
              <label>
                {copy('Alt text')}
                <input
                  type="text"
                  placeholder={copy('Describe the image')}
                  value={remoteAlt}
                  onChange={(event) => setRemoteAlt(event.target.value)}
                  disabled={remoteSubmitting}
                />
              </label>
              {remoteError ? <p className="milkdown-media-modal__error">{remoteError}</p> : null}
              <button type="submit" disabled={remoteSubmitting || !remoteUrl.trim()}>
                {copy(remoteSubmitting ? 'Fetching…' : 'Fetch and add image')}
              </button>
            </form>
          ) : null}

          {selected ? (
            <div className="milkdown-media-modal__selected-panel">
              {docUrl(selected.doc) ? (
                // eslint-disable-next-line @next/next/no-img-element -- admin-only preview thumbnail, not a Core Web Vitals surface.
                <img src={docUrl(selected.doc)} alt={selected.alt} />
              ) : null}
              <input
                type="text"
                value={selected.alt}
                onChange={(event) => setSelected({ ...selected, alt: event.target.value })}
                aria-label={copy('Alt text for selected image')}
              />
              <button type="button" onClick={confirmInsert}>
                {copy('Insert')}
              </button>
              <button type="button" onClick={() => setSelected(null)}>
                {copy('Cancel')}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
