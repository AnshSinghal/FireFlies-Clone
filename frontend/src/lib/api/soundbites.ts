'use client'

/**
 * Soundbite hooks (T-33).
 *
 * Creation and deletion are optimistic, on the comments.ts pattern (T-31):
 * negative placeholder ids, rollback in `onError` with no local error toast —
 * the global MutationCache handler owns those — and `onSettled` invalidation.
 *
 * The types are hand-written mirrors of the backend's schemas rather than
 * aliases into the generated `types/api.d.ts`, because T-33.1 (the API) lands
 * in parallel with this frontend and the generated file has not been
 * regenerated yet. Once `make types` has run against a backend that exports
 * `SoundbiteOut`, these should collapse to
 * `components['schemas']['SoundbiteOut']` etc. — they are shaped to make that
 * a mechanical swap.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import { qk } from './query-keys'

/** Server-enforced clip bounds; the trimmer enforces the same in-UI (T33-C). */
export const MIN_SOUNDBITE_MS = 3_000
export const MAX_SOUNDBITE_MS = 180_000

export interface SoundbiteOut {
  id: number
  meeting_id: number
  title: string
  start_ms: number
  end_ms: number
  auto_generated: boolean
  created_at: string
}

export interface SoundbiteCreate {
  title: string
  start_ms: number
  end_ms: number
  auto_generated?: boolean
}

/**
 * A "Magic Soundbite" proposal (T-33.8). NOT persisted: saving one is a POST
 * with `auto_generated: true`; dismissing one is client-side (localStorage,
 * keyed by meeting + range — see SoundbitesPanel).
 */
export interface SoundbiteProposal {
  title: string
  start_ms: number
  end_ms: number
  score: number
}

/** A cached soundbite, possibly not yet acknowledged by the server. */
export type CachedSoundbite = SoundbiteOut & { pending?: boolean }

/** The list endpoints return a plain items envelope, not the 6-key page. */
interface SoundbiteList {
  items: CachedSoundbite[]
}

interface ProposalList {
  items: SoundbiteProposal[]
}

export function useSoundbites(meetingId: number) {
  return useQuery({
    queryKey: qk.meetings.soundbites(meetingId),
    queryFn: ({ signal }) =>
      api.get<SoundbiteList>(`/api/v1/meetings/${meetingId}/soundbites`, { signal }),
  })
}

export function useSoundbiteProposals(meetingId: number) {
  return useQuery({
    queryKey: [...qk.meetings.soundbites(meetingId), 'proposals'] as const,
    queryFn: ({ signal }) =>
      api.get<ProposalList>(`/api/v1/meetings/${meetingId}/soundbites/proposals`, { signal }),
    // Deterministic per meeting — the mock provider always proposes the same
    // three clips — so refetching buys nothing but a network round-trip.
    staleTime: Infinity,
  })
}

/** Placeholder ids are negative so they can never collide with real rows. */
let optimisticId = -1

export function useCreateSoundbite(meetingId: number) {
  const client = useQueryClient()
  const key = qk.meetings.soundbites(meetingId)

  return useMutation({
    mutationFn: (payload: SoundbiteCreate) =>
      api.post<SoundbiteOut>(`/api/v1/meetings/${meetingId}/soundbites`, payload),

    onMutate: async (payload) => {
      await client.cancelQueries({ queryKey: key })
      const previous = client.getQueryData<SoundbiteList>(key)

      const placeholder: CachedSoundbite = {
        id: optimisticId--,
        meeting_id: meetingId,
        title: payload.title,
        start_ms: payload.start_ms,
        end_ms: payload.end_ms,
        auto_generated: payload.auto_generated ?? false,
        created_at: new Date().toISOString(),
        pending: true,
      }

      client.setQueryData<SoundbiteList>(key, (list) => {
        if (!list) return list
        // Inserted in timeline position: the list is ordered by start_ms, and
        // the server's row will land in the same slot on the refetch.
        return { items: [...list.items, placeholder].sort((a, b) => a.start_ms - b.start_ms) }
      })

      return { previous }
    },

    onError: (_error, _payload, context) => {
      // Roll back only; the global MutationCache handler raises the toast.
      if (context?.previous) client.setQueryData(key, context.previous)
    },

    onSettled: () => {
      void client.invalidateQueries({ queryKey: key })
      void client.invalidateQueries({ queryKey: qk.meetings.detail(meetingId) })
    },
  })
}

export function useDeleteSoundbite(meetingId: number) {
  const client = useQueryClient()
  const key = qk.meetings.soundbites(meetingId)

  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/api/v1/soundbites/${id}`),

    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: key })
      const previous = client.getQueryData<SoundbiteList>(key)
      client.setQueryData<SoundbiteList>(
        key,
        (list) => list && { items: list.items.filter((clip) => clip.id !== id) },
      )
      return { previous }
    },

    onError: (_error, _id, context) => {
      if (context?.previous) client.setQueryData(key, context.previous)
    },

    onSettled: () => {
      void client.invalidateQueries({ queryKey: key })
      void client.invalidateQueries({ queryKey: qk.meetings.detail(meetingId) })
    },
  })
}
