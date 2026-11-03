/**
 * Shared inline style objects for the menu tree builder components.
 * Extracted to a separate module so the row/builder files stay under 200 lines.
 * Uses Payload admin CSS custom properties so the tree respects the active theme.
 */
import type React from 'react'

export const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  flex: 1,
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--theme-elevation-500, #6b7280)',
}

export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '5px 8px',
  border: '1px solid var(--theme-elevation-200, #d1d5db)',
  borderRadius: 3,
  fontSize: 13,
  outline: 'none',
  background: 'var(--theme-bg, #fff)',
  color: 'inherit',
  boxSizing: 'border-box',
}

export const arrowBtnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--theme-elevation-200, #d1d5db)',
  borderRadius: 3,
  padding: '2px 8px',
  fontSize: 11,
  cursor: 'pointer',
  color: 'var(--theme-elevation-600, #4b5563)',
}

export const indentBtnStyle = (enabled: boolean): React.CSSProperties => ({
  background: 'none',
  border: '1px solid var(--theme-elevation-200, #d1d5db)',
  borderRadius: 3,
  padding: '0 6px',
  fontSize: 13,
  lineHeight: 1.6,
  cursor: enabled ? 'pointer' : 'not-allowed',
  opacity: enabled ? 1 : 0.3,
  color: 'var(--theme-elevation-600, #4b5563)',
  flexShrink: 0,
})

export const localeTabStyle = (active: boolean): React.CSSProperties => ({
  padding: '3px 12px',
  border: '1px solid var(--theme-elevation-200, #d1d5db)',
  borderRadius: 4,
  background: active ? 'var(--theme-brand)' : 'transparent',
  color: active ? 'var(--harbor-on-primary)' : 'inherit',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  textTransform: 'uppercase',
})
