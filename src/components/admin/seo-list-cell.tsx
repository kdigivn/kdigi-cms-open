'use client'
/**
 * Custom list-view cell showing SEO title/description presence + score badge.
 *
 * Registered as admin.components.Cell on a UI field named `seoListCell`
 * added to the 5 content collections (products, posts, pages, landings, taxonomies).
 *
 * Uses computeSeoScore with just title + description from rowData so the
 * badge is fast to render and requires no extra network call.
 *
 * Score colour bands mirror seo-analysis-field.tsx:
 *   ≥70 → emerald (good), ≥40 → amber (warn), <40 → red (fail)
 */
import React, { useMemo } from 'react'
import type { DefaultCellComponentProps } from 'payload'
import { computeSeoScore } from '../../lib/seo-score'

type PresenceStatus = 'set' | 'missing'

function badge(label: string, tone: 'emerald' | 'amber' | 'red') {
  const styles: Record<typeof tone, React.CSSProperties> = {
    emerald: { background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7' },
    amber:   { background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' },
    red:     { background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' },
  }
  return (
    <span style={{
      ...styles[tone],
      borderRadius: 4,
      padding: '1px 6px',
      fontSize: 11,
      fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

function presenceDot(status: PresenceStatus, label: string) {
  const color = status === 'set' ? '#10b981' : '#d1d5db'
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, whiteSpace: 'nowrap' }}>
      <span style={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
        display: 'inline-block',
      }} />
      {label}
    </span>
  )
}

export const SeoListCell: React.FC<DefaultCellComponentProps> = ({ rowData }) => {
  const doc = rowData as Record<string, unknown>
  const seo = (doc?.seo ?? {}) as Record<string, unknown>
  const title = typeof seo.title === 'string' ? seo.title : ''
  const description = typeof seo.description === 'string' ? seo.description : ''

  const score = useMemo(
    () => computeSeoScore({ title, description }).score,
    [title, description],
  )

  const scoreTone: 'emerald' | 'amber' | 'red' =
    score >= 70 ? 'emerald' : score >= 40 ? 'amber' : 'red'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 100 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {presenceDot(title ? 'set' : 'missing', 'T')}
        {presenceDot(description ? 'set' : 'missing', 'D')}
        {badge(String(score), scoreTone)}
      </div>
    </div>
  )
}
