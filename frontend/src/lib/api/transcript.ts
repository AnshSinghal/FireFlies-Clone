'use client'

/** Transcript reads (T-17.2). T-21 adds the paging-to-exhaustion behaviour. */

import { useQuery } from '@tanstack/react-query'

import { api } from './client'
import { qk } from './query-keys'
import type { TranscriptPage } from './types'

export function useTranscript(meetingId: number | null, { q }: { q?: string } = {}) {
  return useQuery({
    queryKey: [...qk.meetings.transcript(meetingId ?? 0), q ?? ''],
    queryFn: ({ signal }) =>
      api.get<TranscriptPage>(`/api/v1/meetings/${meetingId}/transcript`, {
        signal,
        params: { q },
      }),
    enabled: meetingId !== null,
  })
}
