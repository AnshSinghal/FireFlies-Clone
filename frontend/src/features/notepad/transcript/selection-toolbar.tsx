'use client'

/**
 * The floating toolbar over a text selection (T-20.8, T-32.2).
 *
 * Positioned from the selection's own bounding rect rather than from the mouse:
 * a selection made with the keyboard, or extended by double-click-and-drag, has
 * no meaningful cursor position, and anchoring to one puts the toolbar in the
 * wrong place for both.
 */

import { Check, Copy, Highlighter, MessageSquarePlus, Quote } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { IconButton } from '@/components/ui/icon-button'
import { useToast } from '@/components/ui/toast'
import { TOAST_MESSAGES } from '@/lib/toast/messages'
import {
  HIGHLIGHT_COLORS,
  HIGHLIGHT_STYLES,
  type HighlightColorName,
} from '@/lib/transcript/highlight-colors'
import { readSegmentSelection, type SegmentSelection } from '@/lib/transcript/selection'
import { cn } from '@/lib/utils/cn'

export interface SoundbiteSelection {
  startSegmentId: number
  endSegmentId: number
  text: string
}

interface SelectionToolbarProps {
  /** Selections outside this element are ignored. */
  containerRef: React.RefObject<HTMLElement | null>
  onCopy: (text: string) => void
  /** Opens the comment composer for the selection's segment (T-31.3). */
  onComment?: (segmentId: number) => void
  /** Applies a highlight. Absent while the transcript is in edit mode. */
  onHighlight?: (selection: SegmentSelection, color: HighlightColorName) => void
  /** The colour the plain `Highlight` button uses (T-32.2). */
  lastColor?: HighlightColorName
  /** Opens the create-soundbite modal for the selection's range (T-33.2). */
  onSoundbite?: (selection: SoundbiteSelection) => void
}

interface Anchor {
  top: number
  left: number
  text: string
  /**
   * The segment the selection STARTS in, from the row's data attribute.
   *
   * A COMMENT anchors here, which is the natural reading of "comment on this"
   * and stays unambiguous for a drag across lines.
   */
  segmentId: number | null
  /**
   * The selection resolved to character offsets, or `null` when it spans more
   * than one segment.
   *
   * A HIGHLIGHT needs more than the comment path does — offsets, not just a
   * line — and cannot fall back to the starting segment, because the offsets
   * past that line's end do not exist (ADR-124).
   */
  segment: SegmentSelection | null
  /** …and the one it ENDS in — a soundbite spans both (T-33.2). */
  endSegmentId: number | null
}

/** Below this many characters a "selection" is usually a stray click-drag. */
const MIN_SELECTION = 2

/** How close the toolbar may sit to either edge of the viewport. */
const EDGE_MARGIN = 8

export function SelectionToolbar({
  containerRef,
  onCopy,
  onComment,
  onHighlight,
  lastColor = 'amber',
  onSoundbite,
}: SelectionToolbarProps) {
  const toast = useToast()
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const [pickingColor, setPickingColor] = useState(false)

  /*
   * The toolbar is centred on the selection, so half of it hangs to each side
   * — and it has grown from three controls to six as T-31, T-32 and T-33 each
   * added one. Centred on a selection near either edge, that half now runs off
   * the viewport, and a `position: fixed` element cannot be scrolled back into
   * view: Playwright hangs on "scrolling into view if needed" and a real user
   * simply cannot reach the button.
   *
   * So the position is CLAMPED, which needs the rendered width — measured
   * rather than estimated, because the swatch row changes it by 120px.
   */
  const toolbarRef = useRef<HTMLDivElement | null>(null)
  const [halfWidth, setHalfWidth] = useState(0)

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

    const parsed = readSegmentSelection()
    // A soundbite needs the whole span, so the END matters too. DOM ranges are
    // normalised to document order, so end is never before start.
    const endElement =
      range.endContainer instanceof Element ? range.endContainer : range.endContainer.parentElement
    const endSegmentId = endElement?.closest<HTMLElement>('[data-segment-id]')?.dataset.segmentId

    setAnchor({
      top: rect.top,
      left: rect.left + rect.width / 2,
      text,
      segmentId: segmentId != null ? Number(segmentId) : null,
      segment: parsed === null || parsed === 'cross-segment' ? null : parsed,
      endSegmentId: endSegmentId != null ? Number(endSegmentId) : null,
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

  /*
   * A new selection starts with the swatch row closed; leaving it open would
   * mean the next selection's primary action is two clicks away.
   *
   * Adjusted DURING RENDER rather than in an effect. React re-runs this
   * component immediately with the new state and paints once — an effect would
   * paint the open swatch row over the new selection first, then close it,
   * which is a visible flicker for state nobody has looked at yet.
   */
  useLayoutEffect(() => {
    const width = toolbarRef.current?.offsetWidth
    if (width) setHalfWidth(width / 2)
  }, [anchor?.text, pickingColor])

  const [lastSelection, setLastSelection] = useState(anchor?.text)
  if (anchor?.text !== lastSelection) {
    setLastSelection(anchor?.text)
    setPickingColor(false)
  }

  if (!anchor) return null

  const soon = () => toast.info(TOAST_MESSAGES.comingSoon)

  const highlight = (color: HighlightColorName) => {
    if (!onHighlight) return
    if (!anchor.segment) {
      /*
       * T-32.11, decided rather than fudged: a selection crossing two lines is
       * REFUSED with an explanation (ADR-124). Splitting it would create marks
       * at both ends that the user did not draw — the first and last lines are
       * almost always partially selected — with no way to remove one without
       * removing all of them.
       */
      toast.info(TOAST_MESSAGES.highlightCrossSegment)
      return
    }
    onHighlight(anchor.segment, color)
    // The selection has become a highlight; leaving it selected leaves the
    // toolbar floating over its own result.
    window.getSelection()?.removeAllRanges()
    setAnchor(null)
  }

  return (
    <div
      data-testid="selection-toolbar"
      role="toolbar"
      aria-label="Selection actions"
      // `fixed`, because the anchor comes from a viewport-relative rect. An
      // absolutely positioned version would need the offset parent's scroll
      // subtracted, and would drift the moment anything between them scrolled.
      ref={toolbarRef}
      className="fixed z-popover flex -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-lg border border-subtle bg-surface-0 p-1 shadow-md"
      style={{
        top: anchor.top - 8,
        // Clamped into the viewport with an 8px margin. Before the first
        // measurement `halfWidth` is 0, which leaves the centred position
        // unchanged — the same frame the old code always rendered.
        left: Math.min(
          Math.max(anchor.left, halfWidth + EDGE_MARGIN),
          Math.max(halfWidth + EDGE_MARGIN, window.innerWidth - halfWidth - EDGE_MARGIN),
        ),
      }}
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

      {onHighlight && (
        <>
          {/*
            One click highlights in the LAST-USED colour (T-32.2). Choosing a
            colour is the exception, so it is behind the swatch toggle rather
            than in front of the common case.
          */}
          <IconButton
            label={`Highlight (${HIGHLIGHT_STYLES[lastColor].label})`}
            size="sm"
            icon={<Highlighter size={16} strokeWidth={1.75} />}
            data-testid="selection-highlight"
            onClick={() => highlight(lastColor)}
          />
          <IconButton
            label="Pick a highlight colour"
            size="sm"
            icon={
              <span
                aria-hidden="true"
                className={cn(
                  'block h-3.5 w-3.5 rounded-full border',
                  HIGHLIGHT_STYLES[lastColor].swatch,
                )}
              />
            }
            aria-expanded={pickingColor}
            data-testid="selection-highlight-colors"
            onClick={() => setPickingColor((open) => !open)}
          />
        </>
      )}

      {pickingColor && onHighlight && (
        <span
          role="group"
          aria-label="Highlight colours"
          data-testid="highlight-toolbar"
          className="flex items-center gap-0.5 border-l border-subtle pl-1"
        >
          {HIGHLIGHT_COLORS.map((color) => (
            <IconButton
              key={color}
              size="sm"
              label={`${HIGHLIGHT_STYLES[color].label} highlight`}
              data-testid={`highlight-color-${color}`}
              onClick={() => highlight(color)}
              icon={
                <span
                  className={cn(
                    'flex h-4 w-4 items-center justify-center rounded-full border',
                    HIGHLIGHT_STYLES[color].swatch,
                  )}
                >
                  {color === lastColor && (
                    <Check size={10} strokeWidth={3} className="text-primary" />
                  )}
                </span>
              }
            />
          ))}
        </span>
      )}

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
