'use client'

/**
 * Turning a DOM selection into character offsets (T-32.2).
 *
 * Highlights are stored as offsets into `segment.text`, so the bridge between
 * what the user dragged over and what gets persisted is this file. Getting it
 * wrong is the whole-segment highlight in T-32's ❌ list.
 *
 * The offsets are computed with a Range rather than by walking text nodes by
 * hand: `selectNodeContents(root)` then `setEnd(container, offset)` gives a
 * range whose text IS the prefix, so its length is the offset. Hand-walking
 * works too, until the paragraph already contains highlight spans and search
 * marks — which, by the second highlight in a line, it does.
 */

/** Marks the element whose text content is exactly one segment's text. */
export const SEGMENT_TEXT_ATTR = 'data-segment-text'

export interface SegmentSelection {
  segmentId: number
  start: number
  end: number
  text: string
}

/** Below this a "selection" is usually a stray click-drag. */
export const MIN_SELECTION = 2

function prefixLength(root: Node, container: Node, offset: number): number {
  const range = document.createRange()
  range.selectNodeContents(root)
  range.setEnd(container, offset)
  return range.toString().length
}

function segmentElement(node: Node | null): HTMLElement | null {
  const element = node instanceof Element ? node : (node?.parentElement ?? null)
  return element?.closest<HTMLElement>(`[${SEGMENT_TEXT_ATTR}]`) ?? null
}

/**
 * What the current selection means, in segment coordinates.
 *
 * Returns `'cross-segment'` when the selection spans more than one line.
 * T-32.11 offers a choice between splitting such a selection into one highlight
 * per segment and refusing it; this codebase REFUSES, and says so (ADR-119).
 * Splitting produces marks the user did not ask for at both ends — the leading
 * and trailing lines are almost always partially selected — and there is no
 * affordance for removing one of them without removing all of them.
 */
export function readSegmentSelection(): SegmentSelection | 'cross-segment' | null {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null

  const range = selection.getRangeAt(0)
  const startEl = segmentElement(range.startContainer)
  const endEl = segmentElement(range.endContainer)

  if (startEl === null || endEl === null) return null
  if (startEl !== endEl) return 'cross-segment'

  const id = Number(startEl.getAttribute(SEGMENT_TEXT_ATTR))
  if (!Number.isFinite(id)) return null

  const start = prefixLength(startEl, range.startContainer, range.startOffset)
  const end = prefixLength(startEl, range.endContainer, range.endOffset)
  if (end - start < MIN_SELECTION) return null

  return { segmentId: id, start, end, text: (startEl.textContent ?? '').slice(start, end) }
}
