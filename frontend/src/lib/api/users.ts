'use client'

import { useQuery } from '@tanstack/react-query'

import { api } from './client'
import type { components } from '@/types/api'

export type TeamMemberOut = components['schemas']['TeamMemberOut']
export type MembersPage = components['schemas']['Page_TeamMemberOut_']

/**
 * Workspace members for the Team placeholder page (T-30.4).
 *
 * Long `staleTime` for the same reason as channels: the seeded workspace
 * roster changes exactly never during a session.
 */
export function useMembers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: ({ signal }) => api.get<MembersPage>('/api/v1/users', { signal }),
    staleTime: 5 * 60_000,
  })
}
