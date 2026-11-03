'use client'
/**
 * Full-size image lightbox overlay for the Media grid list view.
 * ESC / backdrop click closes; arrow keys navigate prev/next.
 *
 * Phase 5 upgrade: a side details panel shows the public URL (with copy
 * and open-in-new-tab), inline alt edit, and metadata (filename/size/
 * dimensions/mime). "Sửa ảnh" button for image docs opens the Phase 6
 * editor. "Tải về" downloads the file via an anchor with `download`.
 *
 * Keyboard handling: ESC closes the lightbox UNLESS focus is inside the
 * alt input (preventing accidental close while typing).
 */
import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from '@payloadcms/ui'
import { useBodyScrollLock } from './use-body-scroll-lock'
import { usePanelFocusTrap } from './use-panel-focus-trap'
import {
  X,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  ExternalLink,
  Download,
  Pencil,
  Save,
  Trash2,
} from 'lucide-react'

export type LightboxDoc = {
  id: string | number
  url?: string
  externalUrl?: string
  filename: string
  filesize?: number
  alt?: string
  width?: number
  height?: number
  mimeType?: string
}

type Props = {
  doc: LightboxDoc
  docs: LightboxDoc[]
  onClose: () => void
  onNavigate: (doc: LightboxDoc) => void
  /** Inline alt edit handler. Called with the new alt; the parent is
   *  responsible for the PATCH and the optimistic update. */
  onSaveAlt?: (id: LightboxDoc['id'], alt: string) => Promise<void> | void
  /** Open the Phase 6 image editor. Wire the button to this; the parent
   *  renders the actual modal. */
  onEditImage?: (doc: LightboxDoc) => void
  /** True if the parent has the image editor available (gate the button). */
  imageEditEnabled?: boolean
  /** Delete the file. Parent confirms, calls DELETE, and removes it from the
   *  list. The lightbox renders a "Xoá" button when provided. */
  onDelete?: (id: LightboxDoc['id']) => void
}

/** Only allow http(s) URLs as hrefs to prevent admin self-XSS via javascript: URIs. */
function safeHref(url: string | undefined): string | undefined {
  if (!url) return undefined
  return /^https?:\/\//i.test(url) ? url : undefined
}

export const MediaLightbox: React.FC<Props> = ({
  doc,
  docs,
  onClose,
  onNavigate,
  onSaveAlt,
  onEditImage,
  imageEditEnabled,
  onDelete,
}) => {
  const { i18n } = useTranslation()
  const isEnglish = i18n.language === 'en'
  const dialogRef = useRef<HTMLDivElement | null>(null)
  useBodyScrollLock(true)
  // Use safeHref for any value used as an <a href> to guard against
  // javascript: URIs stored in externalUrl (belt-and-suspenders: field
  // validate in media.ts already rejects them, but this defends the
  // client against stale/migrated data).
  const url = doc.externalUrl ?? doc.url
  const safeUrl = safeHref(url)
  const idx = docs.findIndex((d) => d.id === doc.id)

  // Phase 5: alt edit state. The Save button calls onSaveAlt and shows a
  // busy state while the request is in flight. Pessimistic on purpose —
  // any failed PATCH surfaces the error and the local input stays as the
  // user typed (the parent may also re-render the doc with the server-
  // canonical alt).
  const [altDraft, setAltDraft] = useState(doc.alt ?? '')
  const [savingAlt, setSavingAlt] = useState(false)
  const [altError, setAltError] = useState<string | null>(null)

  // The lightbox uses inline styles (no Tailwind/.twp fence), so responsiveness
  // is driven by a viewport-width flag rather than media queries. Below 640px
  // the image + details panel stack vertically instead of overflowing in a row.
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640)
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 640)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // The HTML `download` attribute is IGNORED for cross-origin URLs, and media
  // lives on the R2/CDN domain (a different origin from the admin), so a plain
  // <a download> just navigates/opens instead of downloading. Force a real
  // download by fetching the bytes into a blob. If the cross-origin fetch is
  // blocked by CORS (R2/CDN without an allow rule), fall back to opening the
  // file in a new tab so the user can still save it manually.
  const [downloading, setDownloading] = useState(false)
  const downloadFile = async () => {
    if (!safeUrl || downloading) return
    setDownloading(true)
    try {
      const resp = await fetch(safeUrl, { credentials: 'include' })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const blob = await resp.blob()
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl
      a.download = doc.filename || 'download'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(objUrl)
    } catch {
      window.open(safeUrl, '_blank', 'noopener,noreferrer')
    } finally {
      setDownloading(false)
    }
  }
  // Reset the draft when the doc changes (prev nav/next). Also reset
  // error state. Without this the alt field would carry the previous
  // doc's value.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAltDraft(doc.alt ?? '')
    setAltError(null)
  }, [doc.id, doc.alt])

  // Track whether the alt input is currently focused — if so, ESC does
  // not close the lightbox (otherwise the user would lose unsaved alt
  // edits on a stray Esc keystroke).
  const altInputFocused = useRef(false)
  const { handleKeyDown } = usePanelFocusTrap({
    containerRef: dialogRef,
    open: true,
    onEscape: () => { if (!altInputFocused.current) onClose() },
  })

  // Phase 5: copy-link feedback (transient ✓ mark).
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])

  const copyLink = async () => {
    if (!url) return
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url)
      } else {
        // Fallback for dev-over-HTTP or browsers without clipboard API.
        const el = document.createElement('textarea')
        el.value = url
        el.style.position = 'fixed'
        el.style.opacity = '0'
        document.body.appendChild(el)
        el.select()
        document.execCommand('copy')
        document.body.removeChild(el)
      }
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const saveAlt = async () => {
    if (!onSaveAlt) return
    setSavingAlt(true)
    setAltError(null)
    try {
      await onSaveAlt(doc.id, altDraft)
    } catch (err) {
      setAltError(err instanceof Error ? err.message : isEnglish ? 'Unable to save alt text' : 'Lưu alt thất bại')
    } finally {
      setSavingAlt(false)
    }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (altInputFocused.current) return
      if (e.key === 'ArrowLeft' && idx > 0) onNavigate(docs[idx - 1])
      if (e.key === 'ArrowRight' && idx < docs.length - 1) onNavigate(docs[idx + 1])
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [idx, docs, onClose, onNavigate])

  const navBtn = (side: 'left' | 'right', icon: React.ReactNode, onClick: () => void) => (
    <button
      aria-label={side === 'left' ? (isEnglish ? 'Previous image' : 'Ảnh trước') : (isEnglish ? 'Next image' : 'Ảnh kế')}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      style={{
        position: 'fixed', top: '50%', transform: 'translateY(-50%)',
        [side]: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
        padding: '10px', borderRadius: 8, cursor: 'pointer',
      }}
    >
      {icon}
    </button>
  )

  const isImg = !!doc.mimeType?.startsWith('image/')
  const altDirty = altDraft !== (doc.alt ?? '')

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={isEnglish ? `Preview ${doc.filename}` : `Xem ${doc.filename}`}
      onKeyDown={handleKeyDown}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(10,27,33,0.88)',
        zIndex: 9999, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)',
      }}
    >
      {/* Main image + details panel — laid out in a row, both stopPropagation
          so clicks inside don't close the lightbox. */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex',
          flexDirection: narrow ? 'column' : 'row',
          gap: narrow ? 10 : 16,
          // On narrow screens use a fixed viewport-relative width + border-box
          // so children (image, panel) are clamped to the screen and cannot
          // overflow horizontally.
          width: narrow ? '94vw' : undefined,
          maxWidth: '95vw',
          maxHeight: '92vh',
          boxSizing: 'border-box',
          alignItems: narrow ? 'stretch' : 'flex-start',
          overflowY: narrow ? 'auto' : 'visible',
        }}
      >
        <div style={{ textAlign: 'center', width: narrow ? '100%' : undefined }}>
          {url && (
            <img
              src={url} alt={doc.alt ?? ''}
              style={{
                width: narrow ? '100%' : undefined,
                maxWidth: '100%',
                maxHeight: narrow ? '46vh' : '75vh',
                objectFit: 'contain',
                borderRadius: 4,
              }}
            />
          )}
        </div>

        {/* Phase 5: details panel — fixed width on the right side of the
            lightbox. White text on the dark backdrop with subtle dividers. */}
        <div
          style={{
            width: narrow ? '100%' : 320,
            maxWidth: '100%',
            boxSizing: 'border-box',
            color: '#fff',
            fontSize: 13,
            background: '#132b32',
            border: '1px solid rgba(255,255,255,0.16)',
            borderRadius: 12,
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            maxHeight: narrow ? '38vh' : '80vh',
            overflowY: 'auto',
          }}
        >
          {/* URL row: truncated read-only + Copy + Open */}
          <div>
            <p style={{ margin: '0 0 4px', fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              URL
            </p>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input
                value={url ?? ''}
                aria-label={isEnglish ? 'File URL' : 'URL tệp'}
                readOnly
                onClick={(e) => e.currentTarget.select()}
                style={{
                  flex: 1, minWidth: 0,
                  background: 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 4,
                  padding: '4px 6px',
                  fontSize: 11,
                  fontFamily: 'monospace',
                }}
              />
              <button
                onClick={copyLink}
                aria-label={isEnglish ? 'Copy URL' : 'Sao chép URL'}
                title={isEnglish ? 'Copy URL' : 'Sao chép URL'}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: copied ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.15)',
                  border: 'none', color: '#fff', padding: 6, borderRadius: 4, cursor: 'pointer',
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
              {safeUrl && (
                <a
                  href={safeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={isEnglish ? 'Open in new tab' : 'Mở trong tab mới'}
                  title={isEnglish ? 'Open in new tab' : 'Mở trong tab mới'}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(255,255,255,0.15)',
                    color: '#fff', padding: 6, borderRadius: 4, textDecoration: 'none',
                  }}
                >
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
          </div>

          {/* Alt row: editable input + Save button. Required by the Media
              schema, so blank alt would 400 on save. */}
          <div>
            <p style={{ margin: '0 0 4px', fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {isEnglish ? 'Alt text' : 'Alt (mô tả ảnh)'}
            </p>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                value={altDraft}
                aria-label={isEnglish ? 'Alt text' : 'Mô tả ảnh'}
                onChange={(e) => setAltDraft(e.target.value)}
                onFocus={() => { altInputFocused.current = true }}
                onBlur={() => { altInputFocused.current = false }}
                disabled={!onSaveAlt}
                placeholder={isEnglish ? 'Describe the image for accessibility and SEO' : 'Mô tả ảnh cho SEO / accessibility'}
                style={{
                  flex: 1, minWidth: 0,
                  background: 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 4,
                  padding: '4px 6px',
                  fontSize: 12,
                }}
              />
              {onSaveAlt && (
                <button
                  onClick={saveAlt}
                  disabled={!altDirty || savingAlt || !altDraft.trim()}
                  aria-label={isEnglish ? 'Save alt text' : 'Lưu alt'}
                  title={!altDraft.trim() ? (isEnglish ? 'Alt text is required' : 'Alt không được trống') : (isEnglish ? 'Save alt text' : 'Lưu alt')}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: altDirty && altDraft.trim() ? '#187b75' : 'rgba(255,255,255,0.1)',
                    border: 'none', color: '#fff', padding: 6, borderRadius: 4,
                    cursor: altDirty && altDraft.trim() ? 'pointer' : 'not-allowed',
                  }}
                >
                  <Save size={14} />
                </button>
              )}
            </div>
            {altError && (
              <p role="alert" style={{ margin: '4px 0 0', fontSize: 11, color: '#fca5a5' }}>{altError}</p>
            )}
          </div>

          {/* Meta: filename, size, dimensions, mime */}
          <div>
            <p style={{ margin: '0 0 4px', fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {isEnglish ? 'File details' : 'Thông tin'}
            </p>
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 10px', fontSize: 12 }}>
              <dt style={{ opacity: 0.7 }}>{isEnglish ? 'Filename' : 'Tên file'}</dt>
              <dd style={{ margin: 0, wordBreak: 'break-all' }}>{doc.filename}</dd>
              {doc.filesize != null && (
                <>
                  <dt style={{ opacity: 0.7 }}>{isEnglish ? 'File size' : 'Kích thước'}</dt>
                  <dd style={{ margin: 0 }}>{(doc.filesize / 1024).toFixed(0)} KB</dd>
                </>
              )}
              {doc.mimeType && (
                <>
                  <dt style={{ opacity: 0.55 }}>MIME</dt>
                  <dd style={{ margin: 0 }}>{doc.mimeType}</dd>
                </>
              )}
              {doc.width != null && doc.height != null && (
                <>
                  <dt style={{ opacity: 0.7 }}>{isEnglish ? 'Dimensions' : 'Kích thước ảnh'}</dt>
                  <dd style={{ margin: 0 }}>{doc.width} × {doc.height}</dd>
                </>
              )}
            </dl>
          </div>

          {/* Actions: Download + Sửa ảnh (image only) */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {safeUrl && (
              <button
                type="button"
                onClick={downloadFile}
                disabled={downloading}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: 'rgba(255,255,255,0.15)', border: 'none',
                  color: '#fff', padding: '6px 10px', borderRadius: 4,
                  cursor: downloading ? 'default' : 'pointer', fontSize: 12,
                  opacity: downloading ? 0.6 : 1,
                }}
              >
                <Download size={14} /> {downloading ? (isEnglish ? 'Downloading…' : 'Đang tải…') : (isEnglish ? 'Download' : 'Tải về')}
              </button>
            )}
            {isImg && onEditImage && (
              <button
                onClick={() => onEditImage(doc)}
                disabled={!imageEditEnabled}
                title={imageEditEnabled ? (isEnglish ? 'Edit image (crop/rotate/resize)' : 'Sửa ảnh (crop/rotate/resize)') : (isEnglish ? 'Image editor unavailable' : 'Trình sửa ảnh chưa khả dụng')}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: imageEditEnabled ? '#187b75' : 'rgba(255,255,255,0.1)',
                  border: 'none', color: '#fff', padding: '6px 10px', borderRadius: 4,
                  fontSize: 12, cursor: imageEditEnabled ? 'pointer' : 'not-allowed',
                }}
              >
                <Pencil size={14} /> {isEnglish ? 'Edit image' : 'Sửa ảnh'}
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(doc.id)}
                title={isEnglish ? 'Delete file from the library and R2' : 'Xoá tệp khỏi thư viện và R2'}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: 'rgba(220,38,38,0.35)', border: 'none',
                  color: '#fff', padding: '6px 10px', borderRadius: 4,
                  fontSize: 12, cursor: 'pointer',
                }}
              >
                <Trash2 size={14} /> {isEnglish ? 'Delete' : 'Xoá'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Side nav is hidden on narrow screens: the panel is full-width there,
          so fixed left/right buttons would overlap it. Mobile users swipe the
          list / reopen; keyboard arrows still work on desktop. */}
      {!narrow && idx > 0 && navBtn('left', <ChevronLeft size={28} />, () => onNavigate(docs[idx - 1]))}
      {!narrow && idx < docs.length - 1 && navBtn('right', <ChevronRight size={28} />, () => onNavigate(docs[idx + 1]))}

      <button
        aria-label={isEnglish ? 'Close' : 'Đóng'}
        onClick={onClose}
        style={{
          position: 'fixed', top: 12, right: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,0.15)', border: 'none',
          color: '#fff', padding: '8px', borderRadius: 8, cursor: 'pointer',
        }}
      >
        <X size={20} />
      </button>
    </div>
  )
}
