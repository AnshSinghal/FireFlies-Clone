/**
 * Loading placeholders (T-06.9).
 *
 * The geometry matters more than the shimmer. A skeleton row must be EXACTLY as
 * tall as the row it stands in for, or content jumps when data lands and the
 * page scores badly on CLS (T06-I asks for < 0.1).
 *
 * The shimmer is a background-position animation, which the reduced-motion rule
 * in globals.css collapses automatically — no separate handling needed here.
 */

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-sm bg-surface-2 ${className}`}
      data-testid="skeleton"
    />
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
