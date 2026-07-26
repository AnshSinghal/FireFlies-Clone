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
