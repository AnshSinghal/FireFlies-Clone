'use client'

/**
 * Tag chips (T-36.2).
 *
 * One component for every surface a tag appears on — row, drawer, notepad
 * header, settings — because T36-L asserts the same tag looks identical
 * everywhere. Colour identity is a DOT in the tag's colour rather than a
 * tinted background: the dot reuses the calibrated speaker tokens as-is, so
 * both themes are correct with zero new tokens and no contrast math.
 *
 * With `onFilter` the chip is a real button that applies the tag as a
 * notebook filter (T-36.5); without it, a quiet label.
 */

import { Tooltip } from '@/components/ui/tooltip'
import { Chip, type ChipSize } from '@/components/ui/chip'
import type { TagLike } from '@/lib/api/tags'
import { slug } from '@/lib/utils/slug'
import { getTagColor } from '@/lib/utils/tag-color'

interface TagChipProps {
  tag: TagLike
  size?: ChipSize
  /** Makes the chip a filter button. Receives the tag NAME (no `#`). */
  onFilter?: (name: string) => void
}

export function TagChip({ tag, size = 'md', onFilter }: TagChipProps) {
  return (
    <Chip
      size={size}
      testId={`tag-chip-${slug(tag.name)}`}
      icon={<TagColorDot tag={tag} />}
      onAction={onFilter ? () => onFilter(tag.name) : undefined}
      actionLabel={onFilter ? `Filter meetings by #${tag.name}` : undefined}
    >
      #{tag.name}
    </Chip>
  )
}

export function TagColorDot({ tag }: { tag: TagLike }) {
  return (
    <span
      aria-hidden="true"
      className="h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ backgroundColor: getTagColor(tag) }}
    />
  )
}

interface TagChipListProps {
  tags: readonly TagLike[]
  /** How many chips render before the rest collapse into `+N`. */
  max?: number
  size?: ChipSize
  onFilter?: (name: string) => void
}

/**
 * A row of tag chips with overflow: `max 2 + "+N"` on notebook rows, the full
 * list elsewhere. The `+N` chip carries the hidden names in its tooltip, so
 * the collapse costs a hover rather than a navigation.
 */
export function TagChipList({ tags, max = Infinity, size = 'md', onFilter }: TagChipListProps) {
  if (tags.length === 0) return null

  const shown = tags.slice(0, max)
  const hidden = tags.slice(max)

  return (
    <>
      {shown.map((tag) => (
        <TagChip key={tag.id} tag={tag} size={size} onFilter={onFilter} />
      ))}
      {hidden.length > 0 && (
        <Tooltip content={hidden.map((tag) => `#${tag.name}`).join(' · ')}>
          {/* A span, because Radix's `asChild` trigger needs an element that
              takes its props — Chip deliberately does not spread. */}
          <span className="inline-flex shrink-0">
            <Chip size={size} testId="tag-chip-overflow" className="tnum">
              +{hidden.length}
            </Chip>
          </span>
        </Tooltip>
      )}
    </>
  )
}
