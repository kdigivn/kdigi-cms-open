'use client'
/**
 * Custom list-view cell for the Media collection — shows a thumbnail preview.
 * Registered as admin.components.Cell on the thumbPreview UI field in media.ts.
 * Uses rowData (not cellData) because thumbPreview is a UI field with no stored value.
 */
import React from 'react'
import type { DefaultCellComponentProps } from 'payload'

export const MediaThumbCell: React.FC<DefaultCellComponentProps> = ({ rowData }) => {
  const doc = rowData as Record<string, unknown>
  const url = (doc?.externalUrl ?? doc?.url) as string | undefined
  if (!url) return <span style={{ color: 'var(--theme-elevation-400)', fontSize: 12 }}>—</span>
  return (
    <img
      src={url}
      alt=""
      style={{
        width: 120,
        height: 80,
        objectFit: 'cover',
        borderRadius: 4,
        border: '1px solid var(--theme-elevation-150)',
        display: 'block',
      }}
    />
  )
}
