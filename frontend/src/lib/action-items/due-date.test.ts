import { describe, expect, it } from 'vitest'

import { describeDueDate } from './due-date'

/** The clock the seed and the e2e suite are pinned to. */
const NOW = new Date(2026, 6, 26, 9, 0) // 26 July 2026, local

describe('describeDueDate', () => {
  it('says nothing at all when there is no due date', () => {
    // Not "No due date": a badge that exists to say there is nothing to say.
    expect(describeDueDate(null, NOW)).toBeNull()
  })

  it('calls today today', () => {
    expect(describeDueDate('2026-07-26', NOW)).toEqual({ tone: 'today', label: 'Due today' })
  })

  it('counts overdue days, singular and plural', () => {
    expect(describeDueDate('2026-07-25', NOW)).toEqual({
      tone: 'overdue',
      label: '1 day overdue',
    })
    expect(describeDueDate('2026-07-23', NOW)).toEqual({
      tone: 'overdue',
      label: '3 days overdue',
    })
  })

  it('names tomorrow rather than dating it', () => {
    expect(describeDueDate('2026-07-27', NOW)).toEqual({
      tone: 'upcoming',
      label: 'Due tomorrow',
    })
  })

  it('dates anything further out', () => {
    expect(describeDueDate('2026-07-30', NOW)).toEqual({ tone: 'upcoming', label: 'Due Jul 30' })
    expect(describeDueDate('2026-09-02', NOW)).toEqual({ tone: 'upcoming', label: 'Due Sep 2' })
  })

  it('treats the due date as LOCAL, not UTC', () => {
    /*
     * `new Date('2026-07-26')` is UTC midnight — the evening of the 25th in
     * every timezone west of Greenwich — so the naive parse reports a task due
     * today as overdue for a third of the world.
     *
     * Checked late in the day, when a UTC-based parse has already rolled over.
     */
    const lateEvening = new Date(2026, 6, 26, 23, 30)
    expect(describeDueDate('2026-07-26', lateEvening)?.tone).toBe('today')
  })

  it('compares calendar days, not elapsed hours', () => {
    // Due tomorrow, checked one minute before midnight: still one day away,
    // even though barely an hour separates them.
    const almostMidnight = new Date(2026, 6, 26, 23, 59)
    expect(describeDueDate('2026-07-27', almostMidnight)?.label).toBe('Due tomorrow')
  })

  it('ignores a malformed value rather than rendering NaN', () => {
    expect(describeDueDate('not-a-date', NOW)).toBeNull()
    expect(describeDueDate('', NOW)).toBeNull()
  })
})
