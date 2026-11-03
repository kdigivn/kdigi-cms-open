'use client'
/**
 * "Tạo bằng AI" button for SEO fields.
 *
 * Two modes:
 *
 * 1. Write mode (fieldPath provided, previewOnly: false/omitted):
 *    One click → POST /api/seo/ai-generate → writes suggestion into the target
 *    Payload field via useField({ path: fieldPath }).setValue.
 *    Used for: seo.title, seo.description, seo.openGraph.imageAlt.
 *
 * 2. Preview-only mode (previewOnly: true, no fieldPath):
 *    One click → POST /api/seo/ai-generate → shows suggestion in a local panel
 *    with copy-to-clipboard. Does NOT call useField or write to any form path.
 *    Used for: FAQ suggestions (FAQs live in a separate collection — editor
 *    copies accepted Q&A items into the Faqs collection manually).
 *
 * Never auto-overwrites: the suggestion is only applied on an explicit click.
 * Shows loading spinner; degrades gracefully on error (inline message, no crash).
 *
 * API key never leaves server — only /api/seo/ai-generate is called.
 */
import React, { useState, useCallback } from 'react'
import { useField, useFormFields, useTranslation } from '@payloadcms/ui'
import { Sparkles, Loader2, ClipboardCopy } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ─── Types ────────────────────────────────────────────────────────────────────

type SeoAiField = 'title' | 'description' | 'faq' | 'alt'

interface SeoAiGenerateButtonProps {
  /**
   * Payload field path this button writes into (e.g. "seo.title").
   * Required when previewOnly is false/omitted.
   * Must be omitted (or set to '') when previewOnly is true — the FAQ case.
   */
  fieldPath?: string
  /** Which SEO field type to generate */
  fieldType: SeoAiField
  /** Optional button text override */
  label?: string
  /** Optional image description (used only for alt field) */
  imageContext?: string
  /**
   * When true, the suggestion is shown in a read-only preview panel only.
   * No form field is written. Use for FAQ (no backing seo field exists).
   */
  previewOnly?: boolean
}

interface GenerateResponse {
  suggestion: string
  error?: string
}

// ─── Sub-component: write-mode inner button ───────────────────────────────────

/**
 * Inner component that calls useField for write-mode buttons.
 * Isolated so useField is never called with an empty path (FAQ / previewOnly case).
 */
function WriteButton({
  fieldPath,
  fieldType,
  label,
  imageContext,
  fields,
}: {
  fieldPath: string
  fieldType: SeoAiField
  label: string
  imageContext?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fields: any
}) {
  const { i18n } = useTranslation()
  const isEnglish = i18n.language === 'en'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { setValue } = useField<string>({ path: fieldPath })

  const handleGenerate = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const docTitle =
        (fields?.['title']?.value as string) ??
        (fields?.['name']?.value as string) ??
        ''
      if (!docTitle) {
        setError(isEnglish ? 'Enter a document title before generating SEO content.' : 'Cần có tiêu đề bài viết để tạo nội dung SEO.')
        return
      }

      const focusKeywordsRaw = fields?.['seo.focusKeywords']?.value
      const focusKeyword = Array.isArray(focusKeywordsRaw)
        ? (focusKeywordsRaw as string[]).filter(Boolean).join(', ')
        : typeof focusKeywordsRaw === 'string' ? focusKeywordsRaw : ''

      const docContent =
        (fields?.['contentMd']?.value as string) ??
        (fields?.['excerpt']?.value as string) ??
        ''

      const body: Record<string, unknown> = {
        field: fieldType,
        docTitle,
        docContent: docContent.slice(0, 600),
        focusKeyword,
      }
      if (fieldType === 'alt' && imageContext) body.imageContext = imageContext

      const res = await fetch('/api/seo/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })

      if (res.status === 429) {
        setError(isEnglish ? 'AI request limit reached. Try again in one minute.' : 'Đã vượt giới hạn số lần tạo AI. Vui lòng thử lại sau 1 phút.')
        return
      }
      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: string }
        setError(errData.error ?? (isEnglish ? `Error ${res.status} — try again later.` : `Lỗi ${res.status} — thử lại sau.`))
        return
      }

      const data = await res.json() as GenerateResponse
      if (!data.suggestion) {
        setError(isEnglish ? 'AI returned no suggestion. Try again.' : 'AI không trả về kết quả. Vui lòng thử lại.')
        return
      }

      setValue(data.suggestion)
    } catch (err) {
      setError(isEnglish ? 'Unable to reach AI. Check your connection and try again.' : 'Không thể kết nối AI. Kiểm tra mạng và thử lại.')
      console.error('[SeoAiGenerateButton] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [fieldType, imageContext, fields, setValue, isEnglish])

  return (
    <div className="twp mt-2">
      <Button
        type="button"
        onClick={handleGenerate}
        disabled={loading}
        variant="outline"
        size="sm"
        title={isEnglish ? `Generate SEO ${fieldType} from the document title and content` : `Tạo ${fieldType} SEO bằng AI dựa trên tiêu đề và nội dung bài viết`}
      >
        {loading
          ? <Loader2 size={13} className="animate-spin" aria-hidden />
          : <Sparkles size={13} aria-hidden />}
        {loading ? (isEnglish ? 'Generating…' : 'Đang tạo…') : label}
      </Button>
      {error && (
        <div role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}
    </div>
  )
}

// ─── Sub-component: FAQ preview panel ────────────────────────────────────────

/**
 * Renders FAQ items in a read-only preview with a copy-to-clipboard button.
 * No form field is written — editor copies items to the Faqs collection manually.
 */
function FaqPreviewPanel({ raw, onDismiss }: { raw: string; onDismiss: () => void }) {
  const { i18n } = useTranslation()
  const isEnglish = i18n.language === 'en'
  const [copied, setCopied] = useState(false)

  let items: Array<{ question: string; answer: string }> = []
  try {
    items = JSON.parse(raw) as typeof items
  } catch {
    return (
      <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
        {isEnglish ? 'Unable to parse the FAQ suggestion.' : 'Không thể đọc kết quả FAQ.'}
      </div>
    )
  }

  const handleCopy = async () => {
    const text = items.map((it, i) => `${i + 1}. Q: ${it.question}\n   A: ${it.answer}`).join('\n\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API blocked (e.g. non-secure context) — silently ignore
    }
  }

  return (
    <div className="mt-2 rounded border border-border bg-muted/30 p-3 text-xs">
      <div className="mb-1 font-semibold text-foreground">{isEnglish ? 'FAQ suggestions' : 'Gợi ý FAQ'} ({items.length}):</div>
      <div className="mb-2 text-muted-foreground">
        {isEnglish ? 'Copy these suggestions and add them to the FAQs collection.' : 'Sao chép nội dung bên dưới và thêm vào bộ sưu tập FAQs.'}
      </div>
      <ul className="mb-3 space-y-2">
        {items.map((item, i) => (
          <li key={i}>
            <div className="font-medium text-foreground">{item.question}</div>
            <div className="text-muted-foreground">{item.answer}</div>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button
          type="button"
          onClick={handleCopy}
          variant="outline"
          size="sm"
        >
          <ClipboardCopy size={12} aria-hidden />
          {copied ? (isEnglish ? 'Copied!' : 'Đã sao chép!') : (isEnglish ? 'Copy all' : 'Sao chép tất cả')}
        </Button>
        <Button
          type="button"
          onClick={onDismiss}
          variant="outline"
          size="sm"
        >
          {isEnglish ? 'Close' : 'Đóng'}
        </Button>
      </div>
    </div>
  )
}

// ─── Sub-component: preview-only button (FAQ) ─────────────────────────────────

/**
 * Preview-only mode: fetches suggestion and shows FaqPreviewPanel.
 * Does NOT call useField — no form path is needed or written.
 */
function PreviewOnlyButton({
  fieldType,
  label,
  fields,
}: {
  fieldType: SeoAiField
  label: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fields: any
}) {
  const { i18n } = useTranslation()
  const isEnglish = i18n.language === 'en'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const handleGenerate = useCallback(async () => {
    setLoading(true)
    setError(null)
    setPreview(null)

    try {
      const docTitle =
        (fields?.['title']?.value as string) ??
        (fields?.['name']?.value as string) ??
        ''
      if (!docTitle) {
        setError(isEnglish ? 'Enter a document title before generating SEO content.' : 'Cần có tiêu đề bài viết để tạo nội dung SEO.')
        return
      }

      const focusKeywordsRaw = fields?.['seo.focusKeywords']?.value
      const focusKeyword = Array.isArray(focusKeywordsRaw)
        ? (focusKeywordsRaw as string[]).filter(Boolean).join(', ')
        : typeof focusKeywordsRaw === 'string' ? focusKeywordsRaw : ''

      const docContent =
        (fields?.['contentMd']?.value as string) ??
        (fields?.['excerpt']?.value as string) ??
        ''

      const res = await fetch('/api/seo/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          field: fieldType,
          docTitle,
          docContent: docContent.slice(0, 600),
          focusKeyword,
        }),
      })

      if (res.status === 429) {
        setError(isEnglish ? 'AI request limit reached. Try again in one minute.' : 'Đã vượt giới hạn số lần tạo AI. Vui lòng thử lại sau 1 phút.')
        return
      }
      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: string }
        setError(errData.error ?? (isEnglish ? `Error ${res.status} — try again later.` : `Lỗi ${res.status} — thử lại sau.`))
        return
      }

      const data = await res.json() as GenerateResponse
      if (!data.suggestion) {
        setError(isEnglish ? 'AI returned no suggestion. Try again.' : 'AI không trả về kết quả. Vui lòng thử lại.')
        return
      }

      setPreview(data.suggestion)
    } catch (err) {
      setError(isEnglish ? 'Unable to reach AI. Check your connection and try again.' : 'Không thể kết nối AI. Kiểm tra mạng và thử lại.')
      console.error('[SeoAiGenerateButton] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [fieldType, fields, isEnglish])

  return (
    <div className="twp mt-2">
      <Button
        type="button"
        onClick={handleGenerate}
        disabled={loading}
        variant="outline"
        size="sm"
        title={isEnglish ? 'Preview FAQ suggestions, then copy to the FAQs collection' : 'Gợi ý FAQ bằng AI — xem trước, sau đó sao chép vào bộ sưu tập FAQs'}
      >
        {loading
          ? <Loader2 size={13} className="animate-spin" aria-hidden />
          : <Sparkles size={13} aria-hidden />}
        {loading ? (isEnglish ? 'Generating…' : 'Đang tạo…') : label}
      </Button>
      {error && (
        <div role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}
      {preview && (
        <FaqPreviewPanel raw={preview} onDismiss={() => setPreview(null)} />
      )}
    </div>
  )
}

// ─── Main exported component ──────────────────────────────────────────────────

export const SeoAiGenerateButton: React.FC<SeoAiGenerateButtonProps> = ({
  fieldPath,
  fieldType,
  label,
  imageContext,
  previewOnly = false,
}) => {
  const { i18n } = useTranslation()
  const displayLabel = label ?? (i18n.language === 'en' ? 'Generate with AI' : 'Tạo bằng AI')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fields = useFormFields((ctx: any) => ctx[0])

  if (previewOnly) {
    // FAQ mode: no fieldPath, no useField, pure local-state preview
    return (
      <PreviewOnlyButton fieldType={fieldType} label={displayLabel} fields={fields} />
    )
  }

  if (!fieldPath) {
    // Defensive: write-mode requires a fieldPath
    return (
      <div className="mt-1 text-xs text-red-600">
        [SeoAiGenerateButton] fieldPath required in write mode.
      </div>
    )
  }

  return (
    <WriteButton
      fieldPath={fieldPath}
      fieldType={fieldType}
      label={displayLabel}
      imageContext={imageContext}
      fields={fields}
    />
  )
}
