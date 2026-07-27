'use client'

/**
 * The floating toolbar over a text selection (T-20.8).
 *
 * Positioned from the selection's own bounding rect rather than from the mouse:
 * a selection made with the keyboard, or extended by double-click-and-drag, has
 * no meaningful cursor position, and anchoring to one puts the toolbar in the
 * wrong place for both.
 */

import { Copy, Highlighter, MessageSquarePlus, Quote } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { IconButton } from '@/components/ui/icon-button'
import { useToast } from '@/components/ui/toast'
import type { HighlightColor } from '@/lib/api/types'
import { TOAST_MESSAGES } from '@/lib/toast/messages'
import { cn } from '@/lib/utils/cn'

import { HIGHLIGHT_COLORS, SWATCH_CLASSES } from './segment-text'

export interface SoundbiteSelection {
  startSegmentId: number
  endSegmentId: number
  text: string
}

export interface HighlightSelection {
  segmentId: number
  startOffset: number
  endOffset: number
}

interface SelectionToolbarProps {
  /** Selections outside this element are ignored. */
  containerRef: React.RefObject<HTMLElement | null>
  onCopy: (text: string) => void
  /** Opens the comment composer for the selection's segment (T-31.3). */
  onComment?: (segmentId: number) => void
  /** Opens the create-soundbite modal for the selection's range (T-33.2). */
  onSoundbite?: (selection: SoundbiteSelection) => void
  /** Creates a highlight over the selection (T-32.2). */
  onHighlight?: (selection: HighlightSelection, color: HighlightColor) => void
  /** The last-used colour — what the main Highlight button applies. */
  highlightColor?: HighlightColor
}

interface Anchor {
  top: number
  /** The selection's lower edge — where the toolbar goes when it flips down. */
  bottom: number
  left: number
  text: string
  /** The segment the selection STARTS in, from the row's data attribute. */
  segmentId: number | null
  /** …and the one it ENDS in — a soundbite spans both (T-33.2). */
  endSegmentId: number | null
  /** Character offsets within the start segment's text (T-32.2); null when
   *  the selection crosses segments or the boundary could not be measured. */
  offsets: { start: number; end: number } | null
}

/** Below this many characters a "selection" is usually a stray click-drag. */
const MIN_SELECTION = 2

export function SelectionToolbar({
  containerRef,
  onCopy,
  onComment,
  onSoundbite,
  onHighlight,
  highlightColor = 'amber',
}: SelectionToolbarProps) {
  const toast = useToast()
  const [anchor, setAnchor] = useState<Anchor | null>(null)

  const update = useCallback(() => {
    const selection = window.getSelection()
    const container = containerRef.current

    if (!selection || selection.isCollapsed || !container) {
      setAnchor(null)
      return
    }

    const text = selection.toString().trim()
    if (text.length < MIN_SELECTION) {
      setAnchor(null)
      return
    }

    // Both ends inside the transcript: a selection that starts in the summary
    // and ends here is not a transcript selection.
    const range = selection.getRangeAt(0)
    if (!container.contains(range.commonAncestorContainer)) {
      setAnchor(null)
      return
    }

    const rect = range.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) {
      setAnchor(null)
      return
    }

    // A comment anchors to the line where the selection STARTS — the natural
    // reading of "comment on this", and unambiguous for cross-line drags.
    const startElement =
      range.startContainer instanceof Element
        ? range.startContainer
        : range.startContainer.parentElement
    const segmentId = startElement?.closest<HTMLElement>('[data-segment-id]')?.dataset.segmentId

    // A soundbite needs the whole span, so the END matters too. DOM ranges are
    // normalised to document order, so end is never before start.
    const endElement =
      range.endContainer instanceof Element ? range.endContainer : range.endContainer.parentElement
    const endSegmentId = endElement?.closest<HTMLElement>('[data-segment-id]')?.dataset.segmentId

    setAnchor({
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left + rect.width / 2,
      text,
      segmentId: segmentId != null ? Number(segmentId) : null,
      endSegmentId: endSegmentId != null ? Number(endSegmentId) : null,
      offsets:
        segmentId != null && segmentId === endSegmentId
          ? measureOffsets(range, startElement?.closest('[data-segment-id]') ?? null)
          : null,
    })
  }, [containerRef])

  useEffect(() => {
    /*
     * On `selectionchange`, not `mouseup`.
     *
     * `mouseup` misses keyboard selection entirely (Shift+Arrow, ⌘A) and fires
     * before the selection settles on some platforms. `selectionchange` is the
     * event that actually describes what this component displays.
     */
    document.addEventListener('selectionchange', update)
    // A scroll moves the selection out from under a fixed toolbar, so the
    // anchor has to be recomputed rather than left where it was.
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)

    return () => {
      document.removeEventListener('selectionchange', update)
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [update])

  if (!anchor) return null

  const soon = () => toast.info(TOAST_MESSAGES.comingSoon)

  const applyHighlight = (color: HighlightColor) => {
    if (anchor.segmentId == null) return
    if (anchor.segmentId !== anchor.endSegmentId || anchor.offsets == null) {
      // The documented T-32.11 choice: block cross-segment selections with a
      // clear message rather than silently splitting them into two ranges the
      // user never asked for.
      toast.error(TOAST_MESSAGES.highlightOneSegment)
      return
    }
    onHighlight?.(
      {
        segmentId: anchor.segmentId,
        startOffset: anchor.offsets.start,
        endOffset: anchor.offsets.end,
      },
      color,
    )
    window.getSelection()?.removeAllRanges()
    setAnchor(null)
  }

  /*
   * Clamped into the viewport, and flipped below the selection when there is
   * no room above it (T-33.2 fallout).
   *
   * `fixed` + the selection's viewport rect means an unclamped toolbar simply
   * leaves the screen: select a line scrolled to the TOP of the transcript and
   * it renders above the viewport, unreachable — and because the rightmost
   * control is `selection-soundbite`, a selection near the right edge takes
   * that button off-screen first. Neither is reachable by scrolling, since a
   * fixed element does not move with the page. `07-primitives` T10-K already
   * requires dropdowns to flip near an edge; this was the one floating surface
   * that did not.
   *
   * Measured toolbar box: 248×38. The half-width and height are constants
   * rather than a measured ref because the toolbar's contents are fixed and a
   * layout-effect measurement would place it one frame late, which reads as a
   * jump.
   */
  const HALF_W = 124
  const HEIGHT = 38
  const GAP = 8
  const viewportW = typeof window === 'undefined' ? 1440 : window.innerWidth
  const flipped = anchor.top < HEIGHT + GAP
  const placement = {
    flipped,
    top: flipped ? anchor.bottom + GAP : anchor.top - GAP,
    left: Math.min(Math.max(anchor.left, HALF_W + GAP), viewportW - HALF_W - GAP),
  }

  return (
    <div
      data-testid="selection-toolbar"
      data-flipped={flipped ? 'true' : 'false'}
      role="toolbar"
      aria-label="Selection actions"
      // `fixed`, because the anchor comes from a viewport-relative rect. An
      // absolutely positioned version would need the offset parent's scroll
      // subtracted, and would drift the moment anything between them scrolled.
      className={cn(
        'fixed z-popover flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-subtle bg-surface-0 p-1 shadow-md',
        // Flipped below the selection, so no `-translate-y-full`.
        placement.flipped ? '' : '-translate-y-full',
      )}
      style={{ top: placement.top, left: placement.left }}
      // The toolbar must not steal the selection it is describing: focusing a
      // button inside it would collapse the range and unmount this component
      // before the click landed.
      onMouseDown={(event) => event.preventDefault()}
    >
      <IconButton
        label="Copy"
        size="sm"
        icon={<Copy size={16} strokeWidth={1.75} />}
        data-testid="selection-copy"
        onClick={() => onCopy(anchor.text)}
      />
      <span className="flex items-center gap-0.5" data-testid="highlight-toolbar">
        <IconButton
          label="Highlight"
          size="sm"
          icon={<Highlighter size={16} strokeWidth={1.75} />}
          data-testid="selection-highlight"
          onClick={onHighlight ? () => applyHighlight(highlightColor) : soon}
        />
        {onHighlight &&
          HIGHLIGHT_COLORS.map((color) => (
            <IconButton
              key={color}
              label={`Highlight in ${color}`}
              size="sm"
              data-testid={`highlight-color-${color}`}
              onClick={() => applyHighlight(color)}
              icon={
                <span
                  aria-hidden="true"
                  className={cn(
                    'block size-3.5 rounded-full transition-transform hover:scale-110',
                    SWATCH_CLASSES[color],
                    color === highlightColor &&
                      'ring-offset-surface-0 ring-1 ring-accent ring-offset-1',
                  )}
                />
              }
            />
          ))}
      </span>
      <IconButton
        label="Comment"
        size="sm"
        icon={<MessageSquarePlus size={16} strokeWidth={1.75} />}
        data-testid="selection-comment"
        onClick={
          onComment && anchor.segmentId != null
            ? () => {
                onComment(anchor.segmentId as number)
                window.getSelection()?.removeAllRanges()
                setAnchor(null)
              }
            : soon
        }
      />
      <IconButton
        label="Soundbite"
        size="sm"
        icon={<Quote size={16} strokeWidth={1.75} />}
        data-testid="selection-soundbite"
        onClick={
          onSoundbite && anchor.segmentId != null
            ? () => {
                onSoundbite({
                  startSegmentId: anchor.segmentId as number,
                  // A selection can END outside any segment row — in a speaker
                  // header, say — in which case the start segment IS the range.
                  endSegmentId: anchor.endSegmentId ?? (anchor.segmentId as number),
                  text: anchor.text,
                })
                window.getSelection()?.removeAllRanges()
                setAnchor(null)
              }
            : soon
        }
      />
    </div>
  )
}

/**
 * Character offsets of a selection within its segment's text (T-32.2).
 *
 * Measured by cloning a range from the start of the segment's paragraph to
 * each selection boundary and counting its text — which walks nested spans
 * and marks correctly, so a selection over an existing highlight or a search
 * mark still lands on the right characters.
 */
function measureOffsets(
  range: Range,
  segmentElement: Element | null,
): { start: number; end: number } | null {
  const paragraph = segmentElement?.querySelector('p')
  if (!paragraph) return null

  try {
    const probe = document.createRange()
    probe.selectNodeContents(paragraph)
    probe.setEnd(range.startContainer, range.startOffset)
    const start = probe.toString().length
    probe.setEnd(range.endContainer, range.endOffset)
    const end = probe.toString().length

    if (end <= start) return null
    return { start, end }
  } catch {
    // A boundary outside the paragraph (double-click on the speaker name that
    // drags into the text) makes the range invalid — no highlight, no crash.
    return null
  }
}
