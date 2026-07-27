'use client'

/**
 * The range trimmer (T-33.3).
 *
 * A mini waveform of the clip's neighbourhood with pointer-captured start/end
 * handles, ±1s nudge buttons and a live duration readout. The peaks come from
 * the SAME source as the player strip — the session cache when real media has
 * been decoded, the seeded pseudo-waveform otherwise — sliced by index, so the
 * bars here visibly agree with the strip for the same milliseconds.
 *
 * The handle pattern is ResizablePanels' (T-18.8): capture on pointer-down,
 * ratio from the container's rect, clamp on every write, arrow keys with
 * `preventDefault`, and an invisible widened hit area — a 6px bar is not a
 * target anyone can hit.
 */

import { Minus, Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { IconButton } from '@/components/ui/icon-button'
import { pseudoPeaks, readCachedPeaks } from '@/lib/player/waveform'
import { cn } from '@/lib/utils/cn'
import { formatDuration, formatTimestamp } from '@/lib/utils/format'

const HEIGHT = 56
const BAR_GAP = 1
const NUDGE_MS = 1000
const KEY_STEP_MS = 1000

/**
 * Handles cannot cross closer than this. Deliberately BELOW the 3s minimum:
 * T33-C wants the too-short state reachable and explained with a message, not
 * silently prevented by a clamp the user never sees.
 */
const MIN_GAP_MS = 1000

interface ClipTrimmerProps {
  meetingId: number
  /** The meeting's timeline, for mapping peaks to milliseconds. */
  durationMs: number
  startMs: number
  endMs: number
  onChange: (startMs: number, endMs: number) => void
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function ClipTrimmer({ meetingId, durationMs, startMs, endMs, onChange }: ClipTrimmerProps) {
  /*
   * The VIEW is fixed at mount: the initial clip plus breathing room on each
   * side. Re-deriving it from the live handles would re-scale the waveform
   * under the pointer mid-drag, which makes precise trimming impossible.
   */
  const [view] = useState(() => {
    const pad = Math.max(15_000, endMs - startMs)
    return {
      startMs: Math.max(0, startMs - pad),
      endMs: Math.min(durationMs, endMs + pad),
    }
  })
  const span = Math.max(1, view.endMs - view.startMs)

  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [width, setWidth] = useState(0)

  const peaks = useMemo(() => {
    const all = readCachedPeaks(meetingId) ?? pseudoPeaks(meetingId)
    const from = Math.floor((view.startMs / Math.max(1, durationMs)) * all.length)
    const to = Math.min(
      all.length,
      Math.max(from + 1, Math.ceil((view.endMs / Math.max(1, durationMs)) * all.length)),
    )
    return all.slice(from, to)
  }, [meetingId, view, durationMs])

  // ── Size ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(wrap)
    setWidth(wrap.clientWidth)

    return () => observer.disconnect()
  }, [])

  // ── Paint ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width === 0) return

    const context = canvas.getContext('2d')
    if (!context) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(HEIGHT * dpr)
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.clearRect(0, 0, width, HEIGHT)

    // Colours read at paint time so the trimmer follows the theme — the same
    // rule as the strip, with the same inherited-colour fallback.
    const styles = getComputedStyle(canvas)
    const inClip = styles.getPropertyValue('--ff-accent').trim() || styles.color
    const outside = styles.getPropertyValue('--ff-border-strong').trim() || styles.color

    const barWidth = Math.max(1, width / peaks.length - BAR_GAP)
    const step = width / peaks.length

    peaks.forEach((peak, index) => {
      const barMs = view.startMs + ((index + 0.5) / peaks.length) * span
      const height = Math.max(2, peak * (HEIGHT - 4))
      const y = (HEIGHT - height) / 2

      context.fillStyle = barMs >= startMs && barMs < endMs ? inClip : outside
      context.fillRect(index * step, y, barWidth, height)
    })
  }, [peaks, width, startMs, endMs, view, span])

  // ── Geometry ──────────────────────────────────────────────────────────────

  const setStart = (ms: number) => onChange(clamp(ms, view.startMs, endMs - MIN_GAP_MS), endMs)
  const setEnd = (ms: number) => onChange(startMs, clamp(ms, startMs + MIN_GAP_MS, view.endMs))

  const msFromClientX = (clientX: number): number => {
    const box = wrapRef.current?.getBoundingClientRect()
    if (!box || box.width === 0) return startMs
    const ratio = clamp((clientX - box.left) / box.width, 0, 1)
    // Snapped to 100ms: finer than anyone can hear, coarse enough that the
    // readout does not jitter through sub-second noise while dragging.
    return Math.round((view.startMs + ratio * span) / 100) * 100
  }

  const startRatio = (startMs - view.startMs) / span
  const endRatio = (endMs - view.startMs) / span

  return (
    <div className="space-y-2">
      <div
        ref={wrapRef}
        className="relative select-none overflow-hidden rounded-md border border-subtle bg-surface-1"
        style={{ height: HEIGHT }}
        data-testid="soundbite-trimmer"
      >
        {/* Decorative — the handles carry the semantics. */}
        <canvas ref={canvasRef} aria-hidden="true" style={{ width: '100%', height: HEIGHT }} />

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 bg-soundbite-band"
          style={{ left: `${startRatio * 100}%`, width: `${(endRatio - startRatio) * 100}%` }}
        />

        <TrimHandle
          side="start"
          ms={startMs}
          ratio={startRatio}
          minMs={view.startMs}
          maxMs={endMs - MIN_GAP_MS}
          onMove={(clientX) => setStart(msFromClientX(clientX))}
          onStep={(delta) => setStart(startMs + delta)}
        />
        <TrimHandle
          side="end"
          ms={endMs}
          ratio={endRatio}
          minMs={startMs + MIN_GAP_MS}
          maxMs={view.endMs}
          onMove={(clientX) => setEnd(msFromClientX(clientX))}
          onStep={(delta) => setEnd(endMs + delta)}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <Nudge label="start" ms={startMs} onStep={(delta) => setStart(startMs + delta)} />
        {/* The live readout (T33-B): `0:24`, no leading zero on the largest
            unit — exactly `formatDuration`'s contract. */}
        <span
          data-testid="soundbite-duration"
          aria-live="polite"
          className="tnum text-body-strong text-primary"
        >
          {formatDuration(endMs - startMs)}
        </span>
        <Nudge label="end" ms={endMs} onStep={(delta) => setEnd(endMs + delta)} />
      </div>
    </div>
  )
}

interface TrimHandleProps {
  side: 'start' | 'end'
  ms: number
  ratio: number
  minMs: number
  maxMs: number
  onMove: (clientX: number) => void
  onStep: (deltaMs: number) => void
}

function TrimHandle({ side, ms, ratio, minMs, maxMs, onMove, onStep }: TrimHandleProps) {
  const [dragging, setDragging] = useState(false)

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={side === 'start' ? 'Trim start' : 'Trim end'}
      aria-valuemin={Math.floor(minMs / 1000)}
      aria-valuemax={Math.floor(maxMs / 1000)}
      aria-valuenow={Math.floor(ms / 1000)}
      aria-valuetext={formatTimestamp(ms)}
      data-testid={side === 'start' ? 'soundbite-trim-start' : 'soundbite-trim-end'}
      data-dragging={dragging || undefined}
      className={cn(
        'absolute inset-y-0 z-10 w-1.5 cursor-ew-resize rounded-full bg-accent',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
      )}
      style={{ left: `calc(${ratio * 100}% - 3px)` }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        setDragging(true)
        onMove(event.clientX)
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) onMove(event.clientX)
      }}
      onPointerUp={(event) => {
        event.currentTarget.releasePointerCapture(event.pointerId)
        setDragging(false)
      }}
      onKeyDown={(event) => {
        const step =
          event.key === 'ArrowLeft' ? -KEY_STEP_MS : event.key === 'ArrowRight' ? KEY_STEP_MS : 0
        if (step === 0) return
        event.preventDefault()
        onStep(step)
      }}
    >
      {/* Invisible widened hit area (the ResizablePanels trick). */}
      <span aria-hidden="true" className="absolute inset-y-0 -left-2 -right-2" />
    </div>
  )
}

function Nudge({
  label,
  ms,
  onStep,
}: {
  label: 'start' | 'end'
  ms: number
  onStep: (deltaMs: number) => void
}) {
  return (
    <div className="flex items-center gap-1">
      <IconButton
        size="sm"
        label={`Move ${label} back 1 second`}
        icon={<Minus size={14} strokeWidth={1.75} />}
        onClick={() => onStep(-NUDGE_MS)}
        data-testid={`soundbite-nudge-${label}-back`}
      />
      <span className="tnum min-w-12 text-center text-sm text-secondary">
        {formatTimestamp(ms)}
      </span>
      <IconButton
        size="sm"
        label={`Move ${label} forward 1 second`}
        icon={<Plus size={14} strokeWidth={1.75} />}
        onClick={() => onStep(NUDGE_MS)}
        data-testid={`soundbite-nudge-${label}-forward`}
      />
    </div>
  )
}
