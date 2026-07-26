'use client'

/**
 * Row selection for the Notebook (T-14.1 – T-14.3, T-14.9).
 *
 * Selection SURVIVES paging — a user selecting three meetings on page 1 and two
 * on page 2 means five — but is cleared when the filters change, because the
 * rows they picked may no longer be in the result set at all and silently
 * deleting something the user can no longer see is the worst outcome here.
 */

import { useCallback, useMemo, useRef, useState } from 'react'

export type SelectionState = 'none' | 'some' | 'all'

export function useSelection<T extends string | number>(
  /** The ids on the CURRENT page, in display order — shift-click ranges use it. */
  pageIds: readonly T[],
) {
  const [selected, setSelected] = useState<ReadonlySet<T>>(new Set())

  /** The last id the user clicked, which a shift-click extends from. */
  const anchor = useRef<T | null>(null)

  const toggle = useCallback((id: T, next: boolean) => {
    anchor.current = id
    setSelected((current) => {
      const copy = new Set(current)
      if (next) copy.add(id)
      else copy.delete(id)
      return copy
    })
  }, [])

  /**
   * Shift-click: select everything between the anchor and `id` (T-14.3).
   *
   * Always SELECTS the range rather than toggling it. A range that flipped each
   * row's state would leave holes wherever the user had already picked one,
   * which is not what dragging a selection means anywhere else.
   */
  const selectRange = useCallback(
    (id: T) => {
      const from = anchor.current
      if (from === null) {
        toggle(id, true)
        return
      }

      const start = pageIds.indexOf(from)
      const end = pageIds.indexOf(id)
      if (start === -1 || end === -1) {
        toggle(id, true)
        return
      }

      const [low, high] = start <= end ? [start, end] : [end, start]
      setSelected((current) => {
        const copy = new Set(current)
        for (const rangeId of pageIds.slice(low, high + 1)) copy.add(rangeId)
        return copy
      })
      anchor.current = id
    },
    [pageIds, toggle],
  )

  const setMany = useCallback((ids: readonly T[], next: boolean) => {
    setSelected((current) => {
      const copy = new Set(current)
      for (const id of ids) {
        if (next) copy.add(id)
        else copy.delete(id)
      }
      return copy
    })
  }, [])

  const clear = useCallback(() => {
    anchor.current = null
    setSelected(new Set())
  }, [])

  /**
   * Whether the CURRENT PAGE is fully, partly or not selected.
   *
   * Scoped to the page because that is what the select-all checkbox controls.
   * An empty page is `none`, not `all` — `every()` on an empty array is true,
   * which would render a checked box over nothing.
   */
  const pageState: SelectionState = useMemo(() => {
    if (pageIds.length === 0) return 'none'
    const count = pageIds.filter((id) => selected.has(id)).length
    if (count === 0) return 'none'
    return count === pageIds.length ? 'all' : 'some'
  }, [pageIds, selected])

  return {
    selected,
    /** Total across every page, which is what the bulk bar counts. */
    count: selected.size,
    isSelected: useCallback((id: T) => selected.has(id), [selected]),
    toggle,
    selectRange,
    setMany,
    clear,
    pageState,
  }
}
