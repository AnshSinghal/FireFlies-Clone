'use client'

/**
 * One transcript line (T-20.3 to T-20.7).
 *
 * MEMOISED, and this is the one component in the app where that is not
 * premature: the playhead commits ten times a second, and without it every
 * commit re-renders every rendered row. The comparator ignores the callbacks,
 * which are stable, and compares only what the row draws.
 */

import {
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  Quote,
  Copy,
  Link2,
  UserCog,
} from 'lucide-react'
import { memo } from 'react'

import { Avatar } from '@/components/ui/avatar'
import { Highlighter, type HighlightRange } from '@/components/ui/highlighter'
import { Dropdown, DropdownItem, DropdownSeparator } from '@/components/ui/dropdown'
import { IconButton } from '@/components/ui/icon-button'
import { TimestampButton } from '@/components/ui/media-controls'
import type { SegmentOut, SpeakerRef } from '@/lib/api/types'
import type { TurnAware } from '@/lib/transcript/grouping'
import { cn } from '@/lib/utils/cn'
import { formatTimestamp } from '@/lib/utils/format'
import { getSpeakerColorByIndex } from '@/lib/utils/speaker-color'

export interface SegmentRowProps {
  segment: SegmentOut & TurnAware
  speaker: SpeakerRef | undefined
  isActive: boolean
  /** The one seek path (T-21.8). The row seeks; the timestamp seeks and plays. */
  onSeek: (ms: number, options?: { play?: boolean }) => void
  onCopyText: (segment: SegmentOut) => void
  onCopyLink: (segment: SegmentOut) => void
  /** Offsets to highlight in this line (T-22.3). */
  matchRanges?: HighlightRange[]
  /** Which of those is the CURRENT match, or -1 for none. */
  activeMatch?: number
}

function SegmentRowImpl({
  segment,
  speaker,
  isActive,
  onSeek,
  onCopyText,
  onCopyLink,
  matchRanges,
  activeMatch = -1,
}: SegmentRowProps) {
  const color = speaker ? getSpeakerColorByIndex(speaker.color_index) : undefined
  const label = speaker?.label ?? 'Unknown speaker'

  return (
    <article
      data-testid={`transcript-segment-${segment.id}`}
      data-active={isActive || undefined}
      // Announced as the current item rather than only coloured (T-21.12).
      aria-current={isActive ? 'true' : undefined}
      /*
       * Clicking the LINE seeks (T-21.1) — but on `onClick` of the article
       * rather than a wrapping button, because the text has to stay
       * selectable and a button's contents are not reliably selectable.
       *
       * The check below is what makes that safe: a click that landed on the
       * timestamp, the menu, or inside a text selection is not a "seek here".
       */
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest('button, a, [role="menu"]')) {
          return
        }
        // Dragging out a selection ends in a click. Seeking then would move the
        // player every time somebody copied a quote.
        if ((window.getSelection()?.toString().length ?? 0) > 0) return
        onSeek(segment.start_ms)
      }}
      // `group` so the timestamp and the ⋯ can appear on hover without either
      // of them needing hover state of its own.
      className={cn(
        'group/segment relative cursor-pointer px-4 py-3 transition-colors duration-fast',
        isActive ? 'bg-accent-subtle' : 'hover:bg-surface-hover',
      )}
    >
      {/*
        The active marker is an overlay rather than a `border-l`: a border
        changes the box width, so every row would shift 3px sideways as the
        playhead moved through it.
      */}
      {isActive && (
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-accent" />
      )}

      {segment.startsTurn && (
        <header className="mb-1 flex items-center gap-3">
          <Avatar name={label} size="sm" color={color} />
          <span
            data-testid={`transcript-speaker-${segment.id}`}
            className="min-w-0 flex-1 truncate text-body-strong"
            style={{ color }}
          >
            {label}
          </span>
        </header>
      )}

      {/*
        Indented to sit under the NAME, not under the avatar — 24px of avatar
        plus the 12px gap. Continuation lines land in the same column, which is
        what makes a turn read as one block.
      */}
      <div className="flex items-start gap-2 pl-9">
        <p
          className="min-w-0 flex-1 select-text whitespace-pre-wrap text-transcript text-primary"
          // Explicit, because a reset that kills selection would quietly make
          // the transcript uncopyable — the one thing people do with one.
          style={{ userSelect: 'text' }}
        >
          {matchRanges && matchRanges.length > 0 ? (
            <Highlighter
              text={segment.text}
              ranges={matchRanges}
              activeIndex={activeMatch}
              // No radius here: the component already sets `rounded-none`, and a
              // second radius utility would leave the winner to stylesheet order.
              markClassName="bg-highlight text-primary"
            />
          ) : (
            segment.text
          )}
        </p>

        <TimestampButton
          data-testid={`transcript-timestamp-${segment.id}`}
          time={formatTimestamp(segment.start_ms)}
          label={`Play from ${formatTimestamp(segment.start_ms)}`}
          onClick={() => onSeek(segment.start_ms, { play: true })}
          className={cn(
            // Always on for the first line of a turn; on hover or focus for the
            // continuation lines, where a timestamp per line is visual noise.
            segment.startsTurn
              ? 'opacity-100'
              : 'opacity-0 focus-visible:opacity-100 group-hover/segment:opacity-100',
          )}
        />

        <span
          className={cn(
            'shrink-0 transition-opacity duration-fast',
            'opacity-0 focus-within:opacity-100 group-hover/segment:opacity-100',
          )}
        >
          <Dropdown
            align="end"
            testId="transcript-segment-menu"
            trigger={
              <IconButton
                label="Segment actions"
                size="sm"
                icon={<MoreHorizontal size={16} strokeWidth={2} />}
                data-testid={`transcript-segment-actions-${segment.id}`}
                hideTooltip
              />
            }
          >
            <DropdownItem
              icon={<Copy size={16} strokeWidth={1.75} />}
              onSelect={() => onCopyText(segment)}
              testId="segment-copy-text"
            >
              Copy text
            </DropdownItem>
            <DropdownItem
              icon={<Link2 size={16} strokeWidth={1.75} />}
              onSelect={() => onCopyLink(segment)}
              testId="segment-copy-link"
            >
              Copy link to this moment
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem icon={<MessageSquarePlus size={16} strokeWidth={1.75} />} soon>
              Add comment
            </DropdownItem>
            <DropdownItem icon={<Quote size={16} strokeWidth={1.75} />} soon>
              Create soundbite
            </DropdownItem>
            <DropdownItem icon={<Pencil size={16} strokeWidth={1.75} />} soon>
              Edit
            </DropdownItem>
            <DropdownItem icon={<UserCog size={16} strokeWidth={1.75} />} soon>
              Reassign speaker
            </DropdownItem>
          </Dropdown>
        </span>
      </div>
    </article>
  )
}

export const SegmentRow = memo(SegmentRowImpl, (previous, next) => {
  /*
   * Re-render only when something VISIBLE changed.
   *
   * The callbacks are excluded deliberately: they are `useCallback`-stable at
   * the call site, and including them would make this comparator a no-op the
   * first time one of them was rebuilt — which is exactly the kind of silent
   * regression memoisation is supposed to prevent.
   */
  return (
    previous.segment.id === next.segment.id &&
    previous.segment.text === next.segment.text &&
    previous.segment.startsTurn === next.segment.startsTurn &&
    previous.isActive === next.isActive &&
    // Identity is enough: the ranges are rebuilt as a group whenever the query
    // changes, and never mutated in place.
    previous.matchRanges === next.matchRanges &&
    previous.activeMatch === next.activeMatch &&
    previous.speaker?.label === next.speaker?.label &&
    previous.speaker?.color_index === next.speaker?.color_index
  )
})
