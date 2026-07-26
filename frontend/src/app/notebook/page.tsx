import type { Metadata } from 'next'
import { Suspense } from 'react'

import { MeetingListSkeleton } from '@/components/ui/skeleton'
import { NotebookView } from '@/features/notebook/notebook-view'

export const metadata: Metadata = {
  title: 'Meetings',
}

/**
 * The Notebook route.
 *
 * A route file composes; it holds no logic (the ESLint rule in T-01.7 enforces
 * that). The Suspense boundary is required because `NotebookView` reads
 * `useSearchParams`, which suspends during prerender.
 */
export default function NotebookPage() {
  return (
    <Suspense fallback={<MeetingListSkeleton testId="meeting-list-skeleton-fallback" />}>
      <NotebookView />
    </Suspense>
  )
}
