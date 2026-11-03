/**
 * Loads the calendar's items for one tenant and one month window (SP1a-3).
 *
 * Every query runs AS THE USER (`overrideAccess: false`): the collection access predicates are
 * the boundary, and the explicit `tenant` condition only narrows to the tenant the admin
 * selected (resolved by the caller through `getValidatedAdminTenantId` [RT-7]). A forged
 * `payload-tenant` cookie therefore cannot reach another tenant's rows: the helper ignores it,
 * and even a wrong id passed here returns nothing the user may not read.
 * Minimal `select` — no SEO blobs, no secrets. Trashed documents are excluded (Payload default).
 */
import type { Payload, Where } from 'payload'

import { CALENDAR_COLLECTIONS, type CalendarCollection, type CalendarItem } from './bucket-by-local-day'

/** Page size per collection query; pages are followed until the window is exhausted. */
export const CALENDAR_PAGE_LIMIT = 500

type CalendarUser = Parameters<Payload['find']>[0]['user']

export async function loadCalendarItems(
  payload: Payload,
  user: CalendarUser | null | undefined,
  tenantId: string | number | undefined,
  range: { start: Date; end: Date },
): Promise<CalendarItem[]> {
  if (!user) throw new Error('loadCalendarItems: an authenticated user is required')
  if (tenantId === undefined || tenantId === '') return []

  const where: Where = {
    and: [
      { tenant: { equals: tenantId } },
      { publishedAt: { greater_than_equal: range.start.toISOString() } },
      { publishedAt: { less_than: range.end.toISOString() } },
    ],
  }

  const perCollection = await Promise.all(
    CALENDAR_COLLECTIONS.map(async (collection) => {
      const items: CalendarItem[] = []
      for (let page = 1; ; page += 1) {
        const result = await payload.find({
          collection,
          where,
          user,
          overrideAccess: false,
          depth: 0,
          limit: CALENDAR_PAGE_LIMIT,
          page,
          sort: 'publishedAt',
          select: { title: true, slug: true, status: true, publishedAt: true },
        })
        for (const doc of result.docs as unknown as Array<Record<string, unknown>>) {
          if (typeof doc.publishedAt !== 'string') continue
          items.push({
            id: doc.id as string | number,
            collection: collection as CalendarCollection,
            title: typeof doc.title === 'string' && doc.title ? doc.title : String(doc.slug ?? doc.id),
            slug: typeof doc.slug === 'string' ? doc.slug : '',
            status: typeof doc.status === 'string' ? doc.status : 'draft',
            publishedAt: doc.publishedAt,
          })
        }
        if (!result.hasNextPage) break
      }
      return items
    }),
  )

  return perCollection
    .flat()
    .sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime())
}
