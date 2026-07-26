'use client'

import { useQuery } from '@tanstack/react-query'

import { api } from './client'
import { qk } from './query-keys'
import type { UserOut } from './types'

/**
 * The signed-in user.
 *
 * Long `staleTime`: this cannot change during a session while authentication is
 * out of scope, so refetching it is pure noise. When real auth arrives, this is
 * the one line that needs revisiting.
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: qk.me,
    queryFn: ({ signal }) => api.get<UserOut>('/api/v1/me', { signal }),
    staleTime: Number.POSITIVE_INFINITY,
    // A fresh clone has no seeded user and gets a 503 NOT_SEEDED. Retrying that
    // three times just delays the message telling you to run `make seed`.
    retry: false,
  })
}
