'use client'

/**
 * Pagination (T-10.15) and ProgressBar (T-10.16).
 */

import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils/cn'

/**
 * Page numbers with ellipses, always the same LENGTH.
 *
 * A control whose width changes as you page through it makes `Next` move under
 * the pointer — click twice quickly and the second click lands on a number.
 * So the window is fixed at 7 slots and the ellipses are placeholders inside
 * it, not an optimisation applied only when the list is long.
 *
 * Exported for testing: the boundary cases (page 1, page N, fewer than 7 pages)
 * are exactly where off-by-ones live.
 */
export function pageWindow(current: number, total: number): Array<number | 'gap'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  // Near the start: 1 2 3 4 5 … N
  if (current <= 4) return [1, 2, 3, 4, 5, 'gap', total]

  // Near the end: 1 … N-4 N-3 N-2 N-1 N
  if (current >= total - 3) {
    return [1, 'gap', total - 4, total - 3, total - 2, total - 1, total]
  }

  // In the middle: 1 … c-1 c c+1 … N
  return [1, 'gap', current - 1, current, current + 1, 'gap', total]
}

interface PaginationProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  /** Enables the `Showing 1–20 of 47` summary and the page-size select. */
  total?: number
  pageSize?: number
  onPageSizeChange?: (size: number) => void
  /** Fired on hover of Next, to prefetch what the user is about to ask for. */
  onPrefetchNext?: () => void
  className?: string
}

/** The plan's three sizes. Beyond 100 the page is slower than paging. */
export const PAGE_SIZES = [20, 50, 100] as const

export function Pagination({
  page,
  totalPages,
  onPageChange,
  total,
  pageSize,
  onPageSizeChange,
  onPrefetchNext,
  className,
}: PaginationProps) {
  // Hidden entirely for a single page — a lone disabled `[1]` is noise that
  // implies there is somewhere else to go (T-14.10).
  if (totalPages <= 1) return null

  const pages = pageWindow(page, totalPages)
  const first = total !== undefined && pageSize ? (page - 1) * pageSize + 1 : 0
  const last = total !== undefined && pageSize ? Math.min(page * pageSize, total) : 0

  return (
    <nav
      aria-label="Pagination"
      data-testid="pagination"
      className={cn('flex flex-wrap items-center justify-between gap-3', className)}
    >
      {total !== undefined && pageSize ? (
        <div className="flex items-center gap-3">
          <span className="tnum text-sm text-muted" data-testid="pagination-summary">
            Showing {first}–{last} of {total}
          </span>
          {onPageSizeChange && (
            <Select
              label="Per page"
              hideLabel
              value={String(pageSize)}
              onValueChange={(value) => onPageSizeChange(Number(value))}
              options={PAGE_SIZES.map((size) => ({
                value: String(size),
                label: `${size} per page`,
              }))}
              testId="page-size-select"
            />
          )}
        </div>
      ) : (
        <span />
      )}

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          data-testid="pagination-prev"
          className="flex h-btn-sm w-btn-sm items-center justify-center rounded-md text-muted transition-colors duration-fast hover:bg-surface-hover hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <ChevronLeft size={16} strokeWidth={2} />
        </button>

        {pages.map((entry, i) =>
          entry === 'gap' ? (
            <span key={`gap-${i}`} aria-hidden="true" className="px-1 text-body text-muted">
              …
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              onClick={() => onPageChange(entry)}
              // `aria-current`, not `aria-selected` — this is the current page of
              // a set, not a selected option in a listbox.
              aria-current={entry === page ? 'page' : undefined}
              aria-label={`Page ${entry}`}
              data-testid={`pagination-page-${entry}`}
              className={cn(
                'tnum flex h-btn-sm min-w-btn-sm items-center justify-center rounded-md px-2 text-body-strong transition-colors duration-fast',
                entry === page
                  ? 'bg-accent-subtle text-accent'
                  : 'text-secondary hover:bg-surface-hover hover:text-primary',
              )}
            >
              {entry}
            </button>
          ),
        )}

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          // Prefetch what the user is about to ask for. A hover is a strong
          // enough signal, and the query cache makes a wasted one free.
          onPointerEnter={onPrefetchNext}
          onFocus={onPrefetchNext}
          disabled={page >= totalPages}
          aria-label="Next page"
          data-testid="pagination-next"
          className="flex h-btn-sm w-btn-sm items-center justify-center rounded-md text-muted transition-colors duration-fast hover:bg-surface-hover hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <ChevronRight size={16} strokeWidth={2} />
        </button>
      </div>
    </nav>
  )
}

interface ProgressBarProps {
  /** 0–1. Clamped, so a caller's rounding error cannot overflow the track. */
  value: number
  label: string
  /** Hides the numeric readout; the label still names the bar for assistive tech. */
  hideLabel?: boolean
  className?: string
  testId?: string
}

export function ProgressBar({ value, label, hideLabel, className, testId }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, value))
  const percent = Math.round(clamped * 100)

  return (
    <div className={cn('space-y-1.5', className)}>
      {!hideLabel && (
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-secondary">{label}</span>
          <span className="tnum text-sm text-muted">{percent}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        data-testid={testId}
        className="h-1.5 overflow-hidden rounded-full bg-surface-2"
      >
        {/* `scaleX` on a full-width child rather than an animated `width`:
            transforms are composited, width changes force layout every frame. */}
        <div
          className="h-full w-full origin-left rounded-full bg-accent transition-transform duration-base"
          style={{ transform: `scaleX(${clamped})` }}
        />
      </div>
    </div>
  )
}
