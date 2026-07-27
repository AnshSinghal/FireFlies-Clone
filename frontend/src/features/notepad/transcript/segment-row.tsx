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
  Copy,
  Link2,
  MessageSquare,
  MessageSquarePlus,
  MoreHorizontal,
  Quote,
  Star,
  Undo2,
  UserCog,
} from 'lucide-react'
import { memo } from 'react'

import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dropdown, DropdownItem, DropdownSeparator, DropdownSub } from '@/components/ui/dropdown'
import { IconButton } from '@/components/ui/icon-button'
import { TimestampButton } from '@/components/ui/media-controls'
import type { HighlightOut, SegmentOut, SpeakerRef } from '@/lib/api/types'
import type { SearchRange } from '@/lib/transcript/segment-spans'
import type { TurnAware } from '@/lib/transcript/grouping'
import { cn } from '@/lib/utils/cn'
import { formatTimestamp } from '@/lib/utils/format'
import { getSpeakerColorByIndex } from '@/lib/utils/speaker-color'

import { SegmentEditor } from './segment-editor'
import { SegmentText } from './segment-text'

export interface SegmentRowProps {
  segment: SegmentOut & TurnAware
  speaker: SpeakerRef | undefined
  isActive: boolean
  /** The one seek path (T-21.8). The row seeks; the timestamp seeks and plays. */
  onSeek: (ms: number, options?: { play?: boolean }) => void
  onCopyText: (segment: SegmentOut) => void
  onCopyLink: (segment: SegmentOut) => void
  /** Offsets to highlight in this line (T-22.3). */
  matchRanges?: SearchRange[]
  /** Which of those is the CURRENT match, or -1 for none. */
  activeMatch?: number
  /** This line's stored highlights (T-32.4). */
  highlights?: readonly HighlightOut[]
  onHighlightActivate?: (highlightId: number, anchor: HTMLElement) => void
  /** Bookmarks (T-32.6). */
  bookmarked?: boolean
  onToggleBookmark?: (segmentId: number) => void
  /** Edit mode (T-25). The row becomes editable and gains its own affordances. */
  editing?: boolean
  speakers?: SpeakerRef[]
  onEditText?: (segmentId: number, previous: string, next: string) => void
  onCommitEdit?: () => void
  onReassign?: (segmentId: number, speakerId: number) => void
  onRevert?: (segment: SegmentOut) => void
  /** Live comments on this line — drives the always-visible gutter chip (T-31.2). */
  commentCount?: number
  /** Opens the inline composer under this line (T-31.3). */
  onAddComment?: (segmentId: number) => void
}

const NO_HIGHLIGHTS: readonly HighlightOut[] = []

function SegmentRowImpl({
  segment,
  speaker,
  isActive,
  onSeek,
  onCopyText,
  onCopyLink,
  matchRanges,
  activeMatch = -1,
  highlights = NO_HIGHLIGHTS,
  onHighlightActivate,
  bookmarked = false,
  onToggleBookmark,
  editing = false,
  speakers,
  onEditText,
  onCommitEdit,
  onReassign,
  onRevert,
  commentCount = 0,
  onAddComment,
}: SegmentRowProps) {
  const color = speaker ? getSpeakerColorByIndex(speaker.color_index) : undefined
  const label = speaker?.label ?? 'Unknown speaker'

  return (
    <article
      data-testid={`transcript-segment-${segment.id}`}
      data-segment-id={segment.id}
      data-active={isActive || undefined}
      // Announced as the current item rather than only coloured (T-21.12).
      aria-current={isActive ? 'true' : undefined}
      /*
       * Clicking the LINE seeks (T-21.1) — but on `onClick` of the article
       * rather than a wrapping button, because the text has to stay
       * selectable and a button's contents are not reliably selectable.
       *
       * The check below is what makes that safe: a click that landed on the
       * timestamp, the menu, a highlight, or inside a text selection is not a
       * "seek here".
       */
      onClick={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest('button, a, [role="menu"], [data-highlight-id]')
        ) {
          return
        }
        // Dragging out a selection ends in a click. Seeking then would move the
        // player every time somebody copied a quote.
        if ((window.getSelection()?.toString().length ?? 0) > 0) return
        onSeek(segment.start_ms)
      }}
      // `group` so the timestamp, the star and the ⋯ can appear on hover
      // without any of them needing hover state of its own.
      className={cn(
        // `pl-8` rather than `px-4`: the extra 16px is the bookmark gutter, and
        // reserving it unconditionally is what keeps a starred line exactly as
        // wide as an unstarred one.
        'group/segment relative cursor-pointer py-3 pl-8 pr-4 transition-colors duration-fast',
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

      {/*
        The gutter star (T-32.6). It lives in the row's LEFT PADDING rather than
        in the content flow, so a bookmarked line is exactly as tall and exactly
        as wide as an unbookmarked one — a star that reflowed the text would
        make scanning a transcript for stars impossible.
      */}
      {onToggleBookmark && (
        <IconButton
          size="sm"
          label={bookmarked ? 'Remove bookmark' : 'Bookmark this moment'}
          aria-pressed={bookmarked}
          data-testid={`bookmark-toggle-${segment.id}`}
          hideTooltip
          icon={
            <Star size={14} strokeWidth={1.75} fill={bookmarked ? 'currentColor' : 'none'} />
          }
          onClick={(event) => {
            event.stopPropagation()
            onToggleBookmark(segment.id)
          }}
          className={cn(
            'absolute left-0 top-1.5 transition-opacity duration-fast',
            bookmarked
              ? 'text-brand-amber opacity-100 hover:text-brand-amber'
              : 'opacity-0 focus-visible:opacity-100 group-hover/segment:opacity-100',
          )}
        />
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

          {segment.is_edited && (
            <span
              data-testid={`segment-edited-${segment.id}`}
              title="This line was edited after transcription"
              className="shrink-0 rounded-full bg-surface-2 px-1.5 text-xs text-muted"
            >
              Edited
            </span>
          )}
        </header>
      )}

      {/*
        Indented to sit under the NAME, not under the avatar — 24px of avatar
        plus the 12px gap. Continuation lines land in the same column, which is
        what makes a turn read as one block.
      */}
      <div className="flex items-start gap-2 pl-9">
        <p className="min-w-0 flex-1 select-text text-transcript text-primary">
          {editing && onEditText && onCommitEdit ? (
            <SegmentEditor
              segmentId={segment.id}
              value={segment.text}
              onChange={(previous, next) => onEditText(segment.id, previous, next)}
              onCommit={onCommitEdit}
            />
          ) : (
            /*
              ONE renderer for both channels (T-32.4). Marks and highlights are
              flattened into a single disjoint span list rather than nested,
              which is what keeps a search hit inside a highlight from producing
              broken markup or dropping the characters at the seam.
            */
            <SegmentText
              segmentId={segment.id}
              text={segment.text}
              highlights={highlights}
              matchRanges={matchRanges}
              activeMatch={activeMatch}
              onHighlightActivate={onHighlightActivate}
            />
          )}
        </p>

        {/*
          Always visible, not hover-only (T-31.2): a thread nobody can see is
          a thread nobody discovers. Sits in the right gutter beside the
          timestamp, and clicking it opens the discussion it advertises.
        */}
        {commentCount > 0 && onAddComment && (
          <Button
            variant="ghost"
            size="sm"
            data-testid={`comment-gutter-${segment.id}`}
            aria-label={`${commentCount} ${commentCount === 1 ? 'comment' : 'comments'} on this line`}
            className="tnum h-6 shrink-0 gap-1 px-1.5 text-xs text-muted"
            leftIcon={<MessageSquare size={13} strokeWidth={1.75} />}
            onClick={() => onAddComment(segment.id)}
          >
            {commentCount}
          </Button>
        )}

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

            {onToggleBookmark && (
              <DropdownItem
                icon={
                  <Star
                    size={16}
                    strokeWidth={1.75}
                    fill={bookmarked ? 'currentColor' : 'none'}
                  />
                }
                onSelect={() => onToggleBookmark(segment.id)}
                testId={`segment-bookmark-${segment.id}`}
              >
                {bookmarked ? 'Remove bookmark' : 'Bookmark this moment'}
              </DropdownItem>
            )}

            <DropdownSeparator />
            {onAddComment ? (
              <DropdownItem
                icon={<MessageSquarePlus size={16} strokeWidth={1.75} />}
                onSelect={() => onAddComment(segment.id)}
                testId={`segment-add-comment-${segment.id}`}
              >
                Add comment
              </DropdownItem>
            ) : (
              <DropdownItem icon={<MessageSquarePlus size={16} strokeWidth={1.75} />} soon>
                Add comment
              </DropdownItem>
            )}
            <DropdownItem icon={<Quote size={16} strokeWidth={1.75} />} soon>
              Create soundbite
            </DropdownItem>
            {/*
              Reassignment is a submenu of the meeting's own speakers (T-25.6).
              Cross-meeting reassignment would corrupt two transcripts at once,
              which is why the API refuses it and why the list is scoped here.
            */}
            {onReassign && speakers && speakers.length > 1 && (
              <DropdownSub label="Reassign speaker" icon={<UserCog size={16} strokeWidth={1.75} />}>
                {speakers.map((speaker) => (
                  <DropdownItem
                    key={speaker.id}
                    testId={`segment-reassign-${speaker.id}`}
                    onSelect={() => onReassign(segment.id, speaker.id)}
                  >
                    {speaker.label}
                  </DropdownItem>
                ))}
              </DropdownSub>
            )}

            {/* Only where there is something to revert TO. */}
            {onRevert && segment.original_text !== null && (
              <DropdownItem
                icon={<Undo2 size={16} strokeWidth={1.75} />}
                testId={`segment-revert-${segment.id}`}
                onSelect={() => onRevert(segment)}
              >
                Revert to original
              </DropdownItem>
            )}
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
   * The callbacks are excluded, which puts a REQUIREMENT on the call site: they
   * must be genuinely stable, because a row will hold the first one it is given
   * for as long as nothing visible about it changes.
   *
   * `seekTo` was not, once — it depended on the player, which changes with the
   * clock — and rows kept a closure from before the audio had loaded, in which
   * seeking moved a number and not the audio. See the note in
   * `lib/notepad/commands.tsx`; the fix belongs there, not here, because a
   * comparator that included the callbacks would simply never memoise anything.
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
    // Same contract — the per-segment slice is memoised by the panel, so a new
    // array identity means a highlight on THIS line changed.
    previous.highlights === next.highlights &&
    previous.bookmarked === next.bookmarked &&
    previous.editing === next.editing &&
    previous.segment.is_edited === next.segment.is_edited &&
    previous.segment.original_text === next.segment.original_text &&
    previous.speakers === next.speakers &&
    previous.speaker?.label === next.speaker?.label &&
    previous.speaker?.color_index === next.speaker?.color_index &&
    // The gutter chip is visible state (T-31.2) — a posted comment must show
    // up without waiting for some other prop to change.
    previous.commentCount === next.commentCount
  )
})
