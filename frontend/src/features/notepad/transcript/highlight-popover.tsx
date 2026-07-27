'use client'

/**
 * The popover behind an existing highlight (T-32.5).
 *
 * Anchored to the `<mark>` that was clicked rather than rendered from a
 * trigger, because the trigger is a fragment of running text that the span
 * merger is free to split — a Radix `Trigger` would have to be one element, and
 * a highlight is not always one element.
 *
 * Note editing is DEBOUNCED-ON-CLOSE rather than per keystroke: a note is a
 * sentence, and a PATCH per character would put the network in the typing path
 * for no benefit.
 */

import { Check, Trash2, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Textarea } from '@/components/ui/input'
import type { HighlightOut } from '@/lib/api/types'
import {
  HIGHLIGHT_COLORS,
  HIGHLIGHT_STYLES,
  type HighlightColorName,
} from '@/lib/transcript/highlight-colors'
import { cn } from '@/lib/utils/cn'
import { formatTimestamp } from '@/lib/utils/format'

const MAX_NOTE = 1000
const PANEL_WIDTH = 288
const GAP = 8

interface HighlightPopoverProps {
  highlight: HighlightOut
  anchor: HTMLElement
  onClose: () => void
  onChangeColor: (color: HighlightColorName) => void
  onSaveNote: (note: string | null) => void
  onRemove: () => void
}

export function HighlightPopover({
  highlight,
  anchor,
  onClose,
  onChangeColor,
  onSaveNote,
  onRemove,
}: HighlightPopoverProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  /*
   * Seeded once. The call site KEYS this component on the highlight's id, so
   * clicking a different mark remounts it rather than leaving the previous
   * note in the field — which is the same fix as an effect, minus the render
   * that shows the stale value first.
   */
  const [note, setNote] = useState(highlight.note ?? '')
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  /*
   * Positioned after layout, so the measurement is of the real panel rather
   * than of an assumed height. Clamped to the viewport in both axes: a
   * highlight near the bottom of a long transcript would otherwise open a
   * panel below the fold, which reads as nothing happening.
   */
  useLayoutEffect(() => {
    const rect = anchor.getBoundingClientRect()
    const height = panelRef.current?.offsetHeight ?? 220

    const below = rect.bottom + GAP
    const top = below + height > window.innerHeight ? Math.max(GAP, rect.top - height - GAP) : below
    const left = Math.min(
      Math.max(GAP, rect.left),
      Math.max(GAP, window.innerWidth - PANEL_WIDTH - GAP),
    )

    setPosition({ top, left })
  }, [anchor, highlight.id])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && panelRef.current?.contains(event.target)) return
      // A click on ANOTHER highlight closes this one and opens that one; the
      // mark's own handler runs after this, so nothing is lost.
      onClose()
    }

    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [onClose])

  const commitNote = () => {
    const trimmed = note.trim()
    if (trimmed === (highlight.note ?? '')) return
    onSaveNote(trimmed === '' ? null : trimmed)
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Highlight"
      data-testid="highlight-popover"
      className="fixed z-popover w-[288px] rounded-lg border border-subtle bg-surface-0 p-3 shadow-lg"
      style={{
        top: position?.top ?? -9999,
        left: position?.left ?? -9999,
        // Hidden rather than unmounted until measured, so the panel never
        // flashes at the top-left corner on the frame before it is placed.
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="text-label uppercase tabular-nums text-muted">
          {formatTimestamp(highlight.start_ms)} · {highlight.speaker_label}
        </span>
        <IconButton
          label="Close"
          size="sm"
          icon={<X size={14} strokeWidth={2} />}
          onClick={onClose}
          data-testid="highlight-popover-close"
          hideTooltip
        />
      </div>

      <blockquote
        className={cn(
          'mb-3 line-clamp-4 border-l-2 pl-2 text-sm text-secondary',
          HIGHLIGHT_STYLES[highlight.color].swatch,
          // The swatch class carries a background too; the quote wants only the
          // edge, so the background is overridden back to nothing.
          'bg-transparent',
        )}
      >
        {highlight.text}
      </blockquote>

      <div
        role="group"
        aria-label="Highlight colour"
        data-testid="highlight-popover-colors"
        className="mb-3 flex items-center gap-1"
      >
        {HIGHLIGHT_COLORS.map((color) => (
          <IconButton
            key={color}
            size="sm"
            label={HIGHLIGHT_STYLES[color].label}
            aria-pressed={color === highlight.color}
            data-testid={`highlight-popover-color-${color}`}
            onClick={() => onChangeColor(color)}
            icon={
              <span
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded-full border',
                  HIGHLIGHT_STYLES[color].swatch,
                )}
              >
                {color === highlight.color && (
                  <Check size={10} strokeWidth={3} className="text-primary" />
                )}
              </span>
            }
          />
        ))}
      </div>

      <Textarea
        label="Note"
        value={note}
        maxChars={MAX_NOTE}
        rows={3}
        placeholder="Why does this matter?"
        data-testid="highlight-note"
        onChange={(event) => setNote(event.target.value.slice(0, MAX_NOTE))}
        // Saved when the field loses focus, and again on close — one PATCH per
        // edit rather than one per keystroke.
        onBlur={commitNote}
      />

      <div className="mt-3 flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          data-testid="highlight-remove"
          leftIcon={<Trash2 size={14} strokeWidth={1.75} />}
          onClick={onRemove}
        >
          Remove
        </Button>
        <Button
          variant="primary"
          size="sm"
          data-testid="highlight-save"
          onClick={() => {
            commitNote()
            onClose()
          }}
        >
          Done
        </Button>
      </div>
    </div>
  )
}
