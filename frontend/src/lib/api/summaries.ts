'use client'

/** Meeting summaries. T-20 builds the full panel; this backs the drawer preview. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import { qk } from './query-keys'
import type { SummaryOut } from './types'

export function useSummary(meetingId: number | null) {
  return useQuery({
    queryKey: qk.meetings.summary(meetingId ?? 0),
    queryFn: ({ signal }) =>
      api.get<SummaryOut>(`/api/v1/meetings/${meetingId}/summary`, { signal }),
    enabled: meetingId !== null,
  })
}

export function useRegenerateSummary(meetingId: number) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: () => api.post<SummaryOut>(`/api/v1/meetings/${meetingId}/summary/regenerate`),
    onSuccess: (summary) => {
      // Written straight into the cache: the response IS the new summary, so
      // refetching it would be a round-trip for data already in hand.
      client.setQueryData(qk.meetings.summary(meetingId), summary)
    },
  })
}
