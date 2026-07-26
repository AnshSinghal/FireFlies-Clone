'use client'

/**
 * Notebook toolbar and quick filters (T-12.2, T-12.3).
 *
 * Everything here writes to the URL rather than to component state, so a
 * filtered view is a shareable link and Back undoes a filter — the property
 * `use-query-params` exists to guarantee.
 */

import { LayoutGrid, List, SlidersHorizontal } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge, ToggleChip } from '@/components/ui/chip'
import { IconButton } from '@/components/ui/icon-button'
import { SearchInput } from '@/components/ui/search-input'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils/cn'

export type NotebookView = 'list' | 'grid'

/** Whitelisted server-side; the labels are the client's business. */
export const SORT_OPTIONS = [
  { value: '-started_at', label: 'Newest first' },
  { value: 'started_at', label: 'Oldest first' },
  { value: '-duration_seconds', label: 'Longest first' },
  { value: 'duration_seconds', label: 'Shortest first' },
  { value: 'title', label: 'Title A–Z' },
  { value: '-title', label: 'Title Z–A' },
] as const

/**
 * The four quick filters from the reference's own toolbar.
 *
 * Each maps to real API parameters — a chip that filters nothing is worse than
 * no chip, because the user assumes it worked.
 */
export const QUICK_FILTERS = [
  { id: 'hosted-by-me', label: 'Hosted by me' },
  { id: 'shared-with-me', label: 'Shared with me' },
  { id: 'has-action-items', label: 'Has action items' },
  { id: 'this-week', label: 'This week' },
] as const

export type QuickFilterId = (typeof QUICK_FILTERS)[number]['id']

interface NotebookToolbarProps {
  query: string
  onQueryChange: (value: string) => void
  sort: string
  onSortChange: (value: string) => void
  view: NotebookView
  onViewChange: (view: NotebookView) => void
  active: readonly QuickFilterId[]
  onToggleQuickFilter: (id: QuickFilterId) => void
  /** Drives the count badge on the Filters button. */
  activeFilterCount: number
  onOpenFilters: () => void
  searching: boolean
}

export function NotebookToolbar({
  query,
  onQueryChange,
  sort,
  onSortChange,
  view,
  onViewChange,
  active,
  onToggleQuickFilter,
  activeFilterCount,
  onOpenFilters,
  searching,
}: NotebookToolbarProps) {
  return (
    <div className="space-y-3" data-testid="notebook-toolbar">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 sm:max-w-search">
          <SearchInput
            value={query}
            onChange={onQueryChange}
            ariaLabel="Search meetings"
            placeholder="Search by title or keyword"
            loading={searching}
            testId="notebook-search"
          />
        </div>

        <Button
          variant="secondary"
          onClick={onOpenFilters}
          data-testid="notebook-filters-button"
          leftIcon={<SlidersHorizontal size={16} strokeWidth={1.75} />}
          rightIcon={
            activeFilterCount > 0 ? (
              <Badge variant="accent" shape="count">
                {activeFilterCount}
              </Badge>
            ) : undefined
          }
        >
          Filters
        </Button>

        <Select
          label="Sort by"
          hideLabel
          value={sort}
          onValueChange={onSortChange}
          options={SORT_OPTIONS.map((option) => ({ ...option }))}
          testId="notebook-sort"
        />

        {/* Segmented list/grid toggle. `aria-pressed` on each half rather than
            a single toggle button, so a screen reader hears which view is on. */}
        <div
          className="flex shrink-0 items-center gap-0.5 rounded-md bg-surface-2 p-0.5"
          role="group"
          aria-label="View"
        >
          <ViewButton
            active={view === 'list'}
            label="List view"
            testId="notebook-view-list"
            onClick={() => onViewChange('list')}
            icon={<List size={16} strokeWidth={1.75} />}
          />
          <ViewButton
            active={view === 'grid'}
            label="Grid view"
            testId="notebook-view-grid"
            onClick={() => onViewChange('grid')}
            icon={<LayoutGrid size={16} strokeWidth={1.75} />}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2" data-testid="notebook-quick-filters">
        {QUICK_FILTERS.map((filter) => (
          <ToggleChip
            key={filter.id}
            selected={active.includes(filter.id)}
            onToggle={() => onToggleQuickFilter(filter.id)}
            testId={`quick-filter-${filter.id}`}
          >
            {filter.label}
          </ToggleChip>
        ))}
      </div>
    </div>
  )
}

function ViewButton({
  active,
  label,
  icon,
  onClick,
  testId,
}: {
  active: boolean
  label: string
  icon: React.ReactNode
  onClick: () => void
  testId: string
}) {
  return (
    <IconButton
      label={label}
      icon={icon}
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className={cn(active ? 'bg-surface-0 text-primary shadow-xs' : 'text-muted')}
    />
  )
}
