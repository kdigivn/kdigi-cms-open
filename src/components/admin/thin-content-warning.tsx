'use client'
/**
 * Thin content warning cell for taxonomies list view.
 * Shows a warning icon when contentWordCount < 500 (thin content threshold).
 *
 * Registered as admin.components.Cell on the `contentWordCount` number field
 * in the taxonomies collection.
 */
import React from 'react'
import type { DefaultCellComponentProps } from 'payload'

const THIN_CONTENT_THRESHOLD = 500

const WarningIcon: React.FC = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    style={{ width: 14, height: 14, flexShrink: 0, color: '#f59e0b' }}
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
      clipRule="evenodd"
    />
  </svg>
)

export const ThinContentWarningCell: React.FC<DefaultCellComponentProps> = ({
  rowData,
}) => {
  const wordCount = rowData?.contentWordCount as number | undefined
  const isThin = typeof wordCount === 'number' && wordCount < THIN_CONTENT_THRESHOLD

  if (!isThin) {
    return (
      <span style={{ fontSize: 12, color: '#6b7280' }}>
        {wordCount ?? 0} words
      </span>
    )
  }

  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 12,
        color: '#92400e',
      }}
      title={`Only ${wordCount} words — thin content (min ${THIN_CONTENT_THRESHOLD})`}
    >
      <WarningIcon />
      {wordCount} words
    </span>
  )
}
