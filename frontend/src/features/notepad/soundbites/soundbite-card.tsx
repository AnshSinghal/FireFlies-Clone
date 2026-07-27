'use client'

/**
 * A soundbite card (T-33.4): title, duration badge, the speakers who talk in
 * the clip, a 3-line excerpt, and an inline mini-player whose play button runs
 * ONLY the clip's range — the ❌ the spec calls out is a "soundbite" that just
 * plays the whole meeting from a timestamp.
 *
 * The excerpt and speakers are DERIVED from the transcript already in the
 * query cache — the API sends only the range (T-33's contract), so the client
 * owns this presentation.
 */

import { Download, Link2, Pause, Play, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'

import { AvatarGroup } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/chip'
import { IconButton } from '@/components/ui/icon-button'
import { useToast } from '@/components/ui/toast'
import { Tooltip } from '@/components/ui/tooltip'
import type { CachedSoundbite } from '@/lib/api/soundbites'
import type { SegmentOut, SpeakerRef } from '@/lib/api/types'
import { useNotepadCommands } from '@/lib/notepad/commands'
import { usePlayer } from '@/lib/player/player-context'
import { TOAST_MESSAGES } from '@/lib/toast/messages'
import { cn } from '@/lib/utils/cn'
import { getSpeakerColorByIndex } from '@/lib/utils/speaker-color'
import { formatDuration, formatTimestamp } from '@/lib/utils/format'

interface SoundbiteCardProps {
  clip: CachedSoundbite
  segments: SegmentOut[]
  speakers: SpeakerRef[]
  selected: boolean
  onSelect: () => void
  onDelete: () => void
}

export function SoundbiteCard({
  clip,
  segments,
  speakers,
  selected,
  onSelect,
  onDelete,
}: SoundbiteCardProps) {
  const player = usePlayer()
  const toast = useToast()
  const { seekTo } = useNotepadCommands()
  const rootRef = useRef<HTMLDivElement | null>(null)

  const { people, excerpt } = useMemo(() => {
    const byId = new Map(speakers.map((speaker) => [speaker.id, speaker]))
    const inClip = segments.filter(
      (segment) => segment.start_ms < clip.end_ms && segment.end_ms > clip.start_ms,
    )

    const seen = new Map<number, SpeakerRef>()
    for (const segment of inClip) {
      const speaker = byId.get(segment.speaker_id)
      if (speaker && !seen.has(speaker.id)) seen.set(speaker.id, speaker)
    }

    return {
      people: [...seen.values()].map((speaker) => ({
        name: speaker.label,
        // DB-authoritative colour (ADR-013), same as the transcript rows.
        color: getSpeakerColorByIndex(speaker.color_index),
      })),
      excerpt: inClip.map((segment) => segment.text).join(' '),
    }
  }, [segments, speakers, clip.start_ms, clip.end_ms])

  // A `&clip=` deep link selects the card; bring it into view (T-33.9).
  useEffect(() => {
    if (selected) rootRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const isActive =
    player.activeRange?.startMs === clip.start_ms && player.activeRange?.endMs === clip.end_ms
  const playing = isActive && player.isPlaying
  const clipLength = Math.max(1, clip.end_ms - clip.start_ms)
  const progress = isActive
    ? Math.min(1, Math.max(0, (player.currentMs - clip.start_ms) / clipLength))
    : 0

  const play = () => {
    onSelect()
    // Reveal the clip's start in the transcript the way a chapter click does,
    // then constrain playback to the range (T-33.6).
    seekTo(clip.start_ms, { reveal: true })
    player.playRange(clip.start_ms, clip.end_ms)
  }

  const copyLink = async () => {
    onSelect()
    const url = new URL(window.location.href)
    url.searchParams.set('t', String(Math.floor(clip.start_ms / 1000)))
    url.searchParams.set('clip', String(clip.id))
    try {
      await navigator.clipboard.writeText(url.toString())
      toast.success(TOAST_MESSAGES.linkCopied)
    } catch {
      toast.error(TOAST_MESSAGES.copyFailed)
    }
  }

  return (
    <div
      ref={rootRef}
      data-testid={`soundbite-${clip.id}`}
      data-selected={selected || undefined}
      className={cn(
        'space-y-2 rounded-md border p-3 transition-colors duration-fast',
        selected ? 'border-accent bg-accent-subtle' : 'border-subtle bg-surface-0',
        clip.pending && 'opacity-60',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-body-strong text-primary">{clip.title}</span>
        {clip.auto_generated && (
          // Visually distinct from user clips (T-33.8): amber + sparkle.
          <Badge variant="warning" testId={`soundbite-auto-badge-${clip.id}`}>
            <Sparkles size={12} strokeWidth={1.75} />
            Auto
          </Badge>
        )}
        <Badge shape="count">{formatDuration(clip.end_ms - clip.start_ms)}</Badge>
      </div>

      {people.length > 0 && <AvatarGroup people={people} size="sm" max={4} />}

      {excerpt && <p className="line-clamp-3 text-sm text-secondary">{excerpt}</p>}

      {/* The inline mini-player (T-33.5). */}
      <div className="flex items-center gap-2">
        <IconButton
          size="sm"
          label={playing ? 'Pause soundbite' : 'Play soundbite'}
          icon={
            playing ? <Pause size={16} strokeWidth={1.75} /> : <Play size={16} strokeWidth={1.75} />
          }
          onClick={playing ? player.pause : play}
          data-testid={`soundbite-play-${clip.id}`}
          className={cn(isActive && 'text-accent')}
        />
        <div className="h-1 min-w-0 flex-1 rounded-full bg-surface-2" aria-hidden="true">
          <div className="h-full rounded-full bg-accent" style={{ width: `${progress * 100}%` }} />
        </div>
        <span className="tnum shrink-0 text-xs text-muted">
          {formatTimestamp(clip.start_ms)} – {formatTimestamp(clip.end_ms)}
        </span>
      </div>

      <div className="flex items-center justify-end gap-0.5">
        <IconButton
          size="sm"
          label="Copy link to soundbite"
          icon={<Link2 size={16} strokeWidth={1.75} />}
          onClick={() => void copyLink()}
          disabled={Boolean(clip.pending)}
          data-testid={`soundbite-copy-link-${clip.id}`}
        />
        {/*
          T-33.10: ffmpeg is not installed on this host, so download ships
          disabled with the tooltip explaining why. `aria-disabled` rather than
          `disabled`, because a natively disabled button swallows the pointer
          events the tooltip needs — and the tooltip IS the feature here. No
          onClick, so the control is inert either way.
        */}
        <Tooltip content="Server-side clipping needs ffmpeg, not available on this host">
          <IconButton
            size="sm"
            hideTooltip
            label="Download clip"
            aria-disabled="true"
            icon={<Download size={16} strokeWidth={1.75} />}
            data-testid={`soundbite-download-${clip.id}`}
            className="cursor-not-allowed opacity-50 hover:bg-transparent hover:text-muted"
          />
        </Tooltip>
        <IconButton
          size="sm"
          variant="danger"
          label="Delete soundbite"
          icon={<Trash2 size={16} strokeWidth={1.75} />}
          onClick={onDelete}
          disabled={Boolean(clip.pending)}
          data-testid={`soundbite-delete-${clip.id}`}
        />
      </div>
    </div>
  )
}
