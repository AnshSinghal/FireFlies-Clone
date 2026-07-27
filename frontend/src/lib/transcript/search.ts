/**
 * Finding text in a transcript (T-22.2).
 *
 * Literal matching, never a regex built from the query. A user searching for
 * `c++`, `(draft)` or `a.*b` means those characters — and a `RegExp` from input
 * either throws on unbalanced parens or quietly matches the wrong thing.
 * `findRanges` in the highlighter takes the same position, and this builds on
 * it so the offsets that are HIGHLIGHTED are the offsets that were COUNTED.
 */

import { findRanges, type HighlightRange } from '@/components/ui/highlighter'

export interface Searchable {
  id: number
  speaker_id: number
  text: string
  start_ms: number
}

export interface TranscriptMatch {
  /** Position in the segment list — what the virtualiser scrolls to. */
  segmentIndex: number
  segmentId: number
  /** Which match within that segment, for the highlighter's `activeIndex`. */
  indexInSegment: number
  start: number
  end: number
  startMs: number
}

export interface SearchOptions {
  /** Restrict to one speaker (T-22.9). */
  speakerId?: number | null
  /** `sale` should not match `wholesale` when this is on. */
  wholeWord?: boolean
}

const WORD = /[\p{L}\p{N}_]/u

/**
 * A boundary check rather than `\b`.
 *
 * `\b` is defined against ASCII word characters, so it treats `café` as ending
 * after `caf`. This uses Unicode letter and number properties, which is what
 * "a word" means in a transcript that contains names.
 */
function isBoundary(text: string, index: number): boolean {
  if (index < 0 || index >= text.length) return true
  return !WORD.test(text[index] ?? '')
}

export function findMatches(
  segments: readonly Searchable[],
  query: string,
  { speakerId = null, wholeWord = false }: SearchOptions = {},
): TranscriptMatch[] {
  const needle = query.trim()
  if (!needle) return []

  const matches: TranscriptMatch[] = []

  segments.forEach((segment, segmentIndex) => {
    if (speakerId !== null && segment.speaker_id !== speakerId) return

    const ranges = findRanges(segment.text, needle)

    /*
     * `indexInSegment` counts every range found, INCLUDING ones the whole-word
     * filter rejects — because the highlighter is given the filtered ranges and
     * numbers what it renders. Counting here has to match that, so the filter
     * is applied first and the index assigned after.
     */
    let indexInSegment = 0
    for (const range of ranges) {
      if (
        wholeWord &&
        !(isBoundary(segment.text, range.start - 1) && isBoundary(segment.text, range.end))
      ) {
        continue
      }

      matches.push({
        segmentIndex,
        segmentId: segment.id,
        indexInSegment: indexInSegment++,
        start: range.start,
        end: range.end,
        startMs: segment.start_ms,
      })
    }
  })

  return matches
}

/** The ranges to highlight, grouped by segment id. */
export function rangesBySegment(
  matches: readonly TranscriptMatch[],
): Map<number, HighlightRange[]> {
  const bySegment = new Map<number, HighlightRange[]>()

  for (const match of matches) {
    const existing = bySegment.get(match.segmentId)
    const range = { start: match.start, end: match.end }
    if (existing) existing.push(range)
    else bySegment.set(match.segmentId, [range])
  }

  return bySegment
}

/**
 * Step to the next or previous match, WRAPPING at both ends (T-22.4).
 *
 * Returns -1 for an empty match list, which is the same "nothing is current"
 * value the highlighter expects for `activeIndex`.
 */
export function stepMatch(current: number, total: number, direction: 1 | -1): number {
  if (total === 0) return -1
  if (current < 0) return direction === 1 ? 0 : total - 1
  return (current + direction + total) % total
}
