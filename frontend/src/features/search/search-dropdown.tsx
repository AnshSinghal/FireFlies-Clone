'use client'

/**
 * Search dropdown presentation (T-08.3, T-08.8).
 *
 * Pure rendering — every decision about *what* is selectable lives in `rows.ts`,
 * so the keyboard handler and this component cannot disagree about which row is
 * second.
 */

import { ArrowRight, Clock, FileText, MessageSquare, Search, Trash2, X } from 'lucide-react'
import Link from 'next/link'

import { Highlighter } from '@/components/ui/highlighter'
import { IconButton } from '@/components/ui/icon-button'
import { Skeleton } from '@/components/ui/skeleton'

import type { SearchRow, SearchSection } from './rows'

const ROW_ICON = {
  recent: Clock,
  action: ArrowRight,
  meeting: FileText,
  transcript: MessageSquare,
  all: Search,
  clear: Trash2,
} as const

interface SearchDropdownProps {
  sections: readonly SearchSection[]
  activeId: string | null
  loading: boolean
  /** Set once a query has run and produced nothing. */
  emptyQuery: string | null
  listboxId: string
  onSelect: (row: SearchRow) => void
  onHover: (id: string) => void
  /** Removes one remembered search (T-35.9). Rendered only on recent rows. */
  onRemoveRecent?: (term: string) => void
}

export function SearchDropdown({
  sections,
  activeId,
  loading,
  emptyQuery,
  listboxId,
  onSelect,
  onHover,
  onRemoveRecent,
}: SearchDropdownProps) {
  return (
    <div
      data-testid="topbar-search-results"
      className="absolute left-0 right-0 top-full z-popover mt-2 max-h-[70vh] overflow-y-auto overscroll-contain rounded-lg border border-subtle bg-surface-0 py-2 shadow-lg"
    >
      {/*
        The listbox is always rendered, even while loading or empty. It is the
        element `aria-controls` and `aria-activedescendant` point at; swapping it
        out for a spinner would break those references mid-interaction.
      */}
      <ul id={listboxId} role="listbox" aria-label="Search results">
        {loading && <LoadingRows />}

        {!loading && emptyQuery !== null && <EmptyState query={emptyQuery} />}

        {!loading &&
          emptyQuery === null &&
          sections.map((section) => (
            <li key={section.id}>
              {section.label && (
                <div className="px-3 pb-1 pt-2 text-label uppercase text-muted">
                  {section.label}
                </div>
              )}
              <ul role="group" aria-label={section.label}>
                {section.rows.map((row) => (
                  <Row
                    key={row.id}
                    row={row}
                    active={row.id === activeId}
                    onSelect={onSelect}
                    onHover={onHover}
                    onRemoveRecent={onRemoveRecent}
                  />
                ))}
              </ul>
            </li>
          ))}
      </ul>
    </div>
  )
}

function Row({
  row,
  active,
  onSelect,
  onHover,
  onRemoveRecent,
}: {
  row: SearchRow
  active: boolean
  onSelect: (row: SearchRow) => void
  onHover: (id: string) => void
  onRemoveRecent?: (term: string) => void
}) {
  const Icon = ROW_ICON[row.kind]
  const removable = row.kind === 'recent' && onRemoveRecent !== undefined

  return (
    <li
      id={row.id}
      role="option"
      aria-selected={active}
      data-testid={row.id}
      data-active={active}
      onPointerEnter={() => onHover(row.id)}
      className="group/row relative"
    >
      <Link
        href={row.href}
        // `onMouseDown` with preventDefault, not `onClick`: clicking a row
        // blurs the input first, which closes the dropdown and unmounts the
        // link before the click lands.
        onMouseDown={(event) => {
          event.preventDefault()
          onSelect(row)
        }}
        // Rows are reached with ↑/↓ against aria-activedescendant, so focus
        // never leaves the input and the links must stay out of the tab order.
        tabIndex={-1}
        className={`flex items-start gap-3 py-2 pl-3 transition-colors duration-fast ${
          active ? 'bg-surface-hover' : ''
        } ${removable ? 'pr-10' : 'pr-3'}`}
      >
        <Icon size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-muted" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <Highlighter
              text={row.label}
              ranges={row.ranges}
              className="truncate text-body-strong text-primary"
            />
            {row.meta && row.kind === 'meeting' && (
              <span className="shrink-0 text-xs text-muted">{row.meta}</span>
            )}
          </span>
          {row.detail && (
            <Highlighter
              text={row.detail}
              ranges={row.detailRanges}
              className="mt-0.5 line-clamp-2 text-sm text-secondary"
            />
          )}
          {row.meta && row.kind === 'transcript' && (
            <span className="mt-0.5 block truncate text-xs text-muted">{row.meta}</span>
          )}
        </span>
      </Link>

      {removable && (
        /*
         * A SIBLING of the link, not a child of it.
         *
         * Nested, this was a `<button>` inside an `<a>` — invalid content, and
         * worse: `preventDefault` on mousedown does not stop the `click` that
         * follows, so the click bubbled to the anchor and Next navigated. It
         * only misfired when React had already re-rendered the list, so what
         * you saw was an ✕ that USUALLY removed an entry and occasionally ran
         * the search that had just moved into its place.
         *
         * Pointer-only and outside the tab order, like the link: focus lives in
         * the input while the listbox is driven by aria-activedescendant. The
         * keyboard's route to the same outcome is the "Clear history" row.
         */
        <IconButton
          label={`Remove "${row.label}" from history`}
          size="sm"
          icon={<X size={14} strokeWidth={2} />}
          tabIndex={-1}
          hideTooltip
          data-testid={`${row.id}-remove`}
          onMouseDown={(event) => {
            // Still needed: without it the mousedown blurs the input, which
            // closes the dropdown before the click arrives.
            event.preventDefault()
            onRemoveRecent?.(row.label)
          }}
          className="absolute right-2 top-1.5 opacity-0 transition-opacity duration-fast group-hover/row:opacity-100"
        />
      )}
    </li>
  )
}

/** Three rows, matching the real row height — never a blank floating box (T-08.8). */
function LoadingRows() {
  return (
    <li aria-live="polite" aria-busy="true" data-testid="search-loading">
      <span className="sr-only">Searching…</span>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2">
          <Skeleton className="h-4 w-4 shrink-0 rounded-sm" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </li>
  )
}

function EmptyState({ query }: { query: string }) {
  return (
    <li data-testid="search-empty" className="px-3 py-6 text-center">
      <p className="text-body text-secondary">
        No results for <span className="text-body-strong text-primary">“{query}”</span>
      </p>
      <Link
        href="/notebook"
        tabIndex={-1}
        className="mt-2 inline-block text-body-strong text-accent hover:underline"
      >
        Search all meetings
      </Link>
    </li>
  )
}
