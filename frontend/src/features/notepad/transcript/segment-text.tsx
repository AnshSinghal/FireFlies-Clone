'use client'

/**
 * A segment's text with user highlights and search marks painted together
 * (T-32.4, T-32.5).
 *
 * The span engine (`buildSegmentAtoms`) guarantees the structure; this file
 * only renders it: one span per contiguous highlight run, `<mark>`s strictly
 * inside, never the other way around. Clicking a highlight opens its popover
 * — note, colour, remove — anchored to the span itself.
 */

import { Trash2 } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import type { HighlightRange } from '@/components/ui/highlighter'
import { IconButton } from '@/components/ui/icon-button'
import { Textarea } from '@/components/ui/input'
import { Popover } from '@/components/ui/popover'
import { useDeleteHighlight, useUpdateHighlight } from '@/lib/api/highlights'
import type { HighlightColor, HighlightOut } from '@/lib/api/types'
import {
  buildSegmentAtoms,
  groupAtomsIntoRuns,
  type SegmentAtom,
} from '@/lib/transcript/segment-spans'
import { cn } from '@/lib/utils/cn'

export const HIGHLIGHT_COLORS: readonly HighlightColor[] = ['amber', 'green', 'blue', 'pink']

/** One complete class set per colour — `cn` does not merge conflicts (ADR-013). */
const HL_CLASSES: Record<HighlightColor, string> = {
  amber: 'bg-hl-amber decoration-hl-amber-line',
  green: 'bg-hl-green decoration-hl-green-line',
  blue: 'bg-hl-blue decoration-hl-blue-line',
  pink: 'bg-hl-pink decoration-hl-pink-line',
}

/** The swatch row reuses the same tokens as fills. */
export const SWATCH_CLASSES: Record<HighlightColor, string> = {
  amber: 'bg-hl-amber-line',
  green: 'bg-hl-green-line',
  blue: 'bg-hl-blue-line',
  pink: 'bg-hl-pink-line',
}

interface SegmentTextProps {
  meetingId: number
  text: string
  highlights: readonly HighlightOut[]
  matchRanges?: readonly HighlightRange[]
  /** Which merged match is the find bar's current one, or -1. */
  activeMatch?: number
}

export function SegmentText({
  meetingId,
  text,
  highlights,
  matchRanges,
  activeMatch = -1,
}: SegmentTextProps) {
  const runs = useMemo(
    () => groupAtomsIntoRuns(buildSegmentAtoms(text, highlights, matchRanges ?? [])),
    [text, highlights, matchRanges],
  )

  return (
    <>
      {runs.map((run, index) =>
        run.highlight ? (
          <HighlightSpan
            key={`h-${run.highlight.id}-${index}`}
            meetingId={meetingId}
            highlight={run.highlight}
            atoms={run.atoms}
            activeMatch={activeMatch}
          />
        ) : (
          <Fragment key={`t-${index}`}>
            <Atoms atoms={run.atoms} activeMatch={activeMatch} />
          </Fragment>
        ),
      )}
    </>
  )
}

/** Marks within a run — the shared leaf renderer. */
function Atoms({ atoms, activeMatch }: { atoms: readonly SegmentAtom[]; activeMatch: number }) {
  return (
    <>
      {atoms.map((atom, index) =>
        atom.matchIndex >= 0 ? (
          <mark
            key={index}
            data-match-index={atom.matchIndex}
            data-active={atom.matchIndex === activeMatch || undefined}
            className={
              atom.matchIndex === activeMatch
                ? 'rounded-none bg-highlight-active font-semibold text-primary'
                : 'rounded-none bg-highlight text-primary'
            }
          >
            {atom.text}
          </mark>
        ) : (
          <Fragment key={index}>{atom.text}</Fragment>
        ),
      )}
    </>
  )
}

function HighlightSpan({
  meetingId,
  highlight,
  atoms,
  activeMatch,
}: {
  meetingId: number
  highlight: HighlightOut
  atoms: readonly SegmentAtom[]
  activeMatch: number
}) {
  const [open, setOpen] = useState(false)
  const [draftNote, setDraftNote] = useState(highlight.note ?? '')
  const update = useUpdateHighlight(meetingId)
  const remove = useDeleteHighlight(meetingId)

  return (
    <Popover
      label="Highlight options"
      side="bottom"
      align="center"
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        // The draft resyncs on OPEN, so a cancelled edit doesn't haunt the
        // next visit; while open, the user's typing owns the field.
        if (next) setDraftNote(highlight.note ?? '')
      }}
      testId={`highlight-popover-${highlight.id}`}
      trigger={
        <span
          role="button"
          tabIndex={0}
          data-testid={`highlight-${highlight.id}`}
          data-color={highlight.color}
          aria-label={`Highlighted: ${highlight.text}. ${
            highlight.note ? `Note: ${highlight.note}. ` : ''
          }Opens highlight options.`}
          title={highlight.note ?? undefined}
          className={cn(
            'cursor-pointer rounded-[2px] underline decoration-2 underline-offset-2',
            HL_CLASSES[highlight.color],
          )}
          // The row's click handler seeks; a highlight click must only open
          // its popover. (The row's guard checks for `button` ELEMENTS, and
          // this is a span precisely so prose selection keeps working.)
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              event.stopPropagation()
              setOpen(true)
            }
          }}
        >
          <Atoms atoms={atoms} activeMatch={activeMatch} />
        </span>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-1" data-testid="highlight-color-row">
          {HIGHLIGHT_COLORS.map((color) => (
            <IconButton
              key={color}
              label={`Set colour to ${color}`}
              size="sm"
              data-testid={`highlight-color-${color}`}
              aria-pressed={highlight.color === color}
              onClick={() => update.mutate({ id: highlight.id, patch: { color } })}
              icon={
                <span
                  aria-hidden="true"
                  className={cn(
                    'block size-4 rounded-full',
                    SWATCH_CLASSES[color],
                    highlight.color === color &&
                      'ring-offset-surface-0 ring-2 ring-accent ring-offset-1',
                  )}
                />
              }
            />
          ))}
          <span className="ml-auto">
            <Button
              variant="ghost"
              size="sm"
              data-testid="highlight-remove"
              leftIcon={<Trash2 size={14} strokeWidth={1.75} />}
              className="text-danger hover:text-danger"
              onClick={() => {
                setOpen(false)
                remove.mutate(highlight.id)
              }}
            >
              Remove
            </Button>
          </span>
        </div>

        <Textarea
          value={draftNote}
          onChange={(event) => setDraftNote(event.target.value)}
          placeholder="Add a note…"
          aria-label="Highlight note"
          data-testid="highlight-note-input"
          rows={2}
          maxLength={500}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            data-testid="highlight-note-save"
            disabled={(draftNote.trim() || null) === (highlight.note ?? null)}
            onClick={() => {
              update.mutate({
                id: highlight.id,
                // Explicit null CLEARS server-side; trimmed text saves.
                patch: { note: draftNote.trim() === '' ? null : draftNote.trim() },
              })
              setOpen(false)
            }}
          >
            Save note
          </Button>
        </div>
      </div>
    </Popover>
  )
}
