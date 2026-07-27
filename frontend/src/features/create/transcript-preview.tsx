'use client'

/**
 * The preview step (T-26.7).
 *
 * What the parser found, before anything is written: which rule matched, how
 * many lines, how long, who spoke — and the first few segments rendered the way
 * they will appear. This is the step that makes an upload trustworthy, because
 * it is the one that admits when the timings were guessed.
 */

import { Input } from '@/components/ui/input'
import type { TranscriptPreview } from '@/lib/api/import'
import { STRATEGY_LABELS } from '@/lib/api/import'
import { formatDuration, formatTimestamp, pluralize } from '@/lib/utils/format'

/** Enough to recognise the transcript, not so many the modal becomes it. */
const PREVIEW_ROWS = 5

export function TranscriptPreviewPanel({
  preview,
  renames,
  onRename,
}: {
  preview: TranscriptPreview
  renames: Record<string, string>
  onRename: (from: string, to: string) => void
}) {
  return (
    <div data-testid="create-preview" className="space-y-3 rounded-lg border border-subtle p-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <span className="text-body-strong text-primary" data-testid="create-preview-count">
          {pluralize(preview.segments.length, 'segment')}
        </span>
        <span className="tnum text-muted">{formatDuration(preview.duration_ms)}</span>
        <span className="text-muted" data-testid="create-preview-strategy">
          {STRATEGY_LABELS[preview.strategy] ?? preview.strategy}
        </span>
      </div>

      <div className="space-y-1.5">
        <p className="text-label uppercase text-muted">
          {pluralize(preview.speakers.length, 'speaker')} found
        </p>
        {/*
          Editable HERE, before the meeting exists. A diariser labels voices
          "Speaker 1" and "Speaker 2"; fixing that afterwards means editing a
          transcript, and fixing it now means typing two names.
        */}
        <div className="flex flex-wrap gap-2">
          {preview.speakers.map((speaker, index) => (
            <Input
              key={speaker}
              value={renames[speaker] ?? speaker}
              onChange={(event) => onRename(speaker, event.target.value)}
              aria-label={`Name for ${speaker}`}
              data-testid={`create-speaker-${index}`}
              className="h-8 w-44"
            />
          ))}
        </div>
      </div>

      <ol className="space-y-1.5">
        {preview.segments.slice(0, PREVIEW_ROWS).map((segment, index) => (
          <li
            key={index}
            data-testid={`create-preview-segment-${index}`}
            className="flex gap-2 text-sm"
          >
            <span className="tnum shrink-0 text-muted">{formatTimestamp(segment.start_ms)}</span>
            <span className="shrink-0 font-medium text-primary">
              {renames[segment.speaker] ?? segment.speaker}
            </span>
            <span className="min-w-0 text-secondary">{segment.text}</span>
          </li>
        ))}
      </ol>

      {preview.segments.length > PREVIEW_ROWS && (
        <p className="text-xs text-muted">…and {preview.segments.length - PREVIEW_ROWS} more.</p>
      )}
    </div>
  )
}
