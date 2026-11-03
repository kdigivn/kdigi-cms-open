'use client'
/**
 * Custom Media list view for Payload admin — grid thumbnails + filter chips +
 * native-folder navigation. Registered via admin.components.views.list in media.ts.
 *
 * Folders: uses Payload's `folders: true` data model (the `payload-folders`
 * collection + media.folder). The view browses one folder at a time — subfolders
 * and folder-scoped media — instead of a flat list, so the native folder tree the
 * default list would have shown is reproduced here. Falls back to direct API fetch
 * (no dependency on useListQuery availability).
 *
 * This is a full custom view (not Payload's native collection table), so the
 * `.twp` Tailwind fence + utilities are safe to use throughout.
 *
 * Phase 3 additions:
 *   - Debounced text search across filename + alt (300ms).
 *   - Drag-drop multi-file upload via MediaUploadDropzone (extracted).
 *   - Alt + MIME badge on every grid tile.
 *   - Empty-state copy mentions drop / upload as alternatives.
 */
import React, { useState, useEffect, useRef } from 'react'
import { useAuth, useListDrawerContext, useTranslation } from '@payloadcms/ui'
import { useTenantSelection } from '@payloadcms/plugin-multi-tenant/client'
import type { User } from '@/payload-types'
import { userTenantIds } from '@/lib/admin-selected-tenant'
import {
  Image as ImageIcon,
  Video,
  FileText,
  Files,
  LayoutGrid,
  List as ListIcon,
  Upload,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  X,
  CloudDownload,
  Link2,
  Trash2,
} from 'lucide-react'
import { MediaLightbox } from './media-lightbox'
import type { LightboxDoc } from './media-lightbox'
import { MediaFolderBar } from './media-folder-bar'
import type { FolderCrumb, SubFolder } from './media-folder-bar'
import { MediaMoveSelect } from './media-move-select'
import { MediaUploadDropzone } from './media-upload-dropzone'
import { MediaImageEditor } from './media-image-editor'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { buildMediaWhere, buildFolderWhere, type MimeFilter } from './media-p3-helpers'

const CHIP_LABELS: Record<MimeFilter, string> = {
  all: 'Tất cả',
  image: 'Ảnh',
  video: 'Video',
  document: 'Tài liệu',
}
const CHIP_LABELS_EN: Record<MimeFilter, string> = { all: 'All', image: 'Images', video: 'Video', document: 'Documents' }

const CHIP_ICONS: Record<MimeFilter, React.ReactNode> = {
  all: <Files className="size-3.5" />,
  image: <ImageIcon className="size-3.5" />,
  video: <Video className="size-3.5" />,
  document: <FileText className="size-3.5" />,
}

/**
 * Build the `where` clause for the media REST query. Combines the folder
 * scope, the MIME chip, and the (optional) text search across filename +
 * alt. Returns a URL-encoded query string (without the leading '?').
 *
 * The search is encoded as a nested `or` over two `like` predicates — the
 * Payload REST API evaluates these case-insensitively on the underlying DB.
 *
  * Phase 3 addition: the search clause is appended with index [2] (after the
  * folder [0] and mime [1] clauses) so the three filters compose with `and`.
 */
// buildMediaWhere is now imported from ./media-p3-helpers (extracted for
// unit testability — the .tsx transitively imports @payloadcms/ui which
// pulls in a CSS file that node --test cannot resolve under tsx).

/** Non-image placeholder icon by mime type. */
function FileTypeIcon({ mimeType, className }: { mimeType?: string; className?: string }) {
  return mimeType?.startsWith('video/') ? (
    <Video className={className} />
  ) : (
    <FileText className={className} />
  )
}

/** Human-readable MIME label for the grid tile badge. */
function mimeBadgeLabel(mimeType?: string): string {
  if (!mimeType) return '—'
  if (mimeType === 'image/jpeg') return 'JPG'
  if (mimeType === 'image/png') return 'PNG'
  if (mimeType === 'image/webp') return 'WebP'
  if (mimeType === 'image/svg+xml') return 'SVG'
  if (mimeType === 'image/gif') return 'GIF'
  if (mimeType === 'image/avif') return 'AVIF'
  if (mimeType === 'application/pdf') return 'PDF'
  if (mimeType.startsWith('image/')) return mimeType.slice(6).toUpperCase()
  if (mimeType.startsWith('video/')) return mimeType.slice(6).toUpperCase()
  if (mimeType.startsWith('audio/')) return mimeType.slice(6).toUpperCase()
  return mimeType.split('/').pop()?.toUpperCase() ?? '—'
}

export const MediaGridListView: React.FC = () => {
  const { user, permissions } = useAuth<User>()
  const { i18n } = useTranslation()
  const isEnglish = i18n.language === 'en'
  const [readError, setReadError] = useState<string | null>(null)
  const [docs, setDocs] = useState<LightboxDoc[]>([])
  const [subfolders, setSubfolders] = useState<SubFolder[]>([])
  const [allFolders, setAllFolders] = useState<SubFolder[]>([])
  const [currentFolder, setCurrentFolder] = useState<number | null>(null)
  const [folderPath, setFolderPath] = useState<FolderCrumb[]>([])
  const [mimeFilter, setMimeFilter] = useState<MimeFilter>('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [lightboxDoc, setLightboxDoc] = useState<LightboxDoc | null>(null)
  const [loading, setLoading] = useState(false)
  // Phase 3: search input (raw, untrimmed) — debounced below.
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')

  // When this list view is rendered inside a relationship/upload field's
  // "Choose from existing" drawer, Payload provides onSelect via context (the raw
  // context defaults to {} so this is safe on the normal full-page list too).
  // In drawer mode a doc click selects it for the field instead of opening the lightbox.
  const drawerCtx = useListDrawerContext()
  const selectForDrawer = drawerCtx?.onSelect

  // The site currently selected in the admin's tenant switcher. Scopes the
  // Media Library to that site's uploads — without this, the grid ignores
  // the selector entirely and always lists every tenant's media.
  const { selectedTenantID } = useTenantSelection()
  const tenantAssigned = selectedTenantID != null && (user?.role === 'super-admin' || userTenantIds({ tenants: user?.tenants ?? undefined }).includes(String(selectedTenantID)))
  const canUpload = permissions?.collections?.media?.create === true && drawerCtx.allowCreate !== false && tenantAssigned
  const canUpdate = permissions?.collections?.media?.update === true && tenantAssigned
  const canDelete = permissions?.collections?.media?.delete === true && tenantAssigned
  const canCreateFolder = permissions?.collections?.['payload-folders']?.create === true && tenantAssigned
  const noWebsiteAccess = user?.role !== 'super-admin' && (!Array.isArray(user?.tenants) || user.tenants.length === 0)
  const chooseWebsite = !noWebsiteAccess && user?.role !== 'super-admin' && !tenantAssigned
  const previewOpenerRef = useRef<HTMLElement | null>(null)
  const pickDoc = (doc: LightboxDoc) => {
    if (selectForDrawer) {
      selectForDrawer({ collectionSlug: 'media', doc, docID: String(doc.id) })
      return
    }
    if (isImg(doc)) {
      previewOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setLightboxDoc(doc)
    }
  }
  const [refreshKey, setRefreshKey] = useState(0)
  const [editingDoc, setEditingDoc] = useState<LightboxDoc | null>(null)
  const [droppedFiles, setDroppedFiles] = useState<FileList | null>(null)
  useEffect(() => {
    if (lightboxDoc || editingDoc || !previewOpenerRef.current) return
    const opener = previewOpenerRef.current
    const frame = requestAnimationFrame(() => { if (opener.isConnected) opener.focus() })
    return () => cancelAnimationFrame(frame)
  }, [lightboxDoc, editingDoc])
  // Phase 4: Fetch-from-R2 button state — disable while the call is in
  // flight, show a toast-like result on success.
  const [fetching, setFetching] = useState(false)
  const [fetchResult, setFetchResult] = useState<{
    imported: number
    skipped: number
    foldersCreated: number
    remainder: number
    errors: string[]
  } | null>(null)
  // Auto-dismiss the Fetch R2 result toast after 6 seconds.
  useEffect(() => {
    if (!fetchResult) return
    const t = setTimeout(() => setFetchResult(null), 6000)
    return () => clearTimeout(t)
  }, [fetchResult])

  // Phase 7: paste-URL inline form state.
  const [pasteUrlOpen, setPasteUrlOpen] = useState(false)
  const [pasteUrl, setPasteUrl] = useState('')
  const [pasteAlt, setPasteAlt] = useState('')
  const [pasteSubmitting, setPasteSubmitting] = useState(false)
  const [pasteError, setPasteError] = useState<string | null>(null)

  const submitPasteUrl = async () => {
    setPasteError(null)
    setPasteSubmitting(true)
    try {
      const res = await fetch('/api/media/from-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          url: pasteUrl,
          alt: pasteAlt,
          folder: currentFolder,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error((data as { error?: string } | null)?.error ?? `HTTP ${res.status}`)
      }
      const created = data as { id: string | number }
      // Auto-select into drawer mode if applicable
      if (selectForDrawer && created?.id) {
        selectForDrawer({ collectionSlug: 'media', doc: { id: created.id }, docID: String(created.id) })
      }
      setPasteUrlOpen(false)
      setPasteUrl('')
      setPasteAlt('')
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setPasteError(err instanceof Error ? err.message : 'Lỗi mạng')
    } finally {
      setPasteSubmitting(false)
    }
  }

  const fetchFromR2 = async () => {
    setFetching(true)
    setFetchResult(null)
    try {
      // Send an explicit JSON content-type + body even though the endpoint
      // reads no input — Payload's REST middleware rejects a bodyless/typeless
      // POST with a framework-level 400 before the handler runs.
      const res = await fetch('/api/media/fetch-from-r2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        // Our handler returns { error }, but Payload framework-level failures
        // use { errors: [{ message }] } — read both so the real cause shows.
        const d = data as { error?: string; errors?: Array<{ message?: string }>; message?: string } | null
        const message = d?.error ?? d?.errors?.[0]?.message ?? d?.message ?? `Lỗi HTTP ${res.status}`
        alert(`${isEnglish ? 'Fetch R2 failed' : 'Fetch R2 thất bại'}: ${message}`)
        return
      }
      setFetchResult(data as {
        imported: number
        skipped: number
        foldersCreated: number
        remainder: number
        errors: string[]
      })
      setRefreshKey((k) => k + 1)
    } catch (err) {
      alert(`${isEnglish ? 'Fetch R2 network error' : 'Fetch R2 lỗi mạng'}: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setFetching(false)
    }
  }

  // Phase 3: debounced search → `search` state. The 300ms window matches the
  // plan and is short enough to feel responsive. Cleanup on unmount so a
  // stale fetch cannot fire after navigation.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim())
      // Reset pagination to page 1 when search changes — otherwise the user
      // is stuck on a high-numbered page that may now be empty. We pair the
      // page reset with the debounced search setState (not a separate
      // effect on `search`) to avoid the "setState in effect" lint rule
      // and to keep both transitions atomic.
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  // A folder/preview from the previous site must not survive a tenant switch.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setPage(1)
    setCurrentFolder(null)
    setFolderPath([])
    setLightboxDoc(null)
    setEditingDoc(null)
    setPasteUrlOpen(false)
    setPasteUrl('')
    setPasteAlt('')
    setFetchResult(null)
    setDroppedFiles(null)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [selectedTenantID])

  useEffect(() => {
    let cancelled = false
    if (noWebsiteAccess || chooseWebsite) return
    const mediaWhere = buildMediaWhere(currentFolder, mimeFilter, search, selectedTenantID)
    const folderWhere = buildFolderWhere(currentFolder, selectedTenantID)
    // Loading flag for the fetch lifecycle — gates a spinner, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setReadError(null)
    Promise.all([
      fetch(`/api/media?limit=24&page=${page}&depth=0&${mediaWhere}`, { credentials: 'include' })
        .then((r) => { if (!r.ok) throw new Error(`Media HTTP ${r.status}`); return r.json() }),
      fetch(`/api/payload-folders?limit=100&depth=0&sort=name&${folderWhere}`, { credentials: 'include' })
        .then((r) => { if (!r.ok) throw new Error(`Folders HTTP ${r.status}`); return r.json() }),
    ])
      .then(([media, folders]: [{ docs: LightboxDoc[]; totalPages: number } | null, { docs: SubFolder[] } | null]) => {
        if (cancelled) return
        if (media) {
          setDocs(media.docs ?? [])
          setTotalPages(media.totalPages ?? 1)
        }
        if (folders) setSubfolders((folders.docs ?? []).map((f) => ({ id: f.id, name: f.name })))
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setDocs([])
        setSubfolders([])
        setTotalPages(1)
        setReadError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [mimeFilter, noWebsiteAccess, chooseWebsite, page, currentFolder, refreshKey, search, selectedTenantID])

  // Flat list of every folder — powers the per-item "move to folder" dropdown.
  // Scoped by selectedTenantID so a doc can't be moved into another site's folder.
  useEffect(() => {
    let cancelled = false
    if (noWebsiteAccess || chooseWebsite) return
    const tenantWhere = buildFolderWhere(undefined, selectedTenantID)
    const qs = tenantWhere ? `&${tenantWhere}` : ''
    fetch(`/api/payload-folders?limit=200&depth=0&sort=name${qs}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { docs: SubFolder[] } | null) => {
        if (!cancelled && d) setAllFolders((d.docs ?? []).map((f) => ({ id: f.id, name: f.name })))
        if (!cancelled && !d) setAllFolders([])
      })
      .catch(() => { if (!cancelled) setAllFolders([]) })
    return () => { cancelled = true }
  }, [noWebsiteAccess, chooseWebsite, refreshKey, selectedTenantID])

  // ── Folder navigation ──────────────────────────────────────────────────────
  const openFolder = (f: SubFolder) => {
    setFolderPath((p) => [...p, f])
    setCurrentFolder(f.id)
    setPage(1)
  }
  const gotoRoot = () => {
    setFolderPath([])
    setCurrentFolder(null)
    setPage(1)
  }
  const gotoCrumb = (index: number) => {
    const target = folderPath[index]
    setFolderPath((p) => p.slice(0, index + 1))
    setCurrentFolder(target.id)
    setPage(1)
  }
  const createFolder = async (name: string) => {
    setLoading(true)
    try {
      const res = await fetch('/api/payload-folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, folder: currentFolder, folderType: ['media'] }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        alert((e as { errors?: { message: string }[] })?.errors?.[0]?.message ?? 'Tạo thư mục thất bại')
        return
      }
      setRefreshKey((k) => k + 1)
    } finally {
      setLoading(false)
    }
  }

  /** Phase 5: PATCH the alt of a media doc. The caller passes the new value
   *  from the lightbox. On success, update the local `docs` and the
   *  `lightboxDoc` so the panel reflects the new alt without a re-fetch.
   *  On failure, throw so the lightbox can show the error inline. */
  const onSaveAlt = async (docId: LightboxDoc['id'], alt: string) => {
    const res = await fetch(`/api/media/${docId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ alt }),
    })
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      const message =
        (e as { errors?: { message: string }[] })?.errors?.[0]?.message ??
        `Lưu alt thất bại (HTTP ${res.status})`
      throw new Error(message)
    }
    setDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, alt } : d)))
    setLightboxDoc((prev) => (prev && prev.id === docId ? { ...prev, alt } : prev))
  }

  /** Phase 5/6: open the image editor. The lightbox's "Sửa ảnh" button
   *  calls this with the doc. We stash it in editingDoc state; the
   *  MediaImageEditor modal is rendered when state is set. */
  const onEditImage = (doc: LightboxDoc) => {
    setLightboxDoc(null) // close the lightbox
    setEditingDoc(doc)
  }
  const onEditApplied = (result: { id: string | number; version: number; mimeType: string; filesize: number; width?: number; height?: number; url?: string }) => {
    // Update local docs with the new dimensions/size/version so the grid
    // reflects the new bytes without a re-fetch. The result fields are
    // spread into the LightboxDoc; the type of `id` widens so we cast.
    setDocs((prev) =>
      prev.map((d) =>
        d.id === result.id || String(d.id) === String(result.id)
          ? ({ ...d, ...result, id: d.id, url: result.url ?? d.url } as LightboxDoc)
          : d,
      ),
    )
    setEditingDoc(null)
    setRefreshKey((k) => k + 1)
  }

  /** Move a media item into a folder (null = root), then refresh. */
  const moveDoc = async (docId: LightboxDoc['id'], folderId: number | null) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/media/${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ folder: folderId }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        alert((e as { errors?: { message: string }[] })?.errors?.[0]?.message ?? 'Di chuyển thất bại')
        return
      }
      setRefreshKey((k) => k + 1)
    } finally {
      setLoading(false)
    }
  }

  // Track the most recent setRefreshKey call from the dropzone so we don't
  // double-fire when a search input is also debouncing.
  const lastUploadRefresh = useRef(0)
  const onUploaded = () => {
    // Coalesce: only refresh if we haven't already from a recent upload.
    // Keeps the effect below from running on every item-status tick.
    const now = Date.now()
    if (now - lastUploadRefresh.current < 200) return
    lastUploadRefresh.current = now
    setRefreshKey((k) => k + 1)
  }

  // Drawer auto-select: the dropzone calls this with the first doc id; we
  // forward to the drawer's onSelect.
  const onAutoSelect = (docID: string | number) => {
    if (selectForDrawer) selectForDrawer({ collectionSlug: 'media', doc: { id: docID }, docID: String(docID) })
  }

  // ── Grid-level drag-drop ───────────────────────────────────────────────────
  // Drag-drop is handled on the outer grid container so the user can drop
  // files anywhere on the page (not just on the small upload button). The
  // dropped files are forwarded to MediaUploadDropzone via `externalFiles`.
  const [gridIsDragging, setGridIsDragging] = useState(false)
  const onGridDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (!canUpload) return
    e.stopPropagation()
    if (!gridIsDragging) setGridIsDragging(true)
  }
  const onGridDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!(e.currentTarget as Node).contains(e.relatedTarget as Node | null)) {
      setGridIsDragging(false)
    }
  }
  const onGridDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setGridIsDragging(false)
    if (!canUpload) return
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setDroppedFiles(e.dataTransfer.files)
      e.dataTransfer.clearData()
    }
  }

  /** Delete a media item (confirm first), then close the lightbox if it shows
   *  this doc and refresh. The storage adapter removes the R2 object via its
   *  handleDelete. */
  const deleteDoc = async (docId: LightboxDoc['id'], filename?: string) => {
    if (!window.confirm(`Xoá tệp ${filename ? `"${filename}"` : 'này'}? Hành động không thể hoàn tác và sẽ xoá cả file trên R2.`)) {
      return
    }
    // No global `loading` flag here — that hides the whole grid behind the
    // spinner and looks like a full reload. Delete is a quiet single-item op.
    const res = await fetch(`/api/media/${docId}`, { method: 'DELETE', credentials: 'include' })
    if (!res.ok) {
      const e = await res.json().catch(() => null)
      const msg =
        (e as { errors?: { message: string }[] } | null)?.errors?.[0]?.message ??
        (e as { error?: string } | null)?.error ??
        `Xoá thất bại (HTTP ${res.status})`
      alert(msg)
      return
    }
    // Remove just this item from local state — no full gallery refetch.
    setDocs((prev) => prev.filter((d) => String(d.id) !== String(docId)))
    setLightboxDoc((cur) => (cur && String(cur.id) === String(docId) ? null : cur))
  }

  const docUrl = (doc: LightboxDoc) => doc.externalUrl ?? doc.url
  const isImg = (doc: LightboxDoc) => !!(doc as { mimeType?: string }).mimeType?.startsWith('image/')

  return (
    <div
      className="twp relative px-4 py-6 sm:px-6 lg:px-8"
      onDragOver={onGridDragOver}
      onDragLeave={onGridDragLeave}
      onDrop={onGridDrop}
    >
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-2xl font-semibold tracking-tight text-foreground">{isEnglish ? 'Media library' : 'Thư viện đa phương tiện'}</h1>
          <p className="mb-0 mt-2 text-sm text-muted-foreground">{selectForDrawer ? (isEnglish ? 'Choose a file for this field.' : 'Chọn tệp cho trường này.') : (isEnglish ? 'Organize the images and files used across your content.' : 'Quản lý hình ảnh và tệp dùng trong nội dung.')}</p>
        </div>
      </header>
      {noWebsiteAccess && <p role="status" className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">{isEnglish ? 'No website is assigned to your account.' : 'Tài khoản chưa được cấp quyền website.'}</p>}
      {chooseWebsite && <p role="status" className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">{isEnglish ? 'Select an assigned website to browse its media.' : 'Chọn website được cấp quyền để xem media.'}</p>}
      {!noWebsiteAccess && !chooseWebsite && selectedTenantID == null && <p className="mb-4 text-sm text-muted-foreground">{isEnglish ? 'All websites. Select a website to upload or create a folder.' : 'Tất cả website. Chọn website để tải lên hoặc tạo thư mục.'}</p>}
      {readError && <div role="alert" className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{isEnglish ? 'Unable to load the media library.' : 'Không tải được thư viện media.'} {readError} <Button variant="outline" size="sm" onClick={() => setRefreshKey((key) => key + 1)}>{isEnglish ? 'Retry' : 'Thử lại'}</Button></div>}
      {/* Drag-drop overlay — covers the whole grid when files are dragged over */}
      {gridIsDragging && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/10 text-[14px] font-medium text-primary">
          <Upload className="mr-2 size-4" /> {isEnglish ? 'Drop files to upload to this folder' : 'Thả tệp để tải lên thư mục này'}
        </div>
      )}
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(Object.keys(CHIP_LABELS) as MimeFilter[]).map((f) => {
          const active = mimeFilter === f
          return (
            <button
              key={f}
              onClick={() => { setMimeFilter(f); setPage(1) }}
              type="button"
              aria-pressed={active}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-md border px-3.5 py-2 text-sm transition-colors ${
                active
                  ? 'border-primary bg-primary font-semibold text-primary-foreground'
                  : 'border-border text-foreground hover:bg-accent'
              }`}
            >
              {CHIP_ICONS[f]}
              {isEnglish ? CHIP_LABELS_EN[f] : CHIP_LABELS[f]}
            </button>
          )
        })}

        {/* Phase 3: search input (debounced) — magnifier icon + clear button */}
        <div className="relative ml-2 inline-flex items-center">
          <Search className="pointer-events-none absolute left-2 size-3.5 text-muted-foreground" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label={isEnglish ? 'Search media by filename or alt text' : 'Tìm media theo tên tệp hoặc alt'}
            placeholder={isEnglish ? 'Search filename or alt…' : 'Tìm tên tệp hoặc alt…'}
            className="min-h-10 w-full rounded-md border border-border bg-background py-2 pl-7 pr-7 text-sm outline-none focus:border-primary sm:w-60"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput('')}
              aria-label={isEnglish ? 'Clear search' : 'Xoá tìm kiếm'}
              className="absolute right-1.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
          <div className="inline-flex rounded-md border border-border p-0.5">
            <button
              onClick={() => setViewMode('grid')}
              aria-label={isEnglish ? 'Grid' : 'Lưới'}
              aria-pressed={viewMode === 'grid'}
              className={`inline-flex size-10 items-center justify-center rounded transition-colors ${
                viewMode === 'grid' ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <LayoutGrid className="size-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              aria-label={isEnglish ? 'List' : 'Danh sách'}
              aria-pressed={viewMode === 'list'}
              className={`inline-flex size-10 items-center justify-center rounded transition-colors ${
                viewMode === 'list' ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <ListIcon className="size-4" />
            </button>
          </div>
          {/* Phase 3: dropzone (extracted component). Click-to-upload via the
              hidden file input it owns; drag-drop over the whole grid via
              externalFiles (dropped on the outer container above). */}
          {canUpload && <MediaUploadDropzone
            key={selectedTenantID}
            currentFolder={currentFolder}
            onUploaded={onUploaded}
            onAutoSelect={onAutoSelect}
            externalFiles={droppedFiles}
          />}
          {/* Phase 4: Fetch-from-R2 — import objects present in R2 but
              missing from the DB. Disabled while in flight; on success,
              shows a toast with imported/skipped/remainder counts. */}
          {canUpload && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchFromR2}
            disabled={fetching}
            title={isEnglish ? 'Import R2 objects missing from the database' : 'Import object R2 chưa có trong cơ sở dữ liệu'}
          >
            {fetching ? <Loader2 className="animate-spin" /> : <CloudDownload />}
            {isEnglish ? 'Fetch R2' : 'Lấy tệp từ R2'}
          </Button>
          )}
          {/* Phase 7: Dán URL — opens an inline form for pasting an image
              URL. Server fetches the bytes, uploads to R2, sets externalUrl. */}
          {canUpload && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => { setPasteUrlOpen((v) => !v); setPasteError(null) }}
            title={isEnglish ? 'Import an image from a URL' : 'Nhập ảnh từ URL'}
          >
            <Link2 /> {isEnglish ? 'Paste URL' : 'Dán URL'}
          </Button>
          )}
        </div>
      </div>

      {/* Folder navigation */}
      <MediaFolderBar
        path={folderPath}
        subfolders={subfolders}
        busy={loading}
        onRoot={gotoRoot}
        onCrumb={gotoCrumb}
        onOpen={openFolder}
        onCreate={createFolder}
        canCreate={canCreateFolder}
      />

      {/* Phase 7: paste-URL inline form (collapsible). */}
      {pasteUrlOpen && (
        <div className="mb-3 flex flex-wrap items-end gap-2 rounded-md border border-border bg-card p-3">
          <div className="flex-1 min-w-[280px]">
            <label className="mb-1 block text-[12px] font-medium text-muted-foreground" htmlFor="paste-url">URL ảnh</label>
            <input
              id="paste-url"
              type="url"
              value={pasteUrl}
              onChange={(e) => setPasteUrl(e.target.value)}
              placeholder="https://cdn.example.com/photo.jpg"
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-[13px] outline-none focus:border-primary"
            />
          </div>
          <div className="min-w-[180px] flex-1">
            <label className="mb-1 block text-[12px] font-medium text-muted-foreground" htmlFor="paste-alt">Alt (tùy chọn)</label>
            <input
              id="paste-alt"
              type="text"
              value={pasteAlt}
              onChange={(e) => setPasteAlt(e.target.value)}
              placeholder="Mô tả ảnh"
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-[13px] outline-none focus:border-primary"
            />
          </div>
          <Button
            type="button"
            size="sm"
            onClick={submitPasteUrl}
            disabled={pasteSubmitting || !pasteUrl.trim()}
          >
            {pasteSubmitting ? <Loader2 className="animate-spin" /> : <Upload />}
            Thêm
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => { setPasteUrlOpen(false); setPasteError(null); setPasteUrl(''); setPasteAlt('') }}
            disabled={pasteSubmitting}
          >
            Huỷ
          </Button>
          {pasteError && (
            <p className="basis-full text-[12px] text-destructive">{pasteError}</p>
          )}
        </div>
      )}

      {loading && (
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Đang tải…
        </p>
      )}

      {/* Grid view */}
      {!loading && !readError && !noWebsiteAccess && !chooseWebsite && viewMode === 'grid' && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
          {docs.map((doc) => {
            const url = docUrl(doc)
            const image = isImg(doc)
            const mime = (doc as { mimeType?: string }).mimeType
            return (
              <Card key={doc.id} className="overflow-hidden p-0 transition-shadow hover:shadow-card-hover">
                <button type="button" onClick={() => pickDoc(doc)} disabled={!selectForDrawer && !image} aria-label={`${isEnglish ? (selectForDrawer ? 'Select' : 'Preview') : (selectForDrawer ? 'Chọn' : 'Xem')} ${doc.filename ?? doc.id}`} className="block w-full border-0 bg-muted p-0 text-left disabled:cursor-default">
                {image && url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={doc.alt ?? ''} className="block aspect-[4/3] w-full object-cover" />
                ) : (
                  <div className="flex aspect-[4/3] w-full items-center justify-center bg-muted text-muted-foreground">
                    <FileTypeIcon mimeType={mime} className="size-9" />
                  </div>
                )}
                </button>
                <div className="flex flex-col gap-2 p-3">
                  {/* Phase 3: alt shown under filename (when present) for
                      searchability + a small MIME badge. */}
                  <div className="flex items-center gap-1">
                    <p className="m-0 min-w-0 flex-1 truncate text-sm font-medium text-foreground">{doc.filename}</p>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-medium uppercase text-muted-foreground">
                      {mimeBadgeLabel(mime)}
                    </span>
                    {canDelete && (
                    <button
                      type="button"
                      aria-label={isEnglish ? 'Delete file' : 'Xoá tệp'}
                      title={isEnglish ? 'Delete file' : 'Xoá tệp'}
                      onClick={(e) => { e.stopPropagation(); deleteDoc(doc.id, doc.filename) }}
                      className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                    )}
                  </div>
                  {doc.alt ? (
                    <p className="m-0 truncate text-xs text-muted-foreground" title={doc.alt}>
                      {doc.alt}
                    </p>
                  ) : null}
                  {canUpdate && (
                  <MediaMoveSelect
                    currentFolder={currentFolder}
                    folders={allFolders}
                    onMove={(folderId) => moveDoc(doc.id, folderId)}
                  />
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* List view — wrapped so the 6-column table scrolls horizontally on
          narrow screens instead of overflowing the viewport. */}
      {!loading && !readError && !noWebsiteAccess && !chooseWebsite && viewMode === 'list' && (
        <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-[13px]">
          <thead>
            <tr>
              {(isEnglish ? ['', 'Filename', 'Alt', 'Type', 'Size', 'Folder'] : ['', 'Tên tệp', 'Alt', 'Loại', 'Kích thước', 'Thư mục']).map((h) => (
                <th key={h} className="border-b border-border px-2 py-1.5 text-left font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {docs.map((doc) => {
              const url = docUrl(doc)
              const mime = (doc as { mimeType?: string }).mimeType
              return (
                <tr key={doc.id} className="border-b border-border/60 hover:bg-accent">
                  <td className="px-2 py-1">
                    {isImg(doc) && url ? (
                      <button type="button" className="rounded border-0 bg-transparent p-0" aria-label={`${isEnglish ? (selectForDrawer ? 'Select' : 'Preview') : (selectForDrawer ? 'Chọn' : 'Xem')} ${doc.filename ?? doc.id}`} onClick={() => pickDoc(doc)}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="rounded object-cover" style={{ width: 56, height: 38 }} />
                      </button>
                    ) : (
                      <FileTypeIcon mimeType={mime} className="size-5 text-muted-foreground" />
                    )}
                  </td>
                  <td className="px-2 py-3 text-foreground"><button type="button" disabled={!selectForDrawer && !isImg(doc)} className="border-0 bg-transparent p-0 text-left text-inherit disabled:cursor-default" onClick={() => pickDoc(doc)}>{doc.filename}</button></td>
                  <td className="px-2 py-1 text-muted-foreground">{doc.alt ?? '—'}</td>
                  <td className="px-2 py-1 text-[11px] text-muted-foreground">
                    <span className="rounded bg-muted px-1 py-px text-[10px] font-medium uppercase">
                      {mimeBadgeLabel(mime)}
                    </span>
                  </td>
                  <td className="px-2 py-1 text-[11px] text-muted-foreground">
                    {doc.filesize != null ? `${(doc.filesize / 1024).toFixed(0)} KB` : '—'}
                  </td>
                  <td className="max-w-[160px] px-2 py-1">
                    <div className="flex items-center gap-1">
                      {canUpdate && (
                      <MediaMoveSelect
                        currentFolder={currentFolder}
                        folders={allFolders}
                        onMove={(folderId) => moveDoc(doc.id, folderId)}
                      />
                      )}
                      {canDelete && (
                      <button
                        type="button"
                        aria-label={isEnglish ? 'Delete file' : 'Xoá tệp'}
                        title={isEnglish ? 'Delete file' : 'Xoá tệp'}
                        onClick={() => deleteDoc(doc.id, doc.filename)}
                        className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      )}

      {docs.length === 0 && subfolders.length === 0 && !loading && !readError && !noWebsiteAccess && !chooseWebsite && (
        <p className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          {search
            ? (isEnglish ? `No files match \"${search}\".` : `Không có tệp khớp \"${search}\".`)
            : (isEnglish ? 'This folder has no files.' : 'Thư mục chưa có tệp.')}
        </p>
      )}

      {/* Pagination */}
      {!loading && !readError && !noWebsiteAccess && !chooseWebsite && totalPages > 1 && (
        <div className="mt-4 flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            <ChevronLeft /> {isEnglish ? 'Previous' : 'Trước'}
          </Button>
          <span className="text-sm text-muted-foreground">{isEnglish ? 'Page' : 'Trang'} {page} / {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
            {isEnglish ? 'Next' : 'Tiếp'} <ChevronRight />
          </Button>
        </div>
      )}

      {/* Lightbox */}
      {lightboxDoc && (
        <MediaLightbox
          doc={lightboxDoc}
          docs={docs.filter(isImg)}
          onClose={() => setLightboxDoc(null)}
          onNavigate={setLightboxDoc}
          onSaveAlt={canUpdate ? onSaveAlt : undefined}
          onEditImage={canUpdate ? onEditImage : undefined}
          onDelete={canDelete ? (id) => deleteDoc(id, lightboxDoc.filename) : undefined}
          imageEditEnabled={canUpdate}
        />
      )}

      {/* Phase 6: image editor modal */}
      {editingDoc && editingDoc.url && (
        <MediaImageEditor
          doc={{
            id: editingDoc.id,
            url: editingDoc.externalUrl ?? editingDoc.url,
            mimeType: (editingDoc as { mimeType?: string }).mimeType ?? 'image/jpeg',
            width: editingDoc.width,
            height: editingDoc.height,
            filename: editingDoc.filename,
          }}
          onClose={() => setEditingDoc(null)}
          onApplied={onEditApplied}
        />
      )}

      {/* Phase 4: Fetch R2 result toast — bottom-right, similar shape to
          the upload status list. Auto-dismisses after 6s. */}
      {fetchResult && (
        <div className="fixed bottom-4 left-4 z-40 max-w-sm rounded-lg border border-border bg-card p-3 text-[12px] shadow-card-hover">
          <div className="mb-1 flex items-start justify-between gap-2">
            <strong className="text-[13px]">{isEnglish ? 'Fetch R2 result' : 'Kết quả lấy tệp R2'}</strong>
            <button
              onClick={() => setFetchResult(null)}
              aria-label={isEnglish ? 'Close' : 'Đóng'}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </div>
          <p>
            Đã nhập <strong>{fetchResult.imported}</strong> tệp, bỏ qua{' '}
            <strong>{fetchResult.skipped}</strong>, tạo{' '}
            <strong>{fetchResult.foldersCreated}</strong> thư mục.
          </p>
          {fetchResult.remainder > 0 && (
            <p className="mt-1 text-muted-foreground">
              {isEnglish ? <>Remaining <strong>{fetchResult.remainder}</strong> files — run Fetch R2 again to continue.</> : <>Còn <strong>{fetchResult.remainder}</strong> tệp — bấm lại Lấy tệp từ R2 để tiếp tục.</>}
            </p>
          )}
          {fetchResult.errors.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer text-muted-foreground">
                {fetchResult.errors.length} lỗi
              </summary>
              <ul className="mt-1 max-h-32 overflow-auto pl-4 text-[11px]">
                {fetchResult.errors.slice(0, 10).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
