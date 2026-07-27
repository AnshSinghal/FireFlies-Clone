'use client'

/**
 * The filters panel's Tags section (T-36.5, T-36.8).
 *
 * A chip cloud with live usage counts and each tag's colour dot, straight from
 * the facets payload — `TagFacet` carries `{id, name, color_index, count}`,
 * so the panel can never offer a tag that matches nothing.
 *
 * Below the cloud, the OR/AND toggle — labelled in words (`Match any` /
 * `Match all`) because "ambiguous filter semantics is a real usability bug"
 * is written into the task.
 */

import { ToggleChip } from '@/components/ui/chip'
import { RadioGroup } from '@/components/ui/controls'
import type { Facets } from '@/lib/api/types'
import { slug } from '@/lib/utils/slug'
import { getTagColor } from '@/lib/utils/tag-color'

export type TagsMode = 'or' | 'and'

interface TagFilterOptionsProps {
  facets: Facets | undefined
  /** Selected tag NAMES — the URL keeps names, not ids, so links stay readable. */
  selected: string[]
  onChange: (tags: string[]) => void
  mode: TagsMode
  onModeChange: (mode: TagsMode) => void
}

export function TagFilterOptions({
  facets,
  selected,
  onChange,
  mode,
  onModeChange,
}: TagFilterOptionsProps) {
  const options = facets?.tags ?? []

  if (options.length === 0) {
    return <p className="text-sm text-muted">No tags yet.</p>
  }

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {options.map((tag) => (
          <ToggleChip
            key={tag.id}
            selected={selected.includes(tag.name)}
            onToggle={() =>
              onChange(
                selected.includes(tag.name)
                  ? selected.filter((t) => t !== tag.name)
                  : [...selected, tag.name],
              )
            }
            testId={`tag-filter-${slug(tag.name)}`}
            icon={
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: getTagColor(tag) }}
              />
            }
          >
            #{tag.name}
            <span className="tnum text-xs text-muted">{tag.count}</span>
          </ToggleChip>
        ))}
      </div>

      {/* Only meaningful once two tags CAN be combined. */}
      {options.length > 1 && (
        <RadioGroup
          label="How multiple tags combine"
          value={mode}
          onValueChange={(value) => onModeChange(value === 'and' ? 'and' : 'or')}
          options={[
            {
              value: 'or',
              label: 'Match any',
              description: 'Meetings with at least one selected tag',
            },
            {
              value: 'and',
              label: 'Match all',
              description: 'Only meetings carrying every selected tag',
            },
          ]}
          testId="filter-tags-mode"
        />
      )}
    </>
  )
}
