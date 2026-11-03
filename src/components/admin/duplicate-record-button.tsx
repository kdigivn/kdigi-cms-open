'use client'
/**
 * "Nhân bản" button for Posts / Pages / Products edit view.
 *
 * Fetches the saved doc at depth=0 with locale=all (safer than reading form state
 * via getData(), and preserves every locale of localized fields), strips
 * ownership/derived fields so Payload hooks re-assign them server-side, then POSTs
 * a draft copy with a unique slug suffix.
 *
 * Slug collision: retries up to 5 times with "-copy", "-copy-2", … "-copy-5".
 * All error paths surface an alert — no silent failures.
 *
 * Uses relative URLs (/api/…) — admin is always on the same origin as the API.
 */
import React, { useState } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { Copy } from 'lucide-react'

/**
 * Append a suffix to a title value that may be a plain string or a localized
 * object ({ vi, en, … }). For localized objects, each present locale string gets
 * the suffix; non-string values pass through untouched.
 */
function appendToTitle(value: unknown, suffix: string): unknown {
  if (typeof value === 'string') return `${value}${suffix}`
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [locale, localized] of Object.entries(value as Record<string, unknown>)) {
      out[locale] = typeof localized === 'string' ? `${localized}${suffix}` : localized
    }
    return out
  }
  return value
}

export const DuplicateRecordButton: React.FC = () => {
  const { id, collectionSlug } = useDocumentInfo()
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleDuplicate = async () => {
    if (!id || !collectionSlug) return
    setLoading(true)
    try {
      // Fetch the saved document at depth=0, locale=all to avoid reading unsaved
      // form state and to carry every locale of localized fields into the copy
      const getRes = await fetch(`/api/${collectionSlug}/${id}?depth=0&locale=all`, {
        credentials: 'include',
      })
      if (!getRes.ok) {
        alert('Không thể đọc dữ liệu bài viết.')
        return
      }
      const data = await getRes.json()

      // Strip ownership, derived, and system-managed fields.
      // tenant + createdBy intentionally omitted — Payload hooks re-assign on create.
      // commentCount/kkStarRating are derived counters that must start at zero.
      const {
        id: _id,
        publishedAt: _pub,
        isNotified: _n,
        tenant: _t,
        createdBy: _c,
        commentCount: _cc,
        kkStarRating: _k,
        updatedAt: _ua,
        createdAt: _ca,
        ...rest
      } = data

      const baseSlug = (rest.slug as string) ?? ''

      // Retry with count-based suffix to survive slug unique-index collisions
      for (let attempt = 1; attempt <= 5; attempt++) {
        const suffix = attempt === 1 ? '-copy' : `-copy-${attempt}`
        const payload = {
          ...rest,
          status: 'draft',
          slug: `${baseSlug}${suffix}`,
          // Suffix every locale of the (possibly localized) title
          title: appendToTitle(rest.title, ' (Bản sao)'),
          publishedAt: null,
        }

        // POST with locale=all so the localized objects in the body are written
        // to all locales rather than collapsed into the default locale
        const res = await fetch(`/api/${collectionSlug}?locale=all`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        })

        // 409 = unique constraint (slug collision) — try next suffix
        if (res.status === 409 && attempt < 5) continue

        if (!res.ok) {
          const e = await res.json().catch(() => ({}))
          alert((e as { errors?: { message: string }[] })?.errors?.[0]?.message ?? 'Nhân bản thất bại')
          return
        }

        const { doc } = (await res.json()) as { doc?: { id: string } }
        if (!doc?.id) {
          alert('Nhân bản thất bại: không nhận được ID bản mới.')
          return
        }
        router.push(`/admin/collections/${collectionSlug}/${doc.id}`)
        return
      }

      alert('Nhân bản thất bại: không thể tạo slug duy nhất sau 5 lần thử.')
    } finally {
      setLoading(false)
    }
  }

  // Only render when editing an existing record — not on the "create new" form
  if (!id) return null

  return (
    <button
      onClick={handleDuplicate}
      disabled={loading}
      className="btn btn--style-secondary btn--size-small"
      type="button"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
    >
      <Copy size={14} aria-hidden />
      {loading ? 'Đang nhân bản...' : 'Nhân bản'}
    </button>
  )
}
