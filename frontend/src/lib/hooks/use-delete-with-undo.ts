'use client'

/**
 * Delete a meeting with an Undo toast (T-09.4).
 *
 * The interaction, and why it is shaped this way: the delete happens
 * immediately and the toast offers `Undo` for six seconds. The alternative —
 * a confirmation dialog — asks the user to be certain *before* acting, which
 * they rarely can be. Undo lets them find out.
 *
 * This is only safe because the delete is soft (`deleted_at`), so restore is
 * lossless. T-28's confirm dialog covers the Notepad's `Delete meeting`, where
 * the user is looking at the thing rather than at a row in a list.
 */

import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { useToast } from '@/components/ui/toast'
import { api } from '@/lib/api/client'
import { useDeleteMeeting } from '@/lib/api/meetings'
import { qk } from '@/lib/api/query-keys'
import type { MeetingDetail } from '@/lib/api/types'
import { TOAST_MESSAGES } from '@/lib/toast/messages'

/** Long enough to read the toast and react; short enough not to linger. */
export const UNDO_WINDOW_MS = 6000

export function useDeleteWithUndo() {
  const toast = useToast()
  const client = useQueryClient()
  const remove = useDeleteMeeting()

  return useCallback(
    async (id: number) => {
      try {
        await remove.mutateAsync(id)
      } catch {
        // The MutationCache's global handler already raised the error toast
        // with its Retry action (T-09.11); rethrowing would surface an
        // unhandled rejection for a failure that is fully reported.
        return
      }

      toast.success({
        message: TOAST_MESSAGES.meetingDeleted,
        duration: UNDO_WINDOW_MS,
        action: {
          label: 'Undo',
          onClick: () => void undoDelete(),
        },
      })

      /*
       * The restore is issued DIRECTLY rather than through `useRestoreMeeting`,
       * and that is not a shortcut — it is the fix for a real bug.
       *
       * A `useMutation` observer is owned by the component that called the
       * hook. Here that component is the row's delete button, which is inside
       * the row that the successful delete has just removed from the list. By
       * the time the user clicks `Undo`, the observer has unsubscribed with its
       * component and `mutate()`'s callbacks never fire — the meeting silently
       * stayed deleted and no toast appeared.
       *
       * An undo handler outlives whatever raised it, so it cannot depend on
       * that thing still being mounted.
       */
      async function undoDelete() {
        try {
          await api.post<MeetingDetail>(`/api/v1/meetings/${id}/restore`)
          // The whole meetings branch: the row returns to any list, and its
          // detail cache is stale too.
          await client.invalidateQueries({ queryKey: qk.meetings.all })
          toast.success(TOAST_MESSAGES.meetingRestored)
        } catch {
          // Bypassing the MutationCache means bypassing its global error
          // handler, so this path reports its own failure. Saying "couldn't
          // undo" is important: the user believes the meeting is back.
          toast.error("Couldn't restore the meeting. Please try again.")
        }
      }
    },
    [remove, client, toast],
  )
}
