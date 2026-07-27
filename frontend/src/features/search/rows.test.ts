import { describe, expect, it } from 'vitest'

import type { SearchResults } from '@/lib/api/types'

import { flattenRows, idleSections, resultSections, truncateSnippet } from './rows'

const EMPTY: SearchResults = {
  query: '',
  meetings: [],
  transcripts: [],
  total: 0,
  has_more: false,
  offset: 0,
}

describe('truncateSnippet', () => {
  it('leaves short snippets and their ranges alone', () => {
    const result = truncateSnippet('short one', [{ start: 0, end: 5 }])
    expect(result.text).toBe('short one')
    expect(result.ranges).toEqual([{ start: 0, end: 5 }])
  })

  it('shifts ranges to follow the slice', () => {
    // Trimming without shifting is the real bug: the offsets would still point
    // at the original string and highlight the wrong words.
    const text = `${'a'.repeat(200)}MATCH${'b'.repeat(200)}`
    const result = truncateSnippet(text, [{ start: 200, end: 205 }], 40)

    const highlighted = result.text.slice(result.ranges[0]!.start, result.ranges[0]!.end)
    expect(highlighted).toBe('MATCH')
  })

  it('marks elision with ellipses on the sides it trimmed', () => {
    const text = `${'a'.repeat(100)}MATCH${'b'.repeat(100)}`
    const result = truncateSnippet(text, [{ start: 100, end: 105 }], 40)
    expect(result.text.startsWith('…')).toBe(true)
    expect(result.text.endsWith('…')).toBe(true)
  })

  it('keeps the window inside the string when the match is at the end', () => {
    const text = `${'a'.repeat(200)}END`
    const result = truncateSnippet(text, [{ start: 200, end: 203 }], 40)
    expect(result.text.endsWith('END')).toBe(true)
    expect(result.text.slice(result.ranges[0]!.start, result.ranges[0]!.end)).toBe('END')
  })

  it('drops ranges that fall outside the window rather than mis-pointing them', () => {
    const text = `MATCH${'a'.repeat(300)}`
    const result = truncateSnippet(
      text,
      [
        { start: 0, end: 5 },
        { start: 290, end: 295 },
      ],
      40,
    )
    for (const range of result.ranges) {
      expect(range.end).toBeLessThanOrEqual(result.text.length)
    }
  })
})

describe('idleSections', () => {
  it('omits the recent group entirely when there is no history', () => {
    // An empty "Recent searches" heading is worse than no heading.
    const sections = idleSections([])
    expect(sections.map((s) => s.id)).toEqual(['actions'])
  })

  it('lists recent searches before quick actions', () => {
    const sections = idleSections(['roadmap', 'pricing'])
    expect(sections.map((s) => s.id)).toEqual(['recent', 'actions'])
    expect(sections[0]!.rows[0]!.label).toBe('roadmap')
  })

  it('points a recent search at the search page, not at a result', () => {
    const [recent] = idleSections(['q3 & q4'])
    expect(recent!.rows[0]!.href).toBe('/search?q=q3%20%26%20q4')
  })
})

describe('resultSections', () => {
  const results: SearchResults = {
    query: 'road',
    meetings: [
      {
        id: 7,
        title: 'Q3 Product Roadmap Sync',
        started_at: '2026-07-24T10:00:00Z',
        duration_seconds: 1800,
        matches: [{ start: 11, end: 15 }],
      },
    ],
    transcripts: [
      {
        segment_id: 3,
        meeting_id: 9,
        meeting_title: 'Weekly Standup',
        speaker: 'Priya Raghunathan',
        start_ms: 1_122_000,
        snippet: 'the roadmap is slipping',
        matches: [{ start: 4, end: 8 }],
      },
    ],
    total: 2,
    has_more: false,
    offset: 0,
  }

  it('groups meetings and transcripts separately, with a footer row last', () => {
    expect(resultSections('road', results).map((s) => s.id)).toEqual([
      'meetings',
      'transcripts',
      'all',
    ])
  })

  it('deep-links a transcript hit to its second, not just its meeting', () => {
    const rows = flattenRows(resultSections('road', results))
    const transcript = rows.find((r) => r.kind === 'transcript')
    expect(transcript!.href).toBe('/meeting/9?t=1122')
  })

  it('links a meeting hit to the meeting', () => {
    const rows = flattenRows(resultSections('road', results))
    expect(rows.find((r) => r.kind === 'meeting')!.href).toBe('/meeting/7')
  })

  it('gives every row a unique id for aria-activedescendant', () => {
    const ids = flattenRows(resultSections('road', results)).map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('returns nothing at all when both groups are empty', () => {
    // No sections means the empty state renders — not a footer row on its own.
    expect(resultSections('zzz', EMPTY)).toEqual([])
  })

  it('escapes the query in the see-all link', () => {
    const rows = flattenRows(resultSections('a&b=c', results))
    expect(rows.find((r) => r.kind === 'all')!.href).toBe('/search?q=a%26b%3Dc')
  })
})
