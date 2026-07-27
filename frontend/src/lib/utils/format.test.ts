import { describe, expect, it } from 'vitest'

import {
  formatDuration,
  formatDurationLabel,
  formatFullDate,
  formatMeetingMeta,
  formatRelativeDate,
  formatTimestamp,
  parseTimeParam,
  pluralize,
} from './format'

/** Fixed reference point, so nothing here depends on the day the suite runs. */
const NOW = new Date(2026, 6, 26, 14, 30) // Sun 26 Jul 2026, 14:30 local

describe('formatDuration', () => {
  // T06-A / T06-B / T06-C / T06-D
  it.each([
    [2_538_000, '42:18'],
    [3_932_000, '1:05:32'],
    [0, '0:00'],
    [999, '0:00'],
    [1000, '0:01'],
    [59_000, '0:59'],
    [60_000, '1:00'],
    [599_000, '9:59'],
    [600_000, '10:00'],
  ])('formats %ims as %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected)
  })

  it('rolls over to hours at exactly one hour, not 60:00', () => {
    // The classic off-by-one. 59:59 must stay in minutes; 1:00:00 must not
    // render as 60:00, and the second either side must be right too.
    expect(formatDuration(3_599_000)).toBe('59:59')
    expect(formatDuration(3_600_000)).toBe('1:00:00')
    expect(formatDuration(3_601_000)).toBe('1:00:01')
  })

  it('pads sub-units but never the leading one', () => {
    expect(formatDuration(3_723_000)).toBe('1:02:03')
    expect(formatDuration(36_000_000)).toBe('10:00:00')
  })

  it('floors rather than rounds, so a partial second never inflates', () => {
    expect(formatDuration(1999)).toBe('0:01')
  })

  it('survives nonsense input rather than rendering NaN:NaN', () => {
    expect(formatDuration(-5)).toBe('0:00')
    expect(formatDuration(Number.NaN)).toBe('0:00')
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('0:00')
  })
})

describe('formatTimestamp', () => {
  it('always pads minutes, unlike formatDuration', () => {
    // Transcript timestamps sit in a right-aligned column; a variable-width
    // leading digit makes the column ragged even with tabular numerals.
    expect(formatTimestamp(272_000)).toBe('04:32')
    expect(formatTimestamp(0)).toBe('00:00')
    expect(formatTimestamp(14_000)).toBe('00:14')
  })

  it('grows to hours only when needed', () => {
    expect(formatTimestamp(3_599_000)).toBe('59:59')
    expect(formatTimestamp(3_600_000)).toBe('1:00:00')
  })
})

describe('parseTimeParam', () => {
  it('round-trips a deep-link ?t= value in seconds', () => {
    expect(parseTimeParam('125')).toBe(125_000)
    expect(parseTimeParam('0')).toBe(0)
  })

  it('rejects anything that is not a usable offset', () => {
    for (const bad of [null, '', 'abc', '-5', 'NaN']) {
      expect(parseTimeParam(bad)).toBeNull()
    }
  })

  it('floors fractional seconds', () => {
    expect(parseTimeParam('12.9')).toBe(12_000)
  })
})

describe('formatRelativeDate', () => {
  // T06-E — four distinct branches.
  it('says Today for any time today, however long ago', () => {
    expect(formatRelativeDate('2026-07-26T09:00:00', NOW)).toBe('Today')
    // 14 hours earlier, still the same calendar day.
    expect(formatRelativeDate('2026-07-26T00:30:00', NOW)).toBe('Today')
  })

  it('says Yesterday by calendar day, not by elapsed hours', () => {
    // 15.5 hours ago, but a different calendar day — "Yesterday", not "Today".
    expect(formatRelativeDate('2026-07-25T23:00:00', NOW)).toBe('Yesterday')
    expect(formatRelativeDate('2026-07-25T00:01:00', NOW)).toBe('Yesterday')
  })

  it('drops the year within the current year', () => {
    expect(formatRelativeDate('2026-07-24T10:00:00', NOW)).toBe('Jul 24')
    expect(formatRelativeDate('2026-01-02T10:00:00', NOW)).toBe('Jan 2')
  })

  it('includes the year for prior years', () => {
    expect(formatRelativeDate('2025-07-24T10:00:00', NOW)).toBe('Jul 24, 2025')
    // 31 Dec is one day before 1 Jan but a different year — must not say
    // "Yesterday" without a year if the day gap happens to be larger.
    expect(formatRelativeDate('2025-12-15T10:00:00', NOW)).toBe('Dec 15, 2025')
  })

  it('handles the year boundary as a calendar day, not a year comparison', () => {
    const newYearsDay = new Date(2026, 0, 1, 10, 0)
    expect(formatRelativeDate('2025-12-31T22:00:00', newYearsDay)).toBe('Yesterday')
  })

  it('returns empty rather than "Invalid Date" for junk', () => {
    expect(formatRelativeDate('not-a-date', NOW)).toBe('')
  })
})

describe('formatFullDate', () => {
  it('spells the date out for the hover tooltip', () => {
    const full = formatFullDate('2026-07-24T10:00:00')
    expect(full).toContain('Friday')
    expect(full).toContain('July')
    expect(full).toContain('2026')
    expect(full).toContain('at')
  })
})

describe('formatDurationLabel', () => {
  /*
   * The four cases below are read straight off `docs/reference/fireflies/02.png`
   * — 30, 12, 55 and 17 minutes. Keeping the reference's own numbers means a
   * regression here fails against the artifact this project is graded on rather
   * than against a number someone invented.
   */
  it.each([
    [1800, '30 min'],
    [720, '12 min'],
    [3300, '55 min'],
    [1020, '17 min'],
  ])('renders %i seconds as the reference labels it: %s', (seconds, expected) => {
    expect(formatDurationLabel(seconds * 1000)).toBe(expected)
  })

  it('rounds to the nearest minute rather than truncating', () => {
    // 7:13 is nearer 7 than 8; 7:45 is nearer 8. Truncation would call both 7.
    expect(formatDurationLabel(433 * 1000)).toBe('7 min')
    expect(formatDurationLabel(465 * 1000)).toBe('8 min')
  })

  it('says "< 1 min" rather than "0 min" for a very short meeting', () => {
    // A real two-minute standup that overran by nothing is plausible; a meeting
    // labelled "0 min" reads as a bug in the app rather than a short meeting.
    expect(formatDurationLabel(20 * 1000)).toBe('< 1 min')
    expect(formatDurationLabel(29 * 1000)).toBe('< 1 min')
    expect(formatDurationLabel(30 * 1000)).toBe('1 min')
  })

  it('drops the empty minute on an exact hour', () => {
    expect(formatDurationLabel(3600 * 1000)).toBe('1 hr')
    expect(formatDurationLabel(7200 * 1000)).toBe('2 hr')
  })

  it('carries hours and minutes together otherwise', () => {
    expect(formatDurationLabel(3900 * 1000)).toBe('1 hr 5 min')
    expect(formatDurationLabel(5415 * 1000)).toBe('1 hr 30 min')
  })

  it("never emits a colon — that is formatDuration's job", () => {
    // The two are easy to confuse at a call site, and confusing them is exactly
    // the defect ADR-148 records. This is the cheap guard against a silent swap.
    for (const seconds of [0, 45, 433, 1800, 3600, 5415]) {
      expect(formatDurationLabel(seconds * 1000)).not.toContain(':')
    }
  })
})

describe('formatMeetingMeta', () => {
  it('matches the reference screenshots: "Jul 25 · 9:00 AM · 30 min"', () => {
    // The full line from `docs/reference/fireflies/02.png`, minus the host.
    const meta = formatMeetingMeta('2026-07-24T09:00:00', 1800, NOW)
    expect(meta).toBe('Jul 24 · 9:00 AM · 30 min')
  })

  it('joins date, time and duration with the separator the design uses', () => {
    const meta = formatMeetingMeta('2026-07-26T10:00:00', 2538, NOW)
    expect(meta).toContain('Today')
    expect(meta).toContain('42 min')
    expect(meta.split(' · ')).toHaveLength(3)
  })
})

describe('pluralize', () => {
  it.each([
    [1, '1 participant'],
    [0, '0 participants'],
    [5, '5 participants'],
  ])('%i -> %s', (count, expected) => {
    expect(pluralize(count, 'participant')).toBe(expected)
  })

  it('accepts an irregular plural', () => {
    expect(pluralize(2, 'person', 'people')).toBe('2 people')
  })
})
