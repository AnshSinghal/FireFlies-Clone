import { describe, expect, it } from 'vitest'

import { activeSegmentIndex, markTurns, toPlainText, TURN_GAP_MS } from './grouping'

const segment = (speaker: number, start: number, length = 5000) => ({
  speaker_id: speaker,
  start_ms: start,
  end_ms: start + length,
})

describe('markTurns', () => {
  it('starts a turn on the first segment', () => {
    expect(markTurns([segment(1, 0)])[0]?.startsTurn).toBe(true)
  })

  it('groups consecutive segments from the same speaker', () => {
    const marked = markTurns([segment(1, 0), segment(1, 5000), segment(1, 10_000)])
    expect(marked.map((s) => s.startsTurn)).toEqual([true, false, false])
  })

  it('breaks on a speaker change', () => {
    const marked = markTurns([segment(1, 0), segment(2, 5000), segment(1, 10_000)])
    expect(marked.map((s) => s.startsTurn)).toEqual([true, true, true])
  })

  it('breaks the same speaker on a long silence', () => {
    // Measured from the previous segment's END: this gap is just over the
    // threshold, so the second line gets its own header and timestamp.
    const marked = markTurns([segment(1, 0), segment(1, 5000 + TURN_GAP_MS + 1)])
    expect(marked.map((s) => s.startsTurn)).toEqual([true, true])
  })

  it('does not break on a gap exactly at the threshold', () => {
    const marked = markTurns([segment(1, 0), segment(1, 5000 + TURN_GAP_MS)])
    expect(marked[1]?.startsTurn).toBe(false)
  })

  it('measures the gap from the end of a long segment, not its start', () => {
    // A two-minute segment followed immediately by another is continuous
    // speech; comparing start-to-start would wrongly split it.
    const marked = markTurns([segment(1, 0, 120_000), segment(1, 120_000)])
    expect(marked[1]?.startsTurn).toBe(false)
  })
})

describe('activeSegmentIndex', () => {
  const segments = [{ start_ms: 0 }, { start_ms: 1000 }, { start_ms: 5000 }, { start_ms: 9000 }]

  it('finds the last segment that has started', () => {
    expect(activeSegmentIndex(segments, 0)).toBe(0)
    expect(activeSegmentIndex(segments, 999)).toBe(0)
    expect(activeSegmentIndex(segments, 1000)).toBe(1)
    expect(activeSegmentIndex(segments, 7500)).toBe(2)
    expect(activeSegmentIndex(segments, 999_999)).toBe(3)
  })

  it('returns -1 before the first segment', () => {
    expect(activeSegmentIndex([{ start_ms: 500 }], 0)).toBe(-1)
  })

  it('handles an empty transcript', () => {
    expect(activeSegmentIndex([], 1000)).toBe(-1)
  })

  it('agrees with a linear scan across the whole range', () => {
    // The property that matters: the fast version and the obvious version
    // must never disagree.
    const many = Array.from({ length: 200 }, (_, i) => ({ start_ms: i * 137 }))
    for (let ms = 0; ms < 200 * 137 + 500; ms += 61) {
      const linear = many.reduce((best, s, i) => (s.start_ms <= ms ? i : best), -1)
      expect(activeSegmentIndex(many, ms)).toBe(linear)
    }
  })
})

describe('toPlainText', () => {
  it('formats each line as [MM:SS] Speaker: text', () => {
    const text = toPlainText(
      [
        { start_ms: 0, speaker_id: 1, text: 'Morning.' },
        { start_ms: 74_000, speaker_id: 2, text: 'Morning!' },
      ],
      (id) => (id === 1 ? 'Sarah Chen' : 'Raj Patel'),
      (ms) =>
        `${String(Math.floor(ms / 60_000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`,
    )

    expect(text).toBe('[00:00] Sarah Chen: Morning.\n[01:14] Raj Patel: Morning!')
  })
})
