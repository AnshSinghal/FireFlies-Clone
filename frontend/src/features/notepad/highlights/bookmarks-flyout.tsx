'use client'

/**
 * The bookmarks panel (T-32.7).
 *
 * Chronological, not most-recent-first: the list is a map of the recording, and
 * a map has to read in the recording's order. Sorting by when each star was
 * added would make two readings of the same meeting produce two different maps.
 */

import { Star, Trash2 } from 'lucide-react'

import { IconButton } from '@/components/ui/icon-button'
import { ResultRow } from '@/components/ui/media-controls'
import { SkeletonText } from '@/components/ui/skeleton'
import { StateView } from '@/components/ui/state-view'
import { useBookmarks, useToggleBookmark } from '@/lib/api/highlights'
import { useNotepadCommands } from '@/lib/notepad/commands'
import { formatTimestamp } from '@/lib/utils/format'

export function BookmarksFlyout({ meetingId }: { meetingId: number }) {
  const { data, isPending } = useBookmarks(meetingId)
  const toggle = useToggleBookmark(meetingId)
  const { seekTo } = useNotepadCommands()

  if (isPending) return <SkeletonText lines={6} />

  const bookmarks = data ?? []

  if (bookmarks.length === 0) {
    return (
      <StateView
        variant="empty"
        testId="bookmarks-empty"
        title="No bookmarks yet"
        body="Press B on a line, or use its ⋯ menu, to star a moment worth coming back to."
        className="border-0 py-8"
      />
    )
  }

  return (
    <ul data-testid="bookmarks-flyout" className="space-y-1">
      {bookmarks.map((bookmark) => (
        <li key={bookmark.id}>
          <div className="group/bookmark flex items-start gap-2 rounded-md p-2 hover:bg-surface-hover">
            <Star
              size={14}
              strokeWidth={1.75}
              fill="currentColor"
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-brand-amber"
            />

            <ResultRow
              data-testid={`bookmark-entry-${bookmark.segment_id}`}
              // Seeking is what a bookmark is FOR (T32-H), so the whole row is
              // the seek target and the delete is the exception beside it.
              onClick={() => seekTo(bookmark.start_ms, { reveal: true })}
              className="min-w-0 flex-1 px-0 py-0 hover:bg-transparent"
            >
              <span className="flex items-center gap-2">
                <span className="text-xs tabular-nums text-muted">
                  {formatTimestamp(bookmark.start_ms)}
                </span>
                <span className="min-w-0 truncate text-xs text-secondary">
                  {bookmark.speaker_label}
                </span>
              </span>
              <span className="mt-0.5 line-clamp-2 text-sm text-primary">{bookmark.text}</span>
            </ResultRow>

            <IconButton
              label="Remove bookmark"
              size="sm"
              icon={<Trash2 size={14} strokeWidth={1.75} />}
              onClick={() => toggle.mutate(bookmark.segment_id)}
              data-testid={`bookmark-remove-${bookmark.segment_id}`}
              className="shrink-0 opacity-0 focus-visible:opacity-100 group-hover/bookmark:opacity-100"
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
