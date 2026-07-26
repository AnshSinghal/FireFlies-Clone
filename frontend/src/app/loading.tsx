import { MeetingListSkeleton, Skeleton } from '@/components/ui/skeleton'

/**
 * Route-level loading state (T-06.8/T-06.9).
 *
 * A skeleton shell, not a centred spinner. The heading and toolbar render
 * immediately because they do not depend on data — only the rows are unknown —
 * and the skeleton rows are exactly row-height, so nothing shifts when the data
 * arrives (T06-I asks for CLS < 0.1).
 */
export default function Loading() {
  return (
    <div data-testid="route-loading">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
      <MeetingListSkeleton testId="meeting-list-skeleton-route" />
    </div>
  )
}
