'use client'

/**
 * Optimistic mutation helper (T-06.6).
 *
 * The full dance — cancel in-flight refetches, snapshot, patch, roll back on
 * error, invalidate on settle — written once. Used by action-item toggles,
 * inline title edits, deletes and comments.
 *
 * The cancel step is the one people omit and the one that causes the bug: an
 * in-flight GET that resolves AFTER the optimistic patch overwrites it with
 * stale server data, and the checkbox visibly un-ticks itself a moment later.
 */

import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'

export interface OptimisticMutationOptions<TVariables, TData, TSnapshot> {
  /** The request. */
  mutationFn: (variables: TVariables) => Promise<TData>
  /** Cache entries to patch and, on failure, restore. */
  queryKey: QueryKey
  /** Apply the expected change locally. Return the next cache value. */
  optimisticUpdate: (current: TSnapshot | undefined, variables: TVariables) => TSnapshot | undefined
  /** Keys to invalidate once settled. Defaults to `queryKey`. */
  invalidates?: QueryKey[]
  onError?: (error: unknown, variables: TVariables) => void
  onSuccess?: (data: TData, variables: TVariables) => void
}

export function useOptimisticMutation<TVariables, TData = unknown, TSnapshot = unknown>({
  mutationFn,
  queryKey,
  optimisticUpdate,
  invalidates,
  onError,
  onSuccess,
}: OptimisticMutationOptions<TVariables, TData, TSnapshot>) {
  const client = useQueryClient()

  return useMutation({
    mutationFn,

    onMutate: async (variables: TVariables) => {
      // Without this, a GET already in flight can land after the patch and
      // silently revert it.
      await client.cancelQueries({ queryKey })

      const snapshot = client.getQueryData<TSnapshot>(queryKey)
      client.setQueryData<TSnapshot>(queryKey, (current) => optimisticUpdate(current, variables))

      return { snapshot }
    },

    onError: (error, variables, context) => {
      // Restore exactly what was there, rather than refetching — a refetch
      // leaves the UI showing the failed state until it returns.
      if (context?.snapshot !== undefined) {
        client.setQueryData<TSnapshot>(queryKey, context.snapshot)
      }
      onError?.(error, variables)
    },

    onSuccess,

    onSettled: () => {
      // On both paths: success needs the server's real value, failure needs to
      // confirm the rollback matched reality.
      for (const key of invalidates ?? [queryKey]) {
        void client.invalidateQueries({ queryKey: key })
      }
    },
  })
}
