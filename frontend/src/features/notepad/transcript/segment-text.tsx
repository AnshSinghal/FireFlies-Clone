'use client'

/**
 * One transcript line's text, with highlights and search marks (T-32.4).
 *
 * Renders the flat span list from `buildSegmentSpans` — one element per span,
 * never nested. A span that is both a user highlight and a search hit shows
 * both, because they use different channels: search owns the background, a
 * marker owns its wash plus a saturated underline.
 *
 * The element carrying `data-segment-text` is the coordinate system the stored
 * offsets are relative to, so its text content must equal `segment.text`
 * exactly. Nothing decorative may be rendered inside it.
 */

import { Fragment, type KeyboardEvent, type MouseEvent } from 'react'

import type { HighlightOut } from '@/lib/api/types'
import { HIGHLIGHT_STYLES } from '@/lib/transcript/highlight-colors'
import { buildSegmentSpans, type SearchRange } from '@/lib/transcript/segment-spans'
import { cn } from '@/lib/utils/cn'

interface SegmentTextProps {
  segmentId: number
  text: string
  /** This segment's highlights only. */
  highlights: readonly HighlightOut[]
  /** Find-bar offsets for this segment. */
  matchRanges?: readonly SearchRange[]
  /** Which match is the current one, or -1. */
  activeMatch?: number
  onHighlightActivate?: (highlightId: number, anchor: HTMLElement) => void
  className?: string
}

export function SegmentText({
  segmentId,
  text,
  highlights,
  matchRanges,
  activeMatch = -1,
  onHighlightActivate,
  className,
}: SegmentTextProps) {
  const spans = buildSegmentSpans(
    text,
    highlights.map((highlight) => ({
      id: highlight.id,
      start: highlight.start_offset,
      end: highlight.end_offset,
      color: highlight.color,
    })),
    matchRanges,
  )

  return (
    <span
      data-segment-text={segmentId}
      className={cn('whitespace-pre-wrap', className)}
      // Explicit, because a reset that killed selection would make the
      // transcript unhighlightable as well as uncopyable.
      style={{ userSelect: 'text' }}
    >
      {spans.map((span) => {
        const highlight = span.highlight
        const isMatch = span.matchIndex >= 0
        const isActiveMatch = span.matchIndex === activeMatch

        if (highlight === null && !isMatch) {
          return <Fragment key={span.start}>{span.text}</Fragment>
        }

        const style = highlight ? HIGHLIGHT_STYLES[highlight.color] : null

        // The row seeks on click, so a click on a mark must not also move the
        // playhead. Continuation fragments are clickable but not focusable —
        // one highlight is one tab stop.
        const clickable = highlight !== null && onHighlightActivate !== undefined
        const interactive = clickable && highlight.isFirst

        const open = (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
          if (!highlight || !onHighlightActivate) return
          event.stopPropagation()
          onHighlightActivate(highlight.id, event.currentTarget)
        }

        return (
          <mark
            key={span.start}
            data-match-index={isMatch ? span.matchIndex : undefined}
            data-active={isActiveMatch || undefined}
            data-highlight-id={highlight?.id}
            /*
             * Only the LEADING fragment is addressable. A highlight cut in two
             * by a search mark is still one highlight, and a duplicated test id
             * is a locator that throws in strict mode.
             */
            data-testid={
              highlight !== null && highlight.isFirst ? `highlight-${highlight.id}` : undefined
            }
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-label={interactive ? `${style?.label ?? ''} highlight — open note` : undefined}
            onClick={clickable ? open : undefined}
            onKeyDown={
              interactive
                ? (event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    open(event)
                  }
                : undefined
            }
            className={cn(
              'rounded-none text-primary',
              // A user highlight: wash plus underline, and a pointer because it
              // opens something.
              style && style.mark,
              style && 'underline decoration-2 underline-offset-4',
              clickable && 'cursor-pointer',
              // A search hit with no marker under it keeps the search palette.
              isMatch && !style && (isActiveMatch ? 'bg-highlight-active' : 'bg-highlight'),
              /*
               * Both at once. The marker keeps its wash — two backgrounds
               * cannot coexist — so the search hit is carried by weight, and
               * the CURRENT match by an inset ring. Losing one of the two is
               * exactly the T32-C failure.
               */
              isMatch && style && 'font-semibold',
              isActiveMatch && style && 'shadow-[inset_0_0_0_2px_var(--ff-highlight-active)]',
              'focus-visible:shadow-focus focus-visible:outline-none',
            )}
          >
            {span.text}
          </mark>
        )
      })}
    </span>
  )
}
