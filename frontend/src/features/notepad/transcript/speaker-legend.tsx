'use client'

/**
 * The speaker legend (T-25.7, T-25.8).
 *
 * Coloured dots, names, and each voice's share of the talking. Clicking one
 * filters the transcript to that speaker; clicking it again clears — a toggle
 * rather than a menu, because "just show me what Marcus said" is a thing people
 * do repeatedly and a two-click affordance for it is one click too many.
 *
 * In edit mode the same row opens a rename popover, so the legend is both the
 * filter and the place speakers are managed.
 */

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover } from '@/components/ui/popover'
import type { SpeakerRef } from '@/lib/api/types'
import { cn } from '@/lib/utils/cn'
import { formatDuration, pluralize } from '@/lib/utils/format'
import { getSpeakerColorByIndex } from '@/lib/utils/speaker-color'

interface SpeakerLegendProps {
  speakers: SpeakerRef[]
  /** The speaker the transcript is filtered to, or null. */
  filterId: number | null
  onFilter: (speakerId: number | null) => void
  editing: boolean
  onRename: (speakerId: number, label: string) => void
}

export function SpeakerLegend({
  speakers,
  filterId,
  onFilter,
  editing,
  onRename,
}: SpeakerLegendProps) {
  if (speakers.length === 0) return null

  const totalTalk = speakers.reduce((sum, speaker) => sum + speaker.talk_ms, 0)

  return (
    <div
      data-testid="speaker-legend"
      className="flex shrink-0 flex-wrap items-center gap-1 border-b border-subtle px-4 py-2"
    >
      {speakers.map((speaker) => {
        const share = totalTalk > 0 ? Math.round((speaker.talk_ms / totalTalk) * 100) : 0
        const colour = getSpeakerColorByIndex(speaker.color_index)
        const active = filterId === speaker.id

        const entry = (
          <Button
            variant="ghost"
            size="sm"
            data-testid={`speaker-legend-${speaker.id}`}
            aria-pressed={active}
            onClick={() => (editing ? undefined : onFilter(active ? null : speaker.id))}
            className={cn('gap-1.5', active && 'bg-surface-2 text-primary')}
          >
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: colour }}
            />
            {speaker.label}
            <span className="tnum text-xs text-muted">{share}%</span>
          </Button>
        )

        if (!editing) return <span key={speaker.id}>{entry}</span>

        return (
          <Popover
            key={speaker.id}
            label={`Rename ${speaker.label}`}
            align="start"
            testId="speaker-rename-popover"
            trigger={entry}
          >
            <RenameForm speaker={speaker} onRename={onRename} />
          </Popover>
        )
      })}

      {filterId !== null && (
        <Button
          variant="link"
          onClick={() => onFilter(null)}
          data-testid="speaker-legend-clear"
          className="ml-1 text-xs"
        >
          Show everyone
        </Button>
      )}
    </div>
  )
}

function RenameForm({
  speaker,
  onRename,
}: {
  speaker: SpeakerRef
  onRename: (speakerId: number, label: string) => void
}) {
  const [label, setLabel] = useState(speaker.label)

  const save = () => {
    const trimmed = label.trim()
    if (trimmed && trimmed !== speaker.label) onRename(speaker.id, trimmed)
  }

  return (
    <div className="w-64 space-y-2">
      <Input
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        label="Speaker name"
        data-testid="speaker-rename-input"
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            save()
          }
        }}
      />

      {/*
        The blast radius, stated before the click (T-25.7).

        A rename touches every line this voice has, and the number is the
        difference between "fix a typo" and "I have picked the wrong speaker".
      */}
      <p className="text-xs text-muted" data-testid="speaker-rename-count">
        Renaming will update {pluralize(speaker.segment_count, 'segment')} ·{' '}
        {formatDuration(speaker.talk_ms)} of talking
      </p>

      <Button
        variant="primary"
        size="sm"
        fullWidth
        onClick={save}
        data-testid="speaker-rename-save"
      >
        Rename
      </Button>
    </div>
  )
}
