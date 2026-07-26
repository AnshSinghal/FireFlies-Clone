'use client'

/**
 * SearchInput (T-10.5).
 *
 * Controlled from the outside but debounced on the inside: the field updates on
 * every keystroke (so typing never feels laggy) while `onDebouncedChange` fires
 * at most every `debounceMs`. Debouncing the *value* instead would make the
 * caret stutter, which is the usual mistake.
 *
 * The topbar's global search is a separate component — it owns a dropdown, a
 * result list and keyboard navigation over it, none of which belongs in a
 * reusable field. This one backs the Notebook (T-13) and the transcript find
 * bar (T-22).
 */

import { Loader2, Search, X } from 'lucide-react'
import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react'

import { cn } from '@/lib/utils/cn'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  /** Fires `debounceMs` after typing stops. Omit to be notified on every keystroke only. */
  onDebouncedChange?: (value: string) => void
  debounceMs?: number
  placeholder?: string
  /** Right-hand hint, e.g. `⌘K`. Hidden once the field has content. */
  hint?: ReactNode
  loading?: boolean
  ariaLabel: string
  testId?: string
  className?: string
  onFocus?: () => void
  onBlur?: () => void
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void
  /**
   * ARIA wiring for a field that owns a result list (the topbar's global
   * search). Supplying it turns the input into a combobox.
   *
   * It lives here rather than in a second component because the *field* is the
   * same field — same icon, same clear button, same hint, same focus
   * treatment. Forking it would guarantee the two drift apart, which is the
   * exact failure T-10 exists to prevent.
   */
  combobox?: {
    expanded: boolean
    controls: string
    activeDescendant?: string
  }
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  {
    value,
    onChange,
    onDebouncedChange,
    debounceMs = 250,
    placeholder = 'Search…',
    hint,
    loading = false,
    ariaLabel,
    testId,
    className,
    onFocus,
    onBlur,
    onKeyDown,
    combobox,
  },
  forwardedRef,
) {
  const localRef = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)

  // Sub-element test ids derive from the field's own, so `testId="topbar-search"`
  // yields `topbar-search-clear` — the id the topbar's tests already use — and a
  // second SearchInput on the same page cannot collide with the first.
  const idFor = (part: string) => (testId ? `${testId}-${part}` : `search-input-${part}`)

  /*
   * The callback lives in a ref so the debounce effect depends only on `value`.
   * An inline arrow in the dependency array would restart the timer on every
   * parent render, and the callback would then fire late — or, on a busy page,
   * never.
   */
  const notify = useRef(onDebouncedChange)
  useEffect(() => {
    notify.current = onDebouncedChange
  })

  /*
   * Skips the FIRST run.
   *
   * Without this the effect fires once on mount and reports the initial value
   * as though the user had typed it. On the Notebook that meant every page load
   * rewrote the URL ~250ms later — and a click landing inside that window had
   * its navigation clobbered by the rewrite, so filter chips and Clear all
   * silently did nothing on any page opened with query parameters.
   *
   * The symptom pointed everywhere except here: React was hydrated, handlers
   * fired, and the same controls worked from an unparameterised URL.
   */
  const settled = useRef(false)
  useEffect(() => {
    if (!settled.current) {
      settled.current = true
      return
    }
    if (!notify.current) return

    const timer = setTimeout(() => notify.current?.(value), debounceMs)
    return () => clearTimeout(timer)
  }, [value, debounceMs])

  const showClear = value !== ''

  return (
    <div className={cn('relative', className)}>
      <Search
        size={16}
        strokeWidth={1.75}
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
      />

      <input
        ref={(node) => {
          localRef.current = node
          if (typeof forwardedRef === 'function') forwardedRef(node)
          else if (forwardedRef) forwardedRef.current = node
        }}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => {
          setFocused(true)
          onFocus?.()
        }}
        onBlur={() => {
          setFocused(false)
          onBlur?.()
        }}
        onKeyDown={onKeyDown}
        role={combobox ? 'combobox' : undefined}
        aria-expanded={combobox?.expanded}
        aria-controls={combobox?.controls}
        aria-autocomplete={combobox ? 'list' : undefined}
        aria-activedescendant={combobox?.activeDescendant}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        data-testid={testId}
        className={cn(
          'h-btn-md w-full rounded-md border border-transparent bg-surface-2 pl-9 pr-16 text-body text-primary outline-none transition-colors duration-fast',
          'placeholder:text-muted focus:border-accent focus:bg-surface-0 focus:shadow-focus',
          // The browser's own search-clear button would sit beside ours.
          '[&::-webkit-search-cancel-button]:hidden',
        )}
      />

      <span className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
        {loading && (
          <Loader2
            size={14}
            strokeWidth={2}
            aria-hidden="true"
            data-testid={idFor('spinner')}
            className="animate-spin text-muted"
          />
        )}

        {showClear ? (
          <button
            type="button"
            aria-label="Clear search"
            data-testid={idFor('clear')}
            // preventDefault on mousedown so the field does not blur first —
            // clearing should leave the caret where the user can keep typing.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onChange('')
              localRef.current?.focus()
            }}
            className="rounded-sm p-0.5 text-muted transition-colors duration-fast hover:bg-surface-hover hover:text-primary"
          >
            <X size={14} strokeWidth={2} />
          </button>
        ) : (
          hint &&
          !focused && (
            <kbd
              aria-hidden="true"
              data-testid={idFor('hint')}
              className="rounded-sm border border-subtle bg-surface-0 px-1.5 py-0.5 text-xs text-muted"
            >
              {hint}
            </kbd>
          )
        )}
      </span>
    </div>
  )
})
