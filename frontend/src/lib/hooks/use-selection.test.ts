import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useSelection } from './use-selection'

const PAGE = [1, 2, 3, 4, 5]

describe('useSelection', () => {
  it('starts empty and reports the page as unselected', () => {
    const { result } = renderHook(() => useSelection(PAGE))
    expect(result.current.count).toBe(0)
    expect(result.current.pageState).toBe('none')
  })

  it('reports an EMPTY page as none, not all', () => {
    // `every()` on an empty array is true, which would render a checked
    // select-all box over nothing.
    const { result } = renderHook(() => useSelection([]))
    expect(result.current.pageState).toBe('none')
  })

  it('goes none → some → all as rows are picked', () => {
    const { result } = renderHook(() => useSelection(PAGE))

    act(() => result.current.toggle(1, true))
    expect(result.current.pageState).toBe('some')

    act(() => result.current.setMany(PAGE, true))
    expect(result.current.pageState).toBe('all')

    act(() => result.current.toggle(3, false))
    // Back to indeterminate — the state T14-D asserts.
    expect(result.current.pageState).toBe('some')
  })

  describe('shift-click ranges', () => {
    it('selects everything between the anchor and the target', () => {
      const { result } = renderHook(() => useSelection(PAGE))

      act(() => result.current.toggle(2, true))
      act(() => result.current.selectRange(5))

      expect([...result.current.selected].sort()).toEqual([2, 3, 4, 5])
    })

    it('works backwards', () => {
      const { result } = renderHook(() => useSelection(PAGE))

      act(() => result.current.toggle(4, true))
      act(() => result.current.selectRange(2))

      expect([...result.current.selected].sort()).toEqual([2, 3, 4])
    })

    it('always SELECTS the range rather than toggling it', () => {
      /*
       * A range that flipped each row would leave holes wherever the user had
       * already picked one, which is not what dragging a selection means
       * anywhere else.
       */
      const { result } = renderHook(() => useSelection(PAGE))

      act(() => result.current.toggle(3, true))
      act(() => result.current.toggle(1, true))
      act(() => result.current.selectRange(5))

      expect([...result.current.selected].sort()).toEqual([1, 2, 3, 4, 5])
    })

    it('falls back to a plain select with no anchor', () => {
      const { result } = renderHook(() => useSelection(PAGE))
      act(() => result.current.selectRange(3))
      expect([...result.current.selected]).toEqual([3])
    })

    it('moves the anchor, so a second shift-click extends from the last one', () => {
      const { result } = renderHook(() => useSelection(PAGE))

      act(() => result.current.toggle(1, true))
      act(() => result.current.selectRange(2))
      act(() => result.current.selectRange(4))

      expect([...result.current.selected].sort()).toEqual([1, 2, 3, 4])
    })

    it('ignores an anchor that is not on this page', () => {
      // Paging away and back must not produce a range across a gap the user
      // cannot see.
      const { result, rerender } = renderHook(({ ids }) => useSelection(ids), {
        initialProps: { ids: PAGE },
      })

      act(() => result.current.toggle(1, true))
      rerender({ ids: [6, 7, 8] })
      act(() => result.current.selectRange(7))

      expect([...result.current.selected].sort()).toEqual([1, 7])
    })
  })

  it('keeps selections made on other pages', () => {
    // Three on page 1 plus two on page 2 means five — that is what the bulk
    // bar counts.
    const { result, rerender } = renderHook(({ ids }) => useSelection(ids), {
      initialProps: { ids: PAGE },
    })

    act(() => result.current.setMany([1, 2], true))
    rerender({ ids: [6, 7, 8] })
    act(() => result.current.setMany([6], true))

    expect(result.current.count).toBe(3)
    // …while the select-all box still describes only THIS page.
    expect(result.current.pageState).toBe('some')
  })

  it('clears everything, including the anchor', () => {
    const { result } = renderHook(() => useSelection(PAGE))

    act(() => result.current.toggle(2, true))
    act(() => result.current.clear())
    expect(result.current.count).toBe(0)

    // A stale anchor would make the next shift-click select a range the user
    // never started.
    act(() => result.current.selectRange(4))
    expect([...result.current.selected]).toEqual([4])
  })

  it('deselects with setMany', () => {
    const { result } = renderHook(() => useSelection(PAGE))
    act(() => result.current.setMany(PAGE, true))
    act(() => result.current.setMany([1, 2], false))
    expect([...result.current.selected].sort()).toEqual([3, 4, 5])
  })
})
