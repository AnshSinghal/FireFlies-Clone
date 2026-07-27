'use client'

/**
 * The /search route (T-35.4). Shell only — the page lives in features.
 */

import { Suspense } from 'react'

import { SearchPage } from '@/features/search/search-page'

export default function Page() {
  // `useQueryParams` reads search params, which opts the subtree out of
  // prerendering — hence the boundary. No fallback: the page renders its own
  // skeletons the moment it knows the query.
  return (
    <Suspense fallback={null}>
      <SearchPage />
    </Suspense>
  )
}
