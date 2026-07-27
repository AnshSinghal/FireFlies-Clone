/**
 * One non-overlapping span list per transcript line (T-32.4).
 *
 * This is the hard part of T-32, and it is solved ONCE, here, because every
 * naive version of it is wrong in the same way. A segment can carry:
 *
 *   - user highlights — stored character ranges, possibly several, possibly
 *     overlapping each other;
 *   - search marks — derived ranges from the find bar, which move as the user
 *     types and are indexed so the bar can say "3 of 17".
 *
 * Rendering them as nested elements — a `<mark>` inside a highlight `<span>`
 * inside another `<mark>` — is what produces the broken markup T-32's ❌ list
 * names. It also loses characters at the seams the moment two ranges partially
 * overlap, because each renderer only knows about its own ranges.
 *
 * So neither is rendered on top of the other. Both are FLATTENED into a single
 * ordered list of disjoint spans covering the text exactly once, each carrying
 * what applies to it, and the renderer emits one element per span. The two
 * channels then coexist visually rather than structurally: a search hit is a
 * background, a highlight is a wash plus an underline, and a span with both
 * shows both.
 *
 * The invariant every test here asserts: concatenating `span.text` reproduces
 * the input string exactly. No duplicated characters, none dropped.
 */

export const HIGHLIGHT_COLORS = ['amber', 'green', 'blue', 'pink'] as const

export type HighlightColorName = (typeof HIGHLIGHT_COLORS)[number]

export interface HighlightInput {
  id: number
  start: number
  end: number
  color: HighlightColorName
}

export interface SearchRange {
  start: number
  end: number
}

export interface SegmentSpan {
  text: string
  start: number
  end: number
  /**
   * The highlight painted over this span, or `null`.
   *
   * `isFirst` marks the leading fragment of each highlight. A highlight cut in
   * two by a search mark renders as two elements, and only one of them may
   * carry `data-testid="highlight-<id>"` — a duplicated test id is a locator
   * that throws in strict mode.
   */
  highlight: { id: number; color: HighlightColorName; isFirst: boolean } | null
  /**
   * Which search match covers this span, or -1.
   *
   * Counted AFTER overlapping search ranges are merged, so it means the same
   * thing as the find bar's position — two overlapping ranges are one match to
   * step through, and must be one match to index.
   */
  matchIndex: number
}

/** Clamp to the string, drop the empty, sort by start. */
function normalise<T extends SearchRange>(ranges: readonly T[], length: number): T[] {
  return ranges
    .map((range) => ({
      ...range,
      start: Math.max(0, Math.min(range.start, length)),
      end: Math.max(0, Math.min(range.end, length)),
    }))
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start || a.end - b.end)
}

/** Merge overlapping and touching search ranges, so each match is counted once. */
function mergeSearch(ranges: readonly SearchRange[], length: number): SearchRange[] {
  const merged: SearchRange[] = []
  for (const range of normalise(ranges, length)) {
    const last = merged.at(-1)
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end)
    else merged.push({ start: range.start, end: range.end })
  }
  return merged
}

/**
 * Split `text` into disjoint spans annotated with the highlight and search
 * match covering each.
 *
 * Where two HIGHLIGHTS overlap, the higher id wins on the overlapping
 * characters — the more recent mark sits on top, which is what "highlight this
 * again in green" means. The earlier one keeps whatever it does not share, so
 * neither disappears.
 */
export function buildSegmentSpans(
  text: string,
  highlights: readonly HighlightInput[] = [],
  searchRanges: readonly SearchRange[] = [],
): SegmentSpan[] {
  if (!text) return []

  const marks = normalise(highlights, text.length)
  const matches = mergeSearch(searchRanges, text.length)

  if (marks.length === 0 && matches.length === 0) {
    return [{ text, start: 0, end: text.length, highlight: null, matchIndex: -1 }]
  }

  /*
   * Every start and end becomes a cut point. Between two adjacent cut points
   * nothing changes, by construction — which is exactly what makes the output
   * spans disjoint without any interval arithmetic beyond this.
   */
  const cuts = new Set<number>([0, text.length])
  for (const range of [...marks, ...matches]) {
    cuts.add(range.start)
    cuts.add(range.end)
  }
  const points = [...cuts].sort((a, b) => a - b)

  const seen = new Set<number>()
  const spans: SegmentSpan[] = []

  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i]
    const end = points[i + 1]
    if (start === undefined || end === undefined || end <= start) continue

    // Last wins: `marks` is sorted by start, so among the marks covering this
    // slice the one with the highest id is the topmost.
    let top: HighlightInput | undefined
    for (const mark of marks) {
      if (mark.start <= start && mark.end >= end && (top === undefined || mark.id > top.id)) {
        top = mark
      }
    }

    const matchIndex = matches.findIndex((match) => match.start <= start && match.end >= end)

    const previous = spans.at(-1)
    const sameHighlight = (previous?.highlight?.id ?? null) === (top?.id ?? null)

    // Adjacent slices with identical attribution are one span. Without this a
    // segment with three separate search hits inside one highlight would render
    // as seven elements where four are enough, and the extra element boundaries
    // are visible: browsers break lines at them.
    if (previous && sameHighlight && previous.matchIndex === matchIndex) {
      previous.text += text.slice(start, end)
      previous.end = end
      continue
    }

    const isFirst = top !== undefined && !seen.has(top.id)
    if (top !== undefined) seen.add(top.id)

    spans.push({
      text: text.slice(start, end),
      start,
      end,
      highlight: top ? { id: top.id, color: top.color, isFirst } : null,
      matchIndex,
    })
  }

  return spans
}

/**
 * The subset of highlights that belong to one segment, in render order.
 *
 * A convenience over `Array.filter` only in name: it exists so the grouping
 * rule — by segment, ordered by position, not by creation — lives next to the
 * renderer that depends on it.
 */
export function highlightsForSegment<T extends { segment_id: number; start_offset: number }>(
  highlights: readonly T[],
  segmentId: number,
): T[] {
  return highlights
    .filter((highlight) => highlight.segment_id === segmentId)
    .sort((a, b) => a.start_offset - b.start_offset)
}
