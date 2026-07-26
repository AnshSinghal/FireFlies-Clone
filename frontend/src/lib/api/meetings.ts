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
import type { MeetingCreate, MeetingDetail, MeetingListItem, MeetingUpdate, Page } from './types'

export function useMeetings(filters: MeetingFilters = {}) {
  return useQuery({
    queryKey: qk.meetings.list(filters),
    queryFn: ({ signal }) =>
      api.get<Page<MeetingListItem>>('/api/v1/meetings', {
        signal,
        params: {
          q: filters.q,
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
