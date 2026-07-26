import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Highlighter, findRanges, splitByRanges } from './highlighter'

describe('findRanges', () => {
  it('finds every occurrence, case-insensitively', () => {
    expect(findRanges('Road to the roadmap', 'road')).toEqual([
      { start: 0, end: 4 },
      { start: 12, end: 16 },
    ])
  })

  it('treats the query literally, not as a pattern', () => {
    // `c++` and `(draft)` are things people type into search boxes. Building a
    // RegExp from input either throws or matches the wrong thing.
    expect(findRanges('we shipped c++ bindings', 'c++')).toEqual([{ start: 11, end: 14 }])
    expect(findRanges('a.b', '.')).toEqual([{ start: 1, end: 2 }])
    expect(findRanges('anything', '(unclosed')).toEqual([])
  })

  it('returns nothing for a blank query rather than matching everywhere', () => {
    expect(findRanges('some text', '')).toEqual([])
    expect(findRanges('some text', '   ')).toEqual([])
  })
})

describe('splitByRanges', () => {
  it('alternates plain and matched parts', () => {
    expect(splitByRanges('roadmap sync', [{ start: 0, end: 7 }])).toEqual([
      // `matchIndex` counts the visible highlights, so `activeIndex` refers to
      // something the user can actually step through (T-10.9).
      { text: 'roadmap', match: true, matchIndex: 0 },
      { text: ' sync', match: false },
    ])
  })

  it('merges overlapping ranges instead of duplicating characters', () => {
    const parts = splitByRanges('abcdef', [
      { start: 0, end: 3 },
      { start: 2, end: 5 },
    ])
    expect(parts.map((p) => p.text).join('')).toBe('abcdef')
    expect(parts).toEqual([
      // One merged range is ONE highlight, so it gets one index — otherwise
      // stepping through matches would visit an invisible extra stop.
      { text: 'abcde', match: true, matchIndex: 0 },
      { text: 'f', match: false },
    ])
  })

  it('clamps out-of-bounds ranges rather than dropping text', () => {
    // Server offsets are trusted for content, not for bounds — an off-by-one
    // should mis-emphasise, never lose characters.
    const parts = splitByRanges('short', [{ start: 3, end: 99 }])
    expect(parts.map((p) => p.text).join('')).toBe('short')
  })

  it('sorts unordered ranges', () => {
    const parts = splitByRanges('abcdef', [
      { start: 4, end: 5 },
      { start: 0, end: 1 },
    ])
    expect(parts.map((p) => p.text).join('')).toBe('abcdef')
    expect(parts.filter((p) => p.match).map((p) => p.text)).toEqual(['a', 'e'])
  })

  it('returns the whole string unmatched when there are no ranges', () => {
    expect(splitByRanges('plain', [])).toEqual([{ text: 'plain', match: false }])
  })

  it('numbers matches in document order', () => {
    const parts = splitByRanges('one two one two one', [
      { start: 12, end: 15 },
      { start: 0, end: 3 },
      { start: 16, end: 19 },
    ])
    expect(parts.filter((p) => p.match).map((p) => p.matchIndex)).toEqual([0, 1, 2])
  })
})

describe('Highlighter', () => {
  it('wraps matches in <mark>', () => {
    render(<Highlighter text="Q3 Product Roadmap Sync" query="roadmap" />)
    expect(screen.getByText('Roadmap').tagName).toBe('MARK')
  })

  it('renders markup in the text as text, never as HTML', () => {
    // The reason this primitive exists. Transcripts are user content; a meeting
    // where someone reads out a tag must not inject it into the dropdown.
    const { container } = render(<Highlighter text='<img src=x onerror="alert(1)">' query="img" />)

    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toBe('<img src=x onerror="alert(1)">')
  })

  it('prefers server-supplied ranges over the literal query', () => {
    // The API knows the FTS stemming rules ("pricing" matching "priced"); the
    // client must not try to re-derive them.
    const { container } = render(
      <Highlighter text="we priced it" query="pricing" ranges={[{ start: 3, end: 9 }]} />,
    )
    expect(container.querySelector('mark')?.textContent).toBe('priced')
  })

  it('marks one match as active and leaves the rest muted (T-10.9)', () => {
    const { container } = render(
      <Highlighter text="one two one two one" query="one" activeIndex={1} />,
    )
    const marks = Array.from(container.querySelectorAll('mark'))

    expect(marks).toHaveLength(3)
    expect(marks.map((m) => m.getAttribute('data-active'))).toEqual([null, 'true', null])
    // The active one is the SECOND occurrence, not the second character run.
    expect(marks[1]!.className).toContain('bg-highlight-active')
  })

  it('treats an out-of-range activeIndex as no active match', () => {
    // The state before the user has stepped to one — nothing should be
    // singled out.
    const { container } = render(<Highlighter text="one one" query="one" activeIndex={9} />)
    expect(container.querySelector('[data-active="true"]')).toBeNull()
  })

  it('renders plain text when nothing matches', () => {
    const { container } = render(<Highlighter text="nothing here" query="zzz" />)
    expect(container.querySelector('mark')).toBeNull()
    expect(container.textContent).toBe('nothing here')
  })
})
