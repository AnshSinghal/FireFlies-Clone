/**
 * Speaker turns (T-20.3).
 *
 * Consecutive segments from one speaker are one visual block with a single
 * name header. Repeating "Sarah Chen" above each of the nine lines she said in
 * a row is what makes a transcript read like a chat log — which is Otter's
 * layout, not this one.
 *
 * A pure function over the segment list, returning a FLAG per segment rather
 * than a nested structure. Nesting would force the virtualiser to measure
 * turns, and a turn can be a screen tall — the scroll position for "the
 * segment currently playing" then becomes an estimate rather than an index.
 */

export interface TurnAware {
  /** First segment of a turn: renders the avatar, name and timestamp. */
  startsTurn: boolean
}

/**
 * A long enough silence that the conversation moved on.
 *
 * Without it, someone who says two sentences forty minutes apart with nobody
 * else speaking in between reads as one continuous turn — and the timestamp
 * that would have told you otherwise is the one grouping hides.
 */
export const TURN_GAP_MS = 30_000

interface Groupable {
  speaker_id: number
  start_ms: number
  end_ms: number
}

export function markTurns<T extends Groupable>(segments: readonly T[]): Array<T & TurnAware> {
  return segments.map((segment, index) => {
    const previous = index > 0 ? segments[index - 1] : undefined

    if (!previous) return { ...segment, startsTurn: true }

    const speakerChanged = previous.speaker_id !== segment.speaker_id
    // Measured from the previous segment's END, not its start: a long segment
    // followed immediately by another is continuous speech, however long the
    // first one ran.
    const gap = segment.start_ms - previous.end_ms

    return { ...segment, startsTurn: speakerChanged || gap > TURN_GAP_MS }
  })
}

/**
 * The segment playing at `ms`, by binary search.
 *
 * `.find()` would be O(n) on every clock tick — ten times a second across
 * 1,200 segments. The answer is the LAST segment that has started, not the one
 * whose range contains the time: segments can have gaps between them, and
 * during a gap the honest answer is still what was just said.
 *
 * Returns -1 before the first segment starts.
 */
export function activeSegmentIndex(segments: readonly { start_ms: number }[], ms: number): number {
  let low = 0
  let high = segments.length - 1
  let found = -1

  while (low <= high) {
    const mid = (low + high) >>> 1
    const segment = segments[mid]
    if (!segment) break

    if (segment.start_ms <= ms) {
      found = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return found
}

/** `[MM:SS] Speaker: text` lines, for the clipboard (T-20.11). */
export function toPlainText(
  segments: readonly { start_ms: number; speaker_id: number; text: string }[],
  speakerLabel: (id: number) => string,
  formatTime: (ms: number) => string,
): string {
  return segments
    .map(
      (segment) =>
        `[${formatTime(segment.start_ms)}] ${speakerLabel(segment.speaker_id)}: ${segment.text}`,
    )
    .join('\n')
}
