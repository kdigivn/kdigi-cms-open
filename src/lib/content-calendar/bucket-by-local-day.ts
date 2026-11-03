/**
 * Pure calendar logic for the admin content calendar (SP1a-3).
 *
 * `publishedAt` is stored in UTC, editors think in Asia/Ho_Chi_Minh (UTC+7, no DST): an item
 * published at 2026-10-01T17:30Z is on the 2nd of October for them. Every day key here is
 * computed in the calendar's time zone, never from the UTC date.
 */

export const CALENDAR_TIME_ZONE = 'Asia/Ho_Chi_Minh'

export const CALENDAR_COLLECTIONS = ['posts', 'pages', 'products', 'landings'] as const
export type CalendarCollection = (typeof CALENDAR_COLLECTIONS)[number]

export interface CalendarItem {
  id: string | number
  collection: CalendarCollection
  title: string
  slug: string
  status: string
  publishedAt: string
}

/** Live = public now; Scheduled = published but in the future; Planned = a dated draft. */
export type CalendarStatus = 'live' | 'scheduled' | 'planned'

export interface CalendarMonth {
  year: number
  /** 1–12 */
  month: number
}

/** Same rule as `publishedAndLive()` for the date part. */
export function classifyStatus(item: Pick<CalendarItem, 'status' | 'publishedAt'>, now: Date): CalendarStatus {
  if (item.status !== 'published') return 'planned'
  return new Date(item.publishedAt).getTime() <= now.getTime() ? 'live' : 'scheduled'
}

function zonedParts(date: Date, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute') }
}

const pad = (value: number) => String(value).padStart(2, '0')

/** `YYYY-MM-DD` of an instant, in the calendar's time zone. */
export function localDateKey(iso: string | Date, timeZone = CALENDAR_TIME_ZONE): string {
  const { year, month, day } = zonedParts(typeof iso === 'string' ? new Date(iso) : iso, timeZone)
  return `${String(year)}-${pad(month)}-${pad(day)}`
}

export function monthKey({ year, month }: CalendarMonth): string {
  return `${String(year)}-${pad(month)}`
}

/** `?month=YYYY-MM`, else the current month in the calendar's time zone. */
export function parseMonth(value: unknown, now: Date, timeZone = CALENDAR_TIME_ZONE): CalendarMonth {
  if (typeof value === 'string') {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value)
    if (match) return { year: Number(match[1]), month: Number(match[2]) }
  }
  const { year, month } = zonedParts(now, timeZone)
  return { year, month }
}

export function shiftMonth({ year, month }: CalendarMonth, delta: number): CalendarMonth {
  const index = year * 12 + (month - 1) + delta
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

/** UTC instant of local midnight on the given day (offset probed with Intl, no fixed +7). */
function localMidnightUtc(year: number, month: number, day: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day)
  const shown = zonedParts(new Date(guess), timeZone)
  const offsetMs = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute) - guess
  return new Date(guess - offsetMs)
}

/** `[start, end)` of the month in UTC — the query window for `publishedAt`. */
export function monthRangeUtc(month: CalendarMonth, timeZone = CALENDAR_TIME_ZONE): { start: Date; end: Date } {
  const next = shiftMonth(month, 1)
  return {
    start: localMidnightUtc(month.year, month.month, 1, timeZone),
    end: localMidnightUtc(next.year, next.month, 1, timeZone),
  }
}

/**
 * Items grouped by local day, only days inside `month`, each day ordered by publish time
 * (ties by title, so the order is stable across renders).
 */
export function bucketByLocalDay<T extends Pick<CalendarItem, 'publishedAt' | 'title'>>(
  items: readonly T[],
  month: CalendarMonth,
  timeZone = CALENDAR_TIME_ZONE,
): Map<string, T[]> {
  const prefix = `${monthKey(month)}-`
  const buckets = new Map<string, T[]>()
  for (const item of items) {
    const key = localDateKey(item.publishedAt, timeZone)
    if (!key.startsWith(prefix)) continue
    const bucket = buckets.get(key) ?? []
    bucket.push(item)
    buckets.set(key, bucket)
  }
  for (const bucket of buckets.values()) {
    bucket.sort(
      (a, b) =>
        new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime() || a.title.localeCompare(b.title, 'vi'),
    )
  }
  return new Map([...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

/** Monday-first weeks covering the month; days outside it are flagged `inMonth: false`. */
export function monthGridDays(month: CalendarMonth): Array<{ key: string; day: number; inMonth: boolean }> {
  const first = new Date(Date.UTC(month.year, month.month - 1, 1))
  const daysInMonth = new Date(Date.UTC(month.year, month.month, 0)).getUTCDate()
  const leading = (first.getUTCDay() + 6) % 7 // Monday = 0
  const total = Math.ceil((leading + daysInMonth) / 7) * 7
  return Array.from({ length: total }, (_, index) => {
    const date = new Date(Date.UTC(month.year, month.month - 1, 1 + index - leading))
    return {
      key: `${String(date.getUTCFullYear())}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`,
      day: date.getUTCDate(),
      inMonth: date.getUTCMonth() === month.month - 1,
    }
  })
}
