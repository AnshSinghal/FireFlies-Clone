'use client'

/**
 * Highlights & bookmarks (T-32).
 *
 * Colour changes and star toggles are OPTIMISTIC: both are single-property
 * flips whose whole point is feeling instant (T32-E says "updates
 * immediately"), and both roll back cleanly because the previous list is one
 * `getQueryData` away. Creation is not — the server assigns the id the popover
 * and testids need, so the row appears when the 201 lands.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import { qk } from './query-keys'
import type { BookmarkOut, HighlightCreate, HighlightOut, HighlightUpdate } from './types'

export function useHighlights(meetingId: number) {
  return useQuery({
    queryKey: qk.meetings.highlights(meetingId),
    queryFn: () => api.get<HighlightOut[]>(`/api/v1/meetings/${meetingId}/highlights`),
  })
}

export function useCreateHighlight(meetingId: number) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (payload: HighlightCreate) =>
      api.post<HighlightOut>(`/api/v1/meetings/${meetingId}/highlights`, payload),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.meetings.highlights(meetingId) })
    },
  })
}

export function useUpdateHighlight(meetingId: number) {
  const client = useQueryClient()
  const key = qk.meetings.highlights(meetingId)

  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: HighlightUpdate }) =>
      api.patch<HighlightOut>(`/api/v1/highlights/${id}`, patch),

    onMutate: async ({ id, patch }) => {
      await client.cancelQueries({ queryKey: key })
      const previous = client.getQueryData<HighlightOut[]>(key)
      client.setQueryData<HighlightOut[]>(key, (list) =>
        list?.map((h) =>
          h.id === id
            ? {
                ...h,
                // Field-by-field, not a spread: HighlightUpdate's `color` is
                // nullable-as-absent, and spreading `color: undefined/null`
                // over the row would corrupt the cached type.
                ...(patch.color != null ? { color: patch.color } : {}),
                ...('note' in patch ? { note: patch.note ?? null } : {}),
              }
            : h,
        ),
      )
      return { previous }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(key, context.previous)
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: key })
    },
  })
}

export function useDeleteHighlight(meetingId: number) {
  const client = useQueryClient()
  const key = qk.meetings.highlights(meetingId)

  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/v1/highlights/${id}`),

    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: key })
      const previous = client.getQueryData<HighlightOut[]>(key)
      client.setQueryData<HighlightOut[]>(key, (list) => list?.filter((h) => h.id !== id))
      return { previous }
    },
    onError: (_error, _id, context) => {
      if (context?.previous) client.setQueryData(key, context.previous)
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: key })
    },
  })
}

export function useBookmarks(meetingId: number) {
  return useQuery({
    queryKey: qk.meetings.bookmarks(meetingId),
    queryFn: () => api.get<BookmarkOut[]>(`/api/v1/meetings/${meetingId}/bookmarks`),
  })
}

/**
 * One mutation for both directions: the caller says which way the star goes,
 * so a double-press cannot race itself into a stuck state — PUT and DELETE
 * are both idempotent server-side.
 */
export function useToggleBookmark(meetingId: number) {
  const client = useQueryClient()
  const key = qk.meetings.bookmarks(meetingId)

  return useMutation({
    mutationFn: ({ segmentId, bookmarked }: { segmentId: number; bookmarked: boolean }) =>
      bookmarked
        ? api.put<BookmarkOut>(`/api/v1/meetings/${meetingId}/bookmarks/${segmentId}`)
        : api.delete(`/api/v1/meetings/${meetingId}/bookmarks/${segmentId}`),

    onMutate: async ({ segmentId, bookmarked }) => {
      await client.cancelQueries({ queryKey: key })
      const previous = client.getQueryData<BookmarkOut[]>(key)

      client.setQueryData<BookmarkOut[]>(key, (list) => {
        if (!list) return list
        if (!bookmarked) return list.filter((b) => b.segment_id !== segmentId)
        if (list.some((b) => b.segment_id === segmentId)) return list
        // A provisional row with what the client knows; the settle refetch
        // replaces it with the server's snippet and timestamp.
        return [
          ...list,
          {
            id: -segmentId,
            segment_id: segmentId,
            start_ms: 0,
            speaker: '',
            snippet: '',
            created_at: new Date().toISOString(),
          },
        ]
      })
      return { previous }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(key, context.previous)
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: key })
    },
  })
}
