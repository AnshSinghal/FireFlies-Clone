/**
 * Notebook sort options — the values the API accepts, with their labels.
 *
 * Lives in `lib` rather than `features/notebook` because two features need it
 * (the Notebook toolbar and Settings → Preferences), and features must not
 * import each other. Whatever both sides speak belongs below both.
 */

export const SORT_OPTIONS = [
  { value: '-started_at', label: 'Newest first' },
  { value: 'started_at', label: 'Oldest first' },
  { value: '-duration_seconds', label: 'Longest first' },
  { value: 'duration_seconds', label: 'Shortest first' },
  { value: 'title', label: 'Title A–Z' },
  { value: '-title', label: 'Title Z–A' },
] as const

export type SortValue = (typeof SORT_OPTIONS)[number]['value']

export const DEFAULT_SORT: SortValue = '-started_at'

export function isSortValue(value: string): value is SortValue {
  return SORT_OPTIONS.some((option) => option.value === value)
}
