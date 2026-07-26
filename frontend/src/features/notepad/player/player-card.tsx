'use client'

/**
 * The player card (T-19).
 *
 * Assembly only: the clock lives in `usePlayer`, the scrubbing in `Seekbar`,
 * the buttons in `Transport`. What this file owns is where the chapter marks
 * and the hover-preview speaker names come from — both are derived from data
 * the Notepad has already fetched, so neither costs a request.
 */

import { useMemo } from 'react'

import { useSummary } from '@/lib/api/summaries'
import { useTranscript } from '@/lib/api/transcript'
import { usePlayer } from '@/lib/player/player-context'
import { cn } from '@/lib/utils/cn'

import { Seekbar, type Chapter, type SpeakerCue } from './seekbar'
import { Transport } from './transport'
import { WaveformStrip } from './waveform-strip'

interface PlayerCardProps {
  meetingId: number
  /** Resolved media URL, or null when the meeting has none. */
  src: string | null
  className?: string
}

export function PlayerCard({ meetingId, src, className }: PlayerCardProps) {
  const player = usePlayer()

  // Both are already in the cache — the panels mounted with them. React Query
  // returns them without a second request.
  const { data: summary } = useSummary(meetingId)
  const { data: transcript } = useTranscript(meetingId)

  const chapters = useMemo<Chapter[]>(
    () =>
      (summary?.outline ?? []).map((entry) => ({
        title: entry.title,
        startMs: entry.start_ms,
      })),
    [summary],
  )

  const { cues, boundaries } = useMemo(() => {
    const speakers = new Map((transcript?.speakers ?? []).map((speaker) => [speaker.id, speaker]))
    const segments = transcript?.segments ?? []

    return {
      cues: segments.map<SpeakerCue>((segment) => ({
        startMs: segment.start_ms,
        label: speakers.get(segment.speaker_id)?.label ?? 'Speaker',
      })),
      boundaries: segments.map((segment) => segment.start_ms),
    }
  }, [transcript])

  return (
    <div
      data-testid="player"
      className={cn(
        'rounded-lg border border-subtle bg-surface-0 p-4 shadow-xs',
        // `select-none` because a drag across the card would otherwise
        // highlight the timestamps, which looks broken mid-scrub.
        'select-none',
        className,
      )}
    >
      <WaveformStrip
        // Keyed, so opening another meeting rebuilds the strip from that
        // meeting's cache or seed instead of keeping the previous one.
        key={meetingId}
        meetingId={meetingId}
        src={player.mediaFailed ? null : src}
        progress={player.durationMs > 0 ? player.currentMs / player.durationMs : 0}
        onSeekRatio={(ratio) => player.seek(ratio * player.durationMs)}
      />

      <Seekbar
        currentMs={player.currentMs}
        durationMs={player.durationMs}
        bufferedMs={player.bufferedMs}
        chapters={chapters}
        cues={cues}
        onSeek={player.seek}
      />

      <Transport
        currentMs={player.currentMs}
        durationMs={player.durationMs}
        isPlaying={player.isPlaying}
        rate={player.rate}
        volume={player.volume}
        muted={player.muted}
        onToggle={player.toggle}
        onSkip={player.skip}
        onSeek={player.seek}
        onRate={player.setRate}
        onVolume={player.setVolume}
        onToggleMute={player.toggleMute}
        boundaries={boundaries}
      />

      {player.mediaFailed && (
        <p data-testid="player-media-note" className="mt-2 text-sm text-muted">
          {/*
            Stated plainly, and the player keeps working (T-19.14). A broken
            <audio> box or a raw DOMException string would tell the user the
            page is broken, when in fact everything except the sound works.
          */}
          Audio unavailable — showing transcript timeline.
        </p>
      )}
    </div>
  )
}
