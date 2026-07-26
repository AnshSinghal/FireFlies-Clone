'use client'

/**
 * Avatar and AvatarGroup (T-10.8).
 *
 * The fallback colour comes from `getSpeakerColor(name)` — the same hash the
 * transcript and the outline use — so a person is the same colour everywhere
 * they appear. That is the whole point of hashing the name rather than using
 * an array index (ADR-013).
 */

import type { ReactNode } from 'react'

import { cn } from '@/lib/utils/cn'
import { getSpeakerColor } from '@/lib/utils/speaker-color'

import { Tooltip } from './tooltip'

export type AvatarSize = 'sm' | 'md' | 'lg'

const SIZE: Record<AvatarSize, string> = {
  sm: 'h-avatar-sm w-avatar-sm text-[10px]',
  md: 'h-avatar-md w-avatar-md text-xs',
  lg: 'h-avatar-lg w-avatar-lg text-sm',
}

/**
 * Up to two characters, uppercase.
 *
 * First and last word rather than the first two — "Priya Raghunathan" is PR,
 * not PR-from-"Pr". A single word gives one letter, because "AL" from "Alex"
 * looks like a surname that is not there.
 */
export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0]!.slice(0, 1).toUpperCase()
  return `${words[0]![0]}${words.at(-1)![0]}`.toUpperCase()
}

interface AvatarProps {
  name: string
  src?: string | null
  size?: AvatarSize
  className?: string
  /** Overrides the hashed colour — for a speaker whose colour the API assigned. */
  color?: string
  testId?: string
}

export function Avatar({ name, src, size = 'md', className, color, testId }: AvatarProps) {
  const background = color ?? getSpeakerColor(name)

  return (
    <span
      data-testid={testId}
      // The name is on the wrapper, not on the image, so the initials fallback
      // is labelled too.
      title={name}
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-medium text-inverse',
        SIZE[size],
        className,
      )}
      style={src ? undefined : { backgroundColor: background }}
    >
      {src ? (
        /* eslint-disable-next-line @next/next/no-img-element -- avatars are
           static local SVGs; next/image's optimisation does nothing for vector
           art and only delays first paint. */
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden="true">{getInitials(name)}</span>
      )}
    </span>
  )
}

interface AvatarGroupProps {
  people: ReadonlyArray<{ name: string; avatar_url?: string | null; color?: string }>
  size?: AvatarSize
  /** Shown before the `+N` overflow chip. */
  max?: number
  /**
   * The TRUE participant count, when `people` is only a preview.
   *
   * The API sends five participants per row but reports the real total, so
   * `+N` must be computed from the total — otherwise a meeting with 24 people
   * shows `+2`. Names are only listed for the ones actually supplied; padding
   * the array with "Participant 6" would put fabricated data in a tooltip.
   */
  total?: number
  className?: string
}

export function AvatarGroup({ people, size = 'md', max = 3, total, className }: AvatarGroupProps) {
  const shown = people.slice(0, max)
  const named = people.slice(max)
  const overflow = Math.max(named.length, (total ?? people.length) - shown.length)

  return (
    <span
      className={cn('inline-flex items-center', className)}
      data-testid="avatar-group"
      // The group reads as one thing — "5 participants" — rather than as five
      // separate images, and the individual names are in each avatar's title.
      role="group"
      aria-label={`${people.length} ${people.length === 1 ? 'participant' : 'participants'}`}
    >
      {shown.map((person, i) => (
        <span
          key={`${person.name}-${i}`}
          // The ring is the surface colour, so overlapping avatars read as
          // separate discs rather than as one blob.
          className={cn('ring-2 ring-surface', i > 0 && '-ml-2')}
          style={{ borderRadius: '9999px' }}
        >
          <Avatar name={person.name} src={person.avatar_url} size={size} color={person.color} />
        </span>
      ))}

      {overflow > 0 && (
        <Tooltip content={<OverflowNames names={named.map((p) => p.name)} total={overflow} />}>
          <span
            data-testid="avatar-overflow"
            tabIndex={0}
            /*
             * The names are on the element itself, not only in the tooltip.
             *
             * This module's own rule, from tooltip.tsx: a tooltip is a
             * SUPPLEMENT, never the only place information lives. It does not
             * exist for touch users and is not reliably announced. So "+21" is
             * a dead end for anyone who cannot hover — the aria-label is what
             * actually makes the hidden participants discoverable, and the
             * tooltip is the sighted-pointer convenience on top.
             */
            aria-label={overflowLabel(
              named.map((p) => p.name),
              overflow,
            )}
            className={cn(
              '-ml-2 inline-flex shrink-0 items-center justify-center rounded-full bg-surface-2 font-medium text-secondary ring-2 ring-surface',
              SIZE[size],
            )}
          >
            +{overflow}
          </span>
        </Tooltip>
      )}
    </span>
  )
}

/** Capped the same way the tooltip is, so the two never disagree. */
const OVERFLOW_NAMES_SHOWN = 10

export function overflowLabel(names: readonly string[], total = names.length): string {
  const shown = names.slice(0, OVERFLOW_NAMES_SHOWN)
  const rest = total - shown.length
  const list = shown.join(', ')
  if (!list) return `${total} more ${total === 1 ? 'participant' : 'participants'}`
  return rest > 0 ? `${list}, and ${rest} more` : list
}

function OverflowNames({ names, total }: { names: string[]; total: number }): ReactNode {
  // Capped, because 21 names in a tooltip is a wall the user cannot scroll.
  const SHOWN = OVERFLOW_NAMES_SHOWN
  const rest = total - Math.min(names.length, SHOWN)

  return (
    <span className="block space-y-0.5">
      {names.slice(0, SHOWN).map((name) => (
        <span key={name} className="block">
          {name}
        </span>
      ))}
      {rest > 0 && <span className="block text-muted">and {rest} more</span>}
      {names.length === 0 && <span className="block text-muted">{total} more</span>}
    </span>
  )
}
