import React from 'react'
import Link from 'next/link'
import type { AdminViewServerProps } from 'payload'
import { Gutter } from '@payloadcms/ui'
import { CalendarDays, Globe2, Plus } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getValidatedAdminTenantId, isSuperAdminUser } from '@/lib/admin-selected-tenant'
import { DashboardWidgets } from './dashboard-widgets'
import { SeoAuditWidget } from './seo-audit-widget'

export async function EditorialDashboardView({ initPageResult }: AdminViewServerProps) {
  const { req } = initPageResult
  const user = req.user
  const adminRoute = '/admin'
  const isEnglish = req.i18n.language === 'en'

  // RootPage owns DefaultTemplate, Nav and authenticated client props.
  const template = (children: React.ReactNode) => <Gutter>{children}</Gutter>

  if (!user) {
    return template(<p>{isEnglish ? 'Please sign in to continue.' : 'Vui lòng đăng nhập để tiếp tục.'}</p>)
  }
  const tenantUser = { role: user.role, tenants: user.tenants ?? undefined }

  const tenantId = getValidatedAdminTenantId({
    cookieHeader: req.headers?.get('cookie'),
    user: tenantUser,
  })
  const siteContext = tenantId ? 'selected' : isSuperAdminUser(tenantUser) ? 'all-sites' : 'no-site'
  let siteLabel: string | undefined
  let siteLookupFailed = false

  if (tenantId) {
    try {
      const site = await req.payload.findByID({
        collection: 'sites',
        id: tenantId,
        depth: 0,
        overrideAccess: false,
        user,
        select: { siteKey: true, domain: true },
      })
      siteLabel = [site.siteKey, site.domain].filter(Boolean).join(' · ')
    } catch {
      siteLookupFailed = true
    }
  }

  const canCreatePosts = initPageResult.permissions.collections?.posts?.create === true
  const siteHeading = siteContext === 'selected'
    ? siteLookupFailed
      ? (isEnglish ? 'Selected website' : 'Website đã chọn')
      : siteLabel || (isEnglish ? 'Selected website' : 'Website đã chọn')
    : siteContext === 'all-sites'
      ? (isEnglish ? 'All websites' : 'Tất cả website')
      : (isEnglish ? 'No website available' : 'Chưa có website')

  return template(
    <main className="twp space-y-6 pb-10 pt-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="m-0 text-2xl font-semibold tracking-tight text-foreground">
            {isEnglish ? 'Dashboard' : 'Tổng quan'}
          </h1>
          <p className="mb-0 mt-1 text-sm text-muted-foreground">
            {isEnglish ? 'Welcome to KDIGI CMS — open-source multi-site content management.' : 'Chào mừng đến với KDIGI CMS — hệ quản trị nội dung đa site mã nguồn mở.'}
          </p>
          <p className="mb-0 mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Globe2 aria-hidden="true" className="size-4 shrink-0" />
            <span className="min-w-0 break-words">{siteHeading}</span>
          </p>
        </div>
        {tenantId && (
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`${adminRoute}/content-calendar`} className={cn(buttonVariants({ variant: 'outline' }), 'no-underline')}>
              <CalendarDays aria-hidden="true" />
              {isEnglish ? 'Calendar' : 'Lịch nội dung'}
            </Link>
            {canCreatePosts && (
              <Link href={`${adminRoute}/collections/posts/create`} prefetch={false} className={cn(buttonVariants(), 'no-underline')}>
                <Plus aria-hidden="true" />
                {isEnglish ? 'New post' : 'Viết bài mới'}
              </Link>
            )}
          </div>
        )}
      </header>

      <DashboardWidgets
        adminRoute={adminRoute}
        isEnglish={isEnglish}
        payload={req.payload}
        siteContext={siteContext}
        tenantId={tenantId}
        user={user}
        seoPanel={<SeoAuditWidget isEnglish={isEnglish} payload={req.payload} siteContext={siteContext} tenantId={tenantId} />}
      />

    </main>,
  )
}
