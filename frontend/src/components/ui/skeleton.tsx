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
 * One meeting card's placeholder.
 *
 * MIRRORS the real card's box model exactly — same border, same padding, same
 * leading square, same two text lines — rather than approximating it with a
 * fixed height. A skeleton whose height is maintained separately from the thing
 * it stands in for drifts the first time the row changes, and the symptom is
 * content jumping when data lands (T06-I asks for CLS < 0.1).
 *
 * The Notebook is a date-grouped card list, not a table (ADR-036), so this is
 * a card and not a row.
 */
export function MeetingRowSkeleton() {
  return (
    <div
      className="flex h-row items-center gap-3 rounded-lg border border-subtle bg-surface-0 px-3"
      data-testid="meeting-row-skeleton"
    >
      <Skeleton variant="rect" className="h-10 w-10 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/* The two lines are sized to the type they replace — 22px title,
            18px meta — so the card is the same height either way. */}
        <Skeleton variant="text" className="h-[22px] w-1/3" />
        <Skeleton variant="text" className="h-[18px] w-2/3" />
      </div>
      <Skeleton variant="circle" className="h-6 w-16 shrink-0" />
      <Skeleton variant="text" className="h-5 w-16 shrink-0" />
    </div>
  )
}

export function MeetingListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div
      data-testid="meeting-list-skeleton"
      aria-busy="true"
      aria-label="Loading meetings"
      // Matches the real list's card gap, so the whole block is the same
      // height as what replaces it.
      className="space-y-2"
    >
      {Array.from({ length: rows }, (_, index) => (
        <MeetingRowSkeleton key={index} />
      ))}
    </div>
  )
}
