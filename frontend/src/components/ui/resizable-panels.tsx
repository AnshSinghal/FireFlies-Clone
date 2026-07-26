'use client'

/**
 * ResizablePanels (T-10.15).
 *
 * The Notepad's transcript/summary split (T-18). Three things make this more
 * than a draggable div:
 *
 * The handle is a real `role="separator"` with `aria-valuenow`, and arrow keys
 * move it — a split a mouse can adjust and a keyboard cannot is a split half
 * the users cannot adjust.
 *
 * The ratio persists, so reopening a meeting keeps the layout the user chose.
 *
 * Pointer capture, not window listeners: dragging fast enough to leave the
 * handle behind must not drop the drag, and releasing outside the window must
 * still end it.
 */

import { useCallback, useRef, useState, type ReactNode } from 'react'

import { useLocalStorage } from '@/lib/hooks/use-local-storage'
import { cn } from '@/lib/utils/cn'

/** Below 30% a panel is too narrow to read; above 70% the other one is. */
export const MIN_RATIO = 0.3
export const MAX_RATIO = 0.7
export const DEFAULT_RATIO = 0.5

/** One arrow press. Fine enough to tune, coarse enough to cross the range. */
const STEP = 0.02

export function clampRatio(ratio: number): number {
  return Math.max(MIN_RATIO, Math.min(MAX_RATIO, ratio))
}

interface ResizablePanelsProps {
  left: ReactNode
  right: ReactNode
  /** localStorage key. Two different splits must not share one. */
  storageKey: string
  leftLabel?: string
  rightLabel?: string
  className?: string
}

export function ResizablePanels({
  left,
  right,
  storageKey,
  leftLabel = 'Left panel',
  rightLabel = 'Right panel',
  className,
}: ResizablePanelsProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const { value: stored, setValue: setStored } = useLocalStorage(storageKey, DEFAULT_RATIO)

  // Clamped on read as well as on write: a persisted value from an older build
  // with different bounds must not resurrect an unusable layout.
  const ratio = clampRatio(stored)

  const setFromClientX = useCallback(
    (clientX: number) => {
      const box = containerRef.current?.getBoundingClientRect()
      if (!box || box.width === 0) return
      setStored(clampRatio((clientX - box.left) / box.width))
    },
    [setStored],
  )

  const onKeyDown = (event: React.KeyboardEvent) => {
    const delta = event.key === 'ArrowLeft' ? -STEP : event.key === 'ArrowRight' ? STEP : 0
    if (delta === 0) return
    event.preventDefault()
    setStored(clampRatio(ratio + delta))
  }

  const percent = Math.round(ratio * 100)

  return (
    <div
      ref={containerRef}
      className={cn('flex h-full w-full', className)}
      data-testid="resizable-panels"
    >
      {/* `minmax(0,…)` equivalent: min-w-0 so a long unbroken word cannot force
          the panel wider than its share (ADR-020). */}
      <div className="min-w-0 overflow-hidden" style={{ width: `${percent}%` }}>
        {left}
      </div>

      <div
        role="separator"
        tabIndex={0}
        aria-label="Resize panels"
        aria-orientation="vertical"
        aria-valuenow={percent}
        aria-valuemin={Math.round(MIN_RATIO * 100)}
        aria-valuemax={Math.round(MAX_RATIO * 100)}
        aria-controls={undefined}
        data-testid="panel-handle"
        data-dragging={dragging || undefined}
        onKeyDown={onKeyDown}
        onDoubleClick={() => setStored(DEFAULT_RATIO)}
        onPointerDown={(event) => {
          // Capture on the handle: the pointer can outrun a 4px target, and
          // without capture the drag stops the moment it does.
          event.currentTarget.setPointerCapture(event.pointerId)
          setDragging(true)
        }}
        onPointerMove={(event) => {
          if (!dragging) return
          setFromClientX(event.clientX)
        }}
        onPointerUp={(event) => {
          event.currentTarget.releasePointerCapture(event.pointerId)
          setDragging(false)
        }}
        className={cn(
          // 4px at rest widening to 8px is done with a transparent padded hit
          // area rather than by changing the element's width, which would shift
          // both panels every time the pointer crossed it.
          'group relative flex w-1 shrink-0 cursor-col-resize items-stretch justify-center bg-surface-2 transition-colors duration-fast',
          'hover:bg-accent focus-visible:bg-accent',
          dragging && 'bg-accent',
        )}
      >
        {/* Invisible 8px-wide grab target, so the handle is easy to hit without
            being visually heavy. */}
        <span aria-hidden="true" className="absolute inset-y-0 -left-1.5 -right-1.5" />
      </div>

      <div className="min-w-0 flex-1 overflow-hidden">{right}</div>

      {/* Named for assistive tech without adding visible chrome. */}
      <span className="sr-only">
        {leftLabel} {percent}%, {rightLabel} {100 - percent}%
      </span>
    </div>
  )
}
