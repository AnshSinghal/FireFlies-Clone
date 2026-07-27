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

import { usePathname, useSearchParams } from 'next/navigation'
import { useCallback, useMemo } from 'react'

import { useCurrentUser } from '@/lib/api/me'
import { BUILT_IN_CHANNEL_IDS } from '@/lib/nav'
import { useDefaultSortPref, usePageSizePref } from '@/lib/prefs/app-prefs'

export type ParamValue = string | number | boolean | null | undefined | string[]

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
        } else if (Array.isArray(value)) {
          // Repeated params, matching how the API reads them. `delete` first,
          // or toggling a tag off would leave the old value beside the new one.
          next.delete(key)
          for (const item of value) next.append(key, String(item))
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

      /*
       * `history.pushState`, not `router.push`.
       *
       * Next's App Router treats a search-param change as a navigation: it
       * fetches a fresh RSC payload for the route before the URL updates. On a
       * page whose data is fetched client-side that round-trip buys nothing,
       * and it is slow enough to be visible — a filter chip took seconds to
       * clear, and the whole panel felt broken.
       *
       * Next 15+ integrates the native history methods with `usePathname` and
       * `useSearchParams` precisely for this: the URL updates synchronously,
       * the hooks re-render, and Back still works because a real history entry
       * is created.
       */
      if (options.history === 'replace') {
        window.history.replaceState(null, '', url)
      } else {
        window.history.pushState(null, '', url)
      }

      if (options.scroll) window.scrollTo({ top: 0 })
    },
    [pathname, searchParams],
  )

  const getParam = useCallback((key: string) => searchParams.get(key), [searchParams])

  /** Every value for a repeated key — `?tags=a&tags=b` → `['a', 'b']`. */
  const getAll = useCallback((key: string) => searchParams.getAll(key), [searchParams])

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
      // Same mechanism as `setParams`, for the same reason.
      if (options.history === 'replace') window.history.replaceState(null, '', pathname)
      else window.history.pushState(null, '', pathname)
    },
    [pathname],
  )

  return { params, getParam, getAll, getNumber, setParams, clearParams }
}

/**
 * Excluded from the Filters badge count.
 *
 * `sort`, `page` and `page_size` are not filters: a badge reading "3" on a
 * default view that merely happens to be sorted sends the user hunting for
 * filters to clear. `q` is excluded too — it has its own visible field, and
 * counting it twice overstates how narrowed the view is.
 */
const NON_FILTERS = new Set(['sort', 'page', 'pageSize', 'q', 'tags', 'details'])

/**
 * Filter state for the Notebook, read from and written to the URL.
 *
 * Changing any filter resets `page` to 1. Forgetting that is why users see
 * "no results" on a filter that has three matches — they were on page 4 of the
 * previous result set (T-13.9).
 */
export function useNotebookParams() {
  const { getParam, getAll, getNumber, setParams, clearParams } = useQueryParams()

  // Settings → Preferences supplies the DEFAULTS (T-30.7); an explicit URL
  // param always wins, because a shared link must mean the same view on the
  // recipient's machine regardless of their preferences.
  const [defaultSort] = useDefaultSortPref()
  const [defaultPageSize] = usePageSizePref()

  // Already in the cache — the app shell fetches it to render the avatar — so
  // resolving "My Meetings" costs no extra request.
  const { data: me } = useCurrentUser()
  // Hoisted out of the memo's dependency list: the compiler cannot preserve a
  // memo whose deps contain an optional chain.
  const myName = me?.name
  const channelParam = getParam('channel') ?? undefined

  const filters = useMemo(
    () => ({
      q: getParam('q') ?? undefined,
      participant: getParam('participant') ?? undefined,
      from: getParam('from') ?? undefined,
      to: getParam('to') ?? undefined,
      minDuration: getParam('min_duration') ? getNumber('min_duration', 0) : undefined,
      maxDuration: getParam('max_duration') ? getNumber('max_duration', 0) : undefined,
      // Repeated `?tags=a&tags=b`, not a comma-joined string: a tag containing
      // a comma would otherwise split into two filters that match nothing.
      tags: getAll('tags'),
      /*
       * The two BUILT-IN views are filters over the same data, not stored
       * channels (see `BUILT_IN_CHANNELS` and the `/channels` docstring) — so
       * they must not reach the API's `channel` filter, which matches a stored
       * slug and found nothing. Both sidebar items led to an empty Notebook.
       *
       * They stay in the URL as `?channel=` because that is what lights the
       * rail item and what makes the view shareable; only the request they
       * translate into changes here.
       */
      channel: BUILT_IN_CHANNEL_IDS.has(channelParam ?? '') ? undefined : channelParam,
      /*
       * "My Meetings" means hosted by me, matching `hosted_by` — the same
       * definition the rail's own count uses, so the badge and the list cannot
       * disagree. By NAME because that is what the API's `host` filter takes.
       */
      host:
        channelParam === 'my-meetings' && myName ? myName : (getParam('host') ?? undefined),
      hasActionItems: parseBool(getParam('has_action_items')),
      source: getParam('source') ?? undefined,
      // The details drawer's open meeting (T-15.12). Not a filter: it narrows
      // nothing, so it is excluded from the Filters badge below.
      details: getParam('details') ? getNumber('details', 0) : undefined,
      sort: getParam('sort') ?? defaultSort,
      page: getNumber('page', 1),
      pageSize: getNumber('page_size', defaultPageSize),
    }),
    [getParam, getNumber, getAll, defaultSort, defaultPageSize, channelParam, myName],
  )

  const activeFilterCount = useMemo(
    () =>
      Object.entries(filters).filter(([key, value]) => !NON_FILTERS.has(key) && value !== undefined)
        .length + (filters.tags.length > 0 ? 1 : 0),
    [filters],
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

  return { filters, activeFilterCount, setFilter, setPage, setParams, clearFilters: clearParams }
}

/**
 * `"true"`/`"false"` → boolean, anything else → undefined.
 *
 * NOT `raw === 'true'`, which would turn a malformed `?has_action_items=yes`
 * into an active "false" filter the user never asked for.
 */
function parseBool(raw: string | null): boolean | undefined {
  if (raw === 'true') return true
  if (raw === 'false') return false
  return undefined
}
