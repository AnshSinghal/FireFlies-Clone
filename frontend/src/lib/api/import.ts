'use client'

/**
 * Parsing and importing a transcript (T-26).
 *
 * The parse is a DRY RUN: it answers "what would we create" so the preview can
 * be confirmed or corrected first, and writes nothing. Both halves talk to the
 * same server-side parser, so what the preview shows is what gets created.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api, API_BASE_URL, ApiError } from './client'
import { qk } from './query-keys'
import type { MeetingDetail } from './types'

export interface PreviewSegment {
  speaker: string
  start_ms: number
  end_ms: number
  text: string
}

export interface TranscriptPreview {
  /** Which heuristic matched — shown, because invented timings should say so. */
  strategy: string
  segments: PreviewSegment[]
  speakers: string[]
  duration_ms: number
  title: string | null
  participants: string[]
}

/** What each strategy means, in words the reader can act on. */
export const STRATEGY_LABELS: Record<string, string> = {
  webvtt: 'WebVTT cues',
  subrip: 'SubRip subtitles',
  json: 'JSON transcript',
  'bracketed-timestamps': 'Timestamps in [00:14] form',
  'leading-timestamps': 'Timestamps at the start of each line',
  'speaker-prefixes': 'Speaker names — timings estimated from reading speed',
  paragraphs: 'Plain paragraphs — one speaker, timings estimated',
}

/**
 * `multipart/form-data`, so the same endpoint takes a file or a paste.
 *
 * Sent with `fetch` directly rather than through `api.post`: that helper sets
 * a JSON content type, and a multipart body needs the browser to set its own
 * boundary — overriding it produces a request the server cannot split.
 */
async function postForm(body: FormData): Promise<TranscriptPreview> {
  const response = await fetch(new URL('/api/v1/meetings/parse', API_BASE_URL), {
    method: 'POST',
    body,
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string; details?: { hint?: string } }
    } | null

    throw new ApiError(
      response.status,
      'PARSE_FAILED',
      payload?.error?.message ?? "We couldn't read that transcript.",
      payload?.error?.details ?? {},
    )
  }

  return (await response.json()) as TranscriptPreview
}

export function useParseTranscript() {
  return useMutation({
    mutationFn: (input: { file: File } | { text: string; extension: string }) => {
      const body = new FormData()
      if ('file' in input) body.append('file', input.file)
      else {
        body.append('text', input.text)
        body.append('extension', input.extension)
      }
      return postForm(body)
    },
  })
}

export interface ImportPayload {
  title: string
  started_at?: string
  language?: string
  participant_names?: string[]
  segments?: PreviewSegment[]
}

export function useCreateMeeting() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (payload: ImportPayload) =>
      // Two endpoints, one hook: a meeting with a transcript and one without
      // are the same action to the user, and the difference is whether there
      // are segments to send.
      payload.segments && payload.segments.length > 0
        ? api.post<MeetingDetail>('/api/v1/meetings/import', payload)
        : api.post<MeetingDetail>('/api/v1/meetings', payload),

    onSuccess: () => {
      // The Notebook's list and its counts both move when a meeting appears.
      void client.invalidateQueries({ queryKey: qk.meetings.lists() })
    },
  })
}
