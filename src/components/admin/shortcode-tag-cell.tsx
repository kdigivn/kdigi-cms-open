'use client'

import React, { useState } from 'react'
import type { DefaultCellComponentProps } from 'payload'

function fallbackCopy(text: string) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'absolute'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

async function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
    return
  }

  fallbackCopy(text)
}

export const ShortcodeTagCell: React.FC<DefaultCellComponentProps> = ({ rowData }) => {
  const doc = rowData as Record<string, unknown>
  const name = typeof doc?.name === 'string' ? doc.name : ''
  const [copied, setCopied] = useState(false)

  if (!name) return <span style={{ color: 'var(--theme-elevation-400)', fontSize: 12 }}>—</span>

  const snippet = `[sc name="${name}"][/sc]`

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 220 }}>
      <code
        style={{
          background: 'var(--theme-elevation-100)',
          border: '1px solid var(--theme-elevation-150)',
          borderRadius: 6,
          fontSize: 12,
          padding: '3px 6px',
          whiteSpace: 'nowrap',
        }}
      >
        {snippet}
      </code>
      <button
        type="button"
        onClick={() => {
          copyText(snippet)
            .then(() => {
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1200)
            })
            .catch(() => {})
        }}
        title="Sao chép shortcode"
        style={{
          background: 'var(--theme-elevation-50)',
          border: '1px solid var(--theme-elevation-150)',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: 12,
          padding: '3px 8px',
          whiteSpace: 'nowrap',
        }}
      >
        {copied ? 'Da copy' : 'Copy'}
      </button>
    </div>
  )
}

