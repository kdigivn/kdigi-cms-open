'use client'
/**
 * Phase 3 — Media upload dropzone.
 *
 * Native HTML5 drag-drop multi-file upload, scoped to the current folder.
 * Extracted from media-grid-list-view.tsx so the parent view stays under the
 * 200-LOC modularization rule.
 *
 * For each dropped file, this component:
 *   1. Derives a default `alt` from the filename (without extension). The
 *      alt is required by the Media collection's schema, so deriving it here
 *      prevents a validation 400 on the first upload.
 *   2. POSTs the file to /api/media with multipart/form-data shaped as
 *      Payload 3 expects: a `file` part plus a `_payload` JSON string
 *      carrying `{ alt, folder: currentFolder }`. `currentFolder` may be
 *      null (root) — the server treats null as the root folder.
 *   3. Tracks per-file status (`pending` | `uploading` | `done` | `error`)
 *      and reports progress via the onUploaded callback (the parent uses
 *      this to refresh the grid once all uploads settle).
 *   4. On any error, surfaces the server's error message inline so the
 *      user can correct and retry — never throws to the parent.
 *
 * No new npm packages — uses native drag events, FileReader, and fetch.
 *
 * Phase 3 also adds: a hidden file input for click-to-upload (the "Tải lên"
 * button in the toolbar links to /admin/collections/media/create today; this
 * component renders a parallel "Tải lên tệp" button that opens a file picker
 * without leaving the current folder). Phase 4 adds a "Fetch R2" button to the
 * toolbar; Phase 7 adds "Dán URL".
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from '@payloadcms/ui'
import { Upload, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { deriveAltFromFilename, runWithConcurrency } from './media-p3-helpers'
import { uploadFileToPayloadMedia } from './upload-to-payload-media'

export { deriveAltFromFilename }

/**
 * Max uploads in flight at once.
 *
 * Every in-flight upload holds one Postgres connection with an OPEN
 * transaction for its entire duration — Payload begins the transaction before
 * the WebP transcode and only commits after the R2 PutObject returns (see
 * runWithConcurrency for the full explanation). Fanning a whole batch out at
 * once parked every pool connection in `idle in transaction`, which hung the
 * admin and tripped Postgres' idle-in-transaction reaper.
 *
 * Keep this well under the pg pool size (payload.config.ts `db.pool.max`) so
 * ordinary admin traffic always has connections left over while a batch is
 * uploading, and so peak memory stays bounded (each in-flight upload holds the
 * file bytes plus a sharp raw bitmap).
 */
const MAX_CONCURRENT_UPLOADS = 3

export type UploadStatus = 'pending' | 'uploading' | 'done' | 'error'

export interface UploadItem {
  /** Unique key for the React list. */
  key: string
  name: string
  size: number
  status: UploadStatus
  /** Server error message (only when status === 'error'). */
  error?: string
  /** Created media doc id (only when status === 'done'). */
  docId?: string | number
}

export interface MediaUploadDropzoneProps {
  /** Current folder id; null = root. */
  currentFolder: number | null
  /**
   * Called after ALL pending uploads settle (succeeded OR failed). The parent
   * uses this to refresh the grid. Per-file state is rendered inline.
   */
  onUploaded?: (results: { succeeded: number; failed: number }) => void
  /**
   * Optional — in drawer mode, an uploaded doc should be auto-selected into
   * the field. The parent passes its `onSelect` and the dropzone calls it
   * for the first successful upload.
   */
  onAutoSelect?: (docID: string | number) => void
  /**
   * When the parent handles the `onDrop` event on a larger container (e.g.
   * the whole grid), it passes the dropped FileList here. The dropzone ingests
   * them as if they were dropped on its own button. This allows drag-drop to
   * work over the entire grid without duplicating upload logic.
   */
  externalFiles?: FileList | File[] | null
}

export const MediaUploadDropzone: React.FC<MediaUploadDropzoneProps> = ({
  currentFolder,
  onUploaded,
  onAutoSelect,
  externalFiles,
}) => {
  const { i18n } = useTranslation()
  const isEnglish = i18n.language === 'en'
  const activeRef = useRef(true)
  useEffect(() => {
    activeRef.current = true
    return () => { activeRef.current = false }
  }, [])
  const [items, setItems] = useState<UploadItem[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  // Counter used to deduplicate keys for files with the same name.
  const keyCounter = useRef(0)

  /**
   * Build the multipart body Payload 3 expects:
   *   - `file` part(s) with the raw binary
   *   - `_payload` JSON part with the sibling field values
   */
  const uploadOne = useCallback(
    async (file: File, key: string): Promise<void> => {
      if (!activeRef.current) return
      setItems((prev) =>
        prev.map((it) => (it.key === key ? { ...it, status: 'uploading' as UploadStatus } : it)),
      )
      try {
        // Shared `/api/media` upload contract (see upload-to-payload-media.ts) —
        // throws with the server validation message on a non-ok response, which
        // the catch below surfaces inline.
        const doc = await uploadFileToPayloadMedia(file, { folder: currentFolder })
        setItems((prev) =>
          prev.map((it) => (it.key === key ? { ...it, status: 'done' as UploadStatus, docId: doc.id } : it)),
        )
      } catch (err) {
        setItems((prev) =>
          prev.map((it) =>
            it.key === key
              ? { ...it, status: 'error' as UploadStatus, error: err instanceof Error ? err.message : 'Lỗi mạng' }
              : it,
          ),
        )
      }
    },
    [currentFolder],
  )

  const ingest = useCallback(
    (files: FileList | File[]) => {
      const arr = Array.from(files)
      if (arr.length === 0) return
      const newItems: UploadItem[] = arr.map((f) => ({
        key: `${++keyCounter.current}-${f.name}`,
        name: f.name,
        size: f.size,
        status: 'pending' as UploadStatus,
      }))
      setItems((prev) => [...prev, ...newItems])
      // Bounded fan-out. Uploading every dropped file at once starved the pg
      // pool (each upload holds an open transaction across the sharp transcode
      // + R2 upload), which hung the admin and tripped Postgres'
      // idle-in-transaction reaper. uploadOne never rejects — it records the
      // failure on the item — so a bad file can't stall the queue.
      void runWithConcurrency(arr, MAX_CONCURRENT_UPLOADS, (f, i) =>
        uploadOne(f, newItems[i]!.key),
      )
    },
    [uploadOne],
  )

  // Guard to prevent calling onUploaded/onAutoSelect more than once per
  // settled batch. Without this, any re-render that re-runs the effect
  // (e.g. because onUploaded/onAutoSelect are new refs each parent render)
  // would fire the callbacks a second time. Reset when items empties.
  const hasReported = useRef(false)
  useEffect(() => {
    if (items.length === 0) {
      hasReported.current = false
      return
    }
    if (items.some((it) => it.status === 'pending' || it.status === 'uploading')) return
    if (hasReported.current) return
    hasReported.current = true
    const succeeded = items.filter((it) => it.status === 'done').length
    const failed = items.filter((it) => it.status === 'error').length
    // Auto-select the first successful doc if the parent opted in (drawer mode).
    if (onAutoSelect) {
      const first = items.find((it) => it.status === 'done' && it.docId != null)
      if (first && first.docId != null) onAutoSelect(first.docId)
    }
    onUploaded?.({ succeeded, failed })
    // After the parent has had a chance to refresh, clear the list so the
    // toast-like UI doesn't accumulate across uploads.
    const t = setTimeout(() => setItems([]), 1500)
    return () => clearTimeout(t)
  }, [items, onUploaded, onAutoSelect])

  // Ingest files passed from the parent's external drop handler (when the
  // parent manages the drag-drop zone over the whole grid).
  const prevExternalFiles = useRef<FileList | File[] | null>(null)
  useEffect(() => {
    if (!externalFiles || externalFiles === prevExternalFiles.current) return
    prevExternalFiles.current = externalFiles
    ingest(externalFiles)
  }, [externalFiles, ingest])

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      ingest(e.target.files)
      e.target.value = ''
    }
  }

  return (
    <div className="relative">

      {/* Upload status list — toast-like, pinned to the bottom-right. Hidden when empty. */}
      {items.length > 0 && (
        <div role="status" aria-live="polite" className="fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-card-hover sm:max-w-sm">
          {items.map((it) => (
            <div
              key={it.key}
              className="flex items-center gap-2 rounded-md border border-border/50 bg-background px-2.5 py-1.5 text-[12px]"
            >
              {it.status === 'pending' || it.status === 'uploading' ? (
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
              ) : it.status === 'done' ? (
                <CheckCircle2 className="size-3.5 text-success" />
              ) : (
                <AlertCircle className="size-3.5 text-destructive" />
              )}
              <span className="flex-1 truncate">{it.name}</span>
              <span className="text-muted-foreground">
                {it.status === 'uploading'
                  ? (isEnglish ? 'Uploading' : 'Đang tải')
                  : it.status === 'done'
                    ? (isEnglish ? 'Done' : 'Xong')
                    : it.status === 'error'
                      ? <span className="text-destructive">{it.error || (isEnglish ? 'Failed' : 'Thất bại')}</span>
                      : (isEnglish ? 'Queued' : 'Đang chờ')}
              </span>
              <button
                onClick={() => setItems((prev) => prev.filter((x) => x.key !== it.key))}
                aria-label={isEnglish ? 'Dismiss upload result' : 'Đóng kết quả tải lên'}
                type="button"
                disabled={it.status === 'pending' || it.status === 'uploading'}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Click-to-upload button. Hidden visually but kept accessible for the
          keyboard users who can't drag-drop. */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={onFileInput}
        className="hidden"
        aria-hidden
      />
      <Button
        type="button"
        variant="default"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        title={isEnglish ? 'Upload files to this folder' : 'Tải tệp lên thư mục này'}
      >
        <Upload /> {isEnglish ? 'Upload files' : 'Tải lên tệp'}
      </Button>
    </div>
  )
}
