'use client'

/**
 * Smart Search (T-22.10).
 *
 * Four presets over the transcript — what was asked, what was committed to,
 * what the numbers were, when things happen. Pattern matching, not a model, and
 * the panel says so rather than implying an intelligence it does not have.
 */

import { useMemo, useState } from 'react'

import { ToggleChip } from '@/components/ui/chip'
import { ResultRow } from '@/components/ui/media-controls'
import { StateView } from '@/components/ui/state-view'
import { useTranscript } from '@/lib/api/transcript'
import { useNotepadCommands } from '@/lib/notepad/commands'
import { applyPreset, PRESETS, type PresetId } from '@/lib/transcript/smart-search'
import { formatTimestamp } from '@/lib/utils/format'
import { getSpeakerColorByIndex } from '@/lib/utils/speaker-color'

export function SmartSearchPanel({ meetingId }: { meetingId: number }) {
  const { data } = useTranscript(meetingId)
  const { seekTo } = useNotepadCommands()

  const [active, setActive] = useState<PresetId>('questions')

  const segments = useMemo(() => data?.segments ?? [], [data])
  const speakers = useMemo(
    () => new Map((data?.speakers ?? []).map((speaker) => [speaker.id, speaker])),
    [data],
  )

  // Every preset's count, not just the selected one: a tab reading "Metrics"
  // with nothing behind it should say so before it is clicked.
  const counts = useMemo(
    () =>
      new Map(PRESETS.map((preset) => [preset.id, applyPreset(preset, segments).length] as const)),
    [segments],
  )

  const preset = PRESETS.find((entry) => entry.id === active)!
  const results = useMemo(() => applyPreset(preset, segments), [preset, segments])

  return (
    <div data-testid="smart-search-panel" className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((entry) => (
          <ToggleChip
            key={entry.id}
            testId={`smart-search-preset-${entry.id}`}
            selected={entry.id === active}
            onToggle={() => setActive(entry.id)}
          >
            {entry.label}
            <span className="tnum ml-1.5 text-muted">{counts.get(entry.id) ?? 0}</span>
          </ToggleChip>
        ))}
      </div>

      <p className="text-xs text-muted">
        {preset.description}. Matched by pattern, not by a model.
      </p>

      {results.length === 0 ? (
        <StateView
          variant="no-matches"
          title={`No ${preset.label.toLowerCase()} found`}
          body="Another preset may have more."
          className="border-0 py-6"
        />
      ) : (
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto" data-testid="smart-search-results">
          {results.map((segment) => {
            const speaker = speakers.get(segment.speaker_id)
            return (
              <li key={segment.id}>
                <ResultRow
                  data-testid={`smart-search-result-${segment.id}`}
                  // Reveals as well as seeks: a result is an explicit "take me
                  // there", so it overrides the auto-scroll suspension (ADR-064).
                  onClick={() => seekTo(segment.start_ms, { reveal: true })}
                >
                  <span className="flex items-baseline gap-2">
                    <span
                      className="shrink-0 text-xs font-medium"
                      style={{
                        color: speaker ? getSpeakerColorByIndex(speaker.color_index) : undefined,
                      }}
                    >
                      {speaker?.label ?? 'Unknown'}
                    </span>
                    <span className="tnum shrink-0 text-xs text-muted">
                      {formatTimestamp(segment.start_ms)}
                    </span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-sm text-secondary">
                    {segment.text}
                  </span>
                </ResultRow>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
