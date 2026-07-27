'use client'

/**
 * The find bar (T-22.1, T-22.4, T-22.8, T-22.9).
 *
 * Deliberately NOT the browser's find. Native find only sees what is in the
 * DOM, and the transcript is virtualised — it would report three matches in a
 * transcript containing thirty and give no way to reach the rest. Overriding
 * ⌘F is a strong move, so `Escape` closes this and hands the keystroke back.
 */

import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { IconButton } from '@/components/ui/icon-button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import type { SpeakerRef } from '@/lib/api/types'
import { cn } from '@/lib/utils/cn'

interface FindBarProps {
  query: string
  onQueryChange: (query: string) => void
  /** 1-based position of the current match; 0 when there is none. */
  position: number
  total: number
  onStep: (direction: 1 | -1) => void
  onClose: () => void
  speakers: SpeakerRef[]
  speakerId: number | null
  onSpeakerChange: (speakerId: number | null) => void
}

export function FindBar({
  query,
  onQueryChange,
  position,
  total,
  onStep,
  onClose,
  speakers,
  speakerId,
  onSpeakerChange,
}: FindBarProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Focused on open, because the bar exists to be typed into and a user who
  // pressed ⌘F has already committed to typing.
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const empty = query.trim().length > 0 && total === 0

  return (
    <div
      data-testid="transcript-find"
      role="search"
      aria-label="Find in transcript"
      className="flex shrink-0 items-center gap-2 border-b border-subtle bg-surface-1 px-3 py-2"
    >
      <Input
        ref={inputRef}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Find in transcript"
        aria-label="Find in transcript"
        data-testid="transcript-find-input"
        tone={empty ? 'warning' : undefined}
        className="flex-1"
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            onStep(event.shiftKey ? -1 : 1)
          } else if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
          }
        }}
      />

      {speakers.length > 1 && (
        <Select
          label="Speaker"
          hideLabel
          value={speakerId === null ? 'all' : String(speakerId)}
          onValueChange={(value) => onSpeakerChange(value === 'all' ? null : Number(value))}
          testId="transcript-find-speaker"
          options={[
            { value: 'all', label: 'All speakers' },
            ...speakers.map((speaker) => ({ value: String(speaker.id), label: speaker.label })),
          ]}
        />
      )}

      <span
        data-testid="transcript-find-count"
        // `aria-live` because the number changes without the focus moving —
        // stepping through matches would otherwise be silent.
        aria-live="polite"
        className={cn('tnum shrink-0 text-xs', total === 0 ? 'text-muted' : 'text-secondary')}
      >
        {position} of {total}
      </span>

      <IconButton
        label="Previous match"
        size="sm"
        icon={<ChevronUp size={16} strokeWidth={2} />}
        onClick={() => onStep(-1)}
        disabled={total === 0}
        data-testid="transcript-find-prev"
      />
      <IconButton
        label="Next match"
        size="sm"
        icon={<ChevronDown size={16} strokeWidth={2} />}
        onClick={() => onStep(1)}
        disabled={total === 0}
        data-testid="transcript-find-next"
      />
      <IconButton
        label="Close find"
        size="sm"
        icon={<X size={16} strokeWidth={2} />}
        onClick={onClose}
        data-testid="transcript-find-close"
      />

      {empty && (
        // Not a dead end: the word may well be in another meeting, and the
        // cross-meeting search already exists.
        <a
          href={`/search?q=${encodeURIComponent(query.trim())}`}
          data-testid="transcript-find-global"
          className="shrink-0 text-xs text-accent hover:underline"
        >
          Search all meetings →
        </a>
      )}
    </div>
  )
}
