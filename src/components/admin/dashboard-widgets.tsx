import React from 'react'
import Link from 'next/link'
import type { BasePayload, PayloadRequest } from 'payload'
import { ArrowUpRight, CheckCircle2, FileText, MessageSquareText, Ship } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
type QueryState<T> = { status: 'ready'; value: T } | { status: 'error' | 'needs-site' }
type SiteContext = 'selected' | 'all-sites' | 'no-site'

interface DashboardWidgetsProps {
  adminRoute: string
  isEnglish: boolean
  payload: BasePayload
  siteContext: SiteContext
  tenantId?: string
  user: PayloadRequest['user']
  seoPanel: React.ReactNode
}

export const DashboardWidgets: React.FC<DashboardWidgetsProps> = async ({
  adminRoute,
  isEnglish,
  payload,
  siteContext,
  tenantId,
  user,
  seoPanel,
}) => {
  let countStates: QueryState<number>[]
  let recentError = false
  let recentNeedsSite = siteContext === 'no-site'
  let recentDocs: Array<{
    doc: { id: number | string; title?: string | null; updatedAt: string }
    collection: 'posts' | 'pages'
  }> = []

  if (siteContext === 'no-site') {
    countStates = Array.from({ length: 4 }, () => ({ status: 'needs-site' as const }))
  } else {
    const tenantWhere = tenantId ? { tenant: { equals: tenantId } } : undefined
    const access = { user, overrideAccess: false as const }
    const [countResults, recentResults] = await Promise.all([
      Promise.allSettled([
        payload.count({ collection: 'posts', where: { ...tenantWhere, status: { equals: 'draft' } }, ...access }),
        payload.count({ collection: 'posts', where: { ...tenantWhere, status: { equals: 'published' } }, ...access }),
        payload.count({ collection: 'products', where: { ...tenantWhere, status: { equals: 'published' } }, ...access }),
        payload.count({ collection: 'comments', where: { ...tenantWhere, status: { equals: 'pending' } }, ...access }),
      ]),
      Promise.allSettled([
        payload.find({ collection: 'posts', where: tenantWhere, sort: '-updatedAt', limit: 5, depth: 0, select: { title: true, updatedAt: true }, ...access }),
        payload.find({ collection: 'pages', where: tenantWhere, sort: '-updatedAt', limit: 3, depth: 0, select: { title: true, updatedAt: true }, ...access }),
      ]),
    ])

    countStates = countResults.map((result) =>
      result.status === 'fulfilled'
        ? { status: 'ready', value: result.value.totalDocs }
        : { status: 'error' },
    )
    recentError = recentResults.some((result) => result.status === 'rejected')
    recentNeedsSite = false
    if (!recentError) {
      recentDocs = [
        ...(recentResults[0].status === 'fulfilled'
          ? recentResults[0].value.docs.map((doc) => ({ doc, collection: 'posts' as const }))
          : []),
        ...(recentResults[1].status === 'fulfilled'
          ? recentResults[1].value.docs.map((doc) => ({ doc, collection: 'pages' as const }))
          : []),
      ]
        .sort((a, b) => new Date(b.doc.updatedAt).getTime() - new Date(a.doc.updatedAt).getTime())
        .slice(0, 8)
    }
  }

  const stats = [
    {
      label: isEnglish ? 'Draft posts' : 'Bài viết nháp',
      result: countStates[0],
      href: '/collections/posts?where[status][equals]=draft',
      Icon: FileText,
    },
    {
      label: isEnglish ? 'Published posts' : 'Bài viết đã xuất bản',
      result: countStates[1],
      href: '/collections/posts?where[status][equals]=published',
      Icon: CheckCircle2,
    },
    {
      label: isEnglish ? 'Published products' : 'Sản phẩm đã xuất bản',
      result: countStates[2],
      href: '/collections/products?where[status][equals]=published',
      Icon: Ship,
    },
    {
      label: isEnglish ? 'Pending comments' : 'Bình luận chờ duyệt',
      result: countStates[3],
      href: '/collections/comments?where[status][equals]=pending',
      Icon: MessageSquareText,
    },
  ]

  return (
    <div className="space-y-6">
      {siteContext === 'no-site' && (
        <p role="status" className="m-0 rounded-md border border-border p-4 text-sm text-muted-foreground">
          {isEnglish ? 'Select an assigned website to see content metrics.' : 'Chọn website được cấp quyền để xem số liệu nội dung.'}
        </p>
      )}

      <section className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={isEnglish ? 'Content metrics' : 'Số liệu nội dung'}>
        {stats.map(({ label, result, href, Icon }) => {
          const card = (
            <Card className="h-full transition-colors group-hover:bg-muted/30">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 px-4 pb-2 pt-4 sm:px-6 sm:pt-6">
                <CardTitle className="flex items-center gap-2 text-sm font-medium leading-5">
                  <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
                  {label}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
                <div className="flex items-end justify-between gap-2">
                  <span className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                    {result.status === 'ready' ? result.value : '—'}
                  </span>
                  {result.status === 'error' ? (
                    <Badge variant="warning">{isEnglish ? 'Unavailable' : 'Không tải được'}</Badge>
                  ) : result.status === 'needs-site' ? (
                    <Badge variant="outline">{isEnglish ? 'Select website' : 'Chọn website'}</Badge>
                  ) : (
                    <ArrowUpRight aria-hidden="true" className="size-4 text-muted-foreground" />
                  )}
                </div>
                <p className="mb-0 mt-2 text-xs text-muted-foreground">{isEnglish ? 'Current total' : 'Tổng số hiện tại'}</p>
              </CardContent>
            </Card>
          )

          return result.status === 'needs-site' ? (
            <div key={label} className="block min-w-0">{card}</div>
          ) : (
            <Link key={label} href={`${adminRoute}${href}`} prefetch={false} className="group block min-w-0 no-underline">{card}</Link>
          )
        })}
      </section>


      <div className="grid min-w-0 items-stretch gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card className="min-w-0">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 border-b border-border px-4 py-4 sm:px-6">
            <h2 className="m-0 text-base font-semibold text-foreground">{isEnglish ? 'Recently updated' : 'Cập nhật gần đây'}</h2>
            <span className="text-xs text-muted-foreground">{isEnglish ? 'Posts & pages' : 'Bài viết & trang'}</span>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            {recentNeedsSite ? (
              <p className="m-0 text-sm text-muted-foreground">{isEnglish ? 'Select a website to browse recent content.' : 'Chọn website để xem nội dung gần đây.'}</p>
            ) : recentError ? (
              <p role="status" className="m-0 text-sm text-muted-foreground">
                {isEnglish ? 'Recent content could not be loaded.' : 'Không thể tải nội dung gần đây.'}
              </p>
            ) : recentDocs.length > 0 ? (
              <div className="divide-y divide-border">
                {recentDocs.map(({ doc, collection }) => {
                  const title = typeof doc.title === 'string' ? doc.title : isEnglish ? 'Untitled' : 'Chưa có tiêu đề'
                  const updatedDate = new Date(doc.updatedAt)
                  const formattedDate = !isNaN(updatedDate.getTime())
                    ? updatedDate.toLocaleDateString(isEnglish ? 'en-US' : 'vi-VN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : ''
                  return (
                    <Link
                      key={`${collection}-${doc.id}`}
                      href={`${adminRoute}/collections/${collection}/${doc.id}`}
                      prefetch={false}
                      className="group flex items-center justify-between gap-4 py-3 text-sm text-foreground no-underline first:pt-0 last:pb-0 hover:text-primary transition-colors"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground"><FileText aria-hidden="true" className="size-4" /></span>
                        <div className="min-w-0">
                          <span className="block truncate font-medium">{title}</span>
                          {formattedDate && <time dateTime={doc.updatedAt} className="mt-0.5 block text-xs text-muted-foreground">{formattedDate}</time>}
                        </div>
                      </div>
                      <Badge variant="outline" className="shrink-0">{collection === 'posts' ? (isEnglish ? 'Post' : 'Bài viết') : (isEnglish ? 'Page' : 'Trang')}</Badge>
                    </Link>
                  )
                })}
              </div>
            ) : (
              <p className="m-0 text-sm text-muted-foreground">
                {isEnglish ? 'No content has been updated yet.' : 'Chưa có nội dung nào được cập nhật.'}
              </p>
            )}
          </CardContent>
        </Card>
        {seoPanel}
      </div>
    </div>
  )
}
