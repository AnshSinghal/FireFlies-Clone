'use client'

/**
 * Comment hooks (T-31).
 *
 * Posting is optimistic (T-31.8): the comment appears at once with
 * `pending: true` (rendered at reduced opacity) and rolls back on failure —
 * the global mutation handler raises the toast, and the composer keeps its
 * text because it only clears on success.
 *
 * The comments key nests under the meeting detail, so `detail(id)` blanket
 * invalidations (delete, restore) reach these too. Creating or deleting also
 * invalidates the detail itself — the drawer's `N comments` count lives there.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import { qk } from './query-keys'
import type { Page } from './types'
import type { components } from '@/types/api'

export type CommentOut = components['schemas']['CommentOut']
export type CommentCreate = components['schemas']['CommentCreate']
export type CommentUpdate = components['schemas']['CommentUpdate']

/** A cached comment, possibly not yet acknowledged by the server. */
export type CachedComment = CommentOut & { pending?: boolean }

type CommentsPage = Page<CachedComment>

export function useComments(meetingId: number) {
  return useQuery({
    queryKey: qk.meetings.comments(meetingId),
    queryFn: ({ signal }) =>
      api.get<CommentsPage>(`/api/v1/meetings/${meetingId}/comments`, {
        signal,
        // Comments are few; one page of 100 covers any sane meeting, and the
        // thread UI has no pagination affordance to feed a second page into.
        params: { page_size: 100 },
      }),
  })
}

/** Placeholder ids are negative so they can never collide with real rows. */
let optimisticId = -1

export function useCreateComment(meetingId: number) {
  const client = useQueryClient()
  const key = qk.meetings.comments(meetingId)

  return useMutation({
    mutationFn: (payload: CommentCreate) =>
      api.post<CommentOut>(`/api/v1/meetings/${meetingId}/comments`, payload),

    onMutate: async (payload) => {
      await client.cancelQueries({ queryKey: key })
      const previous = client.getQueryData<CommentsPage>(key)

      const placeholder: CachedComment = {
        id: optimisticId--,
        segment_id: payload.segment_id ?? null,
        parent_id: payload.parent_id ?? null,
        start_ms: null,
        author: { id: 0, name: 'You', avatar_url: null },
        body: payload.body,
        mentions: [],
        is_resolved: false,
        is_deleted: false,
        is_edited: false,
        created_at: new Date().toISOString(),
        replies: [],
        pending: true,
      }

      client.setQueryData<CommentsPage>(key, (page) => {
        if (!page) return page
        if (placeholder.parent_id != null) {
          return {
            ...page,
            items: page.items.map((thread) =>
              thread.id === placeholder.parent_id
                ? { ...thread, replies: [...thread.replies, placeholder] }
                : thread,
            ),
          }
        }
        return { ...page, items: [...page.items, placeholder], total: page.total + 1 }
      })

      return { previous }
    },

    onError: (_error, _payload, context) => {
      // Roll back (T31-G); the global handler owns the toast, the composer
      // owns the preserved text.
      if (context?.previous) client.setQueryData(key, context.previous)
    },

    onSettled: () => {
      void client.invalidateQueries({ queryKey: key })
      void client.invalidateQueries({ queryKey: qk.meetings.detail(meetingId) })
    },
  })
}

export function useUpdateComment(meetingId: number) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: CommentUpdate }) =>
      api.patch<CommentOut>(`/api/v1/comments/${id}`, patch),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: qk.meetings.comments(meetingId) })
    },
  })
}

export function useDeleteComment(meetingId: number) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/api/v1/comments/${id}`),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: qk.meetings.comments(meetingId) })
      void client.invalidateQueries({ queryKey: qk.meetings.detail(meetingId) })
    },
  })
}
