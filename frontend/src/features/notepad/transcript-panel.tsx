'use client'

/**
 * The transcript panel (T-20).
 *
 * The player is a FIXED header and the segments scroll under it (T-19.13),
 * which is why this is a flex column with one scrolling child rather than one
 * scrolling box with a `sticky` element in it. `position: sticky` would work
 * until the first element with `overflow` or a transform appeared between them,
 * and then fail silently.
 */

import { Copy } from 'lucide-react'
import { useCallback, useMemo, useRef } from 'react'

import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { SkeletonText } from '@/components/ui/skeleton'
import { StateView } from '@/components/ui/state-view'
import { useToast } from '@/components/ui/toast'
import { useTranscript } from '@/lib/api/transcript'
import type { SegmentOut } from '@/lib/api/types'
import { usePlayer } from '@/lib/player/player-context'
import { TOAST_MESSAGES } from '@/lib/toast/messages'
import { toPlainText } from '@/lib/transcript/grouping'
import { formatTimestamp, pluralize } from '@/lib/utils/format'

import { PlayerCard } from './player/player-card'
import { SelectionToolbar } from './transcript/selection-toolbar'
import { TranscriptList } from './transcript/transcript-list'

interface TranscriptPanelProps {
  meetingId: number
  /** Resolved media URL, or null when the meeting has none. */
  mediaSrc: string | null
}

export function TranscriptPanel({ meetingId, mediaSrc }: TranscriptPanelProps) {
  const { data, isPending, isError } = useTranscript(meetingId)
  const player = usePlayer()
  const toast = useToast()

  const bodyRef = useRef<HTMLDivElement | null>(null)

  /*
   * Memoised so the empty-array fallbacks are not a NEW array on every render.
   * `copyAll` depends on both, and a fresh identity each time would rebuild it
   * on every clock tick — which in turn defeats the row memoisation downstream.
   */
  const segments = useMemo(() => data?.segments ?? [], [data])
  const speakers = useMemo(() => data?.speakers ?? [], [data])

  const copy = useCallback(
    async (text: string, message: string) => {
      try {
        await navigator.clipboard.writeText(text)
        toast.success(message)
      } catch {
        // Denied permission, or an insecure origin. Silently doing nothing
        // would look like a broken button.
        toast.error(TOAST_MESSAGES.copyFailed)
      }
    },
    [toast],
  )

  const onSeek = useCallback(
    (ms: number, options?: { play?: boolean }) => {
      player.seek(ms)
      // T-21 settles the full bidirectional behaviour. What is already true is
      // that the timestamp starts playback and the row alone does not.
      if (options?.play && !player.isPlaying) player.play()
    },
    [player],
  )

  const onCopyText = useCallback(
    (segment: SegmentOut) => void copy(segment.text, TOAST_MESSAGES.segmentCopied),
    [copy],
  )

  const onCopyLink = useCallback(
    (segment: SegmentOut) => {
      const url = new URL(window.location.href)
      url.searchParams.set('t', String(Math.floor(segment.start_ms / 1000)))
      void copy(url.toString(), TOAST_MESSAGES.linkCopied)
    },
    [copy],
  )

  const onCopyAll = useCallback(() => {
    const labels = new Map(speakers.map((speaker) => [speaker.id, speaker.label]))
    void copy(
      toPlainText(segments, (id) => labels.get(id) ?? 'Unknown speaker', formatTimestamp),
      TOAST_MESSAGES.transcriptCopied,
    )
  }, [segments, speakers, copy])

  return (
    <section
      data-testid="transcript-panel"
      aria-label="Transcript"
      className="flex h-full min-h-0 flex-col border-l border-subtle"
    >
      <div className="shrink-0 p-4 pb-2">
        <PlayerCard meetingId={meetingId} src={mediaSrc} />
      </div>

      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-subtle px-4">
        <h2 className="text-label uppercase text-muted">Transcript</h2>
        {segments.length > 0 && (
          <span className="text-xs text-muted" data-testid="transcript-count">
            {pluralize(segments.length, 'segment')}
          </span>
        )}
        <span className="ml-auto">
          <IconButton
            label="Copy transcript"
            size="sm"
            icon={<Copy size={16} strokeWidth={1.75} />}
            onClick={onCopyAll}
            disabled={segments.length === 0}
            data-testid="transcript-copy-all"
          />
        </span>
      </div>

      <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col">
        {isPending && <SkeletonText lines={14} className="p-5" />}

        {isError && (
          <StateView
            variant="error"
            title="Couldn't load the transcript"
            body="The summary is unaffected — one failing panel does not blank the page."
            className="m-5 border-0"
          />
        )}

        {data && segments.length === 0 && (
          <StateView
            variant="empty"
            testId="transcript-empty"
            title="No transcript available for this meeting"
            body="Upload a recording or a transcript file and it will appear here."
            action={
              <Button variant="primary" asChild>
                <a href="/upload">Upload a transcript</a>
              </Button>
            }
            className="m-5 border-0"
          />
        )}

        {segments.length > 0 && (
          <TranscriptList
            segments={segments}
            speakers={speakers}
            currentMs={player.currentMs}
            isPlaying={player.isPlaying}
            onSeek={onSeek}
            onCopyText={onCopyText}
            onCopyLink={onCopyLink}
          />
        )}
      </div>

      <SelectionToolbar
        containerRef={bodyRef}
        onCopy={(text) => void copy(text, TOAST_MESSAGES.selectionCopied)}
      />
    </section>
  )
}
