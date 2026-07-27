'use client'

/**
 * Bookmarks, and the `B` binding that toggles them (T-32.6).
 *
 * The keystroke targets, in order: the segment the reader has FOCUSED, and
 * failing that the segment currently PLAYING. Both are "the moment I am looking
 * at" — a transcript row is not natively focusable, so requiring focus alone
 * would make the shortcut dead for anyone who has not tabbed into a highlight
 * first, while the playhead is always somewhere.
 */

import { useCallback, useEffect, useMemo } from 'react'

import { useToast } from '@/components/ui/toast'
import { useBookmarks, useToggleBookmark } from '@/lib/api/highlights'
import { typingInto } from '@/lib/player/use-player-shortcuts'
import { TOAST_MESSAGES } from '@/lib/toast/messages'

interface Options {
  meetingId: number
  /** The segment under the playhead, or undefined. */
  activeSegmentId: number | undefined
  /** Off while the transcript is being edited — `B` types a B. */
  enabled: boolean
}

export function useBookmarkSession({ meetingId, activeSegmentId, enabled }: Options) {
  const { data } = useBookmarks(meetingId)
  const toggle = useToggleBookmark(meetingId)
  const toast = useToast()

  const bookmarks = useMemo(() => data ?? [], [data])

  const segmentIds = useMemo(
    () => new Set(bookmarks.map((bookmark) => bookmark.segment_id)),
    [bookmarks],
  )

  const toggleSegment = useCallback(
    (segmentId: number) => {
      const wasBookmarked = segmentIds.has(segmentId)
      toggle.mutate(segmentId)
      // Announced from the PREVIOUS state, because the mutation is optimistic
      // and its result has not arrived yet. Reading `segmentIds` again after
      // `mutate` would read the value this render closed over anyway.
      toast.success(
        wasBookmarked ? TOAST_MESSAGES.bookmarkRemoved : TOAST_MESSAGES.bookmarkAdded,
      )
    },
    [segmentIds, toggle, toast],
  )

  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'b' && event.key !== 'B') return
      // ⌘B is bold in every editor on earth, and the browser's own bookmark
      // bar; unmodified `b` is ours.
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (typingInto(event.target)) return

      const focused =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-testid^="transcript-segment-"]')
          : null

      const focusedId = focused?.dataset.testid?.replace('transcript-segment-', '')
      const segmentId = focusedId ? Number(focusedId) : activeSegmentId
      if (segmentId === undefined || !Number.isFinite(segmentId)) return

      event.preventDefault()
      toggleSegment(segmentId)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, activeSegmentId, toggleSegment])

  return { bookmarks, segmentIds, toggleSegment }
}
