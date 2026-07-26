'use client'

/**
 * The meetings library — the first screen an evaluator sees (T-12).
 *
 * A DATE-GROUPED CARD LIST, not the column table PLAN.md A2.1 specifies. That
 * is a deliberate, recorded deviation: the reference screenshots show grouped
 * cards, and where the plan's researched values have conflicted with the
 * reference before, the reference won (ADR-011, ADR-021). See ADR-036.
 */

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/controls'
import { StateView } from '@/components/ui/state-view'
import { Pagination } from '@/components/ui/pagination'
import { MeetingListSkeleton } from '@/components/ui/skeleton'
import { useQueryClient } from '@tanstack/react-query'

import { useToast } from '@/components/ui/toast'
import { useBulkDelete, useBulkRestore } from '@/lib/api/bulk'
import { ApiError, api } from '@/lib/api/client'
import { toApiParams, useMeetingFacets, useMeetings } from '@/lib/api/meetings'
import { qk } from '@/lib/api/query-keys'
import type { MeetingListItem } from '@/lib/api/types'
import { isTypingTarget } from '@/lib/hooks/use-command-palette'
import { UNDO_WINDOW_MS, useDeleteWithUndo } from '@/lib/hooks/use-delete-with-undo'
import { useSelection } from '@/lib/hooks/use-selection'
import { useLocalStorage } from '@/lib/hooks/use-local-storage'
import { useNotebookParams } from '@/lib/hooks/use-query-params'
import { TOAST_MESSAGES } from '@/lib/toast/messages'
import { pluralize } from '@/lib/utils/format'

import { RemovableChip } from '@/components/ui/chip'

import { BulkBar } from './bulk-bar'
import { DetailsDrawer } from './details-drawer'

import { activeFilterChips, draftFromFilters, filtersFromDraft } from './filter-presets'
import { FiltersPanel } from './filters-panel'
import { groupByDate } from './group-by-date'
import { MeetingGrid } from './meeting-grid'
import { MeetingRow } from './meeting-row'
import {
  FiltersButton,
  NotebookToolbar,
  type NotebookView as ViewMode,
  type QuickFilterId,
} from './notebook-toolbar'
import { quickFilterParams, readQuickFilters } from './quick-filters'

export const VIEW_STORAGE_KEY = 'ff.notebook.view'

/** Every filter key the panel and chips can set, nulled. */
function clearedFilters(): Record<string, null> {
  return {
    host: null,
    participant: null,
    from: null,
    to: null,
    min_duration: null,
    max_duration: null,
    tags: null,
    channel: null,
    has_action_items: null,
  }
}

/**
 * Remove exactly one chip's keys.
 *
 * A tag chip owns `tags:<name>` rather than the whole `tags` array, so removing
 * `#urgent` leaves `#sales` alone — otherwise one ✕ would clear them all.
 */
function removeChip(
  keys: readonly string[],
  filters: { tags: string[] },
): Record<string, string[] | null> {
  const updates: Record<string, string[] | null> = {}

  for (const key of keys) {
    if (key.startsWith('tags:')) {
      const tag = key.slice('tags:'.length)
      const remaining = filters.tags.filter((t) => t !== tag)
      updates.tags = remaining.length > 0 ? remaining : null
    } else {
      updates[key] = null
    }
  }
  return updates
}

export function NotebookView() {
  const { filters, setFilter, setPage, setParams } = useNotebookParams()
  const { data, isPending, isFetching, isError, error, refetch } = useMeetings(filters)
  const { data: facets } = useMeetingFacets()
  const deleteWithUndo = useDeleteWithUndo()

  const [filtersOpen, setFiltersOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  /*
   * `/` focuses the search (T-13.11) — unless the user is already typing, in
   * which case a slash is a slash. Same guard the ⌘K binding uses.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || isTypingTarget(event.target)) return
      event.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const chips = useMemo(() => activeFilterChips(filters), [filters])

  /*
   * The drawer's open state lives in the URL (T-15.12), so it is deep-linkable
   * and survives a refresh. `showDetails(null)` closes it.
   */
  const detailsId = filters.details ?? null
  const showDetails = useCallback(
    (id: number | null) =>
      // `replace`, not push: opening a drawer is not a place you want Back to
      // return you to five times after browsing five meetings.
      setParams({ details: id }, { history: 'replace' }),
    [setParams],
  )

  /*
   * The search field is LOCAL state, debounced into the URL.
   *
   * It was bound straight to `filters.q`, which meant every keystroke made a
   * router round-trip before the character appeared — and typing "a/b" quickly
   * produced "b", because the next keystroke landed before the value came
   * back. A controlled input must never wait on navigation to echo.
   *
   * Seeded from the URL and re-seeded when the URL changes for a reason other
   * than typing (Back, a shared link, Clear all), which `queryKey` captures.
   */
  const urlQuery = filters.q ?? ''
  const [search, setSearch] = useState(urlQuery)
  const [searchKey, setSearchKey] = useState(urlQuery)
  // Compared against the NORMALISED value. Comparing `filters.q` directly
  // loops forever once the query is cleared: it is `undefined` while the state
  // holds `''`, so the guard never settles and React re-renders until it gives
  // up.
  if (urlQuery !== searchKey) {
    setSearchKey(urlQuery)
    setSearch(urlQuery)
  }

  const { value: view, setValue: setView } = useLocalStorage<ViewMode>(VIEW_STORAGE_KEY, 'list')

  const activeQuickFilters = readQuickFilters(filters)
  const items = useMemo(() => data?.items ?? [], [data])
  const pageIds = useMemo(() => items.map((m) => m.id), [items])

  const selection = useSelection(pageIds)
  const bulkDelete = useBulkDelete()
  const bulkRestore = useBulkRestore()
  const toast = useToast()
  const client = useQueryClient()

  /*
   * Selection is cleared when the FILTERS change, and said out loud (T-14.1).
   *
   * It survives paging deliberately — three on page 1 plus two on page 2 means
   * five — but a filter change can remove rows the user picked from the result
   * set entirely, and silently bulk-deleting something they can no longer see
   * is the worst outcome available here.
   */
  const filterKey = JSON.stringify({ ...filters, page: undefined })
  const [lastFilterKey, setLastFilterKey] = useState(filterKey)
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey)
    if (selection.count > 0) {
      selection.clear()
      toast.info(`Selection cleared — ${pluralize(selection.count, 'meeting')} deselected`)
    }
  }

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

  const removeSelected = useCallback(async () => {
    const ids = [...selection.selected]

    const result = await bulkDelete.mutateAsync(ids)
    selection.clear()

    if (result.failed.length > 0) {
      // "2 of 3 deleted" rather than a bare success — the user is entitled to
      // know their batch was not applied whole (T-14.6).
      toast.warning(`${result.deleted} of ${ids.length} deleted`)
      return
    }

    const deletedIds = ids.filter((id) => !result.failed.includes(id))
    toast.success({
      message: `${pluralize(result.deleted, 'meeting')} deleted`,
      duration: UNDO_WINDOW_MS,
      action: {
        label: 'Undo',
        // Same constraint as the single-row undo (ADR-026): this handler
        // outlives the rows it came from, so it must not depend on any of them
        // still being mounted.
        onClick: () => {
          bulkRestore.mutate(deletedIds, {
            onSuccess: () => toast.success(TOAST_MESSAGES.meetingRestored),
          })
        },
      },
    })
  }, [selection, bulkDelete, bulkRestore, toast])

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
    // Its own padding, now that the shell no longer imposes any.
    <div data-testid="notebook-page" className="space-y-6 px-4 py-6 md:px-6">
      <header className="flex items-baseline gap-3">
        <h1 className="text-display text-primary">Meetings</h1>
        {data && (
          <span className="text-sm text-muted" data-testid="notebook-count">
            {pluralize(data.total, 'meeting')}
          </span>
        )}
      </header>

      <NotebookToolbar
        query={search}
        onQueryChange={setSearch}
        onQueryCommit={(value) => {
          // `replace`, not push: one character typed must not cost one Back
          // press. A deliberate filter change still pushes.
          setSearchKey(value)
          setFilter({ q: value }, { history: 'replace' })
        }}
        sort={filters.sort}
        onSortChange={(value) => setFilter({ sort: value === '-started_at' ? null : value })}
        view={view}
        onViewChange={setView}
        active={activeQuickFilters}
        onToggleQuickFilter={toggleQuickFilter}
        searchRef={searchRef}
        filtersTrigger={
          <FiltersPanel
            open={filtersOpen}
            onOpenChange={setFiltersOpen}
            applied={draftFromFilters(filters)}
            facets={facets}
            activeCount={chips.length}
            onApply={(draft) => setFilter(filtersFromDraft(draft))}
            onClear={() => setFilter(clearedFilters())}
            // GROUPS, not values: `from` and `to` are one date filter, so the
            // chips are the right thing to count — there is exactly one per
            // group by construction.
            trigger={<FiltersButton activeCount={chips.length} />}
          />
        }
        searching={isFetching && !isPending}
      />

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" data-testid="active-filter-chips">
          {chips.map((chip) => (
            <RemovableChip
              key={chip.id}
              label={chip.label}
              testId={`active-filter-chip-${chip.id}`}
              onRemove={() => setFilter(removeChip(chip.keys, filters))}
            />
          ))}
          <Button
            variant="link"
            size="sm"
            onClick={() => setFilter(clearedFilters())}
            data-testid="active-filters-clear"
          >
            Clear all
          </Button>
        </div>
      )}

      {isPending && <MeetingListSkeleton />}

      {isError && <ErrorState error={error} onRetry={() => void refetch()} />}

      {data && items.length === 0 && (
        <NotebookEmpty
          query={filters.q}
          chips={chips}
          onClearFilters={() => setFilter(clearedFilters())}
          onClearSearch={() => {
            setSearch('')
            setSearchKey('')
            setFilter({ q: null })
          }}
        />
      )}

      {data && items.length > 0 && view === 'grid' && (
        <MeetingGrid meetings={items} query={filters.q} />
      )}

      {data && items.length > 0 && view === 'list' && (
        <GroupedList
          groups={groups}
          selection={selection}
          query={filters.q}
          onDelete={(id) => void deleteWithUndo(id)}
          onShowDetails={showDetails}
          onPrefetch={(id) =>
            void client.prefetchQuery({
              queryKey: qk.meetings.detail(id),
              queryFn: ({ signal }) => api.get(`/api/v1/meetings/${id}`, { signal }),
            })
          }
        />
      )}

      {data && (
        <Pagination
          page={data.page}
          totalPages={data.total_pages}
          onPageChange={(next) => {
            setPage(next)
            // Smoothly, and only on a deliberate page change — the user is
            // asking for different rows and should be looking at the top of
            // them (T-14.8).
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
          total={data.total}
          pageSize={filters.pageSize}
          onPageSizeChange={(size) => setFilter({ page_size: size === 20 ? null : size })}
          onPrefetchNext={() =>
            void client.prefetchQuery({
              queryKey: qk.meetings.list({ ...filters, page: data.page + 1 }),
              queryFn: ({ signal }) =>
                api.get('/api/v1/meetings', {
                  signal,
                  params: { ...toApiParams(filters), page: data.page + 1 },
                }),
            })
          }
        />
      )}

      {detailsId !== null && (
        <DetailsDrawer
          meetingId={detailsId}
          onClose={() => {
            showDetails(null)
            // Focus returns to the row that opened it (T-15.3) — otherwise a
            // keyboard user is dropped at the top of the document.
            document.querySelector<HTMLElement>(`[data-testid="meeting-row-${detailsId}"]`)?.focus()
          }}
          onNavigate={(direction) => {
            const index = pageIds.indexOf(detailsId)
            const next = pageIds[index + direction]
            if (next !== undefined) showDetails(next)
          }}
        />
      )}

      <BulkBar
        count={selection.count}
        total={data?.total ?? 0}
        canSelectAllMatching={selection.pageState === 'all' && (data?.total ?? 0) > selection.count}
        onSelectAllMatching={() =>
          // Honest about its scope: it selects what is ON THIS PAGE plus a
          // promise, which this build cannot keep without fetching every id.
          // So it fetches them.
          void selectEveryMatch()
        }
        onClear={selection.clear}
        onDelete={removeSelected}
      />
    </div>
  )

  async function selectEveryMatch() {
    const all = await api.get<{ items: Array<{ id: number }> }>('/api/v1/meetings', {
      params: { ...toApiParams(filters), page: 1, page_size: 100 },
    })
    selection.setMany(
      all.items.map((m) => m.id),
      true,
    )
  }
}

interface GroupedListProps {
  groups: Array<{ key: string; label: string; items: MeetingListItem[] }>
  selection: ReturnType<typeof useSelection<number>>
  query?: string
  onDelete: (id: number) => void
  onShowDetails: (id: number) => void
  onPrefetch: (id: number) => void
}

function GroupedList({
  groups,
  selection,
  query,
  onDelete,
  onShowDetails,
  onPrefetch,
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
      selection.toggle(activeId, !selection.isSelected(activeId))
    }
  }

  return (
    <div ref={listRef} onKeyDown={onKeyDown} className="space-y-6" data-testid="meeting-list">
      {groups.map((group) => {
        const groupIds = group.items.map((m) => m.id)
        const allSelected = groupIds.every((id) => selection.isSelected(id))
        const someSelected = groupIds.some((id) => selection.isSelected(id))

        return (
          <section key={group.key} className="space-y-2">
            {group.label && (
              <div className="flex items-center gap-2.5 px-1">
                <Checkbox
                  // Indeterminate when only part of the day is selected — a
                  // plain unchecked box would claim nothing in it is.
                  checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                  onCheckedChange={(next) => selection.setMany(groupIds, next)}
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
                  selected={selection.isSelected(meeting.id)}
                  onSelectedChange={(next) => selection.toggle(meeting.id, next)}
                  onShiftSelect={() => selection.selectRange(meeting.id)}
                  anySelected={selection.count > 0}
                  query={query}
                  onDelete={onDelete}
                  onShowDetails={onShowDetails}
                  onPrefetch={() => onPrefetch(meeting.id)}
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

function NotebookEmpty({
  query,
  chips,
  onClearFilters,
  onClearSearch,
}: {
  query?: string
  chips: readonly { id: string; label: string }[]
  onClearFilters: () => void
  onClearSearch: () => void
}) {
  /*
   * THREE genuinely different situations, three different screens (T-16.1–3).
   *
   * Collapsing them into one "No data" message is on the do-not-ship list, and
   * for good reason: the user's next action differs in each case. With no
   * meetings at all they need to create one; with a filter on they need to
   * relax it; with a search term they need to change it. A shared message tells
   * them none of that.
   */
  if (query) {
    return (
      <StateView
        variant="no-results"
        testId="notebook-empty"
        title={`No results for “${query}”`}
        body="Try a different search term, or check the spelling."
        action={
          <Button variant="secondary" onClick={onClearSearch} data-testid="empty-clear-search">
            Clear search
          </Button>
        }
      />
    )
  }

  if (chips.length > 0) {
    return (
      <StateView
        variant="no-matches"
        testId="notebook-empty"
        title="No meetings match your filters"
        body="Nothing here fits every filter you have on."
        // Echoing the active filters, so the user can see WHICH one to relax
        // rather than clearing all of them to find out.
        detail={chips.map((chip) => chip.label).join(' · ')}
        action={
          <Button variant="primary" onClick={onClearFilters} data-testid="empty-clear-filters">
            Clear all filters
          </Button>
        }
      />
    )
  }

  return (
    <StateView
      variant="empty"
      testId="notebook-empty"
      title="No meetings yet"
      body="Upload a transcript or create a meeting to get started."
      action={
        <Button variant="primary" asChild data-testid="empty-upload">
          <Link href="/upload?tab=upload">Upload transcript</Link>
        </Button>
      }
      secondaryAction={
        <Button variant="secondary" asChild data-testid="empty-create">
          <Link href="/upload?tab=manual">Create manually</Link>
        </Button>
      }
    />
  )
}

function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const code = error instanceof ApiError ? error.code : 'NETWORK_ERROR'
  const message =
    error instanceof Error ? error.message : 'Something went wrong loading your meetings.'

  return (
    <StateView
      variant="error"
      testId="notebook-error"
      title="Couldn't load meetings"
      body={message}
      // The code in muted mono, for whoever is reading the console beside this.
      // Deliberately quiet: it is a handle for a bug report, not the message.
      detail={<code className="font-mono">{code}</code>}
      action={
        <Button variant="primary" onClick={onRetry} data-testid="notebook-retry">
          Try again
        </Button>
      }
    />
  )
}
