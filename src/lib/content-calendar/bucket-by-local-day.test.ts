import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  bucketByLocalDay,
  classifyStatus,
  localDateKey,
  monthGridDays,
  monthRangeUtc,
  parseMonth,
  shiftMonth,
} from './bucket-by-local-day'

const OCT = { year: 2026, month: 10 }
const item = (title: string, publishedAt: string) => ({ title, publishedAt })

describe('content calendar — local-day bucketing (Asia/Ho_Chi_Minh)', () => {
  it('a UTC evening lands on the NEXT local day', () => {
    assert.equal(localDateKey('2026-10-01T17:30:00Z'), '2026-10-02')
    assert.equal(localDateKey('2026-10-01T16:59:59Z'), '2026-10-01')
  })

  it('month edges follow local time: 30 Sep 17:00Z is 1 Oct, 31 Oct 17:00Z is 1 Nov', () => {
    const buckets = bucketByLocalDay(
      [item('in (local 1 Oct)', '2026-09-30T17:00:00Z'), item('out (local 1 Nov)', '2026-10-31T17:00:00Z'), item('out (Sep)', '2026-09-30T16:59:00Z')],
      OCT,
    )
    assert.deepEqual([...buckets.keys()], ['2026-10-01'])
    assert.deepEqual(buckets.get('2026-10-01')?.map((entry) => entry.title), ['in (local 1 Oct)'])
  })

  it('orders a day by publish time, ties by title; days come out sorted', () => {
    const buckets = bucketByLocalDay(
      [item('b', '2026-10-05T03:00:00Z'), item('late', '2026-10-05T09:00:00Z'), item('a', '2026-10-05T03:00:00Z'), item('earlier day', '2026-10-02T01:00:00Z')],
      OCT,
    )
    assert.deepEqual([...buckets.keys()], ['2026-10-02', '2026-10-05'])
    assert.deepEqual(buckets.get('2026-10-05')?.map((entry) => entry.title), ['a', 'b', 'late'])
  })

  it('the UTC query window is local midnight to local midnight', () => {
    const { start, end } = monthRangeUtc(OCT)
    assert.equal(start.toISOString(), '2026-09-30T17:00:00.000Z')
    assert.equal(end.toISOString(), '2026-10-31T17:00:00.000Z')
    assert.equal(monthRangeUtc({ year: 2026, month: 12 }).end.toISOString(), '2026-12-31T17:00:00.000Z')
  })
})

describe('content calendar — status, month param, grid', () => {
  const now = new Date('2026-10-10T00:00:00Z')

  it('published past = live, published future = scheduled, draft = planned', () => {
    assert.equal(classifyStatus({ status: 'published', publishedAt: '2026-10-09T00:00:00Z' }, now), 'live')
    assert.equal(classifyStatus({ status: 'published', publishedAt: '2026-10-11T00:00:00Z' }, now), 'scheduled')
    assert.equal(classifyStatus({ status: 'draft', publishedAt: '2026-10-09T00:00:00Z' }, now), 'planned')
  })

  it('?month= accepts only YYYY-MM; anything else is the current LOCAL month', () => {
    assert.deepEqual(parseMonth('2027-02', now), { year: 2027, month: 2 })
    assert.deepEqual(parseMonth('2027-13', now), { year: 2026, month: 10 })
    assert.deepEqual(parseMonth(undefined, new Date('2026-10-31T18:00:00Z')), { year: 2026, month: 11 }, 'already November in ICT')
    assert.deepEqual(shiftMonth({ year: 2026, month: 12 }, 1), { year: 2027, month: 1 })
    assert.deepEqual(shiftMonth({ year: 2026, month: 1 }, -1), { year: 2025, month: 12 })
  })

  it('the grid is Monday-first whole weeks covering the month', () => {
    const days = monthGridDays(OCT) // 1 Oct 2026 is a Thursday
    assert.equal(days.length % 7, 0)
    assert.deepEqual(days.slice(0, 4).map((day) => day.inMonth), [false, false, false, true])
    assert.equal(days[3].key, '2026-10-01')
    assert.equal(days.filter((day) => day.inMonth).length, 31)
  })
})
