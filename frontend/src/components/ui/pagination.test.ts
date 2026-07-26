import { describe, expect, it } from 'vitest'

import { pageWindow } from './pagination'

describe('pageWindow', () => {
  it('lists every page when they all fit', () => {
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5])
    expect(pageWindow(7, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('always renders the same NUMBER of slots once it truncates', () => {
    // The reason ellipses are fixed placeholders rather than an optimisation:
    // a control that changes width as you page makes `Next` move under the
    // pointer, so a quick second click lands on a page number instead.
    for (const page of [1, 2, 5, 8, 11, 12]) {
      expect(pageWindow(page, 12)).toHaveLength(7)
    }
  })

  it('anchors to the start without a leading gap', () => {
    expect(pageWindow(1, 12)).toEqual([1, 2, 3, 4, 5, 'gap', 12])
    expect(pageWindow(4, 12)).toEqual([1, 2, 3, 4, 5, 'gap', 12])
  })

  it('anchors to the end without a trailing gap', () => {
    expect(pageWindow(12, 12)).toEqual([1, 'gap', 8, 9, 10, 11, 12])
    expect(pageWindow(9, 12)).toEqual([1, 'gap', 8, 9, 10, 11, 12])
  })

  it('centres on the current page in the middle', () => {
    expect(pageWindow(6, 12)).toEqual([1, 'gap', 5, 6, 7, 'gap', 12])
  })

  it('always includes the first and last page', () => {
    // Jumping to the end is the second most common thing after Next.
    for (let page = 1; page <= 40; page++) {
      const window = pageWindow(page, 40)
      expect(window[0]).toBe(1)
      expect(window.at(-1)).toBe(40)
    }
  })

  it('always contains the current page', () => {
    for (let page = 1; page <= 40; page++) {
      expect(pageWindow(page, 40)).toContain(page)
    }
  })

  it('never emits a gap that hides exactly one page', () => {
    // `1 … 3` is silly — the ellipsis takes the space the number would have.
    for (let page = 1; page <= 40; page++) {
      const window = pageWindow(page, 40)
      window.forEach((entry, i) => {
        if (entry !== 'gap') return
        const before = window[i - 1]
        const after = window[i + 1]
        if (typeof before === 'number' && typeof after === 'number') {
          expect(after - before).toBeGreaterThan(2)
        }
      })
    }
  })
})
