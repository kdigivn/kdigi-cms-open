/**
 * Admin view `/admin/content-calendar` (SP1a-3): posts, pages, products and landings of the
 * selected tenant by `publishedAt`, as a month grid or an agenda.
 *
 * Registered in payload.config.ts as `admin.components.views.contentCalendar`.
 * Server component: the tenant comes from `getValidatedAdminTenantId` (the `payload-tenant`
 * cookie is honoured only for a member or a super-admin [RT-7]) and the data is loaded AS THE
 * USER (`loadCalendarItems`, `overrideAccess: false`). Days are bucketed in Asia/Ho_Chi_Minh.
 */
import React from 'react'
import type { AdminViewServerProps } from 'payload'
import { Gutter } from '@payloadcms/ui'
import { DefaultTemplate } from '@payloadcms/next/templates'

import { getValidatedAdminTenantId } from '@/lib/admin-selected-tenant'
import {
  bucketByLocalDay,
  classifyStatus,
  localDateKey,
  monthGridDays,
  monthKey,
  monthRangeUtc,
  parseMonth,
  shiftMonth,
} from '@/lib/content-calendar/bucket-by-local-day'
import { loadCalendarItems } from '@/lib/content-calendar/load-calendar-items'

import { ContentCalendarGrid, type CalendarViewItem } from './content-calendar-grid'

export async function ContentCalendarView({ initPageResult, params, searchParams, user: displayUser }: AdminViewServerProps) {
  const { locale, permissions, req, visibleEntities } = initPageResult
  const user = req.user

  const template = (children: React.ReactNode) => (
    <DefaultTemplate
      i18n={req.i18n}
      locale={locale}
      params={params}
      payload={req.payload}
      permissions={permissions}
      req={req}
      searchParams={searchParams}
      user={displayUser}
      visibleEntities={{ collections: visibleEntities.collections, globals: visibleEntities.globals }}
    >
      <Gutter>{children}</Gutter>
    </DefaultTemplate>
  )

  if (!user) {
    return template(<p>Vui lòng đăng nhập. / Please log in.</p>)
  }

  const now = new Date()
  const month = parseMonth(searchParams?.month, now)
  const tenantId = getValidatedAdminTenantId({
    cookieHeader: req.headers?.get('cookie'),
    user: { role: user.role, tenants: user.tenants ?? undefined },
  })
  const items = await loadCalendarItems(req.payload, user, tenantId, monthRangeUtc(month))

  const buckets = bucketByLocalDay(items, month)
  const viewItems: CalendarViewItem[] = [...buckets.entries()].flatMap(([day, dayItems]) =>
    dayItems.map((item) => ({
      id: String(item.id),
      collection: item.collection,
      title: item.title,
      day,
      publishedAt: item.publishedAt,
      status: classifyStatus(item, now),
    })),
  )

  return template(
    <ContentCalendarGrid
      monthKey={monthKey(month)}
      previousMonthKey={monthKey(shiftMonth(month, -1))}
      nextMonthKey={monthKey(shiftMonth(month, 1))}
      todayKey={localDateKey(now)}
      days={monthGridDays(month)}
      items={viewItems}
      tenantSelected={tenantId !== undefined}
    />,
  )
}
