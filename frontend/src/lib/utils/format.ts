/**
 * Formatting at the presentation edge (T-06.12).
 *
 * The API deals in integer milliseconds and UTC ISO-8601 strings; nothing is
 * pre-formatted server-side. These are the only functions that turn those into
 * something a person reads, which is why the off-by-one cases below are
 * covered exhaustively — an hour-boundary bug in `formatDuration` is invisible
 * in review and obvious in a screenshot.
 */

const MS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 3600

/**
 * A duration, as the Notebook and player show it: `42:18`, `1:05:32`, `0:00`.
 *
 * No leading zero on the largest unit — `42:18` not `042:18`, `1:05:32` not
 * `01:05:32`. Seconds and minutes below the largest unit ARE zero-padded, or
 * `1:5:32` would read as ambiguous.
 *
 * Sub-second values floor to `0:00` rather than rounding up, so a 999ms segment
 * does not claim to be a second long.
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00'

  const totalSeconds = Math.floor(ms / MS_PER_SECOND)
  const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR)
  const minutes = Math.floor((totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)
  const seconds = totalSeconds % SECONDS_PER_MINUTE

  const paddedSeconds = String(seconds).padStart(2, '0')

  if (hours > 0) {
    // Exactly one hour is 1:00:00, never 60:00 — the classic boundary bug.
    return `${hours}:${String(minutes).padStart(2, '0')}:${paddedSeconds}`
  }
  return `${minutes}:${paddedSeconds}`
}

/**
 * How long a meeting was, as the reference screenshots label it: `30 min`,
 * `1 hr 5 min`, `1 hr`.
 *
 * NOT the same thing as `formatDuration`, and the distinction is the point.
 * `M:SS` answers "where am I in this recording" — it is a position, it belongs
 * next to a scrubber, and it needs second-level precision. "How long was that
 * meeting" is a different question, nobody answers it in seconds, and
 * `docs/reference/fireflies/02.png` answers it as `30 min` on every row of the
 * list this project is graded against (see ADR-148).
 *
 * Rounds to the nearest minute, because a label claiming `7 min` for 7:13 is
 * right and one claiming `7:13` is answering a question nobody asked. Anything
 * under a minute reads `< 1 min` rather than `0 min`, which would look broken
 * on a legitimately short meeting.
 */
export function formatDurationLabel(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0 min'

  const totalMinutes = Math.round(ms / MS_PER_SECOND / SECONDS_PER_MINUTE)
  if (totalMinutes < 1) return '< 1 min'

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours === 0) return `${minutes} min`
  // `1 hr` on the exact hour — "1 hr 0 min" is how a machine says it.
  if (minutes === 0) return `${hours} hr`
  return `${hours} hr ${minutes} min`
}

/**
 * A position within a recording, as the transcript shows it.
 *
 * Always `MM:SS` under an hour — `04:32`, not `4:32` — because these sit in a
 * right-aligned column and a variable-width leading digit makes the column
 * ragged even with tabular numerals.
 */
export function formatTimestamp(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '00:00'

  const totalSeconds = Math.floor(ms / MS_PER_SECOND)
  const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR)
  const minutes = Math.floor((totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)
  const seconds = totalSeconds % SECONDS_PER_MINUTE

  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')

  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}

/** `formatTimestamp` in reverse — parses a deep-link `?t=` value in seconds. */
export function parseTimeParam(value: string | null): number | null {
  if (!value) return null
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds < 0) return null
  return Math.floor(seconds) * MS_PER_SECOND
}

// ── Dates ───────────────────────────────────────────────────────────────────

/*
 * en-US throughout, matched to the reference screenshots — they show
 * "Jul 25 · 9:00 AM", not "25 Jul · 9:00 am". This is a deliberate pin to the
 * design rather than a fallback to the runtime locale, which would render
 * differently on the evaluator's machine than in the visual-regression
 * baselines. Real localisation would replace these wholesale.
 */
export const LOCALE = 'en-US'

const TIME_FORMAT = new Intl.DateTimeFormat(LOCALE, {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

const SAME_YEAR_FORMAT = new Intl.DateTimeFormat(LOCALE, { month: 'short', day: 'numeric' })

const OTHER_YEAR_FORMAT = new Intl.DateTimeFormat(LOCALE, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

const FULL_FORMAT = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
})

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** Whole days between two instants, comparing calendar days rather than 24h spans. */
function calendarDaysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to) - startOfDay(from)) / 86_400_000)
}

/**
 * A meeting's date, as the Notebook row shows it.
 *
 * `Today` · `Yesterday` · `Jul 24` (this year) · `Jul 24, 2025` (prior years).
 *
 * Comparison is by CALENDAR DAY, not elapsed hours: a meeting at 23:00 last
 * night is "Yesterday" at 01:00 even though it was two hours ago, and a meeting
 * at 09:00 today is "Today" at 23:00 even though it was fourteen hours ago.
 *
 * `now` is injectable so tests are not hostage to the clock — the same reason
 * the seeder takes an anchor date.
 */
export function formatRelativeDate(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''

  const days = calendarDaysBetween(date, now)

  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'

  return date.getFullYear() === now.getFullYear()
    ? SAME_YEAR_FORMAT.format(date)
    : OTHER_YEAR_FORMAT.format(date)
}

/** `10:00 am` — the time half of a meeting's metadata line. */
export function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return TIME_FORMAT.format(date)
}

/**
 * The unabbreviated form, for the tooltip on a relative date.
 *
 * `Today` is friendly but ambiguous when you are scanning for a specific
 * meeting; hovering should give you the real answer.
 */
export function formatFullDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${FULL_FORMAT.format(date)} at ${TIME_FORMAT.format(date)}`
}

/** `Jul 25 · 9:00 AM · 30 min` — the metadata line, exactly as the reference has it. */
export function formatMeetingMeta(iso: string, durationSeconds: number, now?: Date): string {
  return [
    formatRelativeDate(iso, now),
    formatTime(iso),
    formatDurationLabel(durationSeconds * MS_PER_SECOND),
  ]
    .filter(Boolean)
    .join(' · ')
}

/** `5 participants` / `1 participant` — pluralisation without a library. */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}
