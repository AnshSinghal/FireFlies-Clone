import { describe, expect, it } from 'vitest'

import { buildSegmentSpans, type HighlightInput } from './segment-spans'

const TEXT = 'We should revisit the pricing model before the board meeting'

const mark = (id: number, start: number, end: number, color: HighlightInput['color'] = 'amber') => ({
  id,
  start,
  end,
  color,
})

/** The invariant behind every case: the spans reconstruct the input exactly. */
const rebuild = (spans: { text: string }[]) => spans.map((span) => span.text).join('')

describe('buildSegmentSpans', () => {
  it('returns one plain span when there is nothing to mark', () => {
    expect(buildSegmentSpans(TEXT)).toEqual([
      { text: TEXT, start: 0, end: TEXT.length, highlight: null, matchIndex: -1 },
    ])
  })

  it('returns nothing for empty text', () => {
    expect(buildSegmentSpans('', [mark(1, 0, 4)])).toEqual([])
  })

  it('splits around a single highlight without losing characters', () => {
    const spans = buildSegmentSpans(TEXT, [mark(1, 22, 35)])

    expect(rebuild(spans)).toBe(TEXT)
    expect(spans.filter((s) => s.highlight).map((s) => s.text)).toEqual(['pricing model'])
  })

  it('keeps two highlights in one segment separate (T32-B)', () => {
    const spans = buildSegmentSpans(TEXT, [mark(1, 3, 9, 'green'), mark(2, 22, 35)])

    expect(rebuild(spans)).toBe(TEXT)
    expect(spans.filter((s) => s.highlight).map((s) => [s.text, s.highlight?.color])).toEqual([
      ['should', 'green'],
      ['pricing model', 'amber'],
    ])
  })

  it('marks only the first fragment of each highlight', () => {
    // Two fragments because a search hit cuts the highlight in half. Only one
    // may carry the `highlight-<id>` test id.
    const spans = buildSegmentSpans(TEXT, [mark(1, 22, 35)], [{ start: 26, end: 29 }])
    const fragments = spans.filter((s) => s.highlight?.id === 1)

    expect(fragments.length).toBeGreaterThan(1)
    expect(fragments.filter((s) => s.highlight?.isFirst)).toHaveLength(1)
    expect(fragments[0]?.highlight?.isFirst).toBe(true)
  })

  it('lets a highlight and a search mark cover the same characters (T32-C)', () => {
    const spans = buildSegmentSpans(TEXT, [mark(1, 22, 35)], [{ start: 22, end: 29 }])

    expect(rebuild(spans)).toBe(TEXT)
    const both = spans.filter((s) => s.highlight !== null && s.matchIndex >= 0)
    expect(both.map((s) => s.text)).toEqual(['pricing'])
    // …and the rest of the highlight survives as its own span.
    expect(spans.filter((s) => s.highlight !== null && s.matchIndex < 0).map((s) => s.text)).toEqual(
      [' model'],
    )
  })

  it('handles a search mark that only partially overlaps a highlight', () => {
    // The seam case: neither range contains the other.
    const spans = buildSegmentSpans(TEXT, [mark(1, 22, 35)], [{ start: 30, end: 41 }])

    expect(rebuild(spans)).toBe(TEXT)
    expect(spans.map((s) => [s.text, s.highlight !== null, s.matchIndex >= 0])).toEqual([
      ['We should revisit the ', false, false],
      ['pricing ', true, false],
      ['model', true, true],
      [' befor', false, true],
      ['e the board meeting', false, false],
    ])
  })

  it('gives the overlap to the newer highlight and keeps the older one visible', () => {
    const spans = buildSegmentSpans(TEXT, [mark(1, 22, 35, 'amber'), mark(2, 30, 41, 'pink')])

    expect(rebuild(spans)).toBe(TEXT)
    expect(spans.filter((s) => s.highlight).map((s) => [s.text, s.highlight?.color])).toEqual([
      ['pricing ', 'amber'],
      ['model befor', 'pink'],
    ])
  })

  it('counts merged search ranges as one match, like the find bar does', () => {
    // Two overlapping ranges are one thing to step through, so they must be one
    // index — otherwise "3 of 17" stops agreeing with what is on screen.
    const spans = buildSegmentSpans(
      TEXT,
      [],
      [
        { start: 3, end: 9 },
        { start: 6, end: 12 },
        { start: 22, end: 29 },
      ],
    )

    const indices = spans.filter((s) => s.matchIndex >= 0).map((s) => s.matchIndex)
    expect(indices).toEqual([0, 1])
    expect(spans.find((s) => s.matchIndex === 0)?.text).toBe('should re')
  })

  it('clamps ranges that run past the end of the text', () => {
    // What a stale client sends after somebody else shortened the segment.
    const spans = buildSegmentSpans('short', [mark(1, 2, 900)])

    expect(rebuild(spans)).toBe('short')
    expect(spans.at(-1)).toMatchObject({ text: 'ort', end: 5 })
  })

  it('drops empty and inverted ranges rather than emitting empty spans', () => {
    const spans = buildSegmentSpans(TEXT, [mark(1, 5, 5), mark(2, 20, 10)])

    expect(spans).toHaveLength(1)
    expect(spans[0]?.highlight).toBeNull()
  })

  it('merges adjacent slices that carry the same attribution', () => {
    // Two abutting highlights of the same id cannot happen, but two abutting
    // search ranges can, and they must not become two elements: the browser
    // would be free to break the line between them.
    const spans = buildSegmentSpans(
      TEXT,
      [],
      [
        { start: 3, end: 6 },
        { start: 6, end: 9 },
      ],
    )

    expect(spans.filter((s) => s.matchIndex >= 0)).toHaveLength(1)
    expect(spans.filter((s) => s.matchIndex >= 0)[0]?.text).toBe('should')
  })

  it('reconstructs the text under a pile of overlapping ranges', () => {
    const spans = buildSegmentSpans(
      TEXT,
      [mark(1, 0, 20), mark(2, 10, 30, 'blue'), mark(3, 25, 40, 'pink')],
      [
        { start: 5, end: 15 },
        { start: 18, end: 45 },
      ],
    )

    expect(rebuild(spans)).toBe(TEXT)
    // Disjoint and in order.
    for (let i = 1; i < spans.length; i += 1) {
      expect(spans[i]?.start).toBe(spans[i - 1]?.end)
    }
  })
})
