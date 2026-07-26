'use client'

/**
 * Topbar global search (T-08.2 – T-08.4, T-08.11).
 *
 * Owns the input, the debounce, the recent-search history and keyboard
 * navigation. The dropdown renders; `rows.ts` decides what exists.
 */

import { Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'

import { IconButton } from '@/components/ui/icon-button'
import { SearchInput } from '@/components/ui/search-input'
import { MIN_SEARCH_LENGTH, useSearch } from '@/lib/api/search'
import { useCommandPalette } from '@/lib/hooks/use-command-palette'
import { useDebounce } from '@/lib/hooks/use-debounce'
import { useLocalStorage } from '@/lib/hooks/use-local-storage'

import { flattenRows, idleSections, resultSections, type SearchRow } from './rows'
import { SearchDropdown } from './search-dropdown'

export const RECENT_SEARCHES_KEY = 'ff.search.recent'
const MAX_RECENT = 5
const DEBOUNCE_MS = 250

export function GlobalSearch() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()

  const [value, setValue] = useState('')
  const [open, setOpen] = useState(false)
  /** The row the user last moved to. Null means "whatever is first". */
  const [preferredId, setPreferredId] = useState<string | null>(null)
  /** Mobile only: the search overlay below 1024px (T-08.11). */
  const [expanded, setExpanded] = useState(false)

  const { value: recent, setValue: setRecent } = useLocalStorage<string[]>(RECENT_SEARCHES_KEY, [])

  const debounced = useDebounce(value, DEBOUNCE_MS)
  const query = debounced.trim()
  const { data, isFetching } = useSearch(query)

  /*
   * `value` vs `debounced` matters here. While the user is still typing, the
   * results on screen belong to the *previous* term — showing them as final
   * would flash a stale "No results" between keystrokes. So anything typed but
   * not yet debounced counts as loading.
   */
  const settled = value.trim() === query
  const loading = query.length >= MIN_SEARCH_LENGTH && (isFetching || !settled)

  const sections = useMemo(() => {
    if (value.trim().length < MIN_SEARCH_LENGTH) return idleSections(recent)
    if (!data || data.query !== query) return []
    return resultSections(query, data)
  }, [value, query, data, recent])

  const rows = useMemo(() => flattenRows(sections), [sections])

  const emptyQuery =
    !loading && query.length >= MIN_SEARCH_LENGTH && data?.query === query && rows.length === 0
      ? query
      : null

  /*
   * DERIVED, not stored-and-synced. The rows change on every keystroke, and an
   * effect that clamped a stored id would re-render a second time after each
   * one — the cascading-render pattern react-hooks/set-state-in-effect flags.
   *
   * Falling back to the first row rather than resetting to it matters: typing
   * another character re-runs the search, and losing the highlight each time
   * makes ↓↓Enter unusable while results stream in.
   */
  const activeId =
    preferredId !== null && rows.some((row) => row.id === preferredId)
      ? preferredId
      : (rows[0]?.id ?? null)

  const rememberSearch = useCallback(
    (term: string) => {
      const cleaned = term.trim()
      if (cleaned.length < MIN_SEARCH_LENGTH) return
      // Deduplicate case-insensitively and move the term to the front, so
      // repeating a search reorders history rather than growing it.
      const next = [cleaned, ...recent.filter((r) => r.toLowerCase() !== cleaned.toLowerCase())]
      setRecent(next.slice(0, MAX_RECENT))
    },
    [recent, setRecent],
  )

  const close = useCallback(() => {
    setOpen(false)
    setExpanded(false)
  }, [])

  const focusSearch = useCallback(() => {
    setExpanded(true)
    setOpen(true)
    /*
     * After paint, not immediately. Below 1024px the input's container is
     * `display: none` until `expanded` renders, and `focus()` on a
     * display-none element is a silent no-op — so ⌘K would open the overlay
     * with the caret nowhere.
     */
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      // Select rather than append: ⌘K on a field that already has a query means
      // "search for something else", so the next keystroke should replace it.
      inputRef.current?.select()
    })
  }, [])

  const select = useCallback(
    (row: SearchRow) => {
      // A recent search or a "see all" row is itself a search; a result is not.
      if (row.kind !== 'action') rememberSearch(row.kind === 'recent' ? row.label : value)
      close()
      inputRef.current?.blur()
      router.push(row.href)
    },
    [close, rememberSearch, router, value],
  )

  // ⌘K. The binding lives in useCommandPalette so T-22's ⌘F is designed against
  // one shortcut owner rather than two.
  useCommandPalette({ onTrigger: focusSearch })

  // Click-outside. `pointerdown` so a menu that unmounts on press still dismisses.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && containerRef.current?.contains(target)) return
      close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, close])

  const move = (delta: number) => {
    if (rows.length === 0) return
    const current = rows.findIndex((row) => row.id === activeId)
    // Wraps, because a list this short is faster to cycle than to reverse.
    const next = (current + delta + rows.length) % rows.length
    setPreferredId(rows[next]?.id ?? null)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setOpen(true)
        move(1)
        break
      case 'ArrowUp':
        event.preventDefault()
        setOpen(true)
        move(-1)
        break
      case 'Enter': {
        const row = rows.find((r) => r.id === activeId)
        if (open && row) {
          event.preventDefault()
          select(row)
        } else if (value.trim().length >= MIN_SEARCH_LENGTH) {
          // Enter with nothing highlighted runs the full search.
          event.preventDefault()
          rememberSearch(value)
          close()
          router.push(`/search?q=${encodeURIComponent(value.trim())}`)
        }
        break
      }
      case 'Escape':
        event.preventDefault()
        // Closes and blurs but KEEPS the value — T08-F. Clearing it would
        // discard a long query on a mis-hit.
        close()
        inputRef.current?.blur()
        break
    }
  }

  return (
    <>
      {/* <1024px the field collapses to an icon that expands to an overlay (T-08.11). */}
      <IconButton
        label="Search meetings"
        icon={<Search size={20} strokeWidth={1.75} />}
        aria-expanded={expanded}
        onClick={focusSearch}
        data-testid="topbar-search-toggle"
        // The tooltip would cover the field it opens.
        hideTooltip
        className="lg:hidden"
      />

      {/*
        Two complete class strings rather than a base plus overrides. `relative`
        and `absolute` are both `position` utilities, so Tailwind emits them in
        its own fixed order and the one written later in the string does not
        necessarily win — mixing them silently ignores the override.
      */}
      <div
        ref={containerRef}
        data-expanded={expanded}
        className={
          expanded
            ? 'absolute inset-x-2 top-2 z-popover flex min-w-0 justify-center rounded-md bg-surface-0 shadow-md lg:static lg:inset-auto lg:flex-1 lg:shadow-none'
            : 'hidden min-w-0 flex-1 justify-center lg:flex'
        }
      >
        {/*
          The 560px cap is a DESKTOP constraint — it keeps the field from
          stretching across a wide window. In the mobile overlay it would leave
          the "full-width overlay" two thirds of the way across the screen, so
          the cap only applies from `lg` up while expanded.
        */}
        <div
          className={expanded ? 'relative w-full lg:max-w-search' : 'relative w-full max-w-search'}
        >
          {/*
            The shared field (T-10.5), with combobox wiring. It was hand-rolled
            here in T-08 because the primitive did not exist yet; T-10.18's ban
            on raw <input> outside components/ui is what surfaced the
            duplication.
          */}
          <SearchInput
            ref={inputRef}
            value={value}
            onChange={(next) => {
              setValue(next)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Search meetings, transcripts, and more…"
            ariaLabel="Search meetings, transcripts, and more"
            hint="⌘K"
            testId="topbar-search"
            combobox={{
              expanded: open,
              controls: listboxId,
              activeDescendant: open && activeId ? activeId : undefined,
            }}
          />

          {open && (
            <SearchDropdown
              sections={sections}
              activeId={activeId}
              loading={loading}
              emptyQuery={emptyQuery}
              listboxId={listboxId}
              onSelect={select}
              onHover={setPreferredId}
            />
          )}
        </div>
      </div>
    </>
  )
}
