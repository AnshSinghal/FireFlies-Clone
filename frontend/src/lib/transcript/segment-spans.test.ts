import { describe, expect, it } from 'vitest'

import type { HighlightOut } from '@/lib/api/types'

import { buildSegmentAtoms, groupAtomsIntoRuns } from './segment-spans'

const TEXT = 'The top accounts use four times the API volume of the median account.'

function hl(id: number, start: number, end: number, color = 'amber'): HighlightOut {
  return {
    id,
    segment_id: 1,
    start_ms: 0,
    speaker: 'Aisha Khan',
    start_offset: start,
    end_offset: end,
    color: color as HighlightOut['color'],
    note: null,
    text: TEXT.slice(start, end),
    created_at: '2026-07-26T09:00:00Z',
  }
}

/** The invariant everything else rests on: atoms partition the string. */
function reassemble(atoms: ReturnType<typeof buildSegmentAtoms>): string {
  return atoms.map((a) => a.text).join('')
}

describe('buildSegmentAtoms', () => {
  it('plain text is one plain atom', () => {
    const atoms = buildSegmentAtoms(TEXT, [])
    expect(atoms).toHaveLength(1)
    expect(atoms[0]).toMatchObject({ text: TEXT, highlight: null, matchIndex: -1 })
  })

  it('a highlight alone slices exactly its characters', () => {
    const atoms = buildSegmentAtoms(TEXT, [hl(1, 21, 31)])
    expect(reassemble(atoms)).toBe(TEXT)
    const marked = atoms.filter((a) => a.highlight)
    expect(marked).toHaveLength(1)
    expect(marked[0]!.text).toBe(TEXT.slice(21, 31))
  })

  it('a match alone mirrors the Highlighter split', () => {
    const atoms = buildSegmentAtoms(TEXT, [], [{ start: 4, end: 7 }])
    expect(reassemble(atoms)).toBe(TEXT)
    expect(atoms.filter((a) => a.matchIndex >= 0).map((a) => a.text)).toEqual(['top'])
  })

  it('a match inside a highlight nests without losing characters (T32-C)', () => {
    const atoms = buildSegmentAtoms(TEXT, [hl(1, 21, 45)], [{ start: 36, end: 39 }])
    expect(reassemble(atoms)).toBe(TEXT)

    // The API atom is BOTH highlighted and matched.
    const both = atoms.find((a) => a.matchIndex >= 0)
    expect(both?.text).toBe('API')
    expect(both?.highlight?.id).toBe(1)
  })

  it('a match straddling a highlight boundary splits but keeps ONE index', () => {
    // Highlight covers "four times"; the match covers "times the".
    const start = TEXT.indexOf('four times')
    const hEnd = start + 'four times'.length
    const mStart = TEXT.indexOf('times the')
    const mEnd = mStart + 'times the'.length

    const atoms = buildSegmentAtoms(TEXT, [hl(1, start, hEnd)], [{ start: mStart, end: mEnd }])
    expect(reassemble(atoms)).toBe(TEXT)

    const matched = atoms.filter((a) => a.matchIndex >= 0)
    expect(matched.map((a) => a.text)).toEqual(['times', ' the'])
    // Two atoms, one logical match — the find bar must still count 1.
    expect(new Set(matched.map((a) => a.matchIndex)).size).toBe(1)
    expect(matched[0]!.highlight?.id).toBe(1)
    expect(matched[1]!.highlight).toBeNull()
  })

  it('two highlights in one segment stay separate (T32-B)', () => {
    const atoms = buildSegmentAtoms(TEXT, [hl(1, 0, 3), hl(2, 4, 7, 'green')])
    expect(reassemble(atoms)).toBe(TEXT)
    const ids = atoms.filter((a) => a.highlight).map((a) => a.highlight!.id)
    expect(ids).toEqual([1, 2])
  })

  it('overlapping highlights: the later one wins the overlap', () => {
    const atoms = buildSegmentAtoms(TEXT, [hl(1, 0, 10), hl(2, 5, 15, 'pink')])
    expect(reassemble(atoms)).toBe(TEXT)
    const overlap = atoms.find((a) => a.text === TEXT.slice(5, 10))
    expect(overlap?.highlight?.id).toBe(2)
  })

  it('out-of-bounds server offsets are clamped, never thrown', () => {
    const atoms = buildSegmentAtoms('short', [hl(1, 2, 900)])
    expect(reassemble(atoms)).toBe('short')
    expect(atoms.at(-1)?.highlight?.id).toBe(1)
  })

  it('merged overlapping matches count once', () => {
    const atoms = buildSegmentAtoms(
      TEXT,
      [],
      [
        { start: 0, end: 7 },
        { start: 4, end: 10 },
      ],
    )
    expect(reassemble(atoms)).toBe(TEXT)
    const indices = atoms.filter((a) => a.matchIndex >= 0).map((a) => a.matchIndex)
    expect(new Set(indices).size).toBe(1)
  })
})

describe('groupAtomsIntoRuns', () => {
  it('consecutive atoms under one highlight become one run', () => {
    const atoms = buildSegmentAtoms(TEXT, [hl(1, 21, 45)], [{ start: 36, end: 39 }])
    const runs = groupAtomsIntoRuns(atoms)

    // plain · highlight(3 atoms: before/match/after) · plain
    expect(runs).toHaveLength(3)
    expect(runs[1]!.highlight?.id).toBe(1)
    expect(runs[1]!.atoms.map((a) => a.text).join('')).toBe(TEXT.slice(21, 45))
  })

  it('reassembles exactly across runs', () => {
    const atoms = buildSegmentAtoms(
      TEXT,
      [hl(1, 0, 10), hl(2, 5, 15, 'blue')],
      [{ start: 8, end: 20 }],
    )
    const runs = groupAtomsIntoRuns(atoms)
    expect(runs.flatMap((r) => r.atoms.map((a) => a.text)).join('')).toBe(TEXT)
  })
})
