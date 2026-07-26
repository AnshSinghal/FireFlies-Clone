'use client'

/**
 * The transport row: skip, play/pause, time, rate and volume
 * (T-19.2, T-19.5, T-19.6, T-19.7).
 *
 * Previous/next SEGMENT rather than ±30s. Skipping by a fixed slab of time is
 * a podcast idiom; in a meeting the useful unit is "the next thing someone
 * said", and the transcript already knows where those boundaries are.
 */

import {
  Pause,
  Play,
  Redo2,
  SkipBack,
  SkipForward,
  Undo2,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dropdown, DropdownRadioGroup, DropdownRadioItem } from '@/components/ui/dropdown'
import { IconButton } from '@/components/ui/icon-button'
import { CircleButton, Slider } from '@/components/ui/media-controls'
import { isPlaybackRate, RATES, type PlaybackRate } from '@/lib/player/prefs'
import { formatTimestamp } from '@/lib/utils/format'

interface TransportProps {
  currentMs: number
  durationMs: number
  isPlaying: boolean
  rate: PlaybackRate
  volume: number
  muted: boolean
  onToggle: () => void
  onSkip: (deltaMs: number) => void
  onSeek: (ms: number) => void
  onRate: (rate: PlaybackRate) => void
  onVolume: (volume: number) => void
  onToggleMute: () => void
  /** Segment start times in ms, ascending — the ⏮/⏭ targets. */
  boundaries: number[]
}

const SKIP_MS = 10_000

/** Within this far into a segment, ⏮ restarts it instead of going back one. */
const SEGMENT_BACK_GRACE_MS = 1500

export function Transport({
  currentMs,
  durationMs,
  isPlaying,
  rate,
  volume,
  muted,
  onToggle,
  onSkip,
  onSeek,
  onRate,
  onVolume,
  onToggleMute,
  boundaries,
}: TransportProps) {
  const [showRemaining, setShowRemaining] = useState(false)

  const goToSegment = (direction: -1 | 1) => {
    if (direction === 1) {
      // The 250ms guard stops a press landing exactly on a boundary from
      // "advancing" to the segment already playing.
      const next = boundaries.find((ms) => ms > currentMs + 250)
      onSeek(next ?? durationMs)
      return
    }

    /*
     * Back behaves the way every media player's back button does: the first
     * press restarts the current segment, and only a press near its start goes
     * to the previous one. Jumping straight back loses your place when you
     * meant to re-hear what was just said.
     */
    const starts = [...boundaries].reverse()
    const currentStart = starts.find((ms) => ms <= currentMs) ?? 0

    if (currentMs - currentStart > SEGMENT_BACK_GRACE_MS) {
      onSeek(currentStart)
      return
    }
    onSeek(starts.find((ms) => ms < currentStart) ?? 0)
  }

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2

  return (
    <div className="flex items-center gap-1">
      <IconButton
        label="Previous segment"
        icon={<SkipBack size={16} strokeWidth={1.75} />}
        onClick={() => goToSegment(-1)}
        data-testid="player-prev"
      />
      <IconButton
        label="Back 10 seconds"
        icon={<Undo2 size={16} strokeWidth={1.75} />}
        onClick={() => onSkip(-SKIP_MS)}
        data-testid="player-back10"
      />

      <CircleButton
        label={isPlaying ? 'Pause' : 'Play'}
        aria-pressed={isPlaying}
        onClick={onToggle}
        data-testid="player-play"
        className="mx-1"
        icon={
          isPlaying ? (
            <Pause size={18} strokeWidth={2} fill="currentColor" />
          ) : (
            // Nudged right by 2px: a triangle centred on its bounding box
            // looks off-centre inside a circle.
            <Play size={18} strokeWidth={2} fill="currentColor" className="ml-0.5" />
          )
        }
      />

      <IconButton
        label="Forward 10 seconds"
        icon={<Redo2 size={16} strokeWidth={1.75} />}
        onClick={() => onSkip(SKIP_MS)}
        data-testid="player-forward10"
      />
      <IconButton
        label="Next segment"
        icon={<SkipForward size={16} strokeWidth={1.75} />}
        onClick={() => goToSegment(1)}
        data-testid="player-next"
      />

      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowRemaining((current) => !current)}
        data-testid="player-time"
        className="tnum ml-2"
        // The label carries both readings, so the toggle announces what
        // pressing it will do rather than only what it currently shows.
        aria-label={
          showRemaining
            ? `${formatTimestamp(durationMs - currentMs)} remaining. Show elapsed time.`
            : `${formatTimestamp(currentMs)} of ${formatTimestamp(durationMs)}. Show remaining time.`
        }
      >
        {showRemaining ? (
          `-${formatTimestamp(durationMs - currentMs)}`
        ) : (
          <>
            {formatTimestamp(currentMs)}
            <span className="mx-1 text-muted">/</span>
            {formatTimestamp(durationMs)}
          </>
        )}
      </Button>

      <div className="ml-auto flex items-center gap-1">
        <Dropdown
          testId="player-rate-menu"
          trigger={
            <Button
              variant="ghost"
              size="sm"
              data-testid="player-rate"
              aria-label={`Playback speed, currently ${rate} times`}
              className="tnum"
            >
              {rate}×
            </Button>
          }
        >
          {/*
            A radio group, not seven plain items: "pick one of these" is what
            `menuitemradio` means, and it gets the checked state announced and
            the indicator drawn without a hand-rolled tick.
          */}
          <DropdownRadioGroup
            value={String(rate)}
            onValueChange={(value) => {
              const next = Number(value)
              if (isPlaybackRate(next)) onRate(next)
            }}
          >
            {RATES.map((option) => (
              <DropdownRadioItem
                key={option}
                value={String(option)}
                testId={`player-rate-${option}`}
              >
                {option}×
              </DropdownRadioItem>
            ))}
          </DropdownRadioGroup>
        </Dropdown>

        {/*
          The slider expands on hover (T-19.7) — and stays expanded while it
          has focus, or a keyboard user would be adjusting a control that is
          zero pixels wide.
        */}
        <div className="group/vol flex items-center">
          <IconButton
            label={muted ? 'Unmute' : 'Mute'}
            icon={<VolumeIcon size={16} strokeWidth={1.75} />}
            onClick={onToggleMute}
            data-testid="player-mute"
          />
          <Slider
            label="Volume"
            value={muted ? 0 : volume}
            onValueChange={onVolume}
            data-testid="player-volume"
            className="w-0 opacity-0 transition-[width,opacity] duration-base focus-visible:ml-2 focus-visible:w-20 focus-visible:opacity-100 group-hover/vol:ml-2 group-hover/vol:w-20 group-hover/vol:opacity-100"
          />
        </div>
      </div>
    </div>
  )
}
