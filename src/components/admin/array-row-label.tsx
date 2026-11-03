'use client'
/**
 * Generic array row label for Sites (and any) collection arrays.
 *
 * Replaces Payload's default "Item 01 / Item 02 …" collapsed-row labels with a
 * meaningful, scannable title derived from the row's own data — so editors can
 * read an array at a glance without expanding every row.
 *
 * Auto-detects the most descriptive value among common field keys (name, label,
 * title, alt, key, text, value, …). Localized values (objects keyed by locale)
 * resolve to the active admin locale, falling back to the first non-empty entry.
 *
 * Registered via `admin.components.RowLabel` on array fields in sites.ts.
 */
import React from 'react'
import { useRowLabel, useLocale } from '@payloadcms/ui'

// Priority order: earlier keys win when a row has several populated fields.
const LABEL_KEYS = [
  'name',
  'label',
  'title',
  'key',
  'alt',
  'text',
  'departureName',
  'value',
  'url',
  'link',
  'src',
] as const

type RowData = Record<string, unknown>

/** Resolve a possibly-localized field value to a display string. */
function resolveValue(raw: unknown, localeCode: string): string {
  if (raw == null) return ''
  if (typeof raw === 'string') return raw.trim()
  if (typeof raw === 'number') return String(raw)
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    const localized = obj[localeCode]
    if (typeof localized === 'string' && localized.trim()) return localized.trim()
    const firstString = Object.values(obj).find(
      (v) => typeof v === 'string' && v.trim(),
    )
    return typeof firstString === 'string' ? firstString.trim() : ''
  }
  return ''
}

export const ArrayRowLabel: React.FC = () => {
  const { data, rowNumber } = useRowLabel<RowData>()
  const { code: localeCode } = useLocale()

  const ordinal = String((rowNumber ?? 0) + 1).padStart(2, '0')

  let label = ''
  for (const key of LABEL_KEYS) {
    const candidate = resolveValue(data?.[key], localeCode)
    if (candidate) {
      label = candidate
      break
    }
  }

  // Keep collapsed rows compact — truncate long values.
  const display = label.length > 60 ? `${label.slice(0, 57)}…` : label

  return <span>{display ? `${ordinal} — ${display}` : `Mục ${ordinal}`}</span>
}
