'use client'

/**
 * The virtualised transcript (T-20.2, T-20.9, T-20.10).
 *
 * Virtualised at the SEGMENT level rather than by speaker turn. A turn can be a
 * screen tall, and the thing that has to be scrolled to is the line currently
 * playing — with turns as the unit, `scrollToIndex` lands on the top of a block
 * that may not contain the visible playhead at all. Grouping is then just a
 * flag per row (`startsTurn`), computed once.
 */

import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import type { SegmentOut, SpeakerRef } from '@/lib/api/types'
import { activeSegmentIndex, markTurns } from '@/lib/transcript/grouping'
import { getSpeakerColorByIndex } from '@/lib/utils/speaker-color'

import { SegmentRow } from './segment-row'

interface TranscriptListProps {
  segments: SegmentOut[]
  speakers: SpeakerRef[]
  currentMs: number
  isPlaying: boolean
  onSeek: (ms: number, options?: { play?: boolean }) => void
  onCopyText: (segment: SegmentOut) => void
  onCopyLink: (segment: SegmentOut) => void
}

/** A row's assumed height before it has been measured. */
const ESTIMATED_ROW_PX = 92

/**
 * How long a manual scroll holds auto-scroll off (T-20.9).
 *
 * The failure this prevents is the panel yanking itself back the instant you
 * scroll away to read something — one of the most irritating bugs a transcript
 * view can have, and one that looks like the app fighting you.
 */
const SUSPEND_MS = 5000

/**
 * How long after a programmatic scroll its own events are ignored.
 *
 * A smooth scroll emits events for a few hundred milliseconds; without this
 * window the panel would read its own scrolling as the user's and suspend
 * itself every time it followed the playhead.
 */
const SELF_SCROLL_MS = 800

/** Keys that scroll a focused container, and so mean the user took over. */
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])

export function TranscriptList({
  segments,
  speakers,
  currentMs,
  isPlaying,
  onSeek,
  onCopyText,
  onCopyLink,
}: TranscriptListProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const rows = useMemo(() => markTurns(segments), [segments])
  const speakerById = useMemo(
    () => new Map(speakers.map((speaker) => [speaker.id, speaker])),
    [speakers],
  )

  const activeIndex = activeSegmentIndex(rows, currentMs)

  /*
   * The React Compiler cannot memoise a component that uses this hook: the
   * virtualiser returns fresh function identities every render by design, and
   * memoising around them would serve stale measurements.
   *
   * That is the right trade here and it is why `SegmentRow` is memoised BY
   * HAND with an explicit comparator (T-20.13) — the rows, which there are
   * many of and which re-render on every clock tick, are protected; this
   * component, of which there is one, is not.
   */
  // eslint-disable-next-line react-hooks/incompatible-library -- see above
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_PX,
    // Segments vary from one line to six, so the estimate is only a starting
    // point — `measureElement` replaces it with the real height as each row
    // mounts.
    overscan: 10,
  })

  // ── Following the playhead ────────────────────────────────────────────────

  const [suspendedUntil, setSuspendedUntil] = useState(0)
  const selfScrollUntil = useRef(0)
  const [pinned, setPinned] = useState(false)

  const scrollToActive = useCallback(
    (behavior: 'smooth' | 'auto') => {
      if (activeIndex < 0) return
      selfScrollUntil.current = performance.now() + SELF_SCROLL_MS
      virtualizer.scrollToIndex(activeIndex, { align: 'center', behavior })
    },
    [activeIndex, virtualizer],
  )

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return

    const suspend = () => setSuspendedUntil(performance.now() + SUSPEND_MS)

    /*
     * Suspended by INPUT, not by the scroll event.
     *
     * A scroll event cannot say who caused it, so the only way to use one is a
     * timing window around our own `scrollToIndex` — and that window swallows
     * a real user scroll that lands inside it, which is exactly what a user
     * does when the panel has just moved and they want it to stop. Wheel and
     * touch are unambiguous: nothing programmatic emits them.
     */
    element.addEventListener('wheel', suspend, { passive: true })
    element.addEventListener('touchmove', suspend, { passive: true })

    const onKeyDown = (event: KeyboardEvent) => {
      if (SCROLL_KEYS.has(event.key)) suspend()
    }
    element.addEventListener('keydown', onKeyDown)

    /*
     * The scroll event is still listened for, but only as the fallback for
     * DRAGGING THE SCROLLBAR — the one way to scroll that emits no input event
     * of its own. Here the timing window is appropriate: it is the only signal
     * available, and a missed suspension costs nothing that the wheel path has
     * not already covered.
     */
    const onScroll = () => {
      if (performance.now() < selfScrollUntil.current) return
      suspend()
    }
    element.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      element.removeEventListener('wheel', suspend)
      element.removeEventListener('touchmove', suspend)
      element.removeEventListener('keydown', onKeyDown)
      element.removeEventListener('scroll', onScroll)
    }
  }, [])

  /*
   * Follow only when the ACTIVE INDEX changes, which is why this depends on the
   * index and not on `currentMs`. Scrolling on every clock tick would compete
   * with the user for the scrollbar ten times a second.
   */
  useEffect(() => {
    if (activeIndex < 0) return
    if (performance.now() < suspendedUntil) {
      // Out of sync and told not to move: offer the way back instead.
      setPinned(true)
      return
    }
    setPinned(false)
    scrollToActive('smooth')
  }, [activeIndex, suspendedUntil, scrollToActive])

  // The pill only makes sense while something is moving underneath it.
  const showJump = pinned && isPlaying && activeIndex >= 0

  // ── Sticky speaker (T-20.10) ──────────────────────────────────────────────

  const virtualRows = virtualizer.getVirtualItems()

  /*
   * The topmost row that actually INTERSECTS the viewport.
   *
   * Not `virtualRows[0]` — that is the first OVERSCAN row, ten rows above the
   * fold, so the strip would name whoever was speaking a screen earlier. The
   * bug is invisible at the top of the list, where overscan has nothing to
   * render above, and appears only once you scroll.
   */
  const scrollOffset = virtualizer.scrollOffset ?? 0
  const firstVisible = virtualRows.find((row) => row.end > scrollOffset)

  const stickySpeaker = firstVisible
    ? speakerById.get(rows[firstVisible.index]?.speaker_id ?? -1)
    : undefined

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/*
        A real row in the layout, not an overlay.
        
        An overlay would sit on top of the line it is describing — and the line
        under it is exactly the one whose speaker had scrolled out of view, so
        it would cover the text the strip exists to attribute. Always present
        rather than appearing on scroll, because a bar that comes and goes
        shifts the whole transcript by its own height each time.
      */}
      <div
        data-testid="transcript-sticky-speaker"
        aria-hidden="true"
        className="flex h-7 shrink-0 items-center border-b border-subtle bg-surface-1 px-4 text-xs"
        style={{
          color: stickySpeaker ? getSpeakerColorByIndex(stickySpeaker.color_index) : undefined,
        }}
      >
        {stickySpeaker?.label ?? ''}
      </div>

      <div
        ref={scrollRef}
        data-testid="transcript-scroll"
        tabIndex={0}
        role="group"
        aria-label="Transcript segments"
        className="min-h-0 flex-1 overflow-y-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      >
        <ol
          data-testid="transcript-list"
          className="relative w-full"
          // The full scroll height, so the scrollbar reflects the whole
          // transcript rather than the handful of rows in the DOM.
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualRows.map((virtualRow) => {
            const row = rows[virtualRow.index]
            if (!row) return null

            return (
              <li
                key={row.id}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                className="absolute inset-x-0 top-0"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                <SegmentRow
                  segment={row}
                  speaker={speakerById.get(row.speaker_id)}
                  isActive={virtualRow.index === activeIndex}
                  onSeek={onSeek}
                  onCopyText={onCopyText}
                  onCopyLink={onCopyLink}
                />
              </li>
            )
          })}
        </ol>
      </div>

      {showJump && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            data-testid="transcript-jump-to-current"
            className="pointer-events-auto shadow-md"
            rightIcon={<ArrowDown size={14} strokeWidth={2} />}
            onClick={() => {
              setSuspendedUntil(0)
              setPinned(false)
              scrollToActive('smooth')
            }}
          >
            Jump to current
          </Button>
        </div>
      )}
    </div>
  )
}
