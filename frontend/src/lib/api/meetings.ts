/**
 * Meeting queries and mutations.
 *
 * The only module that knows API paths for meetings. Components call hooks;
 * they never see a URL, which is what keeps a route change from rippling
 * through the component tree.
 */

'use client'

import { useMemo } from 'react'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, type RequestParams } from './client'
import { qk, type MeetingFilters } from './query-keys'
import { resolveTagIds, useTags } from './tags'
import type { Facets, MeetingDetail, MeetingListItem, MeetingUpdate, Page } from './types'

/**
 * camelCase in the app, snake_case on the wire.
 *
 * The T-36 list API takes `tags` as a CSV of tag IDS (`?tags=3,7&tags_mode=or`)
 * while the app's URL state keeps human-readable names — pass `tagIds` once
 * they are resolved. Without `tagIds` the names go out as repeated params,
 * which is the pre-T-36 wire format and the graceful-degradation path.
 */
export function toApiParams(filters: MeetingFilters, tagIds?: number[]): RequestParams {
  return {
    q: filters.q,
    host: filters.host,
    participant: filters.participant,
    from: filters.from,
    to: filters.to,
    min_duration: filters.minDuration,
    max_duration: filters.maxDuration,
    // `0` when every name resolved to nothing: a filter on a tag that does not
    // exist must match NO meetings, and an empty param would match all of them.
    tags: tagIds !== undefined ? (tagIds.length > 0 ? tagIds.join(',') : '0') : filters.tags,
    tags_mode: filters.tagsMode,
    channel: filters.channel,
    has_action_items: filters.hasActionItems,
    source: filters.source,
    sort: filters.sort,
    page: filters.page,
    page_size: filters.pageSize,
  }
}

/**
 * The list request for a filter set, with tag NAMES (URL state) resolved to
 * tag IDS (wire format) via the tag library.
 *
 * One hook shared by `useMeetings`, the pagination prefetch and select-all —
 * three hand-built copies of this mapping would drift, and the symptom would
 * be a prefetch warming a cache key its data does not match.
 *
 * `ready` gates the fetch while the library loads. If the library itself
 * errors (a pre-T-36 backend has no `/tags`), the names are sent as repeated
 * params — the old wire format — so filtering degrades instead of breaking.
 */
export function useMeetingListRequest(filters: MeetingFilters): {
  params: RequestParams
  ready: boolean
} {
  const needsTags = (filters.tags?.length ?? 0) > 0
  const tagLibrary = useTags(needsTags)

  return useMemo(() => {
    if (!needsTags) return { params: toApiParams(filters), ready: true }
    if (tagLibrary.data) {
      return {
        params: toApiParams(filters, resolveTagIds(tagLibrary.data.items, filters.tags ?? [])),
        ready: true,
      }
    }
    if (tagLibrary.isError) return { params: toApiParams(filters), ready: true }
    return { params: toApiParams(filters), ready: false }
  }, [filters, needsTags, tagLibrary.data, tagLibrary.isError])
}

export function useMeetings(filters: MeetingFilters = {}) {
  const { params, ready } = useMeetingListRequest(filters)

  return useQuery({
    queryKey: qk.meetings.list(filters),
    queryFn: ({ signal }) => api.get<Page<MeetingListItem>>('/api/v1/meetings', { signal, params }),
    // Waits for tag-name → id resolution; without the gate a tag-filtered URL
    // would fire once unfiltered and flash the wrong rows.
    enabled: ready,
    // Keeps the previous page visible while the next one loads, so paging does
    // not flash an empty table. Without it every page change is a full unmount.
    placeholderData: (previous) => previous,
  })
}

/**
 * Filter options, derived from real data (T-11.8).
 *
 * Long `staleTime`: the set of hosts and tags changes when meetings are created
 * or deleted, not while the user is adjusting a filter panel. Refetching it on
 * every panel open would be a request per interaction for data that is
 * effectively static within a session.
 */
export function useMeetingFacets() {
  return useQuery({
    queryKey: qk.meetings.facets(),
    queryFn: ({ signal }) => api.get<Facets>('/api/v1/meetings/facets', { signal }),
    staleTime: 5 * 60_000,
  })
}

export function useMeeting(id: number | null) {
  return useQuery({
    queryKey: qk.meetings.detail(id ?? 0),
    queryFn: ({ signal }) => api.get<MeetingDetail>(`/api/v1/meetings/${id}`, { signal }),
    enabled: id !== null,
  })
}

/*
 * Creating a meeting lives in `./import`, not here.
 *
 * There were two `useCreateMeeting` hooks for a while — this one, which only
 * knew `POST /meetings`, and the import module's, which routes to
 * `/meetings/import` when there are segments to send. Every call site used the
 * import one; two exported hooks of the same name in the same folder is a trap
 * whether or not anyone has fallen into it yet, so this one is gone.
 */

export function useUpdateMeeting(id: number) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (payload: MeetingUpdate) =>
      api.patch<MeetingDetail>(`/api/v1/meetings/${id}`, payload),
    onSuccess: (updated) => {
      // Write the response straight into the detail cache so the Notepad header
      // updates without a refetch, then invalidate the lists so the row follows.
      client.setQueryData(qk.meetings.detail(id), updated)
      void client.invalidateQueries({ queryKey: qk.meetings.lists() })
    },
  })
}

export function useDeleteMeeting() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/api/v1/meetings/${id}`),
    onSuccess: (_data, id) => {
      client.removeQueries({ queryKey: qk.meetings.detail(id) })
      void client.invalidateQueries({ queryKey: qk.meetings.lists() })
    },
  })
}

export function useRestoreMeeting() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => api.post<MeetingDetail>(`/api/v1/meetings/${id}/restore`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.meetings.all })
    },
  })
}
