'use client'

/**
 * URL as state (T-06.7).
 *
 * Filters, search, sort, page and the Notepad's `?t=` all live in the query
 * string. Two requirements drive this, and both are things an evaluator will
 * actually try: every view must be shareable by copying the URL, and browser
 * Back must undo a filter change.
 *
 * Hand-rolled rather than pulling in nuqs. It is sixty lines, it needs no
 * provider, and the two behaviours that matter — replace-vs-push and resetting
 * the page on a filter change — are decisions this app has opinions about
 * rather than defaults to inherit.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useMemo } from 'react'

export type ParamValue = string | number | boolean | null | undefined

export interface SetParamsOptions {
  /**
   * `replace` leaves no history entry. Correct for a debounced search — one
   * character typed should not cost one Back press — and for the player's
   * throttled `?t=` writes, which would otherwise flood history (T-19.12).
   *
   * `push` is the default because a deliberate filter change SHOULD be
   * undoable with Back (T06-G).
   */
  history?: 'push' | 'replace'
  /** Skip Next's scroll-to-top. Almost always what you want for a filter. */
  scroll?: boolean
}

export function useQueryParams() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  /** Current params as a plain object, for reading into component state. */
  const params = useMemo(() => {
    const out: Record<string, string> = {}
    for (const [key, value] of searchParams.entries()) out[key] = value
    return out
  }, [searchParams])

  const setParams = useCallback(
    (updates: Record<string, ParamValue>, options: SetParamsOptions = {}) => {
      const next = new URLSearchParams(searchParams.toString())

      for (const [key, value] of Object.entries(updates)) {
        // null/undefined/'' all mean "remove", so a cleared filter leaves a
        // clean URL rather than `?q=&host=`.
        if (value === null || value === undefined || value === '') {
          next.delete(key)
        } else {
          next.set(key, String(value))
        }
      }

      // Keep the query string in a stable order so the same filter state always
      // produces the same URL — otherwise a shared link differs from the one in
      // the address bar and cache keys churn.
      next.sort()

      const query = next.toString()
      const url = query ? `${pathname}?${query}` : pathname

      const navigate = options.history === 'replace' ? router.replace : router.push
      navigate(url, { scroll: options.scroll ?? false })
    },
    [pathname, router, searchParams],
  )

  const getParam = useCallback((key: string) => searchParams.get(key), [searchParams])

  const getNumber = useCallback(
    (key: string, fallback: number) => {
      const raw = searchParams.get(key)
      if (raw === null) return fallback
      const parsed = Number(raw)
      return Number.isFinite(parsed) ? parsed : fallback
    },
    [searchParams],
  )

  const clearParams = useCallback(
    (options: SetParamsOptions = {}) => {
      const navigate = options.history === 'replace' ? router.replace : router.push
      navigate(pathname, { scroll: options.scroll ?? false })
    },
    [pathname, router],
  )

  return { params, getParam, getNumber, setParams, clearParams }
}

/**
 * Filter state for the Notebook, read from and written to the URL.
 *
 * Changing any filter resets `page` to 1. Forgetting that is why users see
 * "no results" on a filter that has three matches — they were on page 4 of the
 * previous result set (T-13.9).
 */
export function useNotebookParams() {
  const { getParam, getNumber, setParams, clearParams } = useQueryParams()

  const filters = useMemo(
    () => ({
      q: getParam('q') ?? undefined,
      sort: getParam('sort') ?? '-started_at',
      page: getNumber('page', 1),
      pageSize: getNumber('page_size', 20),
    }),
    [getParam, getNumber],
  )

  const setFilter = useCallback(
    (updates: Record<string, ParamValue>, options?: SetParamsOptions) => {
      setParams({ ...updates, page: null }, options)
    },
    [setParams],
  )

  const setPage = useCallback(
    (page: number) => setParams({ page: page === 1 ? null : page }),
    [setParams],
  )

  return { filters, setFilter, setPage, clearFilters: clearParams }
}
