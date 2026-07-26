import { describe, expect, it } from 'vitest'

import {
  CURRENT_USER_NAME,
  quickFilterParams,
  readQuickFilters,
  startOfWeek,
} from './quick-filters'

describe('startOfWeek', () => {
  it('returns Monday, not Sunday', () => {
    // Sunday-first weeks would make "This week" include the previous Monday to
    // Saturday on a Sunday, which is nobody's idea of this week.
    const thursday = new Date(2026, 6, 23, 15, 0)
    const monday = startOfWeek(thursday)

    expect(monday.getDay()).toBe(1)
    expect(monday.getDate()).toBe(20)
  })

  it('treats Sunday as the END of its week', () => {
    const sunday = new Date(2026, 6, 26, 15, 0)
    expect(startOfWeek(sunday).getDate()).toBe(20)
  })

  it('is already Monday when given a Monday', () => {
    const monday = new Date(2026, 6, 20, 15, 0)
    expect(startOfWeek(monday).getDate()).toBe(20)
  })

  it('zeroes the time so the whole first day is included', () => {
    const result = startOfWeek(new Date(2026, 6, 23, 15, 30))
    expect([result.getHours(), result.getMinutes(), result.getSeconds()]).toEqual([0, 0, 0])
  })

  it('crosses a month boundary', () => {
    const wednesday = new Date(2026, 7, 5, 12, 0)
    const monday = startOfWeek(wednesday)
    expect(monday.getMonth()).toBe(7)
    expect(monday.getDate()).toBe(3)
  })
})

describe('quickFilterParams', () => {
  const NOW = new Date(2026, 6, 23, 12, 0)

  it('nulls every chip that is off', () => {
    /*
     * The reason this returns nulls rather than only the on-values: `setFilter`
     * reads null as "remove". Returning a partial object would leave a
     * switched-off chip's parameter in the URL forever, so the chip would look
     * off while still filtering.
     */
    const params = quickFilterParams([], NOW)
    expect(Object.values(params).every((v) => v === null)).toBe(true)
    expect(Object.keys(params).sort()).toEqual(['from', 'has_action_items', 'host', 'participant'])
  })

  it('maps each chip to real API parameters', () => {
    expect(quickFilterParams(['hosted-by-me'], NOW).host).toBe(CURRENT_USER_NAME)
    expect(quickFilterParams(['shared-with-me'], NOW).participant).toBe(CURRENT_USER_NAME)
    expect(quickFilterParams(['has-action-items'], NOW).has_action_items).toBe('true')
    expect(quickFilterParams(['this-week'], NOW).from).toBe('2026-07-20')
  })

  it('combines chips rather than replacing', () => {
    const params = quickFilterParams(['hosted-by-me', 'has-action-items'], NOW)
    expect(params.host).toBe(CURRENT_USER_NAME)
    expect(params.has_action_items).toBe('true')
    expect(params.participant).toBeNull()
  })
})

describe('readQuickFilters', () => {
  it('round-trips through the URL parameters', () => {
    const active = ['hosted-by-me', 'has-action-items'] as const
    const params = quickFilterParams(active, new Date(2026, 6, 23))

    // Reading back what writing produced is what keeps the chip row and the URL
    // from disagreeing about which chips are lit.
    expect(
      readQuickFilters({
        host: params.host ?? undefined,
        hasActionItems: params.has_action_items === 'true',
      }).sort(),
    ).toEqual([...active].sort())
  })

  it('lights a chip for a hand-written URL', () => {
    // A shared link with `?host=Sarah Chen` should show "Hosted by me" active,
    // because it is — the chips read the real parameters, not a marker.
    expect(readQuickFilters({ host: CURRENT_USER_NAME })).toEqual(['hosted-by-me'])
  })

  it('does not light a chip for a different host', () => {
    expect(readQuickFilters({ host: 'Someone Else' })).toEqual([])
  })

  it('treats hasActionItems=false as not active', () => {
    // `false` is a real filter ("nothing outstanding") but it is not the chip,
    // which means "has outstanding work".
    expect(readQuickFilters({ hasActionItems: false })).toEqual([])
  })

  it('reports nothing for an empty filter set', () => {
    expect(readQuickFilters({})).toEqual([])
  })
})
