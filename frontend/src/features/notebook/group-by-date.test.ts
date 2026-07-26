import { describe, expect, it } from 'vitest'

import { groupByDate, groupHeading, localDayKey } from './group-by-date'

const NOW = new Date('2026-07-26T12:00:00')

function at(iso: string) {
  return { started_at: iso }
}

describe('localDayKey', () => {
  it('uses the LOCAL day, not the UTC one', () => {
    /*
     * The bug this guards: `toISOString().slice(0, 10)` is the UTC date, so a
     * meeting at 20:00 local in a positive offset lands under tomorrow — and
     * the group heading then disagrees with the time printed inside the card.
     */
    const evening = new Date(2026, 6, 25, 20, 0)
    expect(localDayKey(evening)).toBe('2026-07-25')

    const earlyMorning = new Date(2026, 6, 25, 0, 30)
    expect(localDayKey(earlyMorning)).toBe('2026-07-25')
  })

  it('zero-pads so keys sort lexicographically', () => {
    expect(localDayKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('groupHeading', () => {
  it('reuses Today and Yesterday', () => {
    // Shared with `formatRelativeDate`, so a heading and the card's own date
    // cell cannot disagree about what day it is.
    expect(groupHeading('2026-07-26T09:00:00', NOW)).toBe('Today')
    expect(groupHeading('2026-07-25T09:00:00', NOW)).toBe('Yesterday')
  })

  it('names the weekday for other days this year', () => {
    expect(groupHeading('2026-07-23T09:00:00', NOW)).toMatch(/^\w{3}, Jul 23$/)
  })

  it('adds the year once it is not this one', () => {
    expect(groupHeading('2025-07-23T09:00:00', NOW)).toContain('2025')
  })
})

describe('groupByDate', () => {
  it('groups consecutive items from the same day', () => {
    const groups = groupByDate(
      [at('2026-07-26T09:00:00'), at('2026-07-26T14:00:00'), at('2026-07-25T09:00:00')],
      (m) => m.started_at,
      NOW,
    )

    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday'])
    expect(groups[0]!.items).toHaveLength(2)
    expect(groups[1]!.items).toHaveLength(1)
  })

  it('preserves the incoming order and does NOT sort', () => {
    /*
     * The API already applied the user's chosen sort. Re-sorting here would
     * silently override `?sort=title` — the list would claim to be
     * alphabetical and be chronological.
     */
    const groups = groupByDate(
      [at('2026-07-20T09:00:00'), at('2026-07-26T09:00:00')],
      (m) => m.started_at,
      NOW,
    )
    expect(groups.map((g) => g.key)).toEqual(['2026-07-20', '2026-07-26'])
  })

  it('starts a new group when a day recurs non-consecutively', () => {
    // Grouping runs over the given order, so an interleaved list produces
    // repeated headings rather than silently merging distant items.
    const groups = groupByDate(
      [at('2026-07-26T09:00:00'), at('2026-07-25T09:00:00'), at('2026-07-26T15:00:00')],
      (m) => m.started_at,
      NOW,
    )
    expect(groups).toHaveLength(3)
  })

  it('handles an empty list', () => {
    expect(groupByDate([], (m: { started_at: string }) => m.started_at, NOW)).toEqual([])
  })

  it('gives every group a key usable as a React key', () => {
    const groups = groupByDate(
      [at('2026-07-26T09:00:00'), at('2026-07-25T09:00:00')],
      (m) => m.started_at,
      NOW,
    )
    const keys = groups.map((g) => g.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
