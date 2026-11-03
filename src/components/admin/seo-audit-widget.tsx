import React from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { runSeoAudit, type SeoAuditResult } from '@/lib/seo-audit-core'
import type { BasePayload } from 'payload'

const MAX_DISPLAY = 15

const REASON_LABELS: Record<string, { vi: string; en: string }> = {
  'missing-title': { vi: 'Thiếu tiêu đề SEO', en: 'Missing SEO title' },
  'missing-desc': { vi: 'Thiếu meta description', en: 'Missing meta description' },
  noindex: { vi: 'Đang noindex', en: 'Noindex enabled' },
  'broken-canonical': { vi: 'Canonical không hợp lệ', en: 'Invalid canonical URL' },
}

interface SeoAuditWidgetProps {
  isEnglish: boolean
  payload: BasePayload
  siteContext: 'selected' | 'all-sites' | 'no-site'
  tenantId?: string
}

export const SeoAuditWidget: React.FC<SeoAuditWidgetProps> = async ({
  isEnglish,
  payload,
  siteContext,
  tenantId,
}) => {
  let data: SeoAuditResult | undefined
  let failed = false

  if (siteContext === 'selected' && tenantId) {
    try {
      // The caller supplies only a tenant validated against the authenticated user.
      data = await runSeoAudit(payload, tenantId, 50)
    } catch {
      failed = true
    }
  }

  return (
    <Card className="min-w-0">
      <CardHeader className="border-b border-border px-4 py-4 sm:px-6">
        <h2 className="m-0 text-base font-semibold text-foreground">
          {isEnglish ? 'SEO health' : 'Kiểm tra SEO'}
        </h2>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        {siteContext === 'all-sites' ? (
          <p className="m-0 text-sm text-muted-foreground">
            {isEnglish ? 'Select a website to view its SEO audit.' : 'Chọn website để xem kết quả kiểm tra SEO.'}
          </p>
        ) : siteContext === 'no-site' ? (
          <p className="m-0 text-sm text-muted-foreground">
            {isEnglish ? 'No website is available to audit for this account.' : 'Tài khoản này chưa có website để kiểm tra.'}
          </p>
        ) : failed || !data ? (
          <div role="status" className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
            {isEnglish ? 'The SEO audit could not be loaded. Try again later.' : 'Không thể tải dữ liệu kiểm tra SEO. Vui lòng thử lại sau.'}
          </div>
        ) : data.total === 0 ? (
          <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 aria-hidden="true" className="size-4" />
            {isEnglish ? 'All audited documents meet SEO requirements.' : 'Tất cả tài liệu đã kiểm tra đều đạt yêu cầu SEO.'}
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="destructive">{data.total}</Badge>
              <span>{isEnglish ? 'documents need SEO improvements' : 'tài liệu cần cải thiện SEO'}</span>
              {data.total > MAX_DISPLAY && (
                <span className="text-xs">({isEnglish ? 'showing' : 'hiển thị'} {MAX_DISPLAY}/{data.total})</span>
              )}
            </div>
            <div role="region" aria-label={isEnglish ? 'SEO findings' : 'Kết quả kiểm tra SEO'} tabIndex={0} className="max-h-96 overflow-y-auto divide-y divide-border">
              {data.deficient.slice(0, MAX_DISPLAY).map((doc) => (
                <div key={`${doc.collection}-${doc.id}`} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <Link href={doc.adminUrl} prefetch={false} className="group flex min-h-11 items-center gap-2 text-sm font-medium text-foreground no-underline hover:text-primary md:min-h-5">
                      <span className="truncate">{doc.title || (isEnglish ? '(Untitled)' : '(Không có tiêu đề)')}</span>
                      <ExternalLink aria-hidden="true" className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
                    </Link>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-xs">{isEnglish ? doc.collection : ({ posts: 'Bài viết', pages: 'Trang', products: 'Sản phẩm', landings: 'Trang đích' }[doc.collection] ?? doc.collection)}</Badge>
                      {doc.reasons.map((reason) => {
                        const label = REASON_LABELS[reason]
                        const reasonText = reason.startsWith('low-score:')
                          ? `${isEnglish ? 'Low SEO score' : 'Điểm SEO thấp'} (${reason.split(':')[1]})`
                          : label?.[isEnglish ? 'en' : 'vi'] ?? reason
                        return (
                          <Badge key={reason} variant={reason === 'noindex' ? 'warning' : 'secondary'} className="text-xs font-normal">
                            {reasonText}
                          </Badge>
                        )
                      })}
                    </div>
                  </div>
                  <Badge variant={doc.score >= 70 ? 'success' : doc.score >= 40 ? 'warning' : 'destructive'} className="shrink-0">
                    {doc.score}
                  </Badge>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
