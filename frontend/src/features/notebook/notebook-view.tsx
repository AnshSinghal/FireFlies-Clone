'use client'

/**
 * The meetings library — the first screen an evaluator sees (T-12).
 *
 * A DATE-GROUPED CARD LIST, not the column table PLAN.md A2.1 specifies. That
 * is a deliberate, recorded deviation: the reference screenshots show grouped
 * cards, and where the plan's researched values have conflicted with the
 * reference before, the reference won (ADR-011, ADR-021). See ADR-036.
 */

import { useCallback, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/controls'
import { EmptyInbox, EmptySearch, EmptyState } from '@/components/ui/empty-state'
import { Pagination } from '@/components/ui/pagination'
import { MeetingListSkeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api/client'
import { useMeetings } from '@/lib/api/meetings'
import type { MeetingListItem } from '@/lib/api/types'
import { useDeleteWithUndo } from '@/lib/hooks/use-delete-with-undo'
import { useLocalStorage } from '@/lib/hooks/use-local-storage'
import { useNotebookParams } from '@/lib/hooks/use-query-params'
import { pluralize } from '@/lib/utils/format'

import { groupByDate } from './group-by-date'
import { MeetingGrid } from './meeting-grid'
import { MeetingRow } from './meeting-row'
import {
  NotebookToolbar,
  type NotebookView as ViewMode,
  type QuickFilterId,
} from './notebook-toolbar'
import { quickFilterParams, readQuickFilters } from './quick-filters'

export const VIEW_STORAGE_KEY = 'ff.notebook.view'

export function NotebookView() {
  const { filters, activeFilterCount, setFilter, setPage } = useNotebookParams()
  const { data, isPending, isFetching, isError, error, refetch } = useMeetings(filters)
  const deleteWithUndo = useDeleteWithUndo()

  const { value: view, setValue: setView } = useLocalStorage<ViewMode>(VIEW_STORAGE_KEY, 'list')

  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set())
  const activeQuickFilters = readQuickFilters(filters)

  const items = useMemo(() => data?.items ?? [], [data])

  /*
   * Grouping only makes sense for a chronological sort. Sorted by title, every
   * meeting lands in its own date group and the headings become noise — so the
   * list falls back to a flat run, which is the honest rendering of that
   * request.
   */
  const grouped = filters.sort.includes('started_at')
  const groups = useMemo(
    () => (grouped ? groupByDate(items, (m) => m.started_at) : [{ key: 'all', label: '', items }]),
    [items, grouped],
  )

  const toggleSelected = useCallback((id: number, next: boolean) => {
    setSelected((current) => {
      const copy = new Set(current)
      if (next) copy.add(id)
      else copy.delete(id)
      return copy
    })
  }, [])

  const toggleGroup = useCallback((groupItems: MeetingListItem[], next: boolean) => {
    setSelected((current) => {
      const copy = new Set(current)
      for (const meeting of groupItems) {
        if (next) copy.add(meeting.id)
        else copy.delete(meeting.id)
      }
      return copy
    })
  }, [])

  const toggleQuickFilter = useCallback(
    (id: QuickFilterId) => {
      const next = activeQuickFilters.includes(id)
        ? activeQuickFilters.filter((f) => f !== id)
        : [...activeQuickFilters, id]
      setFilter(quickFilterParams(next))
    },
    [activeQuickFilters, setFilter],
  )

  return (
    <div data-testid="notebook-page" className="space-y-6">
      <header className="flex items-baseline gap-3">
        <h1 className="text-display text-primary">Meetings</h1>
        {data && (
          <span className="text-sm text-muted" data-testid="notebook-count">
            {pluralize(data.total, 'meeting')}
          </span>
        )}
      </header>

      <NotebookToolbar
        query={filters.q ?? ''}
        onQueryChange={(value) =>
          // `replace`, not push: one character typed must not cost one Back
          // press. A deliberate filter change still pushes.
          setFilter({ q: value }, { history: 'replace' })
        }
        sort={filters.sort}
        onSortChange={(value) => setFilter({ sort: value === '-started_at' ? null : value })}
        view={view}
        onViewChange={setView}
        active={activeQuickFilters}
        onToggleQuickFilter={toggleQuickFilter}
        activeFilterCount={activeFilterCount}
        // T-13 builds the real panel. Until then the button toggles the one
        // filter the toolbar cannot otherwise reach, rather than being a dead
        // control that does nothing when clicked.
        onOpenFilters={() =>
          setFilter({ has_action_items: filters.hasActionItems ? null : 'true' })
        }
        searching={isFetching && !isPending}
      />

      {isPending && <MeetingListSkeleton />}

      {isError && <ErrorState error={error} onRetry={() => void refetch()} />}

      {data && items.length === 0 && (
        <NotebookEmpty hasQuery={Boolean(filters.q) || activeFilterCount > 0} />
      )}

      {data && items.length > 0 && view === 'grid' && (
        <MeetingGrid meetings={items} query={filters.q} />
      )}

      {data && items.length > 0 && view === 'list' && (
        <GroupedList
          groups={groups}
          selected={selected}
          onToggleSelected={toggleSelected}
          onToggleGroup={toggleGroup}
          query={filters.q}
          onDelete={(id) => void deleteWithUndo(id)}
        />
      )}

      {data && data.total_pages > 1 && (
        <Pagination page={data.page} totalPages={data.total_pages} onPageChange={setPage} />
      )}
    </div>
  )
}

interface GroupedListProps {
  groups: Array<{ key: string; label: string; items: MeetingListItem[] }>
  selected: ReadonlySet<number>
  onToggleSelected: (id: number, next: boolean) => void
  onToggleGroup: (items: MeetingListItem[], next: boolean) => void
  query?: string
  onDelete: (id: number) => void
}

function GroupedList({
  groups,
  selected,
  onToggleSelected,
  onToggleGroup,
  query,
  onDelete,
}: GroupedListProps) {
  const flat = useMemo(() => groups.flatMap((group) => group.items), [groups])
  const listRef = useRef<HTMLDivElement>(null)

  /*
   * ROVING TABINDEX (T-12.12): exactly one row is tabbable, and ↑/↓ move which.
   *
   * Without it, tabbing through a 20-row list costs 20 presses before reaching
   * the pagination — which is why native listboxes work this way.
   *
   * Derived rather than stored-and-synced: if the focused row disappears (a
   * delete, a filter change) the first row takes over during render, with no
   * effect and no intermediate frame pointing at a row that is gone.
   */
  const [preferredId, setPreferredId] = useState<number | null>(null)
  const activeId =
    preferredId !== null && flat.some((m) => m.id === preferredId) ? preferredId : flat[0]?.id

  const move = (delta: number) => {
    const index = flat.findIndex((m) => m.id === activeId)
    const next = flat[Math.max(0, Math.min(flat.length - 1, index + delta))]
    if (!next) return
    setPreferredId(next.id)
    listRef.current?.querySelector<HTMLElement>(`[data-testid="meeting-row-${next.id}"]`)?.focus()
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      move(1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      move(-1)
    } else if (event.key === 'x' && activeId !== undefined) {
      // The plan's power-user selection toggle. `x` and not Space, because
      // Space on a focused link scrolls the page and stealing that is worse
      // than not having the shortcut.
      event.preventDefault()
      onToggleSelected(activeId, !selected.has(activeId))
    }
  }

  return (
    <div ref={listRef} onKeyDown={onKeyDown} className="space-y-6" data-testid="meeting-list">
      {groups.map((group) => {
        const allSelected = group.items.every((m) => selected.has(m.id))
        const someSelected = group.items.some((m) => selected.has(m.id))

        return (
          <section key={group.key} className="space-y-2">
            {group.label && (
              <div className="flex items-center gap-2.5 px-1">
                <Checkbox
                  // Indeterminate when only part of the day is selected — a
                  // plain unchecked box would claim nothing in it is.
                  checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                  onCheckedChange={(next) => onToggleGroup(group.items, next)}
                  ariaLabel={`Select all meetings on ${group.label}`}
                  testId={`select-group-${group.key}`}
                />
                <h2 className="text-body-strong text-secondary">{group.label}</h2>
              </div>
            )}

            <ul className="space-y-2">
              {group.items.map((meeting) => (
                <MeetingRow
                  key={meeting.id}
                  meeting={meeting}
                  selected={selected.has(meeting.id)}
                  onSelectedChange={(next) => onToggleSelected(meeting.id, next)}
                  anySelected={selected.size > 0}
                  query={query}
                  onDelete={onDelete}
                  tabIndex={meeting.id === activeId ? 0 : -1}
                  onFocus={() => setPreferredId(meeting.id)}
                />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function NotebookEmpty({ hasQuery }: { hasQuery: boolean }) {
  // Two genuinely different situations, two different messages (T-13.10).
  // Reusing one for both is on the do-not-ship list.
  return (
    <EmptyState
      testId="notebook-empty"
      illustration={hasQuery ? <EmptySearch /> : <EmptyInbox />}
      title={hasQuery ? 'No meetings match your search' : 'No meetings yet'}
      body={
        hasQuery
          ? 'Try a different term, or clear the search to see everything.'
          : 'Upload a transcript or create a meeting to get started.'
      }
    />
  )
}

function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const code = error instanceof ApiError ? error.code : 'NETWORK_ERROR'
  const message =
    error instanceof Error ? error.message : 'Something went wrong loading your meetings.'

  return (
    <EmptyState
      testId="notebook-error"
      title="Couldn't load meetings"
      body={message}
      action={
        <Button variant="primary" onClick={onRetry} data-testid="notebook-retry">
          Try again
        </Button>
      }
      secondaryAction={<code className="text-xs text-muted">{code}</code>}
    />
  )
}
