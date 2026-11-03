'use client'
/**
 * Toolbar rendered in the edit-view document-controls band (via
 * admin.components.edit.beforeDocumentControls), sitting next to Save.
 *
 * Fills the band — which lost its timestamp row — with at-a-glance signals and
 * the most-used action:
 *   - status pill (Draft / Published)
 *   - relative "Cập nhật X trước"
 *   - "Xem trên site" link (resolves the public frontend URL)
 *   - Revalidate (clear frontend cache) button
 *
 * Renders nothing on the create-new form (no saved data yet).
 */
import React, { useState } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'
import { ExternalLink } from 'lucide-react'
import { RevalidateButton } from './revalidate-button'

/** Multi-tenant relationship may arrive as an id or a populated object. */
function tenantId(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (value && typeof value === 'object' && 'id' in value) {
    return String((value as { id: unknown }).id)
  }
  return ''
}

/** Compact Vietnamese relative time: "5 phút trước", "3 giờ trước", "2 ngày trước". */
function relativeTime(value: unknown): string | null {
  if (typeof value !== 'string' && !(value instanceof Date)) return null
  const d = new Date(value as string)
  if (Number.isNaN(d.getTime())) return null
  const diffSec = Math.round((Date.now() - d.getTime()) / 1000)
  if (diffSec < 60) return 'vừa xong'
  const mins = Math.round(diffSec / 60)
  if (mins < 60) return `${mins} phút trước`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} giờ trước`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} ngày trước`
  const months = Math.round(days / 30)
  if (months < 12) return `${months} tháng trước`
  return `${Math.round(months / 12)} năm trước`
}

export const DocHeaderActions: React.FC = () => {
  const info = useDocumentInfo() as unknown as {
    id?: string | number
    collectionSlug?: string
    savedDocumentData?: Record<string, unknown>
  }
  const [opening, setOpening] = useState(false)

  const saved = info?.savedDocumentData
  // Only render for existing, saved documents
  if (!info?.id || !saved) return null

  const isPublished = saved.status === 'published'
  const updated = relativeTime(saved.updatedAt)
  const slug = typeof saved.slug === 'string' ? saved.slug : ''
  // Resolve the document's tenant so Revalidate can look up the frontend domain.
  // Without this the endpoint gets no tenantId and fails in production.
  const docTenantId = tenantId(saved.tenant) || undefined

  const handleView = async () => {
    if (!info.collectionSlug || !slug) return
    setOpening(true)
    try {
      const qs = new URLSearchParams({
        collection: info.collectionSlug,
        slug,
        tenantId: tenantId(saved.tenant),
      })
      const res = await fetch(`/api/frontend-doc-url?${qs}`, { credentials: 'include' })
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
      if (res.ok && json.url) {
        window.open(json.url, '_blank', 'noopener,noreferrer')
      } else {
        alert(json.error ?? 'Không tạo được link xem trên site.')
      }
    } catch (e) {
      alert(String(e))
    } finally {
      setOpening(false)
    }
  }

  return (
    <div className="doc-header-actions">
      <span
        className={`doc-header-actions__pill doc-header-actions__pill--${
          isPublished ? 'published' : 'draft'
        }`}
      >
        {isPublished ? 'Đã đăng' : 'Bản nháp'}
      </span>
      {updated && <span suppressHydrationWarning className="doc-header-actions__time">Cập nhật {updated}</span>}
      {slug && (
        <button
          type="button"
          onClick={handleView}
          disabled={opening}
          className="btn btn--style-secondary btn--size-small"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <ExternalLink size={14} aria-hidden />
          {opening ? 'Đang mở...' : 'Xem trên site'}
        </button>
      )}
      <RevalidateButton tenantId={docTenantId} />
    </div>
  )
}

export default DocHeaderActions
