/**
 * Group meetings under date headings (T-12).
 *
 * The reference groups its library by day — `Sat, Jul 25`, then the meetings
 * from that day — which is what makes a long list scannable: you look for
 * "sometime last Thursday", not for row 34.
 *
 * Pure and `now`-injectable, so the "Today"/"Yesterday" boundaries can be
 * tested at a fixed instant rather than against whatever day the suite runs on.
 */

import { LOCALE, formatRelativeDate } from '@/lib/utils/format'

export interface DateGroup<T> {
  /** `Today`, `Yesterday`, or `Sat, Jul 25`. */
  label: string
  /** `YYYY-MM-DD` in local time — stable across renders, usable as a React key. */
  key: string
  items: T[]
}

const WEEKDAY_FORMAT = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

const WITH_YEAR_FORMAT = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

/**
 * A stable local-day key.
 *
 * NOT `toISOString().slice(0, 10)` — that is the UTC day, so a meeting at
 * 8pm local on the 25th in UTC+5 lands under the 26th and the heading
 * disagrees with the time printed inside the card.
 */
export function localDayKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * `Sat, Jul 25` — with the year once the meeting is not from this one.
 *
 * `Today` and `Yesterday` are reused from `formatRelativeDate` so the heading
 * and the row's own date cell can never disagree about what day it is.
 */
export function groupHeading(iso: string, now: Date): string {
  const relative = formatRelativeDate(iso, now)
  if (relative === 'Today' || relative === 'Yesterday') return relative

  const date = new Date(iso)
  return date.getFullYear() === now.getFullYear()
    ? WEEKDAY_FORMAT.format(date)
    : WITH_YEAR_FORMAT.format(date)
}

/**
 * Group in the order the items arrive.
 *
 * Deliberately does NOT sort: the API already applied the user's chosen sort,
 * and re-sorting here would silently override `?sort=title`. Grouping a
 * title-sorted list produces one group per meeting, which is the honest
 * rendering of that request — the caller decides whether to group at all.
 */
export function groupByDate<T>(
  items: readonly T[],
  getDate: (item: T) => string,
  now: Date = new Date(),
): Array<DateGroup<T>> {
  const groups: Array<DateGroup<T>> = []
  let current: DateGroup<T> | undefined

  for (const item of items) {
    const iso = getDate(item)
    const key = localDayKey(new Date(iso))

    if (!current || current.key !== key) {
      current = { key, label: groupHeading(iso, now), items: [] }
      groups.push(current)
    }
    current.items.push(item)
  }

  return groups
}
