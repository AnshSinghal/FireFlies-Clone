/**
 * The dropdown's row model (T-08.3, T-08.4).
 *
 * Keyboard navigation and rendering must agree on exactly what is selectable,
 * or `↓ ↓ Enter` opens something other than the row the user can see is
 * highlighted. So the rows are computed once, as data, and both the arrow-key
 * handler and the renderer read the same array.
 */

import type { MatchRange, SearchResults } from '@/lib/api/types'
import { formatMeetingMeta } from '@/lib/utils/format'

export type SearchRowKind = 'recent' | 'action' | 'meeting' | 'transcript' | 'all'

export interface SearchRow {
  /** Stable DOM id — this is what `aria-activedescendant` points at. */
  id: string
  kind: SearchRowKind
  href: string
  label: string
  ranges?: MatchRange[]
  /** Second line: a snippet for transcripts, meta for meetings. */
  detail?: string
  detailRanges?: MatchRange[]
  meta?: string
}

export interface SearchSection {
  id: string
  /** Uppercase group heading. Absent for ungrouped rows like "See all results". */
  label?: string
  rows: SearchRow[]
}

export const QUICK_ACTIONS: ReadonlyArray<{ label: string; href: string }> = [
  { label: 'Upload a transcript', href: '/upload' },
  { label: 'Browse all meetings', href: '/notebook' },
  { label: 'Open settings', href: '/settings' },
]

/** Long enough to show context around a match, short enough not to wrap forever. */
const SNIPPET_LIMIT = 100

/**
 * Trim a snippet to `SNIPPET_LIMIT` around its first match, shifting the match
 * offsets to follow.
 *
 * Trimming without shifting is the subtle bug here: the ranges would still
 * point at the original string and highlight the wrong words — which looks like
 * a search relevance failure rather than a slicing failure.
 */
export function truncateSnippet(
  text: string,
  ranges: readonly MatchRange[],
  limit = SNIPPET_LIMIT,
): { text: string; ranges: MatchRange[] } {
  if (text.length <= limit) return { text, ranges: [...ranges] }

  const first = ranges[0]?.start ?? 0
  // Centre the window on the match, then clamp it inside the string.
  const half = Math.floor(limit / 2)
  const start = Math.max(0, Math.min(first - half, text.length - limit))
  const end = start + limit

  const sliced = text.slice(start, end)
  const prefix = start > 0 ? '…' : ''
  const shift = prefix.length - start

  return {
    text: `${prefix}${sliced}${end < text.length ? '…' : ''}`,
    ranges: ranges
      .filter((r) => r.start >= start && r.end <= end)
      .map((r) => ({ start: r.start + shift, end: r.end + shift })),
  }
}

/** Sections shown before the user types: what they searched before, and what they can do. */
export function idleSections(recent: readonly string[]): SearchSection[] {
  const sections: SearchSection[] = []

  if (recent.length > 0) {
    sections.push({
      id: 'recent',
      label: 'Recent searches',
      rows: recent.map((term, i) => ({
        id: `search-row-recent-${i}`,
        kind: 'recent',
        // A recent search re-runs the search rather than jumping to a result —
        // the meeting that matched last week may not be the one that matters now.
        href: `/search?q=${encodeURIComponent(term)}`,
        label: term,
      })),
    })
  }

  sections.push({
    id: 'actions',
    label: 'Quick actions',
    rows: QUICK_ACTIONS.map((action, i) => ({
      id: `search-row-action-${i}`,
      kind: 'action',
      href: action.href,
      label: action.label,
    })),
  })

  return sections
}

/** Sections for a completed query. Empty array means "show the empty state". */
export function resultSections(query: string, results: SearchResults): SearchSection[] {
  const sections: SearchSection[] = []

  if (results.meetings.length > 0) {
    sections.push({
      id: 'meetings',
      label: 'Meetings',
      rows: results.meetings.map((hit, i) => ({
        id: `search-row-meeting-${i}`,
        kind: 'meeting',
        href: `/meeting/${hit.id}`,
        label: hit.title,
        ranges: hit.matches,
        meta: formatMeetingMeta(hit.started_at, hit.duration_seconds),
      })),
    })
  }

  if (results.transcripts.length > 0) {
    sections.push({
      id: 'transcripts',
      label: 'Transcripts',
      rows: results.transcripts.map((hit, i) => {
        const snippet = truncateSnippet(hit.snippet, hit.matches)
        return {
          id: `search-row-transcript-${i}`,
          kind: 'transcript',
          // Deep-link to the moment, not just the meeting. `?t=` is seconds —
          // the Notepad's contract from the routes table.
          href: `/meeting/${hit.meeting_id}?t=${Math.floor(hit.start_ms / 1000)}`,
          label: hit.speaker,
          detail: snippet.text,
          detailRanges: snippet.ranges,
          meta: hit.meeting_title,
        }
      }),
    })
  }

  if (sections.length > 0) {
    sections.push({
      id: 'all',
      rows: [
        {
          id: 'search-row-all',
          kind: 'all',
          href: `/search?q=${encodeURIComponent(query)}`,
          label: `See all results for “${query}”`,
        },
      ],
    })
  }

  return sections
}

export function flattenRows(sections: readonly SearchSection[]): SearchRow[] {
  return sections.flatMap((section) => section.rows)
}
