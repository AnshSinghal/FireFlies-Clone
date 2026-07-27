'use client'

/**
 * Tag queries and mutations (T-36.1 client side).
 *
 * The only module that knows tag API paths — components call hooks. Types come
 * from the generated client (ADR-018); nothing here re-declares the wire.
 */

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'

import { api } from './client'
import { qk } from './query-keys'
import type { MeetingDetail, TagOut, TagProposal } from './types'

export type { TagOut, TagProposal }

/**
 * Anything tag-shaped a component can render — the deliberately-light `TagRef`
 * embedded in meeting payloads, the facets' `TagFacet`, or the full `TagOut`.
 * All three carry `{id, name, color_index}`; nothing render-side needs more.
 */
export interface TagLike {
  id: number
  name: string
  color_index: number | null
}

/** Server-enforced too (422 `TAG_LIMIT`); checked client-side to fail politely. */
export const MAX_TAGS_PER_MEETING = 10
/** Matches the DB column (`String(24)`). */
export const MAX_TAG_NAME_LENGTH = 24

export function useTags(enabled = true) {
  return useQuery({
    queryKey: qk.tags.all,
    queryFn: ({ signal }) => api.get<{ items: TagOut[] }>('/api/v1/tags', { signal }),
    // Same reasoning as facets: the tag library changes on explicit edits, not
    // while the user is looking at a picker — and every mutation below
    // invalidates it explicitly.
    staleTime: 5 * 60_000,
    enabled,
  })
}

/**
 * Tag names (case-insensitive, `#`-stripped) → ids, against a loaded library.
 * Names that match no tag are dropped — the caller decides what that means.
 */
export function resolveTagIds(tags: readonly TagOut[], names: readonly string[]): number[] {
  const byName = new Map(tags.map((tag) => [tag.name.toLowerCase(), tag.id]))
  const ids: number[] = []
  for (const name of names) {
    const id = byName.get(name.replace(/^#/, '').toLowerCase())
    if (id !== undefined && !ids.includes(id)) ids.push(id)
  }
  return ids
}

/**
 * Everything a tag edit can be visible in: the library itself, the filter
 * panel's counts, and every meeting list row. Rename/merge/delete go wider
 * (`qk.meetings.all`) because detail payloads embed tag names too.
 */
function invalidateTagLibrary(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: qk.tags.all })
  void client.invalidateQueries({ queryKey: qk.meetings.facets() })
}

export function useCreateTag() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (payload: { name: string; color_index?: number }) =>
      api.post<TagOut>('/api/v1/tags', payload),
    onSuccess: () => invalidateTagLibrary(client),
  })
}

export function useUpdateTag() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...patch }: { id: number; name?: string; color_index?: number | null }) =>
      api.patch<TagOut>(`/api/v1/tags/${id}`, patch),
    onSuccess: () => {
      invalidateTagLibrary(client)
      // A rename propagates by id linkage, so every embedded copy of the name
      // — rows, drawer, notepad header — is now stale (T36-F).
      void client.invalidateQueries({ queryKey: qk.meetings.all })
    },
  })
}

/**
 * Delete, or — with `mergeInto` — the T-36.6 merge: every meeting carrying the
 * deleted tag gains the survivor first (`DELETE /tags/{id}?merge_into=`).
 */
export function useDeleteTag() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: ({ id, mergeInto }: { id: number; mergeInto?: number }) =>
      api.delete<void>(`/api/v1/tags/${id}`, { params: { merge_into: mergeInto } }),
    onSuccess: () => {
      invalidateTagLibrary(client)
      void client.invalidateQueries({ queryKey: qk.meetings.all })
    },
  })
}

/** `PUT /meetings/{id}/tags` — SET semantics: the list sent is the list kept. */
export function useSetMeetingTags(meetingId: number) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (tagIds: number[]) =>
      api.put<{ items: TagOut[] }>(`/api/v1/meetings/${meetingId}/tags`, { tag_ids: tagIds }),
    onSuccess: (data) => {
      // Write-through on the detail (same convention as useUpdateMeeting), so
      // the notepad header and drawer update without a refetch.
      client.setQueryData<MeetingDetail>(qk.meetings.detail(meetingId), (current) =>
        current ? { ...current, tags: data.items } : current,
      )
      void client.invalidateQueries({ queryKey: qk.meetings.lists() })
      invalidateTagLibrary(client)
    },
  })
}

/**
 * Bulk tagging (T-36.9): ADD `tagIds` to every selected meeting.
 *
 * `PUT` is set-semantics, so adding requires each meeting's current list —
 * fetched through the detail cache (a hit is free, and a miss warms the cache
 * for the drawer). One PUT per meeting, one summary toast at the call site.
 */
export function useBulkTagMeetings() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: async ({ meetingIds, tagIds }: { meetingIds: number[]; tagIds: number[] }) => {
      let tagged = 0
      let skipped = 0

      await Promise.all(
        meetingIds.map(async (id) => {
          const detail = await client.fetchQuery({
            queryKey: qk.meetings.detail(id),
            queryFn: ({ signal }) => api.get<MeetingDetail>(`/api/v1/meetings/${id}`, { signal }),
          })

          const current = (detail.tags ?? []).map((tag) => tag.id)
          const merged = [...new Set([...current, ...tagIds])]

          if (merged.length === current.length) return // already carried them all
          if (merged.length > MAX_TAGS_PER_MEETING) {
            skipped += 1 // would breach the cap — leave the meeting untouched
            return
          }

          await api.put(`/api/v1/meetings/${id}/tags`, { tag_ids: merged })
          tagged += 1
        }),
      )

      return { tagged, skipped }
    },
    onSettled: () => {
      // Details were touched per-meeting; the blanket branch covers them all.
      void client.invalidateQueries({ queryKey: qk.meetings.all })
      void client.invalidateQueries({ queryKey: qk.tags.all })
    },
  })
}

/**
 * AI tag proposals (T-36.4). `retry: false` and a tolerant error state: against
 * a backend without T-36 this 404s, and suggestions simply do not render.
 */
export function useTagProposals(meetingId: number, enabled = true) {
  return useQuery({
    queryKey: qk.tags.proposals(meetingId),
    queryFn: ({ signal }) =>
      api.get<{ items: TagProposal[] }>(`/api/v1/meetings/${meetingId}/tags/proposals`, { signal }),
    staleTime: 5 * 60_000,
    retry: false,
    enabled,
  })
}
