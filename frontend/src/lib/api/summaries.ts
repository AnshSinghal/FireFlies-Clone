'use client'

/** Meeting summaries. T-20 builds the full panel; this backs the drawer preview. */

import { useQuery } from '@tanstack/react-query'

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
