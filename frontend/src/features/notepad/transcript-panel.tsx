'use client'

/**
 * The transcript panel.
 *
 * T-21 builds the virtualised list, the speaker grouping and the search. What
 * is settled here is the SHAPE: the player is a fixed header and the segments
 * scroll under it (T-19.13), which is why this is a flex column with one
 * scrolling child rather than one scrolling box with a `sticky` element in it.
 * `position: sticky` would work until the first element with `overflow` or a
 * transform appeared between them, and then fail silently.
 */

import { useEffect, useRef } from 'react'

import { SkeletonText } from '@/components/ui/skeleton'
import { StateView } from '@/components/ui/state-view'
import { useTranscript } from '@/lib/api/transcript'
import { usePlayer } from '@/lib/player/player-context'
import { cn } from '@/lib/utils/cn'
import { formatTimestamp } from '@/lib/utils/format'
import { getSpeakerColorByIndex } from '@/lib/utils/speaker-color'

import { PlayerCard } from './player/player-card'

interface TranscriptPanelProps {
  meetingId: number
  /** Resolved media URL, or null when the meeting has none. */
  mediaSrc: string | null
}

export function TranscriptPanel({ meetingId, mediaSrc }: TranscriptPanelProps) {
  const { data, isPending, isError } = useTranscript(meetingId)
  const player = usePlayer()

  const activeRef = useRef<HTMLLIElement | null>(null)

  const speakers = new Map((data?.speakers ?? []).map((speaker) => [speaker.id, speaker]))
  const segments = data?.segments ?? []

  /*
   * The segment the playhead is inside: the LAST one that has started.
   *
   * Not "the one whose range contains the time" — segments can have gaps
   * between them, and during a gap the honest answer is still the thing that
   * was just said, not nothing at all.
   */
  let activeId: number | null = null
  for (const segment of segments) {
    if (segment.start_ms <= player.currentMs) activeId = segment.id
    else break
  }

  /*
   * Follow the playhead — but only when the ACTIVE SEGMENT changes, which is
   * why this effect depends on the id and not on `currentMs`.
   *
   * Scrolling on every clock tick would fight the user for the scrollbar ten
   * times a second. T-21 adds the "the user has scrolled away" suppression.
   */
  useEffect(() => {
    if (activeId === null) return
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeId])

  return (
    <section
      data-testid="transcript-panel"
      aria-label="Transcript"
      className="flex h-full min-h-0 flex-col border-l border-subtle"
    >
      <div className="shrink-0 p-4 pb-2">
        <PlayerCard meetingId={meetingId} src={mediaSrc} />
      </div>

      {/*
        `tabIndex` because this box SCROLLS and nothing inside it can take
        focus: the segments are plain text, so without a tab stop a keyboard
        user has no way to reach the scrollbar at all. Axe calls this
        `scrollable-region-focusable`, and it appeared the moment the player
        became a fixed header and the list became its own scroll container.
      */}
      <div
        data-testid="transcript-scroll"
        tabIndex={0}
        role="group"
        aria-label="Transcript segments"
        className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
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

        {data && segments.length === 0 && (
          <StateView
            variant="empty"
            title="No transcript yet"
            body="This meeting has not been transcribed."
            className="border-0"
          />
        )}

        {segments.length > 0 && (
          <ol className="space-y-3" data-testid="transcript-segments">
            {segments.map((segment) => {
              const speaker = speakers.get(segment.speaker_id)
              const isActive = segment.id === activeId

              return (
                <li
                  key={segment.id}
                  ref={isActive ? activeRef : undefined}
                  data-testid={`segment-${segment.id}`}
                  data-active={isActive || undefined}
                  className={cn(
                    'rounded-md border-l-2 py-0.5 pl-3 transition-colors duration-fast',
                    isActive ? 'border-accent bg-accent-subtle' : 'border-transparent',
                  )}
                >
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
      </div>
    </section>
  )
}
