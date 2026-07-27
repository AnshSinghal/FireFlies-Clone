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
import { TOAST_MESSAGES } from '@/lib/toast/messages'

interface SelectionToolbarProps {
  /** Selections outside this element are ignored. */
  containerRef: React.RefObject<HTMLElement | null>
  onCopy: (text: string) => void
  /** Opens the comment composer for the selection's segment (T-31.3). */
  onComment?: (segmentId: number) => void
}

interface Anchor {
  top: number
  left: number
  text: string
  /** The segment the selection STARTS in, from the row's data attribute. */
  segmentId: number | null
}

/** Below this many characters a "selection" is usually a stray click-drag. */
const MIN_SELECTION = 2

export function SelectionToolbar({ containerRef, onCopy, onComment }: SelectionToolbarProps) {
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

    setAnchor({
      top: rect.top,
      left: rect.left + rect.width / 2,
      text,
      segmentId: segmentId != null ? Number(segmentId) : null,
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

  return (
    <div
      data-testid="selection-toolbar"
      role="toolbar"
      aria-label="Selection actions"
      // `fixed`, because the anchor comes from a viewport-relative rect. An
      // absolutely positioned version would need the offset parent's scroll
      // subtracted, and would drift the moment anything between them scrolled.
      className="fixed z-popover flex -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-lg border border-subtle bg-surface-0 p-1 shadow-md"
      style={{ top: anchor.top - 8, left: anchor.left }}
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
      <IconButton
        label="Highlight"
        size="sm"
        icon={<Highlighter size={16} strokeWidth={1.75} />}
        onClick={soon}
      />
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
        onClick={soon}
      />
    </div>
  )
}
