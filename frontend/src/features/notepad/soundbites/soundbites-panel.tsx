'use client'

/**
 * The Soundbites flyout (T-33.5, T-33.8, T-33.11).
 *
 * Saved clips first, then the mock provider's three "Magic Soundbite"
 * proposals. Proposals are NOT persisted: saving one POSTs it with
 * `auto_generated: true`; dismissing one is remembered client-side in
 * localStorage keyed by meeting + range, so a dismissal survives reloads
 * without inventing a server-side tombstone for a row that never existed.
 */

import { Play, Sparkles } from 'lucide-react'
import { useMemo } from 'react'

import { Badge } from '@/components/ui/chip'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Skeleton } from '@/components/ui/skeleton'
import { StateView } from '@/components/ui/state-view'
import { useToast } from '@/components/ui/toast'
import {
  useCreateSoundbite,
  useDeleteSoundbite,
  useSoundbiteProposals,
  useSoundbites,
  type CachedSoundbite,
  type SoundbiteProposal,
} from '@/lib/api/soundbites'
import { useTranscript } from '@/lib/api/transcript'
import { useLocalStorage } from '@/lib/hooks/use-local-storage'
import { useNotepadCommands } from '@/lib/notepad/commands'
import { usePlayer } from '@/lib/player/player-context'
import { TOAST_MESSAGES } from '@/lib/toast/messages'
import { formatDuration, formatTimestamp } from '@/lib/utils/format'

import { SoundbiteCard } from './soundbite-card'

interface SoundbitesPanelProps {
  meetingId: number
  /** Set by a `&clip=` deep link or by interacting with a card (T-33.9). */
  selectedId: number | null
  onSelect: (id: number | null) => void
}

/** A proposal's identity is its range — that is what the dismissal remembers. */
function rangeKey(range: { start_ms: number; end_ms: number }): string {
  return `${range.start_ms}-${range.end_ms}`
}

export function SoundbitesPanel({ meetingId, selectedId, onSelect }: SoundbitesPanelProps) {
  const { data, isPending } = useSoundbites(meetingId)
  const { data: proposalData } = useSoundbiteProposals(meetingId)
  const { data: transcript } = useTranscript(meetingId)
  const player = usePlayer()
  const toast = useToast()
  const { seekTo } = useNotepadCommands()
  const create = useCreateSoundbite(meetingId)
  const remove = useDeleteSoundbite(meetingId)

  // Same store-and-degrade pattern as the app prefs (T-30.7): user-writable
  // storage is validated on read, never trusted.
  const { value: dismissedStored, setValue: setDismissed } = useLocalStorage<string[]>(
    `ff.soundbites.dismissed.${meetingId}`,
    [],
  )
  const dismissed = useMemo(
    () =>
      new Set(
        (Array.isArray(dismissedStored) ? dismissedStored : []).filter(
          (entry): entry is string => typeof entry === 'string',
        ),
      ),
    [dismissedStored],
  )

  const segments = useMemo(() => transcript?.segments ?? [], [transcript])
  const speakers = useMemo(() => transcript?.speakers ?? [], [transcript])
  const clips = useMemo(() => data?.items ?? [], [data])

  const proposals = useMemo(() => {
    // A proposal that has been saved (the ranges match a clip) or dismissed is
    // spent — the endpoint is deterministic, so it will propose it forever.
    const saved = new Set(clips.map(rangeKey))
    return (proposalData?.items ?? []).filter(
      (proposal) => !dismissed.has(rangeKey(proposal)) && !saved.has(rangeKey(proposal)),
    )
  }, [proposalData, clips, dismissed])

  const playRange = (startMs: number, endMs: number) => {
    seekTo(startMs, { reveal: true })
    player.playRange(startMs, endMs)
  }

  const saveProposal = (proposal: SoundbiteProposal) => {
    create.mutate(
      {
        title: proposal.title,
        start_ms: proposal.start_ms,
        end_ms: proposal.end_ms,
        auto_generated: true,
      },
      { onSuccess: () => toast.success(TOAST_MESSAGES.soundbiteCreated) },
    )
  }

  const deleteClip = (clip: CachedSoundbite) => {
    // A clip that is mid-playback or selected must not leave ghosts behind.
    const range = player.activeRange
    if (range && range.startMs === clip.start_ms && range.endMs === clip.end_ms) {
      player.clearRange()
    }
    if (selectedId === clip.id) onSelect(null)
    remove.mutate(clip.id, { onSuccess: () => toast.success(TOAST_MESSAGES.soundbiteDeleted) })
  }

  return (
    <div className="space-y-4" data-testid="soundbites-flyout">
      {isPending ? (
        <div className="space-y-3" data-testid="soundbites-flyout-loading">
          <Skeleton className="h-24 w-full rounded-md" />
          <Skeleton className="h-24 w-full rounded-md" />
        </div>
      ) : (
        <>
          {clips.length === 0 ? (
            <StateView
              variant="empty"
              title="No soundbites yet"
              body="Select transcript text to create your first clip."
              className="border-0 py-8"
              testId="soundbites-flyout-empty"
            />
          ) : (
            <div className="space-y-2">
              {clips.map((clip) => (
                <SoundbiteCard
                  key={clip.id}
                  clip={clip}
                  segments={segments}
                  speakers={speakers}
                  selected={clip.id === selectedId}
                  onSelect={() => onSelect(clip.id)}
                  onDelete={() => deleteClip(clip)}
                />
              ))}
            </div>
          )}

          {proposals.length > 0 && (
            <section
              className="space-y-2"
              data-testid="soundbites-proposals"
              aria-label="Suggested soundbites"
            >
              <h3 className="flex items-center gap-1.5 text-label uppercase text-muted">
                <Sparkles size={14} strokeWidth={1.75} className="text-warning" />
                Suggested
              </h3>
              {proposals.map((proposal, index) => (
                <ProposalCard
                  key={rangeKey(proposal)}
                  proposal={proposal}
                  index={index}
                  saving={create.isPending}
                  onPlay={() => playRange(proposal.start_ms, proposal.end_ms)}
                  onSave={() => saveProposal(proposal)}
                  onDismiss={() => setDismissed([...dismissed, rangeKey(proposal)])}
                />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  )
}

function ProposalCard({
  proposal,
  index,
  saving,
  onPlay,
  onSave,
  onDismiss,
}: {
  proposal: SoundbiteProposal
  index: number
  saving: boolean
  onPlay: () => void
  onSave: () => void
  onDismiss: () => void
}) {
  return (
    <div
      className="space-y-2 rounded-md border border-subtle bg-surface-0 p-3"
      data-testid={`soundbite-proposal-${index}`}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-body-strong text-primary">
          {proposal.title}
        </span>
        <Badge variant="warning" testId={`soundbite-proposal-auto-${index}`}>
          <Sparkles size={12} strokeWidth={1.75} />
          Auto
        </Badge>
      </div>

      <span className="tnum block text-xs text-muted">
        {formatTimestamp(proposal.start_ms)} – {formatTimestamp(proposal.end_ms)} ·{' '}
        {formatDuration(proposal.end_ms - proposal.start_ms)}
      </span>

      <div className="flex items-center gap-1.5">
        <IconButton
          size="sm"
          label="Play suggestion"
          icon={<Play size={16} strokeWidth={1.75} />}
          onClick={onPlay}
          data-testid={`soundbite-proposal-play-${index}`}
        />
        <span className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          onClick={onDismiss}
          data-testid={`soundbite-proposal-dismiss-${index}`}
        >
          Dismiss
        </Button>
        <Button
          size="sm"
          variant="secondary"
          loading={saving}
          onClick={onSave}
          data-testid={`soundbite-proposal-save-${index}`}
        >
          Save
        </Button>
      </div>
    </div>
  )
}
