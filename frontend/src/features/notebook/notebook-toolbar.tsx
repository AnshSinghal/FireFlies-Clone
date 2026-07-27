'use client'

/**
 * Notebook toolbar and quick filters (T-12.2, T-12.3).
 *
 * Everything here writes to the URL rather than to component state, so a
 * filtered view is a shareable link and Back undoes a filter — the property
 * `use-query-params` exists to guarantee.
 */

import { LayoutGrid, List, SlidersHorizontal } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes } from 'react'

import { Button } from '@/components/ui/button'
import { Badge, ToggleChip } from '@/components/ui/chip'
import { IconButton } from '@/components/ui/icon-button'
import { SearchInput } from '@/components/ui/search-input'
import { Select } from '@/components/ui/select'
import { SORT_OPTIONS } from '@/lib/meetings/sort-options'
import { cn } from '@/lib/utils/cn'

export type NotebookView = 'list' | 'grid'

/** Whitelisted server-side; the labels are the client's business. Moved to
 * lib so Settings → Preferences can offer the same list without a
 * features→features import (T-30.7); re-exported to keep existing importers. */
export { SORT_OPTIONS } from '@/lib/meetings/sort-options'

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
  /** Fires once typing settles — this is what writes to the URL. */
  onQueryCommit: (value: string) => void
  sort: string
  onSortChange: (value: string) => void
  view: NotebookView
  onViewChange: (view: NotebookView) => void
  active: readonly QuickFilterId[]
  onToggleQuickFilter: (id: QuickFilterId) => void
  /** The FiltersPanel renders its own trigger, so the toolbar is handed one. */
  filtersTrigger: React.ReactNode
  searching: boolean
  searchRef?: React.Ref<HTMLInputElement>
}

export function NotebookToolbar({
  query,
  onQueryChange,
  onQueryCommit,
  sort,
  onSortChange,
  view,
  onViewChange,
  active,
  onToggleQuickFilter,
  filtersTrigger,
  searching,
  searchRef,
}: NotebookToolbarProps) {
  return (
    <div className="space-y-3" data-testid="notebook-toolbar">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 sm:max-w-search">
          <SearchInput
            ref={searchRef}
            value={query}
            onChange={onQueryChange}
            onDebouncedChange={onQueryCommit}
            // Escape clears rather than blurring: in a search field the thing
            // you want undone is the query, not the focus (T-13.11).
            onKeyDown={(event) => {
              if (event.key === 'Escape' && query) {
                event.preventDefault()
                onQueryChange('')
                onQueryCommit('')
              }
            }}
            ariaLabel="Search meetings"
            placeholder="Search by title or keyword"
            loading={searching}
            testId="notebook-search"
          />
        </div>

        {filtersTrigger}

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

/**
 * The Filters button, exported so the panel can own it as its own trigger.
 *
 * Radix needs the trigger inside the Popover to wire `aria-expanded`, focus
 * return and outside-click detection — a button rendered elsewhere that merely
 * flips an `open` prop gets none of that.
 *
 * `forwardRef` and `...props` are LOad-BEARING. `Popover.Trigger asChild` uses
 * Radix's `Slot`, which clones its immediate child and hands it the trigger's
 * props and ref. When that child is a component rather than a DOM element,
 * anything it does not forward is silently dropped — the first version of this
 * swallowed every one of them, and the panel simply never opened, with no
 * error anywhere.
 */
export const FiltersButton = forwardRef<
  HTMLButtonElement,
  { activeCount: number } & ButtonHTMLAttributes<HTMLButtonElement>
>(function FiltersButton({ activeCount, ...props }, ref) {
  return (
    <Button
      ref={ref}
      variant="secondary"
      data-testid="filters-button"
      leftIcon={<SlidersHorizontal size={16} strokeWidth={1.75} />}
      rightIcon={
        activeCount > 0 ? (
          <Badge variant="accent" shape="count">
            {activeCount}
          </Badge>
        ) : undefined
      }
      {...props}
    >
      Filters
    </Button>
  )
})
