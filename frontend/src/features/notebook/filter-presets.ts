/**
 * Filter presets ↔ URL parameters (T-13.3, T-13.8).
 *
 * A preset is a NAMED RANGE, not a filter of its own: "Last 7 days" is
 * `from=<six days ago>`, "< 15 min" is `max_duration=900`. The translation runs
 * in both directions here, so loading a shared URL cold reconstructs the exact
 * panel state (T13-K) — the panel reads the real parameters rather than a
 * separate marker the server would also have to understand.
 *
 * Everything is `now`-injectable, so the boundaries are tested at a fixed
 * instant rather than against whatever day the suite runs on.
 */

import type { MeetingFilters } from '@/lib/api/query-keys'

import type { FilterDraft } from './filters-panel'

export const DATE_PRESET_IDS = [
  'any-time',
  'today',
  'yesterday',
  'last-7-days',
  'last-30-days',
  'this-month',
  'custom',
] as const

export type DatePresetId = (typeof DATE_PRESET_IDS)[number]

export interface DurationPreset {
  id: string
  label: string
  min?: number
  max?: number
}

/** Seconds. Contiguous and non-overlapping, so no meeting falls in two buckets. */
export const DURATION_PRESETS: readonly DurationPreset[] = [
  { id: 'any', label: 'Any' },
  { id: 'under-15', label: '< 15 min', max: 15 * 60 },
  { id: '15-30', label: '15–30 min', min: 15 * 60, max: 30 * 60 },
  { id: '30-60', label: '30–60 min', min: 30 * 60, max: 60 * 60 },
  { id: 'over-60', label: '> 60 min', min: 60 * 60 },
]

function isoDate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

/**
 * `from`/`to` for a preset. `null` means "do not constrain that end".
 *
 * "Last 7 days" is six days back PLUS today — the classic off-by-one, and the
 * one that is invisible in the UI because the result still looks plausible.
 */
export function datePresetRange(
  id: DatePresetId,
  now: Date,
): { from: string | null; to: string | null } {
  switch (id) {
    case 'today':
      return { from: isoDate(now), to: isoDate(now) }
    case 'yesterday': {
      const day = isoDate(addDays(now, -1))
      return { from: day, to: day }
    }
    case 'last-7-days':
      return { from: isoDate(addDays(now, -6)), to: isoDate(now) }
    case 'last-30-days':
      return { from: isoDate(addDays(now, -29)), to: isoDate(now) }
    case 'this-month':
      return { from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDate(now) }
    default:
      // `any-time` and `custom` both mean "the presets do not decide this".
      return { from: null, to: null }
  }
}

/**
 * Which preset a `from`/`to` pair came from.
 *
 * Recognising the range rather than storing the preset name is what makes a
 * shared URL reconstruct the panel: `?from=2026-07-21&to=2026-07-27` lights
 * "Last 7 days" because that is what it is.
 */
export function recognizeDatePreset(
  from: string | undefined,
  to: string | undefined,
  now: Date,
): DatePresetId {
  if (!from && !to) return 'any-time'

  for (const id of DATE_PRESET_IDS) {
    if (id === 'any-time' || id === 'custom') continue
    const range = datePresetRange(id, now)
    if (range.from === (from ?? null) && range.to === (to ?? null)) return id
  }
  return 'custom'
}

export function recognizeDurationPreset(min: number | undefined, max: number | undefined): string {
  if (min === undefined && max === undefined) return 'any'
  const match = DURATION_PRESETS.find((preset) => preset.min === min && preset.max === max)
  return match?.id ?? 'any'
}

/** The applied URL state, read back into the shape the panel edits. */
export function draftFromFilters(filters: MeetingFilters, now: Date = new Date()): FilterDraft {
  return {
    // The API takes ONE host and ONE participant; the panel offers multi-select
    // because that is what the spec asks for, and sends the first. Widening the
    // API to accept repeated values is T-35's business — until then the panel
    // does not pretend the extra selections did something.
    hosts: filters.host ? [filters.host] : [],
    participants: filters.participant ? [filters.participant] : [],
    datePreset: recognizeDatePreset(filters.from, filters.to, now),
    from: filters.from,
    to: filters.to,
    durationPreset: recognizeDurationPreset(filters.minDuration, filters.maxDuration),
    tags: filters.tags ?? [],
    channel: filters.channel,
    hasActionItems: filters.hasActionItems === true,
  }
}

/** The panel's draft, written back out as URL parameters. */
export function filtersFromDraft(
  draft: FilterDraft,
  now: Date = new Date(),
): Record<string, string | string[] | null> {
  const dates =
    draft.datePreset === 'custom'
      ? { from: draft.from ?? null, to: draft.to ?? null }
      : datePresetRange(draft.datePreset, now)

  const duration = DURATION_PRESETS.find((preset) => preset.id === draft.durationPreset)

  return {
    host: draft.hosts[0] ?? null,
    participant: draft.participants[0] ?? null,
    from: dates.from,
    to: dates.to,
    min_duration: duration?.min !== undefined ? String(duration.min) : null,
    max_duration: duration?.max !== undefined ? String(duration.max) : null,
    tags: draft.tags.length > 0 ? draft.tags : null,
    channel: draft.channel ?? null,
    // Only ever `true` or absent: `false` would filter to meetings with nothing
    // outstanding, which is not what an unchecked switch means.
    has_action_items: draft.hasActionItems ? 'true' : null,
  }
}

export interface ActiveFilterChip {
  /** The URL keys this chip owns. Removing it nulls all of them. */
  keys: string[]
  id: string
  label: string
}

/**
 * The dismissible chips above the list (T-13.7).
 *
 * A chip owns whichever KEYS produced it, so removing "Last 7 days" clears both
 * `from` and `to` — removing only one would leave a half-range that filters
 * something nobody asked for.
 */
export function activeFilterChips(
  filters: MeetingFilters,
  now: Date = new Date(),
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = []

  if (filters.host) {
    chips.push({ keys: ['host'], id: 'host', label: `Host: ${filters.host}` })
  }
  if (filters.participant) {
    chips.push({
      keys: ['participant'],
      id: 'participant',
      label: `Participant: ${filters.participant}`,
    })
  }

  if (filters.from || filters.to) {
    const preset = recognizeDatePreset(filters.from, filters.to, now)
    chips.push({
      keys: ['from', 'to'],
      id: 'date',
      label:
        preset === 'custom'
          ? `${filters.from ?? 'Any'} – ${filters.to ?? 'Any'}`
          : DATE_LABELS[preset],
    })
  }

  if (filters.minDuration !== undefined || filters.maxDuration !== undefined) {
    const preset = DURATION_PRESETS.find(
      (p) => p.min === filters.minDuration && p.max === filters.maxDuration,
    )
    chips.push({
      keys: ['min_duration', 'max_duration'],
      id: 'duration',
      label: preset ? preset.label : 'Custom duration',
    })
  }

  for (const tag of filters.tags ?? []) {
    // Each tag is its own chip: they are independent ANDs, so removing one
    // must not clear the rest.
    chips.push({ keys: [`tags:${tag}`], id: `tag-${tag}`, label: `#${tag}` })
  }

  if (filters.channel) {
    chips.push({ keys: ['channel'], id: 'channel', label: `#${filters.channel}` })
  }
  if (filters.hasActionItems === true) {
    chips.push({ keys: ['has_action_items'], id: 'action-items', label: 'Has action items' })
  }

  return chips
}

const DATE_LABELS: Record<DatePresetId, string> = {
  'any-time': 'Any time',
  today: 'Today',
  yesterday: 'Yesterday',
  'last-7-days': 'Last 7 days',
  'last-30-days': 'Last 30 days',
  'this-month': 'This month',
  custom: 'Custom range',
}
