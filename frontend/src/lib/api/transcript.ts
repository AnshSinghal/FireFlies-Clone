'use client'

/** Transcript reads (T-17.2). T-21 adds the paging-to-exhaustion behaviour. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import { qk } from './query-keys'
import type { SegmentOut, SpeakerRef, TranscriptPage } from './types'

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

/**
 * Edit a line's text, reassign its speaker, or both (T-25.2, T-25.6).
 *
 * The updated segment is written straight into the cached page rather than
 * refetching it: the response IS the new segment, and a transcript refetch
 * during editing would rebuild a virtualised list under the cursor.
 */
export function useUpdateSegment(meetingId: number) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...patch }: { id: number; text?: string; speaker_id?: number }) =>
      api.patch<SegmentOut>(`/api/v1/meetings/segments/${id}`, patch),

    onSuccess: (updated) => {
      client.setQueriesData<TranscriptPage>(
        { queryKey: qk.meetings.transcript(meetingId) },
        (page) =>
          page && {
            ...page,
            segments: page.segments.map((segment) =>
              segment.id === updated.id ? updated : segment,
            ),
          },
      )

      /*
       * The SUMMARY is now stale — the server sets the flag, and the panel
       * reads it from a query that would otherwise not refetch for minutes.
       * Without this the Outdated badge appears on the next navigation rather
       * than on the edit that caused it (T-25.9).
       */
      void client.invalidateQueries({ queryKey: qk.meetings.summary(meetingId) })
    },
  })
}

/** Rename a speaker across every line they have (T-25.7). */
export function useRenameSpeaker(meetingId: number) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...patch }: { id: number; label?: string; participant_id?: number }) =>
      api.patch<SpeakerRef>(`/api/v1/meetings/speakers/${id}`, patch),

    onSuccess: (updated) => {
      // One UPDATE on the server, one cache write here: the label lives on the
      // speaker and the segments reference it, so nothing per-segment changes.
      client.setQueriesData<TranscriptPage>(
        { queryKey: qk.meetings.transcript(meetingId) },
        (page) =>
          page && {
            ...page,
            speakers: page.speakers.map((speaker) =>
              speaker.id === updated.id ? updated : speaker,
            ),
          },
      )
      void client.invalidateQueries({ queryKey: qk.meetings.detail(meetingId) })
    },
  })
}

export function useCreateSpeaker(meetingId: number) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (label: string) =>
      api.post<SpeakerRef>(`/api/v1/meetings/${meetingId}/speakers`, { label }),

    onSuccess: () => {
      // A new speaker changes the page's speaker list, which is derived from
      // the segments — so this one does need a refetch.
      void client.invalidateQueries({ queryKey: qk.meetings.transcript(meetingId) })
    },
  })
}
