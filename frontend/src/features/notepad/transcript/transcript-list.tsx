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
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import type { HighlightRange } from '@/components/ui/highlighter'
import { useComments, useCreateComment, type CachedComment } from '@/lib/api/comments'
import { useBookmarks, useHighlights, useToggleBookmark } from '@/lib/api/highlights'
import type { HighlightOut } from '@/lib/api/types'
import { useMeeting } from '@/lib/api/meetings'
import type { SegmentOut, SpeakerRef } from '@/lib/api/types'
import { useNotepadCommands } from '@/lib/notepad/commands'
import { markTurns } from '@/lib/transcript/grouping'
import { getSpeakerColorByIndex } from '@/lib/utils/speaker-color'

import { CommentComposer, type MentionOption } from '../comments/comment-composer'
import { CommentThread } from '../comments/comment-thread'
import { SegmentRow } from './segment-row'

interface TranscriptListProps {
  meetingId: number
  segments: SegmentOut[]
  speakers: SpeakerRef[]
  /**
   * The resolved active row, NOT the playhead (T-21.4).
   *
   * The clock commits ten times a second; the active line changes every few
   * seconds. Taking the index means this component — and the memo around it —
   * re-renders on the second cadence rather than the first.
   */
  activeIndex: number
  isPlaying: boolean
  /** Highlight offsets per segment id (T-22.3). */
  matchRanges?: Map<number, HighlightRange[]>
  /** `{ segmentIndex, indexInSegment }` of the current match, or null. */
  currentMatch?: { segmentIndex: number; indexInSegment: number } | null
  /** Edit mode (T-25), passed straight through to the rows. */
  editing?: boolean
  onEditText?: (segmentId: number, previous: string, next: string) => void
  onCommitEdit?: () => void
  onReassign?: (segmentId: number, speakerId: number) => void
  onRevert?: (segment: SegmentOut) => void
  onSeek: (ms: number, options?: { play?: boolean }) => void
  onCopyText: (segment: SegmentOut) => void
  onCopyLink: (segment: SegmentOut) => void
  /** Which segment has the inline composer open (T-31.3); null for none. */
  commentingSegmentId?: number | null
  /** Opens (id) or closes (null) the composer. Stable — rows memoise on it. */
  onSetCommenting?: (segmentId: number | null) => void
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

const OFFSET_KEY = 'ff.transcript.offset.'

/**
 * The remembered scroll position, per meeting.
 *
 * `sessionStorage`, not `localStorage`: coming back to a meeting during the
 * same visit should land where you were, but opening it fresh next week should
 * start at the top rather than halfway down a conversation you no longer
 * remember leaving.
 */
function readSavedOffset(meetingId: number): number {
  try {
    const raw = window.sessionStorage.getItem(`${OFFSET_KEY}${meetingId}`)
    const value = Number(raw)
    return Number.isFinite(value) && value >= 0 ? value : 0
  } catch {
    return 0
  }
}

function saveOffset(meetingId: number, offset: number): void {
  try {
    window.sessionStorage.setItem(`${OFFSET_KEY}${meetingId}`, String(Math.round(offset)))
  } catch {
    // A blocked store costs the convenience, not the transcript.
  }
}

/** Keys that scroll a focused container, and so mean the user took over. */
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])

function TranscriptListImpl({
  meetingId,
  segments,
  speakers,
  activeIndex,
  isPlaying,
  matchRanges,
  currentMatch,
  editing,
  onEditText,
  onCommitEdit,
  onReassign,
  onRevert,
  onSeek,
  onCopyText,
  onCopyLink,
  commentingSegmentId = null,
  onSetCommenting,
}: TranscriptListProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const { revealNonce } = useNotepadCommands()

  // Comments render inline beneath their rows (T-31.5); the virtualiser's
  // ResizeObserver re-measures each row as threads mount, so variable-height
  // discussion costs nothing extra here.
  const { data: commentsPage } = useComments(meetingId)
  const { data: meetingDetail } = useMeeting(meetingId)
  const createComment = useCreateComment(meetingId)

  // Highlights and bookmarks (T-32). Grouped ONCE per fetch: the rows compare
  // their slice by identity, so the maps must be rebuilt only when the data
  // changes, never per render.
  const { data: allHighlights } = useHighlights(meetingId)
  const { data: allBookmarks } = useBookmarks(meetingId)
  const toggleBookmark = useToggleBookmark(meetingId)

  const highlightsBySegment = useMemo(() => {
    const map = new Map<number, HighlightOut[]>()
    for (const highlight of allHighlights ?? []) {
      const existing = map.get(highlight.segment_id)
      if (existing) existing.push(highlight)
      else map.set(highlight.segment_id, [highlight])
    }
    return map
  }, [allHighlights])

  const bookmarkedSegments = useMemo(
    () => new Set((allBookmarks ?? []).map((b) => b.segment_id)),
    [allBookmarks],
  )

  const onToggleBookmark = useCallback(
    (segmentId: number, next: boolean) => toggleBookmark.mutate({ segmentId, bookmarked: next }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutate is stable
    [],
  )

  const threadsBySegment = useMemo(() => {
    const map = new Map<number, CachedComment[]>()
    for (const thread of commentsPage?.items ?? []) {
      if (thread.segment_id == null) continue
      const existing = map.get(thread.segment_id)
      if (existing) existing.push(thread)
      else map.set(thread.segment_id, [thread])
    }
    return map
  }, [commentsPage])

  const mentionOptions = useMemo<MentionOption[]>(
    () =>
      (meetingDetail?.participants ?? []).map((participant) => ({
        id: participant.id,
        displayName: participant.display_name,
      })),
    [meetingDetail],
  )

  const rows = useMemo(() => markTurns(segments), [segments])
  const speakerById = useMemo(
    () => new Map(speakers.map((speaker) => [speaker.id, speaker])),
    [speakers],
  )

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
    /*
     * Where the reader left off (T-21.10).
     *
     * `initialOffset` tells the virtualiser which rows to RENDER — it does not
     * move the element, which is a distinction worth stating because assuming
     * otherwise leaves the DOM at the top with the correct rows drawn below the
     * fold, and the panel silently forgets every remembered position. The
     * element itself is scrolled in the effect below.
     */
    initialOffset: readSavedOffset(meetingId),
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
   * Restore the remembered position, before anything is painted.
   *
   * Applied TWICE: once now, and once on the next frame. The first attempt
   * lands against ESTIMATED row heights — nothing has been measured yet — so
   * if the estimate is short the browser clamps `scrollTop` to a maximum that
   * is about to grow, and the panel settles somewhere above where it was. The
   * second application runs after the first measurements and corrects it.
   *
   * A deep link is an explicit instruction and outranks a remembered position,
   * so the `?t=` effect below is still allowed to move this again.
   */
  useLayoutEffect(() => {
    const element = scrollRef.current
    const saved = readSavedOffset(meetingId)
    if (!element || saved <= 0) return

    const apply = () => {
      selfScrollUntil.current = performance.now() + SELF_SCROLL_MS
      element.scrollTop = saved
    }

    apply()
    const frame = requestAnimationFrame(apply)
    return () => cancelAnimationFrame(frame)
  }, [meetingId])

  // Remember where the reader is, for coming back to (T-21.10).
  const latestOffset = useRef(0)
  useEffect(() => {
    const element = scrollRef.current
    if (!element) return

    let timer = 0
    const onScroll = () => {
      latestOffset.current = element.scrollTop
      // Debounced: a scroll fires dozens of events, and `sessionStorage` is
      // synchronous — writing on each one puts storage in the scroll path.
      window.clearTimeout(timer)
      timer = window.setTimeout(() => saveOffset(meetingId, latestOffset.current), 250)
    }

    element.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      window.clearTimeout(timer)
      /*
       * From the REF, never from the element.
       *
       * At teardown the element's `scrollTop` reads 0 — its content is already
       * gone — so saving from it overwrites a good position with zero on every
       * navigation, and the feature silently does nothing at all.
       */
      saveOffset(meetingId, latestOffset.current)
      element.removeEventListener('scroll', onScroll)
    }
  }, [meetingId])

  /*
   * An explicit "take me there" (T-21.6) beats the suspension.
   *
   * Clicking an outline chapter is a request to be moved; the playhead
   * advancing on its own is not. Skipped on the very first render, where the
   * nonce is still 0 and there is nothing to reveal.
   */
  useEffect(() => {
    if (revealNonce === 0) return
    setSuspendedUntil(0)
    setPinned(false)
    scrollToActive('smooth')
  }, [revealNonce, scrollToActive])

  /*
   * Stepping through matches scrolls THROUGH THE VIRTUALISER (T-22.5).
   *
   * The trap in this task: a match is very often in a row that is not mounted,
   * and `scrollIntoView` on a node that does not exist silently does nothing —
   * the counter advances, the highlight moves, and the view stays put. Only
   * the virtualiser knows where an unrendered row would be.
   */
  const matchIndex = currentMatch?.segmentIndex ?? -1
  useEffect(() => {
    if (matchIndex < 0) return
    selfScrollUntil.current = performance.now() + SELF_SCROLL_MS
    virtualizer.scrollToIndex(matchIndex, { align: 'center', behavior: 'auto' })
  }, [matchIndex, virtualizer])

  /*
   * The first scroll, after the rows have been MEASURED (T-21.9).
   *
   * A `?t=` deep link resolves an active index before any row has a real
   * height, so scrolling then lands on an estimate. Running once more when the
   * transcript arrives — with `auto`, because an instant landing is what a
   * deep link should look like — corrects it.
   */
  const didInitialScroll = useRef(false)
  useEffect(() => {
    if (didInitialScroll.current || segments.length === 0 || activeIndex <= 0) return
    didInitialScroll.current = true
    scrollToActive('auto')
  }, [segments.length, activeIndex, scrollToActive])

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

  /*
   * Where each match sits in the transcript, as a fraction.
   *
   * By ROW INDEX rather than by measured pixel offset: most rows have not been
   * measured — that is the point of virtualising — so a pixel-based map would
   * be accurate for the visible handful and wrong for everything else. Index
   * position is exact for all of them and, at row heights this uniform, lands
   * within a few pixels of the truth.
   */
  const matchPositions = useMemo(() => {
    if (!matchRanges || matchRanges.size === 0 || rows.length === 0) return []
    return rows.flatMap((row, index) => (matchRanges.has(row.id) ? [index / rows.length] : []))
  }, [matchRanges, rows])

  const activeSpeakerId = activeIndex >= 0 ? rows[activeIndex]?.speaker_id : undefined
  const activeSpeakerLabel =
    activeSpeakerId === undefined ? '' : (speakerById.get(activeSpeakerId)?.label ?? '')

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

      {/*
        The match density map (T-22.7): a tick per match, at the fraction of
        the transcript it sits at. Alongside the scrollbar rather than on it —
        a scrollbar is the browser's, and painting into one means recreating it.
      */}
      {matchRanges && matchRanges.size > 0 && (
        <div
          aria-hidden="true"
          data-testid="transcript-match-map"
          className="pointer-events-none absolute inset-y-0 right-0 z-topbar w-1.5"
        >
          {matchPositions.map((position, index) => (
            <span
              key={index}
              className="absolute inset-x-0 h-0.5 rounded-full bg-highlight-active"
              style={{ top: `${position * 100}%` }}
            />
          ))}
        </div>
      )}

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
          /*
           * Explicitly OFF (T-21.12).
           *
           * Rows mount and unmount constantly as the list virtualises, and an
           * assistive technology that announced each one would read the
           * transcript aloud at scrolling speed. The speaker announcer below
           * is the polite version of the same information.
           */
          aria-live="off"
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
                  editing={editing}
                  speakers={speakers}
                  onEditText={onEditText}
                  onCommitEdit={onCommitEdit}
                  onReassign={onReassign}
                  onRevert={onRevert}
                  matchRanges={matchRanges?.get(row.id)}
                  activeMatch={
                    currentMatch?.segmentIndex === virtualRow.index
                      ? currentMatch.indexInSegment
                      : -1
                  }
                  commentCount={countComments(threadsBySegment.get(row.id))}
                  onAddComment={onSetCommenting ?? undefined}
                  meetingId={meetingId}
                  highlights={highlightsBySegment.get(row.id)}
                  bookmarked={bookmarkedSegments.has(row.id)}
                  onToggleBookmark={onToggleBookmark}
                />

                {/* Threads live INSIDE the measured row wrapper, so the
                    virtualiser sees their height (T-31.5). */}
                {(threadsBySegment.has(row.id) || commentingSegmentId === row.id) && (
                  <div className="space-y-3 py-2 pl-[52px] pr-4">
                    {(threadsBySegment.get(row.id) ?? []).map((thread) => (
                      <CommentThread
                        key={thread.id}
                        meetingId={meetingId}
                        thread={thread}
                        participants={mentionOptions}
                      />
                    ))}
                    {commentingSegmentId === row.id && onSetCommenting && (
                      <CommentComposer
                        participants={mentionOptions}
                        onSubmit={(payload) =>
                          createComment.mutateAsync({ ...payload, segment_id: row.id })
                        }
                        onCancel={() => onSetCommenting(null)}
                      />
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      </div>

      {/*
        Announces the SPEAKER, and only when it changes (T-21.12).
        
        The active line changes every few seconds; the person talking changes
        far less often, and "Marcus Patel" is the part a listener cannot get
        from the audio they are already hearing.
      */}
      <p className="sr-only" role="status" aria-live="polite" data-testid="transcript-announcer">
        {activeSpeakerLabel}
      </p>

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

/**
 * Memoised BY HAND (T-21.4).
 *
 * The React Compiler declines to memoise anything using `useVirtualizer`, and
 * the default shallow comparison is enough here anyway: every prop is either
 * stable (`useCallback`, `useMemo` at the call site) or changes exactly when
 * this list needs to redraw. Without it, the panel's ten-times-a-second
 * re-render reaches the whole transcript.
 */
export const TranscriptList = memo(TranscriptListImpl)

/** Live parents + replies for the gutter chip; tombstones don't count. */
function countComments(threads: CachedComment[] | undefined): number {
  if (!threads) return 0
  return threads.reduce(
    (sum, thread) => sum + (thread.is_deleted ? 0 : 1) + thread.replies.length,
    0,
  )
}
