'use client'

/**
 * The Bookmarks rail flyout (T-32.7, T-32.8).
 *
 * One rail slot, two lists: starred moments and coloured highlights share the
 * panel behind tabs, because the rail's five icons are canonical (A2.2) and
 * highlights have no slot of their own. Both lists are the same interaction —
 * a recognisable moment that seeks the player when clicked — so cohabiting is
 * natural, not a squeeze.
 */

import { Star } from 'lucide-react'
import { useMemo, useState } from 'react'

import { TabPanel, Tabs } from '@/components/ui/controls'
import { ResultRow } from '@/components/ui/media-controls'
import { StateView } from '@/components/ui/state-view'
import { useBookmarks, useHighlights } from '@/lib/api/highlights'
import type { HighlightColor, HighlightOut } from '@/lib/api/types'
import { useNotepadCommands } from '@/lib/notepad/commands'
import { cn } from '@/lib/utils/cn'
import { formatTimestamp } from '@/lib/utils/format'

import { HIGHLIGHT_COLORS, SWATCH_CLASSES } from '../transcript/segment-text'

export function BookmarksPanel({ meetingId }: { meetingId: number }) {
  const [tab, setTab] = useState('bookmarks')

  return (
    <Tabs
      value={tab}
      onValueChange={setTab}
      tabs={[
        { value: 'bookmarks', label: 'Bookmarks' },
        { value: 'highlights', label: 'Highlights' },
      ]}
    >
      <TabPanel value="bookmarks">
        <BookmarkList meetingId={meetingId} />
      </TabPanel>
      <TabPanel value="highlights">
        <HighlightList meetingId={meetingId} />
      </TabPanel>
    </Tabs>
  )
}

function BookmarkList({ meetingId }: { meetingId: number }) {
  const { data: bookmarks } = useBookmarks(meetingId)
  const { seekTo } = useNotepadCommands()

  if (!bookmarks || bookmarks.length === 0) {
    return (
      <StateView
        variant="empty"
        testId="bookmarks-flyout-empty"
        title="No bookmarks yet"
        body="Press B on a transcript line, or star it from the line's menu."
        className="border-0 py-8"
      />
    )
  }

  return (
    <ol data-testid="bookmarks-flyout" className="space-y-1 pt-2">
      {bookmarks.map((bookmark) => (
        <li key={bookmark.id}>
          <ResultRow
            data-testid={`bookmark-entry-${bookmark.id}`}
            aria-label={`Play from ${formatTimestamp(bookmark.start_ms)} — ${bookmark.speaker}`}
            onClick={() => seekTo(bookmark.start_ms, { play: true, reveal: true })}
          >
            <span className="flex items-center gap-1.5 text-sm text-secondary">
              <Star
                size={12}
                strokeWidth={1.75}
                aria-hidden="true"
                className="shrink-0 fill-warning text-warning"
              />
              <span className="min-w-0 truncate">{bookmark.speaker}</span>
              <span className="tnum ml-auto shrink-0 text-xs text-muted">
                {formatTimestamp(bookmark.start_ms)}
              </span>
            </span>
            <span className="line-clamp-2 text-body text-primary">{bookmark.snippet}</span>
          </ResultRow>
        </li>
      ))}
    </ol>
  )
}

function HighlightList({ meetingId }: { meetingId: number }) {
  const { data: highlights } = useHighlights(meetingId)
  const { seekTo } = useNotepadCommands()

  /** Grouped by colour (T-32.8), colours in the palette's fixed order. */
  const groups = useMemo(() => {
    const byColor = new Map<HighlightColor, HighlightOut[]>()
    for (const highlight of highlights ?? []) {
      const existing = byColor.get(highlight.color)
      if (existing) existing.push(highlight)
      else byColor.set(highlight.color, [highlight])
    }
    return HIGHLIGHT_COLORS.filter((color) => byColor.has(color)).map((color) => ({
      color,
      items: byColor.get(color)!,
    }))
  }, [highlights])

  if (groups.length === 0) {
    return (
      <StateView
        variant="empty"
        testId="highlights-flyout-empty"
        title="No highlights yet"
        body="Select transcript text and pick Highlight from the toolbar."
        className="border-0 py-8"
      />
    )
  }

  return (
    <div data-testid="highlights-flyout" className="space-y-4 pt-2">
      {groups.map((group) => (
        <section key={group.color} aria-label={`${group.color} highlights`}>
          <h3 className="flex items-center gap-1.5 px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            <span
              aria-hidden="true"
              className={cn('size-2.5 rounded-full', SWATCH_CLASSES[group.color])}
            />
            {group.color}
          </h3>
          <ol className="space-y-1">
            {group.items.map((highlight) => (
              <li key={highlight.id}>
                <ResultRow
                  data-testid={`highlight-entry-${highlight.id}`}
                  aria-label={`Play from ${formatTimestamp(highlight.start_ms)} — ${highlight.speaker}`}
                  onClick={() => seekTo(highlight.start_ms, { play: true, reveal: true })}
                >
                  <span className="flex items-center gap-1.5 text-sm text-secondary">
                    <span className="min-w-0 truncate">{highlight.speaker}</span>
                    <span className="tnum ml-auto shrink-0 text-xs text-muted">
                      {formatTimestamp(highlight.start_ms)}
                    </span>
                  </span>
                  <span className="line-clamp-2 text-body text-primary">“{highlight.text}”</span>
                  {highlight.note && (
                    <span className="line-clamp-2 text-sm italic text-muted">{highlight.note}</span>
                  )}
                </ResultRow>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}
