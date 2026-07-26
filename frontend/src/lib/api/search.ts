'use client'

/**
 * Global search (T-08.3).
 *
 * The debounce lives at the call site, not here — `useSearch` is given an
 * already-debounced term. Debouncing inside the hook would mean the query key
 * lags the input by 250ms, so a cached term would still wait before painting.
 */

import { useQuery } from '@tanstack/react-query'

import { api } from './client'
import { qk } from './query-keys'
import type { SearchResults } from './types'

/** Below this the corpus barely narrows; matches the server's own floor. */
export const MIN_SEARCH_LENGTH = 2

export function useSearch(query: string, { limit = 5 }: { limit?: number } = {}) {
  const trimmed = query.trim()

  return useQuery({
    queryKey: qk.search(`${trimmed}:${limit}`),
    queryFn: ({ signal }) =>
      api.get<SearchResults>('/api/v1/search', { signal, params: { q: trimmed, limit } }),
    enabled: trimmed.length >= MIN_SEARCH_LENGTH,
    /*
     * Search results are cheap to recompute but expensive to get wrong: results
     * kept for a full session would show meetings the user has since deleted.
     * 30s is long enough that backspacing a character is instant.
     */
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  })
}
