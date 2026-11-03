'use client'
/**
 * Payload admin UI field component — write-only editor for any whitelisted secret field.
 * Registered as type:'ui' on the relevant group; stores nothing itself.
 * The actual secret is written by POST /api/sites/:id/secret which deep-merges
 * the new value into the group, preserving all sibling fields, via overrideAccess:true.
 *
 * Security: this component NEVER reads, renders, or logs the stored secret value.
 * It fetches only { hasValue: boolean } via GET /api/sites/:id/secret?field=PATH.
 * The password input is always empty on mount.
 *
 * Props (via Payload clientProps):
 *   secretPath — dot-path of the secret field, e.g. 'r2.secretAccessKey' (required)
 *   label      — display label; falls back to secretPath if absent
 *
 * Root-cause fix: NO nested <form>. The outer Payload document form already wraps
 * the entire admin page — a second <form> is invalid HTML and the browser ignores it,
 * causing clicks on a type="submit" button to submit the outer form instead.
 * Solution: plain <div> container + type="button" with onClick handler.
 */
import React, { useCallback, useEffect, useId, useState } from 'react'
import { useDocumentInfo, useTranslation } from '@payloadcms/ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type Status = 'idle' | 'loading' | 'saving' | 'success' | 'error'

interface SiteSecretFieldProps {
  /** Whitelisted dot-path of the secret leaf, e.g. 'r2.secretAccessKey' */
  secretPath?: string
  /** Human-readable label shown above the input */
  label?: string
}

export const SiteSecretField: React.FC<SiteSecretFieldProps> = ({ secretPath, label }) => {
  const docInfo = useDocumentInfo()
  const { i18n } = useTranslation()
  const isEnglish = i18n.language === 'en'
  const inputId = useId()
  // id may be string | number | null depending on doc state
  const docId = docInfo?.id != null ? String(docInfo.id) : null

  const displayLabel = label ?? secretPath ?? 'Secret'

  const [hasValue, setHasValue] = useState<boolean | null>(null)
  const [status, setStatus] = useState<Status>(docId && secretPath ? 'loading' : 'idle')
  const [message, setMessage] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [prevTarget, setPrevTarget] = useState<string | null>(docId && secretPath ? `${docId}:${secretPath}` : null)

  const targetKey = docId && secretPath ? `${docId}:${secretPath}` : null
  if (targetKey !== prevTarget) {
    setPrevTarget(targetKey)
    if (targetKey) {
      setStatus('loading')
    }
  }

  // Fetch current set/unset status on mount (or when docId becomes available)
  useEffect(() => {
    if (!docId || !secretPath) return
    let cancelled = false
    fetch(`/api/sites/${docId}/secret?field=${encodeURIComponent(secretPath)}`, {
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as { hasValue: boolean }
        if (!cancelled) {
          setHasValue(data.hasValue)
          setStatus('idle')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHasValue(null)
          setStatus('error')
          setMessage(isEnglish ? 'Unable to check credential status.' : 'Không thể kiểm tra trạng thái.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [docId, secretPath, isEnglish])

  // type="button" onClick — no form submit, no e.preventDefault needed
  const handleSave = useCallback(async () => {
    if (!docId || !secretPath) return

    setStatus('saving')
    setMessage(null)

    try {
      const res = await fetch(`/api/sites/${docId}/secret`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: secretPath, value: inputValue }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      setHasValue(inputValue.length > 0)
      setInputValue('')
      setStatus('success')
      setMessage(isEnglish ? 'Credential saved.' : 'Đã lưu thành công.')
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : (isEnglish ? 'Save failed.' : 'Lưu thất bại.'))
    }
  }, [docId, secretPath, inputValue, isEnglish])

  // New document — cannot save until the doc has an id
  if (!docId) {
    return (
      <div className="field-type twp">
        <p className="mb-2 text-sm font-medium">{displayLabel}</p>
        <p className="text-sm text-muted-foreground">
          {isEnglish ? 'Save this document before setting a credential.' : 'Lưu document trước để có thể cài đặt giá trị này.'}
        </p>
      </div>
    )
  }

  const statusBadge = hasValue === null ? null : (
    <Badge variant={hasValue ? 'success' : 'secondary'}>
      {hasValue ? (isEnglish ? 'Configured' : 'Đã cài đặt') : (isEnglish ? 'Not configured' : 'Chưa cài đặt')}
    </Badge>
  )

  return (
    <div className="field-type twp rounded-lg border border-border bg-card p-4" aria-busy={status === 'loading' || status === 'saving'}>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={inputId} className="text-sm font-medium">{displayLabel}</label>
        {status === 'loading'
          ? <span role="status" className="text-xs text-muted-foreground">{isEnglish ? 'Checking…' : 'Đang kiểm tra…'}</span>
          : statusBadge}
      </div>
      <p id={`${inputId}-description`} className="my-2 text-sm text-muted-foreground">
        {isEnglish ? 'Enter a new value to update. Stored credentials are never displayed.' : 'Nhập giá trị mới để cập nhật. Giá trị đã lưu không hiển thị.'}
      </p>

      {/* Plain div — NOT a <form>. Payload's document <form> already wraps this entire page;
          a nested <form> is invalid HTML and causes the browser to route button clicks to
          the outer form instead of this component's handler. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          id={inputId}
          aria-describedby={`${inputId}-description`}
          type="password"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={isEnglish ? 'Enter a new credential…' : 'Nhập giá trị mới…'}
          autoComplete="new-password"
          disabled={status === 'saving'}
          className="harbor-field__control min-w-0 flex-1"
        />
        {/* type="button" prevents any implicit form submission */}
        <Button
          type="button"
          onClick={handleSave}
          disabled={status === 'saving' || inputValue.length === 0}
          variant="outline"
        >
          {status === 'saving' ? (isEnglish ? 'Saving…' : 'Đang lưu…') : (isEnglish ? 'Save credential' : 'Lưu khóa')}
        </Button>
      </div>

      {message && (
        <p role={status === 'error' ? 'alert' : 'status'} className={`mb-0 mt-3 text-sm ${status === 'success' ? 'text-emerald-700 dark:text-emerald-300' : 'text-destructive'}`}>
          {message}
        </p>
      )}
    </div>
  )
}
