'use client'

/**
 * The participants token input (T-27.3).
 *
 * Tokens rather than a comma-separated string, because a name can contain a
 * comma ("Chen, Sarah" is how some directories export) and because a list you
 * have to re-type to remove one entry from is a list nobody edits.
 */

import { X } from 'lucide-react'
import { useState } from 'react'

import { Avatar } from '@/components/ui/avatar'
import { IconButton } from '@/components/ui/icon-button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils/cn'

interface ParticipantEditorProps {
  names: string[]
  /** Who is mapped to a voice in the transcript — removing them warns first. */
  speakerNames: string[]
  onChange: (names: string[]) => void
}

export function ParticipantEditor({ names, speakerNames, onChange }: ParticipantEditorProps) {
  const [entry, setEntry] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)

  const add = () => {
    const name = entry.trim()
    if (!name) return

    // Blocked, not silently dropped: a list that ignores what was typed is a
    // list the user has to check against their own memory.
    if (names.some((existing) => existing.toLowerCase() === name.toLowerCase())) {
      setError(`${name} is already a participant`)
      return
    }

    onChange([...names, name])
    setEntry('')
    setError(null)
  }

  const remove = (name: string) => {
    /*
     * Removing somebody who SPEAKS in the transcript is warned about first
     * (T-27.3).
     *
     * Their lines do not disappear — the speaker stays — but the link between
     * the voice and the person does, and that link is what the talk-time bars
     * and action-item assignments are built on.
     */
    if (speakerNames.includes(name) && confirming !== name) {
      setConfirming(name)
      return
    }

    onChange(names.filter((existing) => existing !== name))
    setConfirming(null)
  }

  return (
    <div className="space-y-2" data-testid="edit-participants">
      <p className="text-label uppercase text-muted">Participants</p>

      <div className="flex flex-wrap gap-1.5">
        {names.map((name, index) => (
          <span
            key={name}
            data-testid={`edit-participant-token-${index}`}
            // The bare name: `innerText` also picks up the avatar's initials,
            // so "Sarah Chen" reads as "SCSarah Chen".
            data-name={name}
            className={cn(
              'flex items-center gap-1.5 rounded-full bg-surface-2 py-0.5 pl-0.5 pr-1 text-sm text-primary',
              confirming === name && 'ring-warning ring-2',
            )}
          >
            <Avatar name={name} size="sm" />
            {name}
            <IconButton
              label={`Remove ${name}`}
              size="sm"
              icon={<X size={14} strokeWidth={2} />}
              onClick={() => remove(name)}
              data-testid={`edit-participant-remove-${index}`}
              hideTooltip
            />
          </span>
        ))}
      </div>

      {confirming && (
        <p role="alert" data-testid="edit-participant-warning" className="text-sm text-warning">
          {confirming} is mapped to a voice in the transcript. Removing them keeps their lines but
          unlinks the person — press ✕ again to confirm.
        </p>
      )}

      <Input
        value={entry}
        onChange={(event) => {
          setEntry(event.target.value)
          setError(null)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') {
            // A comma commits the token rather than being typed into it, which
            // is what makes this feel like a token input.
            event.preventDefault()
            add()
          } else if (event.key === 'Backspace' && !entry && names.length > 0) {
            remove(names[names.length - 1]!)
          }
        }}
        onBlur={add}
        aria-label="Add a participant"
        placeholder="Add someone and press Enter"
        error={error ?? undefined}
        data-testid="edit-participant-input"
      />
    </div>
  )
}
