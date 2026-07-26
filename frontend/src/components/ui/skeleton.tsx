/**
 * Loading placeholders (T-06.9, T-10.13).
 *
 * The geometry matters more than the shimmer. A skeleton row must be EXACTLY as
 * tall as the row it stands in for, or content jumps when data lands and the
 * page scores badly on CLS (T06-I asks for < 0.1).
 *
 * The shimmer is a background-position animation, which the reduced-motion rule
 * in globals.css collapses automatically — no separate handling needed here.
 */

import { cn } from '@/lib/utils/cn'

export type SkeletonVariant = 'text' | 'circle' | 'rect'

const VARIANT: Record<SkeletonVariant, string> = {
  // `text` carries its own height, so the common case needs no className at all
  // and every text skeleton in the app is the same height.
  text: 'h-3.5 rounded-sm',
  circle: 'rounded-full',
  rect: 'rounded-md',
}

export function Skeleton({
  variant = 'rect',
  className = '',
}: {
  variant?: SkeletonVariant
  className?: string
}) {
  return (
    <div
      aria-hidden="true"
      className={cn('ff-shimmer bg-surface-2', VARIANT[variant], className)}
      data-testid="skeleton"
    />
  )
}

/** A block of text lines, the last one short so it reads as a paragraph. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} data-testid="skeleton-text">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} variant="text" className={i === lines - 1 ? 'w-2/3' : 'w-full'} />
      ))}
    </div>
  )
}

/**
 * One meeting row's placeholder.
 *
 * Height is pinned to the row token so this cannot drift from the real row —
 * see design.md §3.7, and the open question at §2.2 about whether the Notebook
 * is a table or cards, which would change this number.
 */
export function MeetingRowSkeleton() {
  return (
    <div
      className="flex h-row items-center gap-3 border-b border-subtle px-4"
      data-testid="meeting-row-skeleton"
    >
      <Skeleton className="h-10 w-10 shrink-0 rounded-md" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <Skeleton className="h-3 w-16 shrink-0" />
      <Skeleton className="h-3 w-12 shrink-0" />
    </div>
  )
}

export function MeetingListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div data-testid="meeting-list-skeleton" aria-busy="true" aria-label="Loading meetings">
      {Array.from({ length: rows }, (_, index) => (
        <MeetingRowSkeleton key={index} />
      ))}
    </div>
  )
}
