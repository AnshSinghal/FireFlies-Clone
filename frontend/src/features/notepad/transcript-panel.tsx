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

import { Copy, Pencil, Redo2, Search, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { SkeletonText } from '@/components/ui/skeleton'
import { StateView } from '@/components/ui/state-view'
import { useToast } from '@/components/ui/toast'
import { useRenameSpeaker, useTranscript, useUpdateSegment } from '@/lib/api/transcript'
import type { SegmentOut } from '@/lib/api/types'
import { useNotepadCommands } from '@/lib/notepad/commands'
import { usePlayer } from '@/lib/player/player-context'
import { TOAST_MESSAGES } from '@/lib/toast/messages'
import { activeSegmentIndex, toPlainText } from '@/lib/transcript/grouping'
import { cn } from '@/lib/utils/cn'
import { formatTimestamp, pluralize } from '@/lib/utils/format'

import { PlayerCard } from './player/player-card'
import { FindBar } from './transcript/find-bar'
import { SelectionToolbar } from './transcript/selection-toolbar'
import { SpeakerLegend } from './transcript/speaker-legend'
import { TranscriptList } from './transcript/transcript-list'
import { useEditSession } from './transcript/use-edit-session'
import { useTranscriptSearch } from './transcript/use-transcript-search'

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

  // One seek path for the whole Notepad (T-21.8). The row seeks; the timestamp
  // seeks and plays; neither reaches into the player directly.
  const { seekTo } = useNotepadCommands()

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

  // ── Editing (T-25) ────────────────────────────────────────────────────────

  const updateSegment = useUpdateSegment(meetingId)
  const renameSpeaker = useRenameSpeaker(meetingId)

  const saveSegment = useCallback(
    (id: number, text: string) => updateSegment.mutateAsync({ id, text }),
    [updateSegment],
  )
  const edit = useEditSession({ onSave: saveSegment })

  const [speakerFilter, setSpeakerFilter] = useState<number | null>(null)

  /*
   * The filter is applied HERE rather than in the list, so the match count,
   * the copy action and the row indices all describe the same set of segments.
   * A list that filtered internally would leave the find bar counting matches
   * in lines nobody can see.
   */
  const shown = useMemo(
    () =>
      speakerFilter === null
        ? segments
        : segments.filter((segment) => segment.speaker_id === speakerFilter),
    [segments, speakerFilter],
  )

  const search = useTranscriptSearch(shown)

  /*
   * Resolved HERE so the list can take an index (T-21.4).
   *
   * This component re-renders with the clock either way — it reads
   * `player.currentMs` — but it renders almost nothing. Passing the index down
   * keeps the ten-times-a-second cadence out of the transcript.
   */
  const activeIndex = activeSegmentIndex(shown, player.currentMs)

  /*
   * A keyword clicked in the SUMMARY opens this bar on that term (T-23.2).
   *
   * Driven by a nonce so clicking the same keyword twice works — after the
   * reader has closed the bar, asking for "pricing" again has to reopen it,
   * and a plain `term` comparison would see no change.
   */
  const { findRequest } = useNotepadCommands()
  const appliedFind = useRef(0)
  useEffect(() => {
    if (findRequest.nonce === 0 || findRequest.nonce === appliedFind.current) return
    appliedFind.current = findRequest.nonce
    search.openBar()
    search.setQuery(findRequest.term)
  }, [findRequest, search])

  /*
   * ⌘F opens THIS bar, not the browser's (T-22.1).
   *
   * Overriding a browser shortcut needs a reason, and there is one: native find
   * only sees the DOM, and the transcript is virtualised — it would report
   * three matches in a transcript containing thirty. `Escape` closes this and
   * gives the keystroke back, which is the deal.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'f' || !(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      search.openBar()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [search])

  /*
   * Stepping to a match SEEKS as well (T-22.6), so search doubles as
   * navigation. The current match is a position in the recording, and the
   * player following it is what makes "find the bit about pricing" one action
   * rather than two.
   */
  const currentMatch = search.current >= 0 ? search.matches[search.current] : undefined
  const currentMatchMs = currentMatch?.startMs
  useEffect(() => {
    if (currentMatchMs === undefined) return
    player.seek(currentMatchMs)
  }, [currentMatchMs, player])

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
        <h2 className="shrink-0 text-label uppercase text-muted">Transcript</h2>
        {segments.length > 0 && (
          <span className="shrink-0 text-xs text-muted" data-testid="transcript-count">
            {pluralize(segments.length, 'segment')}
          </span>
        )}
        {edit.editing && (
          <span
            data-testid="transcript-edit-status"
            // Truncated rather than wrapped: this row is a fixed 36px, and a
            // status that wraps pushes the controls onto a second line.
            className="min-w-0 truncate text-xs text-muted"
            // Polite: the status changes while the user is typing, and an
            // assertive region would interrupt them mid-sentence.
            aria-live="polite"
          >
            {edit.status === 'saving'
              ? 'Saving…'
              : edit.status === 'saved'
                ? 'Saved'
                : edit.status === 'error'
                  ? "Couldn't save"
                  : 'Editing — changes save automatically'}
          </span>
        )}

        <span className="ml-auto flex items-center gap-1">
          {edit.editing && (
            <>
              <IconButton
                label="Undo"
                size="sm"
                icon={<Undo2 size={16} strokeWidth={1.75} />}
                onClick={edit.undo}
                disabled={!edit.canUndo}
                data-testid="transcript-undo"
              />
              <IconButton
                label="Redo"
                size="sm"
                icon={<Redo2 size={16} strokeWidth={1.75} />}
                onClick={edit.redo}
                disabled={!edit.canRedo}
                data-testid="transcript-redo"
              />
            </>
          )}
          <IconButton
            label={edit.editing ? 'Done editing' : 'Edit transcript'}
            size="sm"
            icon={<Pencil size={16} strokeWidth={1.75} />}
            onClick={edit.toggle}
            aria-pressed={edit.editing}
            disabled={segments.length === 0}
            data-testid="transcript-edit-toggle"
            className={cn(edit.editing && 'bg-accent-subtle text-accent')}
          />
          <IconButton
            label="Find in transcript"
            size="sm"
            icon={<Search size={16} strokeWidth={1.75} />}
            onClick={search.openBar}
            disabled={segments.length === 0}
            data-testid="transcript-find-open"
          />
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

      {search.open && (
        <FindBar
          query={search.query}
          onQueryChange={search.setQuery}
          position={search.position}
          total={search.matches.length}
          onStep={search.step}
          onClose={search.closeBar}
          speakers={speakers}
          speakerId={search.speakerId}
          onSpeakerChange={search.setSpeakerId}
        />
      )}

      {speakers.length > 0 && (
        <SpeakerLegend
          speakers={speakers}
          filterId={speakerFilter}
          onFilter={setSpeakerFilter}
          editing={edit.editing}
          onRename={(id, label) => renameSpeaker.mutate({ id, label })}
        />
      )}

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

        {shown.length > 0 && (
          <TranscriptList
            meetingId={meetingId}
            segments={shown}
            speakers={speakers}
            activeIndex={activeIndex}
            isPlaying={player.isPlaying}
            onSeek={seekTo}
            onCopyText={onCopyText}
            onCopyLink={onCopyLink}
            editing={edit.editing}
            onEditText={edit.change}
            onCommitEdit={edit.flush}
            onReassign={(id, speakerId) => updateSegment.mutate({ id, speaker_id: speakerId })}
            onRevert={(segment) =>
              segment.original_text !== null &&
              updateSegment.mutate({ id: segment.id, text: segment.original_text })
            }
            matchRanges={search.ranges}
            currentMatch={
              currentMatch
                ? {
                    segmentIndex: currentMatch.segmentIndex,
                    indexInSegment: currentMatch.indexInSegment,
                  }
                : null
            }
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
