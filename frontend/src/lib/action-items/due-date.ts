/**
 * How a due date is described (T-24.9).
 *
 * Three tones, because "due in a month" and "three days overdue" are not the
 * same information rendered differently — one is a note and the other is a
 * problem. A list that styles them identically makes the reader do the date
 * arithmetic themselves, every time.
 *
 * No due date renders NOTHING. Not the string "No due date", which takes up a
 * badge's worth of space to say there is nothing to say.
 */

export type DueTone = 'overdue' | 'today' | 'upcoming'

export interface DueDescription {
  tone: DueTone
  label: string
}

const MS_PER_DAY = 86_400_000

/**
 * Whole days between two dates, ignoring the time of day.
 *
 * Built from the calendar fields rather than by dividing a millisecond
 * difference: across a daylight-saving boundary a "day" is 23 or 25 hours, and
 * the division version reports "1 day overdue" for something due this morning.
 */
function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.round((b - a) / MS_PER_DAY)
}

/**
 * @param dueDate  an ISO `YYYY-MM-DD` — a DATE, with no time and no zone.
 * @param now      injected so the description is testable and so the whole app
 *                 can be pinned to one clock in e2e.
 */
export function describeDueDate(
  dueDate: string | null,
  now: Date = new Date(),
): DueDescription | null {
  if (!dueDate) return null

  /*
   * Parsed as LOCAL midnight, deliberately.
   *
   * `new Date('2026-07-30')` parses as UTC midnight, which is the previous
   * evening anywhere west of Greenwich — so a task due today reads as overdue
   * for a third of the world. Splitting the parts sidesteps that entirely.
   */
  const [year, month, day] = dueDate.split('-').map(Number)
  if (!year || !month || !day) return null

  const due = new Date(year, month - 1, day)
  const days = daysBetween(now, due)

  if (days === 0) return { tone: 'today', label: 'Due today' }

  if (days < 0) {
    const overdue = Math.abs(days)
    return {
      tone: 'overdue',
      label: overdue === 1 ? '1 day overdue' : `${overdue} days overdue`,
    }
  }

  if (days === 1) return { tone: 'upcoming', label: 'Due tomorrow' }

  return {
    tone: 'upcoming',
    // `Due Jul 30` — the month is what makes a date scannable at a glance, and
    // the year is noise for anything inside the next twelve months.
    label: `Due ${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
  }
}
