'use client'

/**
 * Bulk meeting operations (T-14.5, T-14.6).
 *
 * Delete and restore are separate mutations rather than one parameterised
 * "bulk action", because their success paths differ: a delete offers Undo and
 * a restore does not, and a partial delete warns while a partial restore is
 * mostly harmless.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import { qk } from './query-keys'
import type { BulkDeleteResponse, BulkRestoreResponse } from './types'

export function useBulkDelete() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (ids: number[]) =>
      api.post<BulkDeleteResponse>('/api/v1/meetings/bulk-delete', { ids }),
    onSuccess: () => {
      // The whole branch: a bulk delete changes counts, facets and every list.
      void client.invalidateQueries({ queryKey: qk.meetings.all })
    },
  })
}

export function useBulkRestore() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (ids: number[]) =>
      api.post<BulkRestoreResponse>('/api/v1/meetings/bulk-restore', { ids }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.meetings.all })
    },
  })
}

/**
 * Move every selected meeting to one channel (T-36.7).
 *
 * One PATCH per meeting — the update endpoint already exists and a meeting
 * belongs to exactly one channel, so "move" is just setting `channel_id`.
 * `allSettled`, because one 404 must not strand the rest mid-move.
 */
export function useBulkMove() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: async ({ ids, channelId }: { ids: number[]; channelId: number }) => {
      const results = await Promise.allSettled(
        ids.map((id) => api.patch(`/api/v1/meetings/${id}`, { channel_id: channelId })),
      )
      const moved = results.filter((r) => r.status === 'fulfilled').length
      return { moved, failed: ids.length - moved }
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: qk.meetings.all })
      // The sidebar's per-channel counts just changed.
      void client.invalidateQueries({ queryKey: ['channels'] })
    },
  })
}
