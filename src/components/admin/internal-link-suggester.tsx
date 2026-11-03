'use client'
/**
 * Internal Link Suggester — client-side editor panel.
 *
 * Registered as a Payload UI field (type: 'ui') inside seoFieldGroup.
 * Reads the current doc's focus keyword + title from sibling form fields
 * via useFormFields, then calls GET /api/seo/internal-link-suggest.
 *
 * Design:
 *  - Non-blocking: suggestions load asynchronously after a 600 ms debounce
 *    on keyword/title changes; the editor is never blocked.
 *  - Collapsed by default to avoid visual noise; expands on click.
 *  - Shows top-N suggestions (max 5) with title, collection badge, and a
 *    copy-to-clipboard link button.
 *  - No API key client-side; auth cookie is forwarded automatically by
 *    same-origin fetch.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useFormFields, useDocumentInfo } from '@payloadcms/ui'
import { Link2, ChevronDown, ChevronUp, Loader2, Copy, Check } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LinkSuggestion {
  id: string
  collection: string
  title: string
  slug: string
  score: number
  adminUrl: string
  frontendSlug: string
}

interface SuggestResponse {
  suggestions: LinkSuggestion[]
}

// ─── Collection label map (Vietnamese) ───────────────────────────────────────

const COLLECTION_LABEL: Record<string, string> = {
  posts: 'Bài viết',
  pages: 'Trang',
  products: 'Sản phẩm',
  landings: 'Landing',
}

// ─── Clipboard copy button ────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard not available (non-https dev) — silently ignore
    }
  }, [text])

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Sao chép đường dẫn"
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '2px 4px',
        color: copied ? '#10b981' : '#6b7280',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export const InternalLinkSuggester: React.FC = () => {
  const [expanded, setExpanded] = useState(false)
  const [suggestions, setSuggestions] = useState<LinkSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Read keyword + title from sibling fields (read-only subscribers)
  const focusKeywordsField = useFormFields(([fields]) => fields['seo.focusKeywords'])
  const titleField = useFormFields(([fields]) => fields['title'])

  const focusKeyword = Array.isArray(focusKeywordsField?.value)
    ? (focusKeywordsField.value as string[])[0] ?? ''
    : typeof focusKeywordsField?.value === 'string'
    ? focusKeywordsField.value
    : ''

  const docTitle = typeof titleField?.value === 'string' ? titleField.value : ''

  // Get current doc info for exclusion from results
  const { id: docId, collectionSlug } = useDocumentInfo()

  const fetchSuggestions = useCallback(async () => {
    const queryText = focusKeyword || docTitle
    if (!queryText.trim() || !docId || !collectionSlug) {
      setSuggestions([])
      return
    }

    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        docId: String(docId),
        collection: collectionSlug,
        keyword: focusKeyword,
        title: docTitle,
        limit: '5',
      })
      const res = await fetch(`/api/seo/internal-link-suggest?${params}`)
      if (!res.ok) {
        setError('Không thể tải gợi ý liên kết nội bộ.')
        setSuggestions([])
        return
      }
      const data = (await res.json()) as SuggestResponse
      setSuggestions(data.suggestions ?? [])
    } catch {
      setError('Lỗi kết nối khi tải gợi ý liên kết.')
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }, [focusKeyword, docTitle, docId, collectionSlug])

  // Debounce: refetch whenever keyword or title changes (600 ms delay)
  useEffect(() => {
    if (!expanded) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(fetchSuggestions, 600)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [expanded, fetchSuggestions])

  // Fetch immediately when panel is expanded
  const handleToggle = useCallback(() => {
    setExpanded(prev => {
      if (!prev) {
        // Opening — schedule fetch immediately
        setTimeout(fetchSuggestions, 0)
      }
      return !prev
    })
  }, [fetchSuggestions])

  return (
    <div
      style={{
        marginTop: 12,
        marginBottom: 4,
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: 6,
        overflow: 'hidden',
        fontFamily: 'inherit',
      }}
    >
      {/* Toggle header */}
      <button
        type="button"
        onClick={handleToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 12px',
          background: 'var(--theme-elevation-50)',
          border: 'none',
          borderBottom: expanded ? '1px solid var(--theme-elevation-150)' : 'none',
          cursor: 'pointer',
          textAlign: 'left',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--theme-text)',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}
      >
        <Link2 size={13} />
        Gợi ý liên kết nội bộ
        {loading && <Loader2 size={13} style={{ marginLeft: 'auto', animation: 'spin 1s linear infinite' }} />}
        {!loading && (expanded ? <ChevronUp size={13} style={{ marginLeft: 'auto' }} /> : <ChevronDown size={13} style={{ marginLeft: 'auto' }} />)}
      </button>

      {/* Suggestion list */}
      {expanded && (
        <div style={{ padding: '8px 12px' }}>
          {error && (
            <p style={{ margin: 0, fontSize: 12, color: '#ef4444' }}>{error}</p>
          )}

          {!loading && !error && suggestions.length === 0 && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--theme-elevation-500)' }}>
              {(focusKeyword || docTitle).trim()
                ? 'Không tìm thấy gợi ý liên kết phù hợp.'
                : 'Nhập focus keyword hoặc tiêu đề để nhận gợi ý liên kết.'}
            </p>
          )}

          {suggestions.map(s => (
            <div
              key={`${s.collection}-${s.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 0',
                borderBottom: '1px solid var(--theme-elevation-100)',
                fontSize: 12,
              }}
            >
              {/* Collection badge */}
              <span
                style={{
                  flexShrink: 0,
                  background: 'var(--theme-elevation-100)',
                  borderRadius: 3,
                  padding: '1px 5px',
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--theme-elevation-600)',
                  whiteSpace: 'nowrap',
                }}
              >
                {COLLECTION_LABEL[s.collection] ?? s.collection}
              </span>

              {/* Title link (opens admin edit page) */}
              <a
                href={s.adminUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: 'var(--theme-text)',
                  textDecoration: 'none',
                }}
                title={s.title}
              >
                {s.title || '(no title)'}
              </a>

              {/* Copy frontend slug */}
              <CopyButton text={s.frontendSlug} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
