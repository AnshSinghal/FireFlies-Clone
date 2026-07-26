/**
 * Highlighter — wraps matched substrings in `<mark>` (T-08.10, T-10.9).
 *
 * The rule this primitive exists to enforce: **never** `dangerouslySetInnerHTML`
 * with search text. Transcripts are user content; the first meeting where
 * someone reads out an HTML tag would otherwise inject it into the dropdown.
 * Splitting into text nodes means the browser renders `<script>` as five
 * visible characters, which is the correct outcome.
 *
 * Two ways to say what to highlight:
 *   - `ranges` — character offsets, which is what the search API returns. It
 *     knows the FTS stemming rules ("pricing" matching "priced"), so the client
 *     must not try to re-derive them.
 *   - `query` — a literal substring, for text the API did not annotate.
 */

import { Fragment, type ReactNode } from 'react'

export interface HighlightRange {
  start: number
  end: number
}

interface HighlighterProps {
  text: string
  /** Server-supplied offsets. Takes precedence over `query`. */
  ranges?: readonly HighlightRange[]
  /** Literal substring to match, case-insensitively. Ignored when `ranges` is set. */
  query?: string
  className?: string
  /** Applied to each `<mark>`; defaults to the accent-tinted style. */
  markClassName?: string
  /**
   * Which match is the CURRENT one (T-10.9), for the transcript find bar's
   * "3 of 17". That match gets `--ff-highlight-active`; the rest stay muted.
   * Out of range means no match is active, which is the correct state before
   * the user has stepped to one.
   */
  activeIndex?: number
}

/**
 * Case-insensitive literal-substring offsets.
 *
 * Exported for testing, and deliberately not a regex: a user searching for
 * `c++` or `(draft)` means those characters. Building a `RegExp` from input
 * either throws on unbalanced parens or matches the wrong thing.
 */
export function findRanges(text: string, query: string): HighlightRange[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []

  const haystack = text.toLowerCase()
  const ranges: HighlightRange[] = []

  let from = 0
  while (from <= haystack.length - needle.length) {
    const at = haystack.indexOf(needle, from)
    if (at === -1) break
    ranges.push({ start: at, end: at + needle.length })
    from = at + needle.length
  }
  return ranges
}

/**
 * Split text into alternating plain and highlighted spans.
 *
 * Ranges from the server are trusted for *content* but not for *bounds* —
 * clamped and merged here so an off-by-one or an overlap produces slightly
 * wrong emphasis rather than dropped or duplicated characters.
 */
export function splitByRanges(
  text: string,
  ranges: readonly HighlightRange[],
): Array<{ text: string; match: boolean; matchIndex?: number }> {
  const clean = ranges
    .map((r) => ({
      start: Math.max(0, Math.min(r.start, text.length)),
      end: Math.max(0, Math.min(r.end, text.length)),
    }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start)

  const merged: HighlightRange[] = []
  for (const range of clean) {
    const last = merged.at(-1)
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end)
    else merged.push({ ...range })
  }

  if (merged.length === 0) return text ? [{ text, match: false }] : []

  const parts: Array<{ text: string; match: boolean; matchIndex?: number }> = []
  let cursor = 0
  // Counted AFTER merging, so `activeIndex` refers to what the user can
  // actually see and step through — two overlapping ranges are one highlight.
  let matchIndex = 0
  for (const range of merged) {
    if (range.start > cursor) parts.push({ text: text.slice(cursor, range.start), match: false })
    parts.push({ text: text.slice(range.start, range.end), match: true, matchIndex: matchIndex++ })
    cursor = range.end
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false })

  return parts
}

export function Highlighter({
  text,
  ranges,
  query,
  className,
  markClassName = 'bg-accent-subtle font-semibold text-accent',
  activeIndex,
}: HighlighterProps): ReactNode {
  const effective = ranges ?? (query ? findRanges(text, query) : [])
  const parts = splitByRanges(text, effective)

  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.match ? (
          // `rounded-none` because a `<mark>` inside a single word should not
          // look like a separate chip.
          <mark
            key={i}
            data-match-index={part.matchIndex}
            data-active={part.matchIndex === activeIndex || undefined}
            className={
              part.matchIndex === activeIndex
                ? 'rounded-none bg-highlight-active font-semibold text-primary'
                : `rounded-none bg-transparent ${markClassName}`
            }
          >
            {part.text}
          </mark>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </span>
  )
}
