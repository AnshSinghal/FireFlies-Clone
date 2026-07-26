/**
 * Meeting queries and mutations.
 *
 * The only module that knows API paths for meetings. Components call hooks;
 * they never see a URL, which is what keeps a route change from rippling
 * through the component tree.
 */

'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import { qk, type MeetingFilters } from './query-keys'
import type {
  Facets,
  MeetingCreate,
  MeetingDetail,
  MeetingListItem,
  MeetingUpdate,
  Page,
} from './types'

export function useMeetings(filters: MeetingFilters = {}) {
  return useQuery({
    queryKey: qk.meetings.list(filters),
    queryFn: ({ signal }) =>
      api.get<Page<MeetingListItem>>('/api/v1/meetings', {
        signal,
        // camelCase in the app, snake_case on the wire. Translated in ONE
        // place, so a rename on either side breaks here rather than in every
        // component that happens to build a query string.
        params: {
          q: filters.q,
          host: filters.host,
          participant: filters.participant,
          from: filters.from,
          to: filters.to,
          min_duration: filters.minDuration,
          max_duration: filters.maxDuration,
          tags: filters.tags,
          channel: filters.channel,
          has_action_items: filters.hasActionItems,
          source: filters.source,
          sort: filters.sort,
          page: filters.page,
          page_size: filters.pageSize,
        },
      }),
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

export function useCreateMeeting() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (payload: MeetingCreate) => api.post<MeetingDetail>('/api/v1/meetings', payload),
    onSuccess: () => {
      // Invalidate the whole list branch, not one filter's key — a new meeting
      // may match filters the user is not currently looking at.
      void client.invalidateQueries({ queryKey: qk.meetings.lists() })
    },
  })
}

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
