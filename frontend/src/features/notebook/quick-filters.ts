/**
 * Quick-filter chips ↔ URL parameters (T-12.3).
 *
 * A chip is a NAMED COMBINATION of real API filters, not a filter of its own —
 * "This week" is `from=<monday>`, "Hosted by me" is `host=<current user>`. The
 * translation lives here, in one direction each way, so the chip row and the
 * URL can never disagree about which chips are lit.
 *
 * The alternative — a `?quick=this-week` parameter the server has to
 * understand — would put presentation vocabulary into the API.
 */

import type { MeetingFilters } from '@/lib/api/query-keys'
import type { QuickFilterId } from './notebook-toolbar'

/**
 * The seeded demo user. Hardcoded because there is no auth in this build
 * (T-08.6's Sign out says so out loud), and inventing a login to derive one
 * name would be a bigger lie than naming it.
 */
export const CURRENT_USER_NAME = 'Sarah Chen'

/** Monday of the week containing `now`, at 00:00 local. */
export function startOfWeek(now: Date): Date {
  const date = new Date(now)
  // getDay() is Sunday-first; shift so Monday is 0.
  const offset = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - offset)
  date.setHours(0, 0, 0, 0)
  return date
}

function isoDate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Which chips the current URL implies.
 *
 * Read back from the REAL parameters rather than from a separate marker, so a
 * hand-edited or shared URL lights the right chips — a link with `?host=Sarah
 * Chen` should show "Hosted by me" as active, because it is.
 */
export function readQuickFilters(filters: MeetingFilters): QuickFilterId[] {
  const active: QuickFilterId[] = []

  if (filters.host === CURRENT_USER_NAME) active.push('hosted-by-me')
  if (filters.participant === CURRENT_USER_NAME) active.push('shared-with-me')
  if (filters.hasActionItems === true) active.push('has-action-items')
  if (filters.from) active.push('this-week')

  return active
}

/**
 * The parameter updates that make exactly `active` true.
 *
 * Returns `null` for every chip that is OFF, because `setFilter` treats null as
 * "remove" — returning only the on-values would leave a switched-off chip's
 * parameter in the URL forever.
 */
export function quickFilterParams(
  active: readonly QuickFilterId[],
  now: Date = new Date(),
): Record<string, string | null> {
  return {
    host: active.includes('hosted-by-me') ? CURRENT_USER_NAME : null,
    participant: active.includes('shared-with-me') ? CURRENT_USER_NAME : null,
    has_action_items: active.includes('has-action-items') ? 'true' : null,
    from: active.includes('this-week') ? isoDate(startOfWeek(now)) : null,
  }
}
