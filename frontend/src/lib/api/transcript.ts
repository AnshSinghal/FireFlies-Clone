'use client'

/** Transcript reads (T-17.2). T-21 adds the paging-to-exhaustion behaviour. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import { qk } from './query-keys'
import type { SegmentOut, SpeakerRef, TranscriptPage } from './types'

/**
 * A bound on the cursor loop below.
 *
 * At the API's 500-row page size this is 25,000 segments — comfortably past
 * the 10,000-segment import cap, so the ceiling can only be reached by a bug.
 * A `while (cursor)` with no bound turns one such bug into a hung tab.
 */
const MAX_TRANSCRIPT_PAGES = 50

/**
 * The WHOLE transcript, paged to exhaustion (T-21).
 *
 * This used to fetch one page and stop, which meant any meeting over 200
 * segments silently showed only its first 200 lines — and, worse, the find bar
 * reported "0 of 0" for a word that was plainly in the recording, because it
 * searches what the client holds. Nothing caught it: the seeded meetings top
 * out at 159 segments, so the bug needed a transcript longer than any fixture
 * to appear (`34-stress.spec.ts` now keeps one).
 *
 * Paged inside ONE query rather than with `useInfiniteQuery`: every consumer —
 * the virtualiser, the find bar, the sync engine, `copyAll` — wants a single
 * ordered list, and an infinite query would push page-flattening into all four.
 * The virtualiser is what makes holding them all cheap; 5,000 rows in state is
 * a few hundred KB and ~40 in the DOM.
 */
export function useTranscript(meetingId: number | null, { q }: { q?: string } = {}) {
  return useQuery({
    queryKey: [...qk.meetings.transcript(meetingId ?? 0), q ?? ''],
    queryFn: async ({ signal }) => {
      const segments: SegmentOut[] = []
      const speakers: SpeakerRef[] = []
      const bySpeakerId = new Set<number>()
      let cursor: number | null = null
      let total = 0

      for (let page = 0; page < MAX_TRANSCRIPT_PAGES; page += 1) {
        // Annotated: `next` feeds `cursor`, which feeds the next request, and
        // TypeScript will not infer through that cycle.
        const next: TranscriptPage = await api.get<TranscriptPage>(
          `/api/v1/meetings/${meetingId}/transcript`,
          { signal, params: { q, cursor: cursor ?? undefined } },
        )

        segments.push(...next.segments)
        // Speakers are sent per page and repeat across them; the union keyed
        // by id is what the legend and the colour map need.
        for (const speaker of next.speakers) {
          if (bySpeakerId.has(speaker.id)) continue
          bySpeakerId.add(speaker.id)
          speakers.push(speaker)
        }
        total = next.total

        cursor = next.next_cursor ?? null
        if (cursor === null) break
      }

      return { segments, speakers, next_cursor: null, total } satisfies TranscriptPage
    },
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
