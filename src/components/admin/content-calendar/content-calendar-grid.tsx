'use client'

/**
 * Month grid / agenda for the content calendar (SP1a-3). Presentational: the server view has
 * already scoped, loaded and bucketed the items; this only filters and renders. Tailwind lives
 * inside `.twp` (docs/admin-theming.md). Every item is a real link (keyboard-focusable) to its
 * edit view, labelled with collection, status and time for screen readers.
 */
import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from '@payloadcms/ui'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { CalendarCollection, CalendarStatus } from '@/lib/content-calendar/bucket-by-local-day'
import { useIsMobile } from '@/hooks/use-mobile'

export interface CalendarViewItem {
  id: string
  collection: CalendarCollection
  title: string
  /** `YYYY-MM-DD` in Asia/Ho_Chi_Minh */
  day: string
  publishedAt: string
  status: CalendarStatus
}

export interface ContentCalendarGridProps {
  monthKey: string
  previousMonthKey: string
  nextMonthKey: string
  todayKey: string
  days: Array<{ key: string; day: number; inMonth: boolean }>
  items: CalendarViewItem[]
  tenantSelected: boolean
}

const COLLECTION_LABELS: Record<CalendarCollection, { vi: string; en: string }> = {
  posts: { vi: 'Bài viết', en: 'Posts' },
  pages: { vi: 'Trang', en: 'Pages' },
  products: { vi: 'Sản phẩm', en: 'Products' },
  landings: { vi: 'Trang đích', en: 'Landings' },
}

const STATUS_LABELS: Record<CalendarStatus, { vi: string; en: string }> = {
  live: { vi: 'Đang hiển thị', en: 'Live' },
  scheduled: { vi: 'Hẹn giờ', en: 'Scheduled' },
  planned: { vi: 'Nháp có ngày', en: 'Planned' },
}

const STATUS_CLASSES: Record<CalendarStatus, string> = {
  live: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100',
  scheduled: 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100',
  planned: 'border-border bg-muted text-muted-foreground',
}

const WEEKDAYS = [
  ['T2', 'Mon'],
  ['T3', 'Tue'],
  ['T4', 'Wed'],
  ['T5', 'Thu'],
  ['T6', 'Fri'],
  ['T7', 'Sat'],
  ['CN', 'Sun'],
] as const

const timeFormatter = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })

function ItemLink({ item, compact }: { item: CalendarViewItem; compact: boolean }) {
  const { i18n } = useTranslation()
  const language = i18n.language === 'en' ? 'en' : 'vi'
  const time = timeFormatter.format(new Date(item.publishedAt))
  return (
    <Link
      href={`/admin/collections/${item.collection}/${item.id}`}
      prefetch={false}
      data-status={item.status}
      data-collection={item.collection}
      aria-label={`${item.title} — ${COLLECTION_LABELS[item.collection][language]}, ${STATUS_LABELS[item.status][language]}, ${time}`}
      className={cn(
        'block min-h-11 rounded-md border px-2 py-2 text-sm font-medium no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
        compact ? 'whitespace-normal break-words' : 'truncate',
        STATUS_CLASSES[item.status],
      )}
      title={`${item.title} (${time})`}
    >
      {compact ? (
        <>
          <span className="tabular-nums opacity-70">{time}</span> {item.title}
        </>
      ) : (
        item.title
      )}
    </Link>
  )
}

export function ContentCalendarGrid({
  monthKey,
  previousMonthKey,
  nextMonthKey,
  todayKey,
  days,
  items,
  tenantSelected,
}: ContentCalendarGridProps) {
  const { i18n } = useTranslation()
  const language = i18n.language === 'en' ? 'en' : 'vi'
  const isEnglish = language === 'en'
  const isMobile = useIsMobile()
  const [selectedView, setView] = useState<'grid' | 'agenda' | null>(null)
  const view = selectedView ?? (isMobile ? 'agenda' : 'grid')
  const [collections, setCollections] = useState<Set<CalendarCollection>>(
    () => new Set(Object.keys(COLLECTION_LABELS) as CalendarCollection[]),
  )
  const [status, setStatus] = useState<CalendarStatus | 'all'>('all')

  const visible = useMemo(
    () => items.filter((item) => collections.has(item.collection) && (status === 'all' || item.status === status)),
    [collections, items, status],
  )
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarViewItem[]>()
    for (const item of visible) {
      const bucket = map.get(item.day)
      if (bucket) bucket.push(item)
      else map.set(item.day, [item])
    }
    return map
  }, [visible])

  const toggleCollection = (collection: CalendarCollection) =>
    setCollections((current) => {
      const next = new Set(current)
      if (next.has(collection)) next.delete(collection)
      else next.add(collection)
      return next
    })

  return (
    <div className="twp min-w-0 max-w-full py-6" data-testid="content-calendar">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="m-0 text-2xl font-semibold tracking-tight text-foreground">{isEnglish ? 'Editorial calendar' : 'Lịch nội dung'}</h1>
          <p className="mb-0 mt-2 text-sm text-muted-foreground">
            {isEnglish ? 'Publication dates in Vietnam time' : 'Ngày đăng theo giờ Việt Nam'} · {items.length} {isEnglish ? 'items' : 'mục'}
          </p>
        </div>
        <nav className="flex items-center gap-2" aria-label={isEnglish ? 'Month' : 'Tháng'}>
          {/* `no-underline`: Payload's global anchor styles would otherwise decorate these. */}
          <Link className={cn(buttonVariants({ variant: 'outline', size: 'icon' }), 'no-underline')} href={`?month=${previousMonthKey}`} aria-label={isEnglish ? 'Previous month' : 'Tháng trước'}>
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
          <span className="min-w-20 text-center font-semibold tabular-nums" aria-live="polite">
            {monthKey}
          </span>
          <Link className={cn(buttonVariants({ variant: 'outline', size: 'icon' }), 'no-underline')} href={`?month=${nextMonthKey}`} aria-label={isEnglish ? 'Next month' : 'Tháng sau'}>
            <ChevronRight className="size-4" aria-hidden />
          </Link>
          <Link className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'no-underline')} href="?">
            {isEnglish ? 'Today' : 'Hôm nay'}
          </Link>
        </nav>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4 text-sm">
        <div className="flex overflow-hidden rounded-md border border-border" role="group" aria-label={isEnglish ? 'Calendar view' : 'Kiểu xem lịch'}>
          {(['grid', 'agenda'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={view === mode}
              onClick={() => setView(mode)}
              className={cn('min-h-11 px-3 py-2', view === mode ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground')}
            >
              {mode === 'grid' ? (isEnglish ? 'Month' : 'Tháng') : (isEnglish ? 'Agenda' : 'Danh sách')}
            </button>
          ))}
        </div>
        <fieldset className="flex flex-wrap items-center gap-3">
          <legend className="sr-only">{isEnglish ? 'Collections' : 'Loại nội dung'}</legend>
          {(Object.keys(COLLECTION_LABELS) as CalendarCollection[]).map((collection) => (
            <label key={collection} className="flex min-h-11 items-center gap-2">
              <input type="checkbox" checked={collections.has(collection)} onChange={() => toggleCollection(collection)} />
              {COLLECTION_LABELS[collection][language]}
            </label>
          ))}
        </fieldset>
        <label className="flex items-center gap-1.5">
          <span>{isEnglish ? 'Status' : 'Trạng thái'}</span>
          <select
            className="min-h-11 rounded-md border border-border bg-background px-3 py-2"
            value={status}
            onChange={(event) => setStatus(event.target.value as CalendarStatus | 'all')}
          >
            <option value="all">{isEnglish ? 'All' : 'Tất cả'}</option>
            {(Object.keys(STATUS_LABELS) as CalendarStatus[]).map((key) => (
              <option key={key} value={key}>
                {STATUS_LABELS[key][language]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!tenantSelected ? (
        <p className="rounded-md border border-border bg-muted p-4 text-sm text-muted-foreground">
          {isEnglish ? 'Choose a website in the website selector to view its calendar.' : 'Chọn website trong bộ lọc website để xem lịch.'}
        </p>
      ) : view === 'grid' ? (
        <div className="w-full min-w-0 max-w-full overflow-x-auto rounded-xl border border-border" tabIndex={0} role="region" aria-label={isEnglish ? 'Month calendar; scroll horizontally' : 'Lịch tháng; cuộn ngang để xem'}>
        <div className="grid min-w-[700px] grid-cols-7 gap-px bg-border" role="grid" aria-label={`${isEnglish ? 'Calendar' : 'Lịch'} ${monthKey}`}>
          {WEEKDAYS.map(([vi, en]) => (
            <div key={vi} role="columnheader" title={isEnglish ? en : vi} className="bg-muted px-3 py-3 text-center text-xs font-semibold text-muted-foreground">
              {isEnglish ? en : vi}
            </div>
          ))}
          {days.map((day) => {
            const dayItems = byDay.get(day.key) ?? []
            return (
              <div
                key={day.key}
                role="gridcell"
                data-day={day.key}
                aria-label={`${day.key}: ${dayItems.length} ${isEnglish ? 'items' : 'mục'}`}
                className={cn(
                  'flex min-h-36 min-w-0 flex-col gap-1 bg-card p-3',
                  !day.inMonth && 'bg-muted/40 text-muted-foreground',
                )}
              >
                <span className={cn('inline-flex size-7 items-center justify-center self-end rounded-full text-xs tabular-nums', day.key === todayKey && 'bg-primary font-semibold text-primary-foreground')}>{day.day}</span>
                {dayItems.map((item) => (
                  <ItemLink key={`${item.collection}-${item.id}`} item={item} compact={false} />
                ))}
              </div>
            )
          })}
        </div>
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-md border border-border bg-muted p-4 text-sm text-muted-foreground">
          {isEnglish ? 'No content matches the current month and filters.' : 'Chưa có nội dung khớp tháng và bộ lọc hiện tại.'}
        </p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-4 p-0" aria-label={`${isEnglish ? 'Agenda' : 'Danh sách'} ${monthKey}`}>
          {[...byDay.entries()].map(([day, dayItems]) => (
            <li key={day} data-day={day}>
              <h2 className={cn('mb-1 text-sm font-semibold', day === todayKey && 'text-primary')}>{day}</h2>
              <ul className="flex flex-col gap-1">
                {dayItems.map((item) => (
                  <li key={`${item.collection}-${item.id}`}>
                    <ItemLink item={item} compact />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
