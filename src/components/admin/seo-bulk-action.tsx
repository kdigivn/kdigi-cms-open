'use client'
/**
 * Bulk SEO edit panel — rendered in the list-view beforeListTable slot.
 *
 * Appears only when ≥1 row is selected. Lets the editor:
 *   - Set robots (index/noindex/follow/nofollow as multi-select)
 *   - Set seo.title (template string)
 *   - Set seo.description (template string)
 * With mode choice: blank-only (safe default) or overwrite (requires explicit confirm).
 *
 * Calls Payload's BUILT-IN bulk PATCH endpoint: PATCH /api/{collectionSlug}
 * with ?where[id][in]=id1,id2,... so no custom endpoint is needed and Payload's
 * own access control (tenant scope) enforces permissions.
 *
 * The pure helper `computeSeoBulkPatches` decides what to patch per-doc based
 * on the blankOnly/overwrite mode. Since we call the Payload PATCH endpoint once
 * per doc (to let Payload run hooks per doc), we iterate patches sequentially.
 * For large sets the helper's batch cap limits damage; truncated IDs are reported.
 */
import React, { useState, useCallback, useId } from 'react'
import { useSelection, useListQuery, useTranslation } from '@payloadcms/ui'
import { Button } from '@/components/ui/button'
import {
  computeSeoBulkPatches,
  DEFAULT_BATCH_SIZE,
  type SeoBulkFields,
  type BulkMode,
  type DocSeoSnapshot,
  type RobotsValue,
} from '../../lib/seo-bulk-update-helper'

// ── Types ────────────────────────────────────────────────────────────────────

interface ListDoc {
  id: string | number
  seo?: {
    title?: string | null
    description?: string | null
    robots?: RobotsValue[] | null
  }
}

type Status = 'idle' | 'running' | 'done' | 'error'

interface ApplyResult {
  succeeded: number
  failed: number
  skipped: number
  truncated: number
  errors: string[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ROBOTS_OPTIONS: { label: string; value: RobotsValue }[] = [
  { label: 'index',    value: 'index' },
  { label: 'noindex',  value: 'noindex' },
  { label: 'follow',   value: 'follow' },
  { label: 'nofollow', value: 'nofollow' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract list-view docs from the useListQuery data shape. */
function extractDocs(data: unknown): ListDoc[] {
  if (!data || typeof data !== 'object') return []
  const d = data as Record<string, unknown>
  if (Array.isArray(d.docs)) return d.docs as ListDoc[]
  return []
}

/**
 * Call Payload's built-in collection PATCH for a single doc.
 * Access control (tenant scope) is enforced server-side automatically.
 */
async function patchDoc(
  collectionSlug: string,
  id: string | number,
  data: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(
    `/api/${collectionSlug}/${id}`,
    {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    },
  )
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { errors?: { message: string }[]; message?: string }
    const msg = body?.errors?.[0]?.message ?? body?.message ?? `HTTP ${res.status}`
    throw new Error(msg)
  }
}


// ── Component ─────────────────────────────────────────────────────────────────

interface SeoBulkActionProps {
  /** collectionSlug is injected automatically by Payload via BeforeListTableClientProps. */
  collectionSlug: string
}

export const SeoBulkAction: React.FC<SeoBulkActionProps> = ({ collectionSlug }) => {
  const { i18n } = useTranslation()
  const isEnglish = i18n.language === 'en'
  const inputId = useId()
  const { selectedIDs, count } = useSelection()
  const { data: listData } = useListQuery()

  // ── Form state ──────────────────────────────────────────────────────────────
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [robots, setRobots] = useState<RobotsValue[]>([])
  const [mode, setMode] = useState<BulkMode>('blankOnly')
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false)
  const [expanded, setExpanded] = useState(false)

  // ── Run state ───────────────────────────────────────────────────────────────
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<ApplyResult | null>(null)

  // ── Derived ─────────────────────────────────────────────────────────────────
  const isOverwrite = mode === 'overwrite'
  const canApply = count > 0 && (title || description || robots.length > 0) &&
    (!isOverwrite || overwriteConfirmed)

  const handleRobotsToggle = useCallback((value: RobotsValue) => {
    setRobots(prev =>
      prev.includes(value) ? prev.filter(r => r !== value) : [...prev, value],
    )
  }, [])

  // handleApply must be declared before any early return (hooks rules)
  const handleApply = useCallback(async () => {
    if (!collectionSlug || !canApply) return

    // Build fields object — only include fields the user actually filled in
    const fields: SeoBulkFields = {}
    if (title.trim()) fields.title = title.trim()
    if (description.trim()) fields.description = description.trim()
    if (robots.length > 0) fields.robots = robots

    if (Object.keys(fields).length === 0) return

    // Extract current SEO snapshot from the list data for blankOnly logic
    const allDocs = extractDocs(listData)
    const selectedSet = new Set(selectedIDs.map(String))
    const targetDocs: DocSeoSnapshot[] = allDocs
      .filter(d => selectedSet.has(String(d.id)))
      .map(d => ({ id: d.id, seo: d.seo }))

    // Fallback: if docs not in list data (e.g. pagination), use IDs with no snapshot
    const foundIds = new Set(targetDocs.map(d => String(d.id)))
    for (const id of selectedIDs) {
      if (!foundIds.has(String(id))) {
        targetDocs.push({ id })
      }
    }

    const plan = computeSeoBulkPatches(targetDocs, fields, mode, DEFAULT_BATCH_SIZE)

    setStatus('running')
    setResult(null)

    const applyResult: ApplyResult = {
      succeeded: 0,
      failed: 0,
      skipped: plan.skipped.length,
      truncated: plan.truncated.length,
      errors: [],
    }

    for (const patch of plan.patches) {
      try {
        await patchDoc(collectionSlug, patch.id, patch.data as Record<string, unknown>)
        applyResult.succeeded++
      } catch (err) {
        applyResult.failed++
        applyResult.errors.push(`ID ${patch.id}: ${String(err)}`)
      }
    }

    setStatus(applyResult.failed > 0 ? 'error' : 'done')
    setResult(applyResult)
  }, [collectionSlug, canApply, title, description, robots, listData, selectedIDs, mode])

  // Don't render when nothing is selected (after all hooks — hooks-rules-of-hooks)
  if (count === 0) return null

  return (
    <section className="twp mb-4 rounded-lg border border-border bg-card p-4" aria-busy={status === 'running'}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-sm font-semibold">
          {isEnglish ? 'Bulk SEO' : 'SEO hàng loạt'} ({count} {isEnglish ? 'selected' : 'đã chọn'})
        </h2>
        <Button type="button" size="sm" variant="outline" aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>
          {expanded ? (isEnglish ? 'Collapse' : 'Thu gọn') : (isEnglish ? 'Expand' : 'Mở rộng')}
        </Button>
      </div>
      {status === 'done' && result && (
        <p role="status" className="mb-0 mt-3 text-sm text-emerald-700 dark:text-emerald-300">
          {result.succeeded} {isEnglish ? 'updated' : 'đã cập nhật'}
          {result.skipped > 0 ? `, ${result.skipped} ${isEnglish ? 'skipped' : 'bỏ qua'}` : ''}
          {result.truncated > 0 ? `, ${result.truncated} ${isEnglish ? 'remaining (batch limit)' : 'còn lại (giới hạn batch)'}` : ''}
        </p>
      )}
      {status === 'error' && result && (
        <p role="alert" className="mb-0 mt-3 text-sm text-destructive">
          {result.succeeded} {isEnglish ? 'updated' : 'thành công'}, {result.failed} {isEnglish ? 'failed' : 'lỗi'}
        </p>
      )}
      {expanded && (
        <div className="mt-4 space-y-4">
          <fieldset className="m-0 flex flex-wrap gap-4 border-0 p-0">
            <legend className="mb-2 text-sm font-medium">{isEnglish ? 'Update mode' : 'Chế độ cập nhật'}</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name={`${inputId}-mode`} value="blankOnly" checked={mode === 'blankOnly'} onChange={() => { setMode('blankOnly'); setOverwriteConfirmed(false) }} className="accent-primary" />
              {isEnglish ? 'Only fill empty fields (safe)' : 'Chỉ điền chỗ trống (an toàn)'}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name={`${inputId}-mode`} value="overwrite" checked={mode === 'overwrite'} onChange={() => setMode('overwrite')} className="accent-primary" />
              {isEnglish ? 'Overwrite all' : 'Ghi đè tất cả'}
            </label>
            {isOverwrite && (
              <label className="flex items-center gap-2 text-sm text-destructive">
                <input type="checkbox" checked={overwriteConfirmed} onChange={e => setOverwriteConfirmed(e.target.checked)} className="accent-primary" />
                {isEnglish ? 'I confirm overwriting existing values' : 'Tôi xác nhận ghi đè toàn bộ'}
              </label>
            )}
          </fieldset>
          <fieldset className="m-0 flex flex-wrap gap-4 border-0 p-0">
            <legend className="mb-2 text-sm font-medium">Robots</legend>
            {ROBOTS_OPTIONS.map(opt => (
              <label key={opt.value} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={robots.includes(opt.value)} onChange={() => handleRobotsToggle(opt.value)} className="accent-primary" />
                {opt.label}
              </label>
            ))}
          </fieldset>
          <div>
            <label htmlFor={`${inputId}-title`} className="mb-2 block text-sm font-medium">{isEnglish ? 'SEO title' : 'Tiêu đề SEO'}</label>
            <input id={`${inputId}-title`} type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder={isEnglish ? 'New SEO title (empty leaves unchanged)' : 'Tiêu đề SEO mới (bỏ trống = không thay đổi)'} className="harbor-field__control" />
          </div>
          <div>
            <label htmlFor={`${inputId}-description`} className="mb-2 block text-sm font-medium">{isEnglish ? 'SEO description' : 'Mô tả SEO'}</label>
            <textarea id={`${inputId}-description`} value={description} onChange={e => setDescription(e.target.value)} placeholder={isEnglish ? 'New SEO description (empty leaves unchanged)' : 'Mô tả SEO mới (bỏ trống = không thay đổi)'} rows={2} className="harbor-field__control resize-y" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" disabled={!canApply || status === 'running'} onClick={handleApply}>
              {status === 'running' ? (isEnglish ? 'Updating…' : 'Đang cập nhật…') : (isEnglish ? `Apply to ${count} records` : `Áp dụng cho ${count} trang`)}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => {
              setTitle('')
              setDescription('')
              setRobots([])
              setMode('blankOnly')
              setOverwriteConfirmed(false)
              setStatus('idle')
              setResult(null)
            }}>
              {isEnglish ? 'Clear' : 'Xóa'}
            </Button>
          </div>
          {status === 'error' && result && result.errors.length > 0 && (
            <details className="text-sm text-destructive">
              <summary className="cursor-pointer">{isEnglish ? 'Error details' : 'Chi tiết lỗi'} ({result.errors.length})</summary>
              <ul className="mt-2">{result.errors.map((error, index) => <li key={index}>{error}</li>)}</ul>
            </details>
          )}
        </div>
      )}
    </section>
  )
}
