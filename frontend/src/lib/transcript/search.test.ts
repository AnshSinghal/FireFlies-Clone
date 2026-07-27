import { describe, expect, it } from 'vitest'

import { findMatches, rangesBySegment, stepMatch } from './search'
import { applyPreset, PRESETS, presetById } from './smart-search'

const segment = (id: number, text: string, speaker = 1) => ({
  id,
  speaker_id: speaker,
  text,
  start_ms: id * 1000,
})

describe('findMatches', () => {
  const segments = [
    segment(1, 'Pricing is the topic. Pricing again.'),
    segment(2, 'Nothing relevant here.'),
    segment(3, 'Wholesale pricing for enterprise.', 2),
  ]

  it('finds every occurrence, across segments', () => {
    const matches = findMatches(segments, 'pricing')
    expect(matches).toHaveLength(3)
    expect(matches.map((m) => m.segmentId)).toEqual([1, 1, 3])
  })

  it('numbers matches within their own segment', () => {
    // The highlighter numbers what it renders per segment, so the counter and
    // the highlight must agree on the same index.
    expect(findMatches(segments, 'pricing').map((m) => m.indexInSegment)).toEqual([0, 1, 0])
  })

  it('is case-insensitive', () => {
    expect(findMatches(segments, 'PRICING')).toHaveLength(3)
  })

  it('treats regex characters literally', () => {
    // `a.*b` is a string, not a pattern. Building a RegExp from input would
    // match half the transcript here — or throw on `(draft`.
    expect(findMatches([segment(1, 'the a.*b marker')], 'a.*b')).toHaveLength(1)
    expect(findMatches([segment(1, 'axxxb')], 'a.*b')).toHaveLength(0)
    expect(() => findMatches([segment(1, 'text')], '(draft')).not.toThrow()
  })

  it('returns nothing for an empty or whitespace query', () => {
    expect(findMatches(segments, '')).toEqual([])
    expect(findMatches(segments, '   ')).toEqual([])
  })

  it('restricts to one speaker when asked', () => {
    const matches = findMatches(segments, 'pricing', { speakerId: 2 })
    expect(matches).toHaveLength(1)
    expect(matches[0]?.segmentId).toBe(3)
  })

  describe('whole word', () => {
    const words = [segment(1, 'A sale, wholesale, and sales.')]

    it('is off by default', () => {
      expect(findMatches(words, 'sale')).toHaveLength(3)
    })

    it('excludes matches inside a larger word', () => {
      // `sale` alone — not `wholesale`, and not the `sale` inside `sales`.
      expect(findMatches(words, 'sale', { wholeWord: true })).toHaveLength(1)
    })

    it('counts accented letters as word characters', () => {
      // `\b` would call this a boundary and match; letters are letters.
      expect(findMatches([segment(1, 'the café menu')], 'caf', { wholeWord: true })).toHaveLength(0)
      expect(findMatches([segment(1, 'the café menu')], 'café', { wholeWord: true })).toHaveLength(
        1,
      )
    })
  })
})

describe('rangesBySegment', () => {
  it('groups the offsets a segment should highlight', () => {
    const matches = findMatches([segment(1, 'one two one')], 'one')
    const grouped = rangesBySegment(matches)

    expect(grouped.get(1)).toEqual([
      { start: 0, end: 3 },
      { start: 8, end: 11 },
    ])
  })
})

describe('stepMatch', () => {
  it('wraps forwards at the end', () => {
    expect(stepMatch(9, 10, 1)).toBe(0)
  })

  it('wraps backwards at the start', () => {
    expect(stepMatch(0, 10, -1)).toBe(9)
  })

  it('starts at the first match going forwards, the last going back', () => {
    expect(stepMatch(-1, 10, 1)).toBe(0)
    expect(stepMatch(-1, 10, -1)).toBe(9)
  })

  it('stays at "nothing current" with no matches', () => {
    expect(stepMatch(-1, 0, 1)).toBe(-1)
    expect(stepMatch(3, 0, -1)).toBe(-1)
  })
})

describe('smart search presets', () => {
  const lines = [
    segment(1, 'Do we want to talk about the hiring req as well?'),
    segment(2, "I'll send the summary afterwards."),
    segment(3, 'Revenue is up 12% to $1.4 million.'),
    segment(4, 'Can we ship it by the end of the quarter?'),
    segment(5, 'Fair enough.'),
  ]

  it('finds questions by their punctuation', () => {
    const found = applyPreset(presetById('questions')!, lines)
    expect(found.map((l) => l.id)).toEqual([1, 4])
  })

  it('finds commitments and requests', () => {
    const found = applyPreset(presetById('tasks')!, lines)
    expect(found.map((l) => l.id)).toContain(2)
    // "Fair enough" is not a task, and a preset that matched it would be
    // matching everything.
    expect(found.map((l) => l.id)).not.toContain(5)
  })

  it('finds numbers, money and percentages', () => {
    const found = applyPreset(presetById('metrics')!, lines)
    expect(found.map((l) => l.id)).toEqual([3])
  })

  it('finds when things happen', () => {
    const found = applyPreset(presetById('dates')!, lines)
    expect(found.map((l) => l.id)).toEqual([4])
  })

  it('exposes exactly the four presets, each with a description', () => {
    expect(PRESETS).toHaveLength(4)
    for (const preset of PRESETS) expect(preset.description.length).toBeGreaterThan(0)
  })

  it('returns undefined for an unknown id', () => {
    expect(presetById('nonsense')).toBeUndefined()
  })
})
