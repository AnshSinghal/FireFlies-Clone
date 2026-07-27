'use client'

/**
 * AskFred (T-37).
 *
 * A mutation, not a query: a question is an ACTION with a cost — the endpoint
 * is rate-limited with the other model-calling routes — and caching one
 * question's answer under a query key would replay it for a differently
 *-worded duplicate.
 */

import { useMutation } from '@tanstack/react-query'

import { api } from './client'
import type { AskRequest, AskResponse } from './types'

export function useAskFred(meetingId: number) {
  return useMutation({
    mutationFn: (payload: AskRequest) =>
      api.post<AskResponse>(`/api/v1/meetings/${meetingId}/ask`, payload),
    // The global handler would toast the failure AND retry it; AskFred renders
    // failures inline on the message itself, where the conversation is.
    meta: { silent: true },
  })
}
