/**
 * Where the player fetches a meeting's audio from.
 *
 * NOT `meeting.media_url`. That field records which file backs the meeting —
 * it is a storage reference, not a route, and nothing serves it. The bytes come
 * from `/api/v1/meetings/{id}/media`, which is the endpoint that implements
 * Range requests and therefore the only one seeking works against.
 *
 * Absolute, because a media element resolves a relative URL against the PAGE's
 * origin — the frontend's port, not the API's — and the resulting 404 comes
 * from Next's router with nothing in it to explain the mistake.
 */

import { resolveApiBase } from '@/lib/api/client'

export function mediaSrc(meeting: { id: number; media_url?: string | null }): string | null {
  if (!meeting.media_url) return null
  return new URL(`/api/v1/meetings/${meeting.id}/media`, resolveApiBase()).toString()
}
