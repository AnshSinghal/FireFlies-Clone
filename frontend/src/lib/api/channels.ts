'use client'

import { useQuery } from '@tanstack/react-query'

import { api } from './client'
import type { components } from '@/types/api'

export type SidebarChannels = components['schemas']['SidebarChannels']
export type ChannelOut = components['schemas']['ChannelOut']

/**
 * Channels for the rail.
 *
 * Long `staleTime` — the sidebar renders on every page, and channel counts do
 * not move often enough to justify refetching on each navigation. Creating or
 * deleting a meeting invalidates this explicitly.
 */
export function useChannels() {
  return useQuery({
    queryKey: ['channels'],
    queryFn: ({ signal }) => api.get<SidebarChannels>('/api/v1/channels', { signal }),
    staleTime: 5 * 60_000,
    // A fresh clone 503s with NOT_SEEDED; retrying only delays the rail
    // rendering without its counts, which is a fine degraded state.
    retry: false,
  })
}
