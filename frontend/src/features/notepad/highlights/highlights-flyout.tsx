'use client'

/**
 * The highlights panel, grouped by colour (T-32.8).
 *
 * Grouped rather than listed flat because colour is the only thing a reader
 * assigns deliberately — "everything I marked green" is a question they asked
 * when they picked green. Within a group the order stays chronological, so each
 * group is still a map of the recording.
 */

import { StickyNote } from 'lucide-react'

import { ResultRow } from '@/components/ui/media-controls'
import { SkeletonText } from '@/components/ui/skeleton'
import { StateView } from '@/components/ui/state-view'
import { useHighlights } from '@/lib/api/highlights'
import type { HighlightOut } from '@/lib/api/types'
import { useNotepadCommands } from '@/lib/notepad/commands'
import { HIGHLIGHT_COLORS, HIGHLIGHT_STYLES } from '@/lib/transcript/highlight-colors'
import { cn } from '@/lib/utils/cn'
import { formatTimestamp, pluralize } from '@/lib/utils/format'

export function HighlightsFlyout({ meetingId }: { meetingId: number }) {
  const { data, isPending } = useHighlights(meetingId)
  const { seekTo } = useNotepadCommands()

  if (isPending) return <SkeletonText lines={6} />

  const highlights = data ?? []

  if (highlights.length === 0) {
    return (
      <StateView
        variant="empty"
        testId="highlights-empty"
        title="No highlights yet"
        body="Select any transcript text and choose Highlight to mark it."
        className="border-0 py-8"
      />
    )
  }

  // Built from the fixed colour order rather than from what happens to be
  // present, so the groups do not reshuffle as highlights are added.
  const groups = HIGHLIGHT_COLORS.map((color) => ({
    color,
    items: highlights.filter((highlight) => highlight.color === color),
  })).filter((group) => group.items.length > 0)

  return (
    <div data-testid="highlights-flyout" className="space-y-4">
      {groups.map((group) => (
        <section key={group.color} aria-label={`${HIGHLIGHT_STYLES[group.color].label} highlights`}>
          <h3 className="mb-1 flex items-center gap-2 px-1 text-label uppercase text-muted">
            <span
              aria-hidden="true"
              className={cn('h-3 w-3 rounded-full border', HIGHLIGHT_STYLES[group.color].swatch)}
            />
            {HIGHLIGHT_STYLES[group.color].label}
            <span className="text-xs normal-case tracking-normal">
              {pluralize(group.items.length, 'highlight')}
            </span>
          </h3>

          <ul className="space-y-1">
            {group.items.map((highlight) => (
              <HighlightEntry
                key={highlight.id}
                highlight={highlight}
                onSeek={() => seekTo(highlight.start_ms, { play: false })}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function HighlightEntry({
  highlight,
  onSeek,
}: {
  highlight: HighlightOut
  onSeek: () => void
}) {
  return (
    <li>
      <ResultRow onClick={onSeek} data-testid={`highlight-entry-${highlight.id}`}>
        <span className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-muted">
            {formatTimestamp(highlight.start_ms)}
          </span>
          <span className="min-w-0 truncate text-xs text-secondary">
            {highlight.speaker_label}
          </span>
        </span>

        {/*
          The quote carries its own colour, so the group header is a label
          rather than the only place the colour appears — a reader scrolling
          past the header still knows which group they are in.
        */}
        <span
          className={cn(
            'mt-0.5 line-clamp-3 border-l-2 pl-2 text-sm text-primary',
            HIGHLIGHT_STYLES[highlight.color].swatch,
            'bg-transparent',
          )}
        >
          {highlight.text}
        </span>

        {highlight.note && (
          <span className="mt-1 flex items-start gap-1.5 text-xs text-secondary">
            <StickyNote size={12} strokeWidth={1.75} className="mt-0.5 shrink-0 text-muted" />
            <span className="line-clamp-2">{highlight.note}</span>
          </span>
        )}
      </ResultRow>
    </li>
  )
}
