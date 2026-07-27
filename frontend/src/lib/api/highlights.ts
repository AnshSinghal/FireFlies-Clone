'use client'

/**
 * Highlights and bookmarks (T-32.1, T-32.6).
 *
 * Both lists are fetched WHOLE rather than paginated. Highlights are painted
 * into transcript lines the reader is already looking at, so a page boundary
 * would leave some lines silently unmarked — and a meeting has tens of them,
 * not thousands.
 *
 * Every mutation writes the server's answer into the cache rather than
 * invalidating: a refetch during a marking session rebuilds the list under the
 * popover the user is typing into.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import { qk } from './query-keys'
import type {
  BookmarkOut,
  BookmarkToggleOut,
  HighlightColor,
  HighlightOut,
  HighlightUpdate,
} from './types'

export function useHighlights(meetingId: number | null) {
  return useQuery({
    queryKey: qk.meetings.highlights(meetingId ?? 0),
    queryFn: ({ signal }) =>
      api.get<HighlightOut[]>(`/api/v1/meetings/${meetingId}/highlights`, { signal }),
    enabled: meetingId !== null,
  })
}

export function useBookmarks(meetingId: number | null) {
  return useQuery({
    queryKey: qk.meetings.bookmarks(meetingId ?? 0),
    queryFn: ({ signal }) =>
      api.get<BookmarkOut[]>(`/api/v1/meetings/${meetingId}/bookmarks`, { signal }),
    enabled: meetingId !== null,
  })
}

export interface CreateHighlightInput {
  segment_id: number
  start_offset: number
  end_offset: number
  color: HighlightColor
  note?: string | null
}

export function useCreateHighlight(meetingId: number) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateHighlightInput) =>
      api.post<HighlightOut>(`/api/v1/meetings/${meetingId}/highlights`, input),

    onSuccess: (created) => {
      client.setQueryData<HighlightOut[]>(qk.meetings.highlights(meetingId), (current) =>
        // Appended, then re-sorted by position: the list is consumed in reading
        // order by the flyout and the renderer alike, and the server would
        // return it that way on the next fetch anyway.
        [...(current ?? []), created].sort(
          (a, b) => a.start_ms - b.start_ms || a.start_offset - b.start_offset,
        ),
      )
    },
  })
}

export function useUpdateHighlight(meetingId: number) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...patch }: HighlightUpdate & { id: number }) =>
      api.patch<HighlightOut>(`/api/v1/meetings/${meetingId}/highlights/${id}`, patch),

    onSuccess: (updated) => {
      client.setQueryData<HighlightOut[]>(qk.meetings.highlights(meetingId), (current) =>
        current?.map((highlight) => (highlight.id === updated.id ? updated : highlight)),
      )
    },
  })
}

export function useDeleteHighlight(meetingId: number) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (id: number) =>
      api.delete<void>(`/api/v1/meetings/${meetingId}/highlights/${id}`).then(() => id),

    onSuccess: (id) => {
      client.setQueryData<HighlightOut[]>(qk.meetings.highlights(meetingId), (current) =>
        current?.filter((highlight) => highlight.id !== id),
      )
    },
  })
}

/**
 * Star or unstar a segment (T-32.6).
 *
 * Optimistic, because this is bound to a keypress: `B` has to feel like a
 * toggle, and a 60ms round trip before the star fills reads as a dropped
 * keystroke. The rollback restores the exact previous list rather than
 * re-toggling, so two fast presses cannot leave the cache inverted.
 */
export function useToggleBookmark(meetingId: number) {
  const client = useQueryClient()
  const key = qk.meetings.bookmarks(meetingId)

  return useMutation({
    mutationFn: (segmentId: number) =>
      api.post<BookmarkToggleOut>(`/api/v1/meetings/${meetingId}/bookmarks`, {
        segment_id: segmentId,
      }),

    onMutate: async (segmentId) => {
      // Otherwise an in-flight GET can land after this write and undo it.
      await client.cancelQueries({ queryKey: key })
      const previous = client.getQueryData<BookmarkOut[]>(key)

      client.setQueryData<BookmarkOut[]>(key, (current) => {
        const list = current ?? []
        const existing = list.find((bookmark) => bookmark.segment_id === segmentId)
        if (existing) return list.filter((bookmark) => bookmark.segment_id !== segmentId)

        /*
         * A placeholder with a negative id, replaced by the server's row in
         * `onSuccess`. Negative so it cannot collide with a real one, and so a
         * stray render keyed on it is obvious rather than subtly wrong.
         *
         * The fields the flyout needs are unknown until the response arrives;
         * the star in the gutter only needs `segment_id`, which is what the
         * optimistic path exists to update.
         */
        return [
          ...list,
          {
            id: -segmentId,
            meeting_id: meetingId,
            segment_id: segmentId,
            start_ms: 0,
            speaker_id: 0,
            speaker_label: '',
            text: '',
            created_at: new Date().toISOString(),
          },
        ]
      })

      return { previous }
    },

    onError: (_error, _segmentId, context) => {
      if (context?.previous) client.setQueryData(key, context.previous)
    },

    onSuccess: (result) => {
      client.setQueryData<BookmarkOut[]>(key, (current) => {
        const without = (current ?? []).filter(
          (bookmark) => bookmark.segment_id !== result.segment_id,
        )
        if (!result.bookmarked || !result.bookmark) return without
        return [...without, result.bookmark].sort((a, b) => a.start_ms - b.start_ms)
      })
    },
  })
}
