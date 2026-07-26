'use client'

/**
 * The transcript panel — SHELL ONLY (T-18).
 *
 * T-21 builds the virtualised list, the speaker grouping and the player sync.
 * What is settled here is that it owns its own scroll container and loads the
 * first page rather than the whole transcript.
 */

import { StateView } from '@/components/ui/state-view'
import { SkeletonText } from '@/components/ui/skeleton'
import { useTranscript } from '@/lib/api/transcript'
import { formatTimestamp } from '@/lib/utils/format'
import { getSpeakerColorByIndex } from '@/lib/utils/speaker-color'

export function TranscriptPanel({ meetingId }: { meetingId: number }) {
  const { data, isPending, isError } = useTranscript(meetingId)

  const speakers = new Map((data?.speakers ?? []).map((s) => [s.id, s]))

  return (
    <section
      data-testid="transcript-panel"
      aria-label="Transcript"
      className="flex h-full min-h-0 flex-col overflow-y-auto border-l border-subtle p-5"
    >
      {isPending && <SkeletonText lines={14} />}

      {isError && (
        <StateView
          variant="error"
          title="Couldn't load the transcript"
          body="The summary is unaffected — one failing panel does not blank the page."
          className="border-0"
        />
      )}

      {data && data.segments.length === 0 && (
        <StateView
          variant="empty"
          title="No transcript yet"
          body="This meeting has not been transcribed."
          className="border-0"
        />
      )}

      {data && data.segments.length > 0 && (
        <ol className="space-y-3" data-testid="transcript-segments">
          {data.segments.map((segment) => {
            const speaker = speakers.get(segment.speaker_id)
            return (
              <li key={segment.id} data-testid={`segment-${segment.id}`} className="space-y-0.5">
                <div className="flex items-baseline gap-2">
                  <span
                    className="text-body-strong"
                    // The speaker's server-assigned colour, so they are the
                    // same colour here as in the details drawer (ADR-013).
                    style={{
                      color: speaker ? getSpeakerColorByIndex(speaker.color_index) : undefined,
                    }}
                  >
                    {speaker?.label ?? 'Unknown'}
                  </span>
                  <span className="tnum text-sm text-muted">
                    {formatTimestamp(segment.start_ms)}
                  </span>
                </div>
                <p className="text-transcript text-primary">{segment.text}</p>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
