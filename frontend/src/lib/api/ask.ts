'use client'

/**
 * AskFred (T-37).
 *
 * A mutation, not a query: a question is an ACTION with a cost — the endpoint
 * is rate-limited with the other model-calling routes — and caching one
 * question's answer under a query key would replay it for a differently
 *-worded duplicate.
 */

import { useMutation, useQuery } from '@tanstack/react-query'

import { api } from './client'
import { qk } from './query-keys'
import type { AskRequest, AskResponse, HealthResponse } from './types'

export function useAskFred(meetingId: number) {
  return useMutation({
    mutationFn: (payload: AskRequest) =>
      api.post<AskResponse>(`/api/v1/meetings/${meetingId}/ask`, payload),
    // The global handler would toast the failure AND retry it; AskFred renders
    // failures inline on the message itself, where the conversation is.
    meta: { silent: true },
  })
}

/**
 * Which provider is answering (T-37.11).
 *
 * Read from `/api/health`, which already reports `ai_provider` — so the
 * `Extractive mode` badge is correct from the moment the panel opens, not only
 * after the first answer confirms it. The provider cannot change while the
 * server runs; cache it for the session.
 */
export function useAiProvider() {
  return useQuery({
    queryKey: qk.health,
    queryFn: () => api.get<HealthResponse>('/api/health'),
    select: (health) => health.ai_provider,
    staleTime: Infinity,
    meta: { silent: true },
  })
}
