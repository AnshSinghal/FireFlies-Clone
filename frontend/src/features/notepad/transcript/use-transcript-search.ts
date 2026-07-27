'use client'

/**
 * Find-in-transcript state (T-22.2, T-22.4, T-22.6, T-22.11).
 *
 * A hook rather than state in the panel, because four things have to stay
 * consistent — the query, the speaker filter, which match is current, and the
 * `?find=` in the URL — and every one of them can be changed from more than one
 * place.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'

import { useDebounce } from '@/lib/hooks/use-debounce'
import {
  findMatches,
  rangesBySegment,
  stepMatch,
  type Searchable,
  type TranscriptMatch,
} from '@/lib/transcript/search'

/**
 * 200ms, per T-22.2.
 *
 * Long enough that a one-character query does not recompute on every keystroke
 * of the word being typed around it, short enough that the count feels live.
 */
const DEBOUNCE_MS = 200

const PARAM = 'find'

export interface TranscriptSearch {
  open: boolean
  query: string
  /** What the matches were computed from — trails `query` by the debounce. */
  appliedQuery: string
  speakerId: number | null
  matches: TranscriptMatch[]
  current: number
  /** 1-based, for display. 0 when nothing is current. */
  position: number
  ranges: Map<number, { start: number; end: number }[]>
  setQuery: (query: string) => void
  setSpeakerId: (speakerId: number | null) => void
  step: (direction: 1 | -1) => void
  openBar: () => void
  closeBar: () => void
}

export function useTranscriptSearch(segments: readonly Searchable[]): TranscriptSearch {
  /*
   * Seeded from the URL so `?find=pricing` opens the bar already populated
   * (T-22.11). Read once, in an initialiser — after that the URL follows the
   * state, and re-reading it would fight the user's typing.
   */
  const [query, setQueryState] = useState(() => {
    if (typeof window === 'undefined') return ''
    return new URLSearchParams(window.location.search).get(PARAM) ?? ''
  })
  const [open, setOpen] = useState(() => query.length > 0)
  const [speakerId, setSpeakerId] = useState<number | null>(null)

  /*
   * The cursor is stored WITH the query it belongs to, and the current match is
   * derived from the pair.
   *
   * The obvious version — a `current` number plus an effect that resets it when
   * the query changes — renders once with the old index against the new matches
   * before the effect corrects it, which is a highlight in the wrong place on
   * every keystroke. Deriving it means there is never a render where the two
   * disagree.
   */
  const [cursor, setCursor] = useState<{ query: string; index: number }>({ query: '', index: 0 })

  const appliedQuery = useDebounce(query, DEBOUNCE_MS)

  const matches = useMemo(
    () => findMatches(segments, appliedQuery, { speakerId }),
    [segments, appliedQuery, speakerId],
  )

  const ranges = useMemo(() => rangesBySegment(matches), [matches])

  /*
   * A NEW search starts at its first match; refining an existing one keeps the
   * reader where they are. The clamp covers the speaker filter narrowing the
   * results out from under the cursor.
   */
  const current =
    matches.length === 0
      ? -1
      : Math.min(cursor.query === appliedQuery ? cursor.index : 0, matches.length - 1)

  /*
   * The URL follows the query (T-22.11), through `history.replaceState`.
   *
   * Not the Next router: a debounced search would otherwise push a navigation
   * per keystroke-pause, and the router treats a search-param change as one
   * (ADR-041 settled the same question for the Notebook's filters).
   */
  useEffect(() => {
    const url = new URL(window.location.href)
    const value = appliedQuery.trim()

    if (value) url.searchParams.set(PARAM, value)
    else url.searchParams.delete(PARAM)

    if (url.toString() !== window.location.href) {
      window.history.replaceState(window.history.state, '', url)
    }
  }, [appliedQuery])

  const step = useCallback(
    (direction: 1 | -1) =>
      setCursor({ query: appliedQuery, index: stepMatch(current, matches.length, direction) }),
    [appliedQuery, current, matches.length],
  )

  const setQuery = useCallback((next: string) => setQueryState(next), [])

  const openBar = useCallback(() => setOpen(true), [])

  const closeBar = useCallback(() => {
    // Clears the query too: leaving the highlights up with no bar to control
    // them would be a page the user cannot undo (T22-J).
    setOpen(false)
    setQueryState('')
    setSpeakerId(null)
    setCursor({ query: '', index: 0 })
  }, [])

  return {
    open,
    query,
    appliedQuery,
    speakerId,
    matches,
    current,
    position: current >= 0 ? current + 1 : 0,
    ranges,
    setQuery,
    setSpeakerId,
    step,
    openBar,
    closeBar,
  }
}
