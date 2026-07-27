'use client'

/**
 * The seekbar (T-19.3, T-19.4, T-19.8, T-19.10).
 *
 * Pointer events rather than mouse events so a touch drag works with the same
 * code, and pointer CAPTURE so a drag that leaves the bar — which every real
 * drag does — keeps scrubbing instead of stopping dead at the edge.
 *
 * The chapter ticks are SIBLINGS of the slider, not children. Buttons nested
 * inside a `role="slider"` are both invalid and unreachable: a screen reader
 * announcing a slider does not then offer the buttons inside it.
 */

import { useRef, useState } from 'react'

import { TrackMarker } from '@/components/ui/media-controls'
import { cn } from '@/lib/utils/cn'
import { formatTimestamp } from '@/lib/utils/format'

export interface Chapter {
  title: string
  startMs: number
}

export interface SpeakerCue {
  startMs: number
  label: string
}

interface SeekbarProps {
  currentMs: number
  durationMs: number
  bufferedMs: number
  chapters: Chapter[]
  /** Sorted by `startMs`; used for the hover preview's speaker name. */
  cues: SpeakerCue[]
  onSeek: (ms: number) => void
  /** Chapter ticks seek AND reveal, which scrubbing does not (T-21.6). */
  onSeekChapter: (ms: number) => void
}

/** Keyboard step, matching the `←`/`→` shortcut so both routes agree. */
const ARROW_STEP_MS = 5000

function ratioOf(value: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0
  return Math.min(1, Math.max(0, value / total))
}

function speakerAt(cues: SpeakerCue[], ms: number): string | null {
  // Linear from the end: the cue list is a few hundred entries at most and the
  // hover moves one bar at a time, so a binary search would be more code for
  // no measurable gain.
  for (let i = cues.length - 1; i >= 0; i -= 1) {
    const cue = cues[i]
    if (cue && cue.startMs <= ms) return cue.label
  }
  return null
}

export function Seekbar({
  currentMs,
  durationMs,
  bufferedMs,
  chapters,
  cues,
  onSeek,
  onSeekChapter,
}: SeekbarProps) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const [hoverRatio, setHoverRatio] = useState<number | null>(null)

  const progress = ratioOf(currentMs, durationMs)
  const buffered = ratioOf(bufferedMs, durationMs)

  const ratioFromEvent = (clientX: number): number => {
    const box = trackRef.current?.getBoundingClientRect()
    if (!box || box.width === 0) return 0
    return Math.min(1, Math.max(0, (clientX - box.left) / box.width))
  }

  const hoverMs = hoverRatio === null ? null : hoverRatio * durationMs
  const hoverSpeaker = hoverMs === null ? null : speakerAt(cues, hoverMs)

  return (
    <div className="group/seek relative py-2">
      {/* The hover preview (T-19.4). */}
      {hoverRatio !== null && hoverMs !== null && (
        <div
          data-testid="player-seek-preview"
          role="presentation"
          className="pointer-events-none absolute bottom-full z-popover mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-primary px-2 py-1 text-xs text-inverse shadow-sm"
          style={{
            // Clamped so the preview never hangs off either end of the card.
            left: `clamp(2rem, ${hoverRatio * 100}%, calc(100% - 2rem))`,
          }}
        >
          <span className="tnum">{formatTimestamp(hoverMs)}</span>
          {hoverSpeaker && <span className="ml-1.5 opacity-80">{hoverSpeaker}</span>}
        </div>
      )}

      <div
        ref={trackRef}
        data-testid="player-seekbar"
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        // FLOORED, not rounded, so the announced value and the displayed
        // timestamp are the same number. `formatTimestamp` floors — a clock
        // shows the second it is in, not the nearest one — and rounding here
        // would have a screen reader saying 2:50 while the display said 2:49.
        aria-valuemax={Math.floor(durationMs / 1000)}
        aria-valuenow={Math.floor(currentMs / 1000)}
        // Without this a screen reader reads "724", which is not a time.
        aria-valuetext={`${formatTimestamp(currentMs)} of ${formatTimestamp(durationMs)}`}
        className={cn(
          'relative h-1 w-full cursor-pointer rounded-full bg-surface-2 transition-[height] duration-fast',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 group-hover/seek:h-1.5',
          dragging && 'h-1.5',
        )}
        onPointerDown={(event) => {
          // Capture on the element, so the drag survives leaving the track.
          event.currentTarget.setPointerCapture(event.pointerId)
          setDragging(true)
          onSeek(ratioFromEvent(event.clientX) * durationMs)
        }}
        onPointerMove={(event) => {
          const ratio = ratioFromEvent(event.clientX)
          setHoverRatio(ratio)
          if (dragging) onSeek(ratio * durationMs)
        }}
        onPointerUp={(event) => {
          event.currentTarget.releasePointerCapture(event.pointerId)
          setDragging(false)
        }}
        onPointerLeave={() => setHoverRatio(null)}
        onKeyDown={(event) => {
          const step =
            event.key === 'ArrowLeft'
              ? -ARROW_STEP_MS
              : event.key === 'ArrowRight'
                ? ARROW_STEP_MS
                : 0

          /*
           * The global shortcuts bind the same arrows, and a focused seekbar
           * must not move twice per press. That is handled THERE, by skipping
           * any event whose target owns the keyboard — `role="slider"` is on
           * that list. One rule in one place, rather than a `stopPropagation`
           * here that only works as long as nobody listens in the capture
           * phase.
           */
          if (step !== 0) {
            event.preventDefault()
            onSeek(currentMs + step)
            return
          }

          if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault()
            onSeek(event.key === 'Home' ? 0 : durationMs)
          }
        }}
      >
        {/* Buffered (T-19.10) — only meaningful with a real transport. */}
        {buffered > 0 && buffered < 1 && (
          <div
            data-testid="player-buffered"
            className="absolute inset-y-0 left-0 rounded-full bg-surface-buffered"
            style={{ width: `${buffered * 100}%` }}
          />
        )}

        <div
          data-testid="player-progress"
          className={cn(
            'absolute inset-y-0 left-0 rounded-full bg-accent',
            // Interpolates between the 10Hz clock commits, so the fill glides
            // rather than stepping. Off while dragging, where it would lag the
            // pointer by a visible fraction of a second.
            !dragging && 'transition-[width] duration-fast ease-linear',
          )}
          style={{ width: `${progress * 100}%` }}
        />

        <div
          data-testid="player-thumb"
          className={cn(
            'ring-surface-0 absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 group-hover/seek:size-4',
            // ONE transition declaration. Two `transition-[...]` classes on the
            // same element both set `transition-property`, and which one wins
            // depends on stylesheet order rather than on the order written here.
            dragging
              ? 'transition-none'
              : 'transition-[left,width,height] duration-fast ease-linear',
          )}
          style={{ left: `${progress * 100}%` }}
        />
      </div>

      {/* Chapter ticks (T-19.8), above the track and outside the slider. */}
      {chapters.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-2 h-1.5">
          {chapters.map((chapter, index) => (
            <TrackMarker
              key={`${chapter.startMs}-${chapter.title}`}
              data-testid={`player-chapter-${index}`}
              title={chapter.title}
              label={`${chapter.title} at ${formatTimestamp(chapter.startMs)}`}
              ratio={ratioOf(chapter.startMs, durationMs)}
              onClick={() => onSeekChapter(chapter.startMs)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
