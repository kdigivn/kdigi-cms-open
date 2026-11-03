'use client'
/**
 * Compact "Cập nhật / Tạo" timestamps for the edit-view sidebar.
 *
 * Replaces Payload's built-in doc-controls timestamp band (hidden via custom.css)
 * so the top bar can be slimmed and de-stickied, freeing vertical space for the
 * editor. Reads the persisted document from useDocumentInfo() — renders nothing on
 * the "create new" form (no saved data yet).
 *
 * Times are formatted for Vietnam (Asia/Ho_Chi_Minh, vi-VN locale).
 */
import React from 'react'
import { useDocumentInfo } from '@payloadcms/ui'

const dateFmt = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
})

function fmt(value: unknown): string | null {
  if (typeof value !== 'string' && !(value instanceof Date)) return null
  const d = new Date(value as string)
  if (Number.isNaN(d.getTime())) return null
  return dateFmt.format(d)
}

export const DocMetaField: React.FC = () => {
  // savedDocumentData is the persisted doc on useDocumentInfo() (present in Payload
  // 3.x, verified 3.78.0). Typed loosely to stay resilient across minor versions;
  // the guard below renders nothing if it's ever absent, so no crash path.
  const info = useDocumentInfo() as unknown as {
    id?: string | number
    savedDocumentData?: Record<string, unknown>
  }

  const saved = info?.savedDocumentData
  const updated = fmt(saved?.updatedAt)
  const created = fmt(saved?.createdAt)

  // Only render for existing docs that actually carry timestamps
  if (!info?.id || (!updated && !created)) return null

  return (
    <div className="doc-meta-field">
      {updated && (
        <div className="doc-meta-field__row">
          <span className="doc-meta-field__label">Cập nhật:</span> {updated}
        </div>
      )}
      {created && (
        <div className="doc-meta-field__row">
          <span className="doc-meta-field__label">Tạo:</span> {created}
        </div>
      )}
    </div>
  )
}

export default DocMetaField
