'use client'
/**
 * RankMath-style SEO analysis panel — bespoke `type:'ui'` field.
 * Reads sibling form fields in real-time; score is client-side only (never persisted).
 * Registered at the end of seoFieldGroup() as { name:'seoAnalysis', type:'ui' }.
 *
 * The SERP + social previews intentionally mimic Google / social-card brand
 * colors and are deliberately NOT themed to the admin palette.
 *
 * Placeholder hints: seo.title / seo.description / OG title / OG description are
 * stored EMPTY when the editor leaves them blank (the apply-seo-templates hook
 * resolves the actual value at render-time in the frontend). To help editors
 * understand what will render, this panel shows a "mặc định: …" hint beneath
 * each relevant field — computed client-side from the live doc fields + the site's
 * seoTitles templates (fetched once per tenant via /api/sites/{tenantId}?depth=0).
 * Using a true input placeholder is not feasible for Payload's localized fields
 * (they render their own <input>), so the hint-below approach is used instead.
 *
 * SERP preview (per research report):
 *   - Title truncated at 60 chars (≈512px desktop / 600px mobile safe limit)
 *   - Description: 158 chars desktop / 120 chars mobile, whole-word + ellipsis
 *   - URL: `{domain} › {humanized slug segments}` (Google breadcrumb style)
 *   - Domain: fetched from active Site; falls back to window.location.hostname
 */
import React, { useMemo, useState, useEffect } from 'react'
import { useFormFields, useDocumentInfo, useTranslation } from '@payloadcms/ui'
import { CheckCircle2, AlertTriangle, XCircle, Search, Monitor, Smartphone } from 'lucide-react'
import { computeSeoScore } from '../../lib/seo-score'
import type { SeoCheck } from '../../lib/seo-score'
import { Card, CardContent } from '@/components/ui/card'
import { resolveSeoTemplate } from '../../lib/seo/resolve-variables'

const STATUS_META: Record<string, { icon: React.ReactNode; cls: string }> = {
  good: { icon: <CheckCircle2 className="size-4" />, cls: 'text-emerald-600 dark:text-emerald-400' },
  warn: { icon: <AlertTriangle className="size-4" />, cls: 'text-amber-600 dark:text-amber-400' },
  fail: { icon: <XCircle className="size-4" />, cls: 'text-red-600 dark:text-red-400' },
}

const ENGLISH_RULE_LABELS: Record<string, string> = {
  'kw-set': 'Focus keyword configured',
  'kw-title': 'Focus keyword in title',
  'kw-desc': 'Focus keyword in description',
  'kw-slug': 'Focus keyword in URL',
  'kw-intro': 'Focus keyword in introduction',
  'kw-density': 'Keyword density (target 1–1.5%)',
  'title-len': 'Title length (target 40–60 characters)',
  'desc-len': 'Description length (target 100–160 characters)',
  'content-len': 'Content length (target at least 700 syllables)',
  'content-len-ideal': 'Ideal content length (target 1400 syllables)',
  headings: 'Subheadings H2/H3',
  'img-alt': 'Image alternative text',
  'internal-link': 'Internal links',
  'url-len': 'URL length (target at most 75 characters)',
}

function scoreTone(score: number): { label: string; ring: string; text: string } {
  if (score >= 70) return { label: 'Tốt', ring: 'border-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' }
  if (score >= 40) return { label: 'Cần cải thiện', ring: 'border-amber-500', text: 'text-amber-600 dark:text-amber-400' }
  return { label: 'Kém', ring: 'border-red-500', text: 'text-red-600 dark:text-red-400' }
}

function ScoreGauge({ score }: { score: number }) {
  const { i18n } = useTranslation()
  const isEnglish = i18n.language === 'en'
  const tone = scoreTone(score)
  return (
    <div className="mb-4 flex items-center gap-4">
      <div className={`flex size-16 shrink-0 flex-col items-center justify-center rounded-full border-4 ${tone.ring}`}>
        <span className={`text-xl font-bold tabular-nums ${tone.text}`}>{score}</span>
      </div>
      <div>
        <div className={`text-[15px] font-semibold ${tone.text}`}>SEO {isEnglish ? (score >= 70 ? 'Good' : score >= 40 ? 'Needs improvement' : 'Poor') : tone.label}</div>
        <div className="text-xs text-muted-foreground">{isEnglish ? 'Score /100 (live)' : 'Điểm /100 (runtime)'}</div>
      </div>
    </div>
  )
}

function CheckItem({ check }: { check: SeoCheck }) {
  const { i18n } = useTranslation()
  const isEnglish = i18n.language === 'en'
  const status = check.status === 'good' ? (isEnglish ? 'Good' : 'Tốt') : check.status === 'warn' ? (isEnglish ? 'Needs attention' : 'Cần chú ý') : (isEnglish ? 'Missing or invalid' : 'Thiếu hoặc chưa hợp lệ')
  const meta = STATUS_META[check.status] ?? STATUS_META.warn
  return (
    <div className="flex items-start gap-2 py-1 text-[13px]">
      <span className={`mt-px shrink-0 ${meta.cls}`} aria-label={status}>{meta.icon}</span>
      <span className="text-foreground">{isEnglish ? ENGLISH_RULE_LABELS[check.id] ?? check.label : check.label}<span className="sr-only"> — {status}</span></span>
    </div>
  )
}

/** Small grey hint shown below an empty SEO field to show what the default value will be. */
function DefaultHint({ value }: { value: string }) {
  const { i18n } = useTranslation()
  if (!value) return null
  return (
    <div className="mt-1 text-xs text-muted-foreground">
      <span className="font-medium">{i18n.language === 'en' ? 'Default:' : 'Mặc định:'}</span>{' '}
      <span className="italic">{value.length > 100 ? value.slice(0, 100) + '…' : value}</span>
    </div>
  )
}

// ─── Truncation helpers ────────────────────────────────────────────────────────

/**
 * Truncate at whole-word boundary to stay within the char limit.
 * If already within limit, returns as-is. Otherwise clips at the last space
 * before the limit and appends '…'.
 */
function truncateAtWordBoundary(text: string, limit: number): string {
  if (text.length <= limit) return text
  const clipped = text.slice(0, limit)
  const lastSpace = clipped.lastIndexOf(' ')
  return (lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped) + '…'
}

// ─── URL / breadcrumb display ──────────────────────────────────────────────────

/**
 * Build the Google-style breadcrumb URL display:
 *   domain › Segment One › Segment Two
 *
 * Humanizes each slug segment: replace hyphens with spaces, title-case.
 * Example: "product/web-design-pro" → "Product › Web Design Pro"
 */
function humanizeSlugSegment(segment: string): string {
  return segment
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function buildSerpUrl(domain: string, slug: string): string {
  const cleanSlug = slug.replace(/^\//, '').replace(/\/$/, '')
  if (!cleanSlug) return domain
  const segments = cleanSlug.split('/').filter(Boolean).map(humanizeSlugSegment)
  return `${domain} › ${segments.join(' › ')}`
}

// ─── Site config fetch ────────────────────────────────────────────────────────

interface SiteConfig {
  domain: string | null
  seoTitles?: {
    separator?: string | null
    posts?: { titleTemplate?: string | null; descriptionTemplate?: string | null }
    pages?: { titleTemplate?: string | null; descriptionTemplate?: string | null }
    products?: { titleTemplate?: string | null; descriptionTemplate?: string | null }
    landings?: { titleTemplate?: string | null; descriptionTemplate?: string | null }
    taxonomies?: { titleTemplate?: string | null; descriptionTemplate?: string | null }
    homepage?: { titleTemplate?: string | null; descriptionTemplate?: string | null }
  }
  /** Resolved site name from knowledgeGraph.name or manifest.name or domain. */
  siteName?: string
  /** Per-tenant default og:image URL (Sites.seoDefaults.ogImage) — final thumbnail fallback. */
  defaultOgImageUrl?: string | null
}

/** Collection slug → seoTitles subgroup key. */
const COLLECTION_TO_SUBGROUP: Record<string, keyof NonNullable<SiteConfig['seoTitles']>> = {
  posts: 'posts',
  pages: 'pages',
  products: 'products',
  landings: 'landings',
  taxonomies: 'taxonomies',
}

/** Read the tenant selector cookie (same pattern as slug-prefix-field). */
function readTenantCookie(): string | undefined {
  if (typeof document === 'undefined') return undefined
  const match = document.cookie.match(/(?:^|;\s*)payload-tenant=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : undefined
}

type SerpMode = 'desktop' | 'mobile'

// ─── SERP Preview ──────────────────────────────────────────────────────────────

function SerpPreview({
  title,
  description,
  slug,
  mode,
  domain,
}: {
  title: string
  description: string
  slug: string
  mode: SerpMode
  domain: string
}) {
  const { i18n } = useTranslation()
  const isEnglish = i18n.language === 'en'
  // Title limit: 60 chars (≈512-600px, safe for both desktop/mobile per research)
  const TITLE_LIMIT = 60
  // Description limit: 158 chars desktop / 120 chars mobile (per Screaming Frog / Spotibo 2024)
  const DESC_LIMIT = mode === 'desktop' ? 158 : 120

  const displayTitle = truncateAtWordBoundary(title || (isEnglish ? 'Page title' : 'Tiêu đề trang'), TITLE_LIMIT)
  const displayDesc = truncateAtWordBoundary(description || (isEnglish ? 'The page description will appear here…' : 'Mô tả trang sẽ hiển thị ở đây…'), DESC_LIMIT)
  const displayUrl = buildSerpUrl(domain, slug)

  const isDesktop = mode === 'desktop'
  // Intentional Google-SERP brand colors — not admin-themed.
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e0e0e0',
        borderRadius: 8,
        padding: '14px 16px',
        maxWidth: isDesktop ? 600 : 360,
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <div style={{ fontSize: 12, color: '#202124', marginBottom: 2 }}>{displayUrl}</div>
      <div style={{ fontSize: isDesktop ? 20 : 18, color: '#1a0dab', marginBottom: 4, lineHeight: 1.3 }}>
        {displayTitle}
      </div>
      <div style={{ fontSize: 14, color: '#4d5156', lineHeight: 1.5 }}>{displayDesc}</div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export const SeoAnalysisField: React.FC = () => {
  const { i18n } = useTranslation()
  const isEnglish = i18n.language === 'en'
  const [serpMode, setSerpMode] = useState<SerpMode>('desktop')
  const [showSocial, setShowSocial] = useState(false)
  const [siteConfig, setSiteConfig] = useState<SiteConfig | null>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fields = useFormFields((ctx: any) => ctx[0])
  const { collectionSlug } = useDocumentInfo()

  const title = (fields?.['seo.title']?.value as string) ?? ''
  const description = (fields?.['seo.description']?.value as string) ?? ''
  const slug = (fields?.['slug']?.value as string) ?? ''
  const docTitle = (fields?.['title']?.value as string) ?? ''
  const docExcerpt = (fields?.['excerpt']?.value as string) ?? ''
  const focusKeywordsRaw = fields?.['seo.focusKeywords']?.value
  const contentMd = (fields?.['contentMd']?.value as string) ?? ''
  // Extra vars for template resolution (RankMath parity): %term% %focuskw% %date% %modified% %price%.
  const docNameRaw = (fields?.['name']?.value as string) ?? '' // taxonomy term name (field is `name`)
  const publishedAtRaw =
    (fields?.['publishedAt']?.value as string) ?? (fields?.['date']?.value as string) ?? ''
  const updatedAtRaw = (fields?.['updatedAt']?.value as string) ?? ''
  const pricesRaw = fields?.['prices']?.value
  const featuredImageRaw = fields?.['featuredImage']?.value

  // ── Tenant id resolution (same pattern as slug-prefix-field) ──────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantFieldRaw = useFormFields((ctx: any) => ctx[0]?.['tenant']?.value)
  const rawTenant = tenantFieldRaw && typeof tenantFieldRaw === 'object'
    ? (tenantFieldRaw as { id?: unknown }).id
    : tenantFieldRaw
  const tenantIdFromField = rawTenant != null && rawTenant !== '' ? String(rawTenant) : undefined
  const tenantId = tenantIdFromField ?? readTenantCookie()

  // ── Fetch site config once per tenantId ────────────────────────────────────
  useEffect(() => {
    if (!tenantId) return
    let cancelled = false
    // depth=1 populates seoDefaults.ogImage into a media object so we can read its url.
    fetch(`/api/sites/${tenantId}?depth=1`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((doc) => {
        if (cancelled || !doc) return
        // Resolve site name: knowledgeGraph.name > manifest.name > domain
        const kgName = typeof doc.knowledgeGraph?.name === 'string' ? doc.knowledgeGraph.name : null
        const manifestName = typeof doc.manifest?.name === 'string' ? doc.manifest.name : null
        const domain = typeof doc.domain === 'string' ? doc.domain : null
        const ogDefault = doc.seoDefaults?.ogImage
        const defaultOgImageUrl =
          ogDefault && typeof ogDefault === 'object'
            ? ((ogDefault.url as string) ?? null)
            : null
        setSiteConfig({
          domain,
          seoTitles: doc.seoTitles ?? undefined,
          siteName: kgName || manifestName || domain || undefined,
          defaultOgImageUrl,
        })
      })
      .catch(() => {
        if (!cancelled) setSiteConfig(null)
      })
    return () => {
      cancelled = true
    }
  }, [tenantId])

  // ── Effective display domain ───────────────────────────────────────────────
  // Falls back to window.location.hostname if site config not yet loaded.
  const siteDomain = siteConfig?.domain
    ?? (typeof window !== 'undefined' ? window.location.hostname : 'yoursite.com')

  // ── Template resolution for placeholder hints ──────────────────────────────
  const rawExcerptText = docExcerpt.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

  // Shared %variable% context — mirrors the frontend buildSeoCtx so the preview
  // matches what actually renders. %category% / %pt_single% / %pt_plural% are left
  // blank: they need relationship resolution not available in admin form state, and
  // resolveSeoTemplate strips unknown/blank vars (plus dangling separators) cleanly.
  const templateVars = useMemo(() => {
    const firstPrice =
      Array.isArray(pricesRaw) && pricesRaw[0] && typeof pricesRaw[0] === 'object'
        ? (pricesRaw[0] as Record<string, unknown>).currentPrice
        : undefined
    return {
      title: docTitle || docNameRaw,
      siteName: siteConfig?.siteName || siteDomain,
      sep: siteConfig?.seoTitles?.separator || '|',
      excerpt: rawExcerptText,
      term: docNameRaw || docTitle, // taxonomy term name
      // %focuskw% / %category% / %pt_single% / %pt_plural% intentionally left blank:
      // the frontend render path (buildSeoCtx) does not resolve them either, so the
      // preview stays truthful to what actually renders.
      date: publishedAtRaw ? publishedAtRaw.slice(0, 10) : '',
      modified: updatedAtRaw ? updatedAtRaw.slice(0, 10) : '',
      price: firstPrice != null ? String(firstPrice) : '',
      currentYear: String(new Date().getFullYear()),
    }
  }, [
    docTitle,
    docNameRaw,
    siteConfig,
    siteDomain,
    rawExcerptText,
    publishedAtRaw,
    updatedAtRaw,
    pricesRaw,
  ])

  // Resolve title template from site seoTitles (if loaded), else use hardcoded default.
  const resolvedDefaultTitle = useMemo((): string => {
    const subgroupKey = collectionSlug && COLLECTION_TO_SUBGROUP[collectionSlug]
    const subgroup = subgroupKey && siteConfig?.seoTitles ? siteConfig.seoTitles[subgroupKey] : null
    const template =
      (subgroup as { titleTemplate?: string | null } | null)?.titleTemplate ||
      '%title% %sep% %sitename%'
    if (!templateVars.title) return ''
    return resolveSeoTemplate(template, templateVars)
  }, [templateVars, siteConfig, collectionSlug])

  // Resolve description template from site seoTitles, else fall back to excerpt.
  const resolvedDefaultDescription = useMemo((): string => {
    const subgroupKey = collectionSlug && COLLECTION_TO_SUBGROUP[collectionSlug]
    const subgroup = subgroupKey && siteConfig?.seoTitles ? siteConfig.seoTitles[subgroupKey] : null
    const template = (subgroup as { descriptionTemplate?: string | null } | null)?.descriptionTemplate
    if (template) return resolveSeoTemplate(template, templateVars)
    // No template → fall back to plain excerpt text
    return rawExcerptText
  }, [templateVars, rawExcerptText, siteConfig, collectionSlug])

  // ── SERP-displayed title/description ──────────────────────────────────────
  // When fields are blank (empty string stored), use resolved defaults for preview.
  const serpTitle = title || resolvedDefaultTitle
  const serpDescription = description || resolvedDefaultDescription

  // ── OG fields — fall back to resolved serp title/desc when blank ──────────
  const rawOgTitle = (fields?.['seo.openGraph.title']?.value as string) ?? ''
  const rawOgDesc = (fields?.['seo.openGraph.description']?.value as string) ?? ''
  const ogTitle = rawOgTitle || serpTitle
  const ogDesc = rawOgDesc || serpDescription
  // OG image thumbnail — resolved fallback chain, mirroring the backend afterRead:
  // seo.openGraph.image → featuredImage → Sites.seoDefaults.ogImage. Each form value
  // may be a populated media object (has .url) or a bare id (fetch /api/media/{id}).
  const ogImageRaw = fields?.['seo.openGraph.image']?.value
  const [ogImageUrl, setOgImageUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    const directUrl = (v: unknown): string | null =>
      v && typeof v === 'object' ? (((v as Record<string, unknown>).url as string) ?? null) : null
    const mediaId = (v: unknown): string | number | null =>
      typeof v === 'number' || (typeof v === 'string' && v !== '') ? v : null

    const resolve = async () => {
      for (const raw of [ogImageRaw, featuredImageRaw]) {
        const url = directUrl(raw)
        if (url) {
          if (!cancelled) setOgImageUrl(url)
          return
        }
        const id = mediaId(raw)
        if (id != null) {
          const media = await fetch(`/api/media/${id}?depth=0`, { credentials: 'include' })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
          if (media?.url) {
            if (!cancelled) setOgImageUrl(media.url as string)
            return
          }
        }
      }
      if (!cancelled) setOgImageUrl(siteConfig?.defaultOgImageUrl ?? null)
    }
    resolve()
    return () => {
      cancelled = true
    }
  }, [ogImageRaw, featuredImageRaw, siteConfig?.defaultOgImageUrl])
  // Twitter fields (useFacebookData toggle)
  const useFacebookData = (fields?.['seo.openGraph.twitterMeta.useFacebookData']?.value as boolean) !== false
  const rawTwTitle = (fields?.['seo.openGraph.twitterMeta.title']?.value as string) ?? ''
  const rawTwDesc = (fields?.['seo.openGraph.twitterMeta.description']?.value as string) ?? ''
  // Effective twitter values — when useFacebookData, twitter mirrors OG
  const twTitle = useFacebookData ? ogTitle : (rawTwTitle || ogTitle)
  const twDesc = useFacebookData ? ogDesc : (rawTwDesc || ogDesc)

  const result = useMemo(() => {
    const focusKeywords: string[] = Array.isArray(focusKeywordsRaw)
      ? focusKeywordsRaw.filter(Boolean)
      : focusKeywordsRaw
        ? [String(focusKeywordsRaw)]
        : []
    return computeSeoScore({ title, description, slug, focusKeywords, contentMd })
  }, [title, description, slug, focusKeywordsRaw, contentMd])

  const titleLen = title.length
  const descLen = description.length
  // Title good range: 40–60 chars (aligned to 60-char Google safe limit per research)
  const titleOk = titleLen >= 40 && titleLen <= 60
  // Desc good range: 100–158 chars desktop (research: 158 chars safe)
  const descOk = descLen >= 100 && descLen <= 158
  const ogTitleLen = ogTitle.length
  const ogDescLen = ogDesc.length
  const twTitleLen = twTitle.length
  const twDescLen = twDesc.length
  const ogTitleOk = ogTitleLen >= 40 && ogTitleLen <= 95
  const ogDescOk = ogDescLen >= 100 && ogDescLen <= 200
  const twTitleOk = twTitleLen >= 40 && twTitleLen <= 70
  const twDescOk = twDescLen >= 100 && twDescLen <= 200

  return (
    <div className="twp mt-2">
      <Card>
        <CardContent className="p-5">
          <h4 className="mb-4 flex items-center gap-2 text-sm font-bold text-foreground">
            <Search aria-hidden="true" className="size-4 text-primary" /> {isEnglish ? 'SEO analysis' : 'Phân tích SEO'}
          </h4>

          <ScoreGauge score={result.score} />

          {/* Placeholder hints — shown when the field is empty to preview what will render */}
          {!title && resolvedDefaultTitle && (
            <DefaultHint value={resolvedDefaultTitle} />
          )}
          {!description && resolvedDefaultDescription && (
            <DefaultHint value={resolvedDefaultDescription} />
          )}

          {/* Character counters — SEO title/desc + OG + Twitter */}
          <div className="mb-4 mt-2 space-y-1 text-xs">
            <div className="flex flex-wrap gap-4">
              <span className={titleOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                {isEnglish ? 'SEO title' : 'Tiêu đề SEO'}: {titleLen}/60
              </span>
              <span className={descOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                {isEnglish ? 'SEO description' : 'Mô tả SEO'}: {descLen}/158
              </span>
            </div>
            <div className="flex flex-wrap gap-4 text-muted-foreground">
              <span className={ogTitleOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                OG title: {ogTitleLen}/95
              </span>
              <span className={ogDescOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                OG desc: {ogDescLen}/200
              </span>
              <span className={twTitleOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                TW title: {twTitleLen}/70
              </span>
              <span className={twDescOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                TW desc: {twDescLen}/200
              </span>
            </div>
          </div>

          {/* Checklist */}
          <div className="mb-5">
            {result.checks.map(c => (
              <CheckItem key={c.id} check={c} />
            ))}
          </div>

          {/* SERP Preview */}
          <div className="mb-4">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-[13px] font-semibold text-foreground">{isEnglish ? 'Search preview' : 'Xem trước kết quả tìm kiếm'}</span>
              <div className="inline-flex rounded-md border border-border p-0.5">
                {(['desktop', 'mobile'] as SerpMode[]).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSerpMode(m)}
                    aria-pressed={serpMode === m}
                    className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                      serpMode === m
                        ? 'bg-secondary text-secondary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {m === 'desktop' ? <Monitor className="size-3.5" /> : <Smartphone className="size-3.5" />}
                    {m === 'desktop' ? (isEnglish ? 'Desktop' : 'Máy tính') : (isEnglish ? 'Mobile' : 'Di động')}
                  </button>
                ))}
              </div>
            </div>
            {/* serpTitle/serpDescription resolve from live fields; blank → resolved default template */}
            <SerpPreview
              title={serpTitle}
              description={serpDescription}
              slug={slug}
              mode={serpMode}
              domain={siteDomain}
            />
          </div>

          {/* Social Preview toggle */}
          <button
            type="button"
            onClick={() => setShowSocial(v => !v)}
            aria-expanded={showSocial}
            className="cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {showSocial ? (isEnglish ? 'Hide' : 'Ẩn') : (isEnglish ? 'Show' : 'Xem')} Open Graph / Social preview
          </button>
          {showSocial && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* OG Preview — Facebook/LinkedIn style card */}
              {/* Intentional social-card brand colors — not admin-themed. */}
              <div>
                <div className="mb-1 text-xs text-muted-foreground">Open Graph (Facebook / LinkedIn)</div>
                <div style={{ background: '#f3f4f6', borderRadius: 8, overflow: 'hidden', maxWidth: 480, border: '1px solid #e5e7eb' }}>
                  {ogImageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={ogImageUrl}
                      alt="OG thumbnail"
                      style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }}
                    />
                  )}
                  {!ogImageUrl && (
                    <div style={{ height: 80, background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 12, color: '#546964' }}>{isEnglish ? 'No Open Graph image' : 'Chưa có ảnh OG'}</span>
                    </div>
                  )}
                  <div style={{ padding: '12px 16px' }}>
                    <div style={{ fontSize: 12, color: '#546964', textTransform: 'uppercase', marginBottom: 4 }}>{siteDomain}</div>
                    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, color: '#111827' }}>{ogTitle || (isEnglish ? '(Open Graph title)' : '(Tiêu đề OG)')}</div>
                    <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.4 }}>{ogDesc || (isEnglish ? '(Open Graph description)' : '(Mô tả OG)')}</div>
                  </div>
                </div>
              </div>
              {/* Twitter/X preview */}
              <div>
                <div className="mb-1 text-xs text-muted-foreground">
                  Twitter/X {useFacebookData ? (isEnglish ? '(uses Open Graph data)' : '(dùng dữ liệu OG)') : ''}
                </div>
                <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', maxWidth: 480, border: '1px solid #cfd9de' }}>
                  {ogImageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={ogImageUrl}
                      alt="Twitter card thumbnail"
                      style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }}
                    />
                  )}
                  <div style={{ padding: '12px 16px' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2, color: '#0f1419' }}>{twTitle || (isEnglish ? '(Twitter title)' : '(Tiêu đề Twitter)')}</div>
                    <div style={{ fontSize: 13, color: '#536471', lineHeight: 1.4 }}>{twDesc || (isEnglish ? '(Twitter description)' : '(Mô tả Twitter)')}</div>
                    <div style={{ fontSize: 13, color: '#536471', marginTop: 4 }}>{siteDomain}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
