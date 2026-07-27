'use client'

/**
 * Action items (T-15.10). T-24 owns the full CRUD; this is the list plus the
 * one mutation the details drawer needs.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import { qk } from './query-keys'
import type { ActionItemOut } from './types'

export function useActionItems(meetingId: number | null) {
  return useQuery({
    queryKey: qk.meetings.actionItems(meetingId ?? 0),
    queryFn: ({ signal }) =>
      api.get<ActionItemOut[]>(`/api/v1/meetings/${meetingId}/action-items`, { signal }),
    enabled: meetingId !== null,
  })
}

export function useToggleActionItem(meetingId: number) {
  const client = useQueryClient()
  const key = qk.meetings.actionItems(meetingId)

  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: ActionItemOut['status'] }) =>
      api.patch<ActionItemOut>(`/api/v1/meetings/action-items/${id}`, { status }),

    /*
     * OPTIMISTIC. A checkbox that waits for a round-trip before ticking feels
     * broken, and this one is ticked from a preview list where the user is
     * scanning rather than waiting.
     */
    onMutate: async ({ id, status }) => {
      await client.cancelQueries({ queryKey: key })
      const previous = client.getQueryData<ActionItemOut[]>(key)

      client.setQueryData<ActionItemOut[]>(key, (items) =>
        items?.map((item) => (item.id === id ? { ...item, status } : item)),
      )

      return { previous }
    },

    onError: (_error, _variables, context) => {
      // Put it back. The global mutation handler (T-09.11) raises the toast.
      if (context?.previous) client.setQueryData(key, context.previous)
    },

    onSettled: () => {
      void client.invalidateQueries({ queryKey: key })
      // The Notebook row's "N open" badge is derived from these counts, so the
      // lists have to be refreshed too — this is the cross-surface
      // invalidation ADR-005 chose TanStack Query for.
      void client.invalidateQueries({ queryKey: qk.meetings.lists() })
    },
  })
}

/**
 * A partial edit — text, assignee or due date (T-24.6).
 *
 * Separate from `useToggleActionItem` because the two want different things:
 * a checkbox must tick before the network settles, while an inline text edit
 * has already shown its result in the input the user typed into. Sharing one
 * hook would mean one of them getting the wrong treatment.
 */
export function useUpdateActionItem(meetingId: number) {
  const client = useQueryClient()
  const key = qk.meetings.actionItems(meetingId)

  return useMutation({
    mutationFn: ({ id, ...patch }: ActionItemPatch & { id: number }) =>
      api.patch<ActionItemOut>(`/api/v1/meetings/action-items/${id}`, patch),

    onSuccess: (updated) => {
      // Written straight into the cache: the response IS the new item, so
      // refetching the list would be a round-trip for data already in hand.
      client.setQueryData<ActionItemOut[]>(key, (items) =>
        items?.map((item) => (item.id === updated.id ? updated : item)),
      )
    },
  })
}

export function useCreateActionItem(meetingId: number) {
  const client = useQueryClient()
  const key = qk.meetings.actionItems(meetingId)

  return useMutation({
    mutationFn: (payload: ActionItemPatch) =>
      api.post<ActionItemOut>(`/api/v1/meetings/${meetingId}/action-items`, payload),

    onSuccess: () => {
      /*
       * INVALIDATED rather than appended, because the server decides where a
       * new item lands: the list is ordered open-first, then by due date, then
       * by the moment it was raised, and an item added with a due date belongs
       * in the middle of it. Appending would put it in the wrong place until
       * the next refetch, which is a worse lie than a brief wait.
       */
      void client.invalidateQueries({ queryKey: key })
      void client.invalidateQueries({ queryKey: qk.meetings.lists() })
    },
  })
}

export function useDeleteActionItem(meetingId: number) {
  const client = useQueryClient()
  const key = qk.meetings.actionItems(meetingId)

  return useMutation({
    mutationFn: (id: number) => api.delete<ActionItemOut>(`/api/v1/meetings/action-items/${id}`),

    onMutate: async (id) => {
      // Optimistic: the row goes immediately and the Undo toast is what makes
      // that safe (T-24.7).
      await client.cancelQueries({ queryKey: key })
      const previous = client.getQueryData<ActionItemOut[]>(key)

      client.setQueryData<ActionItemOut[]>(key, (items) => items?.filter((item) => item.id !== id))

      return { previous }
    },

    onError: (_error, _id, context) => {
      if (context?.previous) client.setQueryData(key, context.previous)
    },

    onSettled: () => {
      void client.invalidateQueries({ queryKey: key })
      void client.invalidateQueries({ queryKey: qk.meetings.lists() })
    },
  })
}

/**
 * The fields an edit or a creation can carry.
 *
 * `null` is MEANINGFUL — clearing an assignee is a real edit — so these are
 * nullable rather than merely optional, matching the API's own distinction
 * between an absent field and an explicit null.
 */
export interface ActionItemPatch {
  text?: string
  status?: ActionItemOut['status']
  assignee_participant_id?: number | null
  due_date?: string | null
  start_ms?: number | null
}
