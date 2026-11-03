'use client'
/**
 * Phase 6 — Image editor modal.
 *
 * Native pointer-event crop rectangle (no new npm dependency for the
 * overlay — the plan explicitly says KISS / no new package). Server-side
 * transforms run with sharp (already registered).
 *
 * Operations supported:
 *   - rotate 90° L/R (button pair)
 *   - flip H / V (mirror)
 *   - crop via draggable rectangle overlay
 *   - resize to a target width (height auto via aspect ratio)
 *
 * Confirm dialog before POST: "Ghi đè ảnh gốc trên R2?" — destructive
 * overwrite is intentional per the locked product decision.
 *
 * The crop rectangle is rendered in the same coordinate space as the
 * displayed image (CSS pixels). On submit, we map it back to source
 * natural pixels using the rendered/natural ratio — the plan §"Crop
 * math" requires the same conversion. The rendered image's natural
 * width/height are queried from the <img> element on load and
 * updated on every rotate/resize so the math is always current.
 */
import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from '@payloadcms/ui'
import { useBodyScrollLock } from './use-body-scroll-lock'
import { usePanelFocusTrap } from './use-panel-focus-trap'
import { Loader2, RotateCcw, RotateCw, FlipHorizontal2, FlipVertical2, Crop, X, Check, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface MediaImageEditorProps {
  doc: {
    id: string | number
    url: string
    mimeType: string
    width?: number
    height?: number
    filename: string
  }
  onClose: () => void
  onApplied: (result: { id: string | number; version: number; mimeType: string; filesize: number; width?: number; height?: number; url?: string }) => void
}

interface CropRect { left: number; top: number; width: number; height: number }

export const MediaImageEditor: React.FC<MediaImageEditorProps> = ({ doc, onClose, onApplied }) => {
  const { i18n } = useTranslation()
  const isEnglish = i18n.language === 'en'
  const dialogRef = useRef<HTMLDivElement | null>(null)
  useBodyScrollLock(true)
  const [rotate, setRotate] = useState<0 | 90 | 180 | 270>(0)
  const [flipH, setFlipH] = useState(false)
  const [flipV, setFlipV] = useState(false)
  const [resizeWidth, setResizeWidth] = useState<number | ''>('')
  const [crop, setCrop] = useState<CropRect | null>(null)
  const [imgNaturalSize, setImgNaturalSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { handleKeyDown } = usePanelFocusTrap({
    containerRef: dialogRef,
    open: true,
    onEscape: () => { if (!applying) onClose() },
  })

  // Drag state for the crop rectangle. We track the start point + current
  // point and resolve to a rectangle on mouseup. Both live in state (not
  // refs) so the visible-crop computation runs cleanly during render.
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null)

  // Reset all state when the doc changes (defensive — usually the editor
  // is mounted with a single doc).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRotate(0)
    setFlipH(false)
    setFlipV(false)
    setResizeWidth('')
    setCrop(null)
    setError(null)
  }, [doc.id])

  // Track the img's natural pixel size once it loads so the crop math
  // (CSS px → source px) is accurate. After rotate/resize, the displayed
  // dimensions change; the natural size does not (the image data is the
  // same, only the CSS transform changes), so we only need to set this
  // once per mount.
  const onImgLoad = () => {
    if (imgRef.current) {
      setImgNaturalSize({ w: imgRef.current.naturalWidth, h: imgRef.current.naturalHeight })
    }
  }

  // ── Drag handlers for the crop rectangle ────────────────────────────────
  // Coords are tracked relative to the <img> element (not the container).
  // The img is centered inside the container via flex/object-contain, so
  // the container may have letterbox/pillarbox padding. We offset by the
  // img's position inside the container so visibleCrop coords are always
  // measured from the top-left corner of the visible image pixels.
  const onContainerMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    if (!containerRef.current || !imgRef.current) return
    const containerRect = containerRef.current.getBoundingClientRect()
    const imgRect = imgRef.current.getBoundingClientRect()
    // Clamp to image bounds, then express relative to img top-left
    const x = Math.max(0, Math.min(imgRect.width, e.clientX - imgRect.left))
    const y = Math.max(0, Math.min(imgRect.height, e.clientY - imgRect.top))
    // Store in container-relative space so the overlay div aligns correctly
    const offset = { x: imgRect.left - containerRect.left, y: imgRect.top - containerRect.top }
    setDragStart({ x: x + offset.x, y: y + offset.y })
    setDragCurrent({ x: x + offset.x, y: y + offset.y })
  }
  const onContainerMouseMove = (e: React.MouseEvent) => {
    if (!dragStart || !containerRef.current || !imgRef.current) return
    const containerRect = containerRef.current.getBoundingClientRect()
    const imgRect = imgRef.current.getBoundingClientRect()
    const offset = { x: imgRect.left - containerRect.left, y: imgRect.top - containerRect.top }
    const x = Math.max(0, Math.min(imgRect.width, e.clientX - imgRect.left))
    const y = Math.max(0, Math.min(imgRect.height, e.clientY - imgRect.top))
    setDragCurrent({ x: x + offset.x, y: y + offset.y })
  }
  const onContainerMouseUp = () => {
    if (!dragStart || !dragCurrent) {
      setDragStart(null)
      return
    }
    const left = Math.min(dragStart.x, dragCurrent.x)
    const top = Math.min(dragStart.y, dragCurrent.y)
    const width = Math.abs(dragCurrent.x - dragStart.x)
    const height = Math.abs(dragCurrent.y - dragStart.y)
    setDragStart(null)
    setDragCurrent(null)
    if (width < 8 || height < 8) {
      // Treat tiny rectangles as a click (no crop), don't set crop
      return
    }
    setCrop({ left, top, width, height })
  }

  // The visible crop rectangle: during a drag, it's the live drag bounds;
  // otherwise it's the committed crop from state. We use a regular
  // variable (not useMemo) because the inputs change rarely enough that
  // the trivial recompute is not a hot path.
  const visibleCrop: CropRect | null = dragStart && dragCurrent
    ? {
        left: Math.min(dragStart.x, dragCurrent.x),
        top: Math.min(dragStart.y, dragCurrent.y),
        width: Math.abs(dragCurrent.x - dragStart.x),
        height: Math.abs(dragCurrent.y - dragStart.y),
      }
    : crop

  // The displayed image dimensions depend on rotate. For a 90°/270°
  // rotation the rendered bounding box swaps w/h. The browser handles
  // the transform via CSS rotate() so the visible size is computed by
  // the layout engine. We track this in state via setInterval polling so
  // reading it during render doesn't violate the React rule on refs.
  const [displaySize, setDisplaySize] = useState<{ w: number; h: number } | null>(null)
  // imgOffset: the img element's top-left position relative to the container.
  // Tracked in state (not read from refs during render) to satisfy react-hooks/refs.
  const [imgOffset, setImgOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  useEffect(() => {
    const update = () => {
      if (imgRef.current) {
        const r = imgRef.current.getBoundingClientRect()
        setDisplaySize({ w: r.width, h: r.height })
      }
      if (imgRef.current && containerRef.current) {
        const imgRect = imgRef.current.getBoundingClientRect()
        const containerRect = containerRef.current.getBoundingClientRect()
        setImgOffset({
          x: imgRect.left - containerRect.left,
          y: imgRect.top - containerRect.top,
        })
      }
    }
    update()
    window.addEventListener('resize', update)
    // Also recompute on the next tick after the rotate transition ends
    // (CSS transition 120ms) so the displaySize tracks the rotated box.
    const interval = setInterval(update, 200)
    return () => {
      window.removeEventListener('resize', update)
      clearInterval(interval)
    }
  }, [rotate, flipH, flipV, resizeWidth])

  /**
   * Convert the CSS-px crop rectangle to source natural pixels.
   *
   * The crop overlay coords are in container-space but measured from the
   * img's top-left corner (see getImgOffset in the drag handlers). So
   * visibleCrop.{left,top} include the img offset — subtract it to get
   * img-local CSS px, then scale to source px.
   *
   * Rotation: CSS rotate() swaps the rendered bounding box for 90°/270°,
   * so getBoundingClientRect() reports swapped w/h while imgNaturalSize
   * reflects the original (un-rotated) pixel grid. To avoid wrong scale
   * axes we always pass `rotate` to the server and compute the crop in
   * the UN-ROTATED display space (the img's pre-rotation rendered size).
   * For 90°/270° we derive the pre-rotation display size by swapping w/h
   * back: preDisplayW = displaySize.h, preDisplayH = displaySize.w.
   *
   * The server applies: (1) rotate, then (2) crop — so our crop coords
   * must be in the rotated coordinate space as seen by the user. The
   * scale factors use the pre-rotation display size (to map CSS px to
   * source px correctly), but the origin is already user-visible img px.
   *
   * Clamp the result to [0, natural w/h] and guard against 0/negative
   * size (the Apply button is disabled when this returns null).
   */
  const cropInSourcePx = (): CropRect | null => {
    if (!visibleCrop) return null
    if (!displaySize || displaySize.w === 0 || displaySize.h === 0) return null
    if (imgNaturalSize.w === 0 || imgNaturalSize.h === 0) return null

    // Strip the img offset from container-space coords to get img-local px.
    // imgOffset is updated by the polling effect, not read from refs directly.
    const offset = imgOffset
    const imgLeft = visibleCrop.left - offset.x
    const imgTop = visibleCrop.top - offset.y

    // For 90°/270° CSS rotate, the rendered bounding box has swapped w/h
    // relative to the source pixel grid. Use the pre-rotation display size
    // for scale factors so the axis mapping is correct.
    const rotated90 = rotate === 90 || rotate === 270
    const preDisplayW = rotated90 ? displaySize.h : displaySize.w
    const preDisplayH = rotated90 ? displaySize.w : displaySize.h

    const scaleX = imgNaturalSize.w / preDisplayW
    const scaleY = imgNaturalSize.h / preDisplayH

    const left = Math.max(0, imgLeft * scaleX)
    const top = Math.max(0, imgTop * scaleY)
    const width = visibleCrop.width * scaleX
    const height = visibleCrop.height * scaleY

    // Guard: zero/negative crop would result in a no-op or server error.
    if (width <= 0 || height <= 0) return null

    return {
      left,
      top,
      width: Math.min(width, imgNaturalSize.w - left),
      height: Math.min(height, imgNaturalSize.h - top),
    }
  }

  const submit = async () => {
    if (!showConfirm) {
      setShowConfirm(true)
      return
    }
    setShowConfirm(false)
    setApplying(true)
    setError(null)
    try {
      const body: Record<string, unknown> = { rotate, flipH, flipV }
      if (resizeWidth !== '') body.resizeWidth = Number(resizeWidth)
      if (cropSrcPx) body.crop = cropSrcPx
      const res = await fetch(`/api/media/${doc.id}/edit-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error((data as { error?: string } | null)?.error ?? `HTTP ${res.status}`)
      }
      onApplied(data as never)
    } catch (err) {
      setError(err instanceof Error ? err.message : isEnglish ? 'Network error' : 'Lỗi mạng')
    } finally {
      setApplying(false)
    }
  }

  // Compute a CSS transform for the displayed image so the user sees
  // the rotate/flip immediately (live preview).
  const imgTransform = `rotate(${rotate}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`

  // Submit button disabled when no transform is selected and no crop drawn
  // (would be a no-op write — refuse to make the user wait). Also disable
  // when a crop is drawn but resolves to zero/negative size (degenerate).
  const cropSrcPx = cropInSourcePx()
  const cropInvalid = !!crop && (cropSrcPx === null || cropSrcPx.width <= 0 || cropSrcPx.height <= 0)
  const noTransform = !rotate && !flipH && !flipV && !crop && resizeWidth === ''

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={isEnglish ? `Edit image: ${doc.filename}` : `Sửa ảnh: ${doc.filename}`}
      onKeyDown={handleKeyDown}
      onClick={() => { if (!applying) onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(10,27,33,0.9)',
        zIndex: 10000, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="twp flex flex-col items-center gap-4 overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-xl"
        style={{ maxWidth: '95vw', maxHeight: '95vh' }}
      >
        <div className="flex w-full items-center justify-between">
          <h2 className="m-0 text-[15px] font-semibold">{isEnglish ? 'Edit image' : 'Sửa ảnh'}: {doc.filename}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={applying}
            aria-label={isEnglish ? 'Close' : 'Đóng'}
            className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Image area — container captures drag for the crop rectangle. */}
        <div
          ref={containerRef}
          onMouseDown={onContainerMouseDown}
          onMouseMove={onContainerMouseMove}
          onMouseUp={onContainerMouseUp}
          onMouseLeave={onContainerMouseUp}
          className="relative flex items-center justify-center bg-muted"
          style={{ maxWidth: '80vw', maxHeight: '70vh', cursor: 'crosshair', overflow: 'hidden' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={doc.url}
            alt={doc.filename}
            onLoad={onImgLoad}
            className="block max-h-[70vh] max-w-[80vw] object-contain select-none"
            style={{ transform: imgTransform, transition: 'transform 120ms ease' }}
            draggable={false}
          />
          {visibleCrop && (
            <div
              className="pointer-events-none absolute border-2 border-primary bg-primary/20"
              style={{
                left: visibleCrop.left,
                top: visibleCrop.top,
                width: visibleCrop.width,
                height: visibleCrop.height,
              }}
            />
          )}
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setRotate((r) => ((r + 270) % 360) as 0 | 90 | 180 | 270)} title={isEnglish ? 'Rotate left 90°' : 'Xoay trái 90°'}>
            <RotateCcw /> {isEnglish ? 'Left' : 'Trái'}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setRotate((r) => ((r + 90) % 360) as 0 | 90 | 180 | 270)} title={isEnglish ? 'Rotate right 90°' : 'Xoay phải 90°'}>
            <RotateCw /> {isEnglish ? 'Right' : 'Phải'}
          </Button>
          <Button type="button" variant={flipH ? 'default' : 'outline'} size="sm" onClick={() => setFlipH((v) => !v)} aria-pressed={flipH} title={isEnglish ? 'Flip horizontally' : 'Lật ngang'}>
            <FlipHorizontal2 /> {isEnglish ? 'Horizontal' : 'Ngang'}
          </Button>
          <Button type="button" variant={flipV ? 'default' : 'outline'} size="sm" onClick={() => setFlipV((v) => !v)} aria-pressed={flipV} title={isEnglish ? 'Flip vertically' : 'Lật dọc'}>
            <FlipVertical2 /> {isEnglish ? 'Vertical' : 'Dọc'}
          </Button>
          {crop && (
            <Button type="button" variant="outline" size="sm" onClick={() => setCrop(null)} title={isEnglish ? 'Clear crop' : 'Xoá crop'}>
              <Crop /> {isEnglish ? 'Clear crop' : 'Xoá crop'}
            </Button>
          )}
          <div className="ml-2 flex items-center gap-1.5">
            <label htmlFor="resize-w" className="text-[12px] text-muted-foreground">{isEnglish ? 'Width:' : 'Rộng:'}</label>
            <input
              id="resize-w"
              type="number"
              min={1}
              placeholder="px"
              value={resizeWidth}
              onChange={(e) => setResizeWidth(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-20 rounded border border-border bg-background px-1.5 py-0.5 text-[12px] outline-none focus:border-primary"
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="flex items-center gap-1.5 text-[12px] text-destructive">
            <AlertCircle className="size-3.5" /> {error}
          </p>
        )}

        <div className="flex items-center gap-2">
          {showConfirm ? (
            <>
              <span className="text-[12px] text-muted-foreground">{isEnglish ? 'Overwrite the original image on R2?' : 'Ghi đè ảnh gốc trên R2?'}</span>
              <Button type="button" variant="destructive" size="sm" onClick={submit} disabled={applying}>
                {applying ? <Loader2 className="animate-spin" /> : <Check />}
                {isEnglish ? 'Confirm' : 'Xác nhận'}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowConfirm(false)} disabled={applying}>
                {isEnglish ? 'Cancel' : 'Huỷ'}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={applying}>{isEnglish ? 'Cancel' : 'Huỷ'}</Button>
              <Button
                type="button"
                size="sm"
                onClick={submit}
                disabled={applying || noTransform || cropInvalid}
                title={noTransform ? (isEnglish ? 'Choose at least one transform before applying' : 'Chọn ít nhất 1 thao tác trước khi áp dụng') : cropInvalid ? (isEnglish ? 'Invalid crop (zero size)' : 'Crop không hợp lệ (kích thước bằng 0)') : undefined}
              >
                {applying ? <Loader2 className="animate-spin" /> : <Check />}
                {isEnglish ? 'Apply' : 'Áp dụng'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
