'use client'

/**
 * The filters panel (T-13.3 – T-13.6).
 *
 * DRAFT-THEN-APPLY, not live-apply — pending decision #5, settled in ADR-039.
 * Changes inside the panel are local until `Apply` commits them to the URL;
 * Escape or a click outside discards them and says so.
 */

import { ChevronDown } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox, RadioGroup, Switch } from '@/components/ui/controls'
import { DateInput } from '@/components/ui/input'
import { Popover } from '@/components/ui/popover'
import { SearchInput } from '@/components/ui/search-input'
import { Select } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { TagFilterOptions, type TagsMode } from '@/features/tags/tag-filter-options'
import type { Facets } from '@/lib/api/types'
import { useLocalStorage } from '@/lib/hooks/use-local-storage'
import { cn } from '@/lib/utils/cn'
import { slug } from '@/lib/utils/slug'

import { DATE_PRESET_IDS, DURATION_PRESETS, type DatePresetId } from './filter-presets'

/** The draft the panel edits. A subset of `MeetingFilters` — `q`, sort and page are not here. */
export interface FilterDraft {
  hosts: string[]
  participants: string[]
  datePreset: DatePresetId
  from?: string
  to?: string
  durationPreset: string
  tags: string[]
  /** How multiple tags combine (T-36.8). `or` is the default. */
  tagsMode: TagsMode
  channel?: string
  hasActionItems: boolean
}

interface FiltersPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The APPLIED state, which the draft is seeded from each time the panel opens. */
  applied: FilterDraft
  facets: Facets | undefined
  onApply: (draft: FilterDraft) => void
  onClear: () => void
  activeCount: number
  trigger: React.ReactNode
}

const SECTION_STORAGE_KEY = 'ff.filters.collapsed'

export function FiltersPanel({
  open,
  onOpenChange,
  applied,
  facets,
  onApply,
  onClear,
  activeCount,
  trigger,
}: FiltersPanelProps) {
  const toast = useToast()
  const [draft, setDraft] = useState<FilterDraft>(applied)

  /*
   * The draft is reseeded from the applied state whenever the panel opens.
   *
   * Keyed on `open` rather than on `applied`, because reseeding while the panel
   * is open would wipe the user's in-progress edits the moment anything else
   * touched the URL.
   */
  const [seededFor, setSeededFor] = useState(false)
  if (open !== seededFor) {
    setSeededFor(open)
    if (open) setDraft(applied)
  }

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(applied), [draft, applied])

  const discard = () => {
    if (dirty) {
      // Says so out loud. Silently throwing away six clicks is the worst part
      // of a draft model, and one line of feedback removes it.
      toast.info('Filters not applied')
    }
    onOpenChange(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : discard())}
      label="Filters"
      align="start"
      testId="filters-panel"
      className="w-panel p-0"
      trigger={trigger}
    >
      <div className="flex max-h-[min(560px,70vh)] flex-col">
        <div className="min-h-0 flex-1 divide-y divide-subtle overflow-y-auto">
          <MultiSelectSection
            name="host"
            title="Host"
            options={facets?.hosts ?? []}
            selected={draft.hosts}
            onChange={(hosts) => setDraft({ ...draft, hosts })}
          />

          <MultiSelectSection
            name="participants"
            title="Participants"
            // AND semantics: "all of these attended", not "any of them".
            hint="Meetings all of these people attended"
            options={facets?.participants ?? []}
            selected={draft.participants}
            onChange={(participants) => setDraft({ ...draft, participants })}
          />

          <Section name="date" title="Date range">
            <RadioGroup
              label="Date range"
              value={draft.datePreset}
              onValueChange={(value) =>
                setDraft({
                  ...draft,
                  datePreset: value as DatePresetId,
                  from: undefined,
                  to: undefined,
                })
              }
              options={DATE_PRESET_IDS.map((id) => ({ value: id, label: labelFor(id) }))}
            />
            {draft.datePreset === 'custom' && (
              <div className="mt-2 flex items-center gap-2">
                <DateInput
                  label="From"
                  value={draft.from ?? ''}
                  onChange={(from) => setDraft({ ...draft, from })}
                  testId="filter-date-from"
                  className="flex-1"
                />
                <DateInput
                  label="To"
                  value={draft.to ?? ''}
                  onChange={(to) => setDraft({ ...draft, to })}
                  testId="filter-date-to"
                  className="flex-1"
                />
              </div>
            )}
          </Section>

          <Section name="duration" title="Duration">
            <RadioGroup
              label="Duration"
              value={draft.durationPreset}
              onValueChange={(durationPreset) => setDraft({ ...draft, durationPreset })}
              options={DURATION_PRESETS.map((preset) => ({
                value: preset.id,
                label: preset.label,
              }))}
            />
          </Section>

          <Section name="tags" title="Tags">
            <TagFilterOptions
              facets={facets}
              selected={draft.tags}
              onChange={(tags) => setDraft({ ...draft, tags })}
              mode={draft.tagsMode}
              onModeChange={(tagsMode) => setDraft({ ...draft, tagsMode })}
            />
          </Section>

          <Section name="channel" title="Channel">
            <Select
              label="Channel"
              hideLabel
              value={draft.channel ?? ''}
              onValueChange={(channel) => setDraft({ ...draft, channel: channel || undefined })}
              options={[
                { value: '', label: 'Any channel' },
                ...(facets?.channels ?? []).map((slug) => ({ value: slug, label: `#${slug}` })),
              ]}
              testId="filter-channel"
              className="w-full"
            />
          </Section>

          <Section name="action-items" title="Action items">
            <Switch
              checked={draft.hasActionItems}
              onCheckedChange={(hasActionItems) => setDraft({ ...draft, hasActionItems })}
              label="Has open action items"
              testId="filter-has-action-items"
            />
          </Section>
        </div>

        {/* Sticky footer: with 560px of scrollable sections, Apply must never
            scroll out of reach. */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-subtle p-3">
          <Button
            variant="ghost"
            onClick={() => {
              onClear()
              onOpenChange(false)
            }}
            disabled={activeCount === 0}
            data-testid="filters-clear"
          >
            Clear all
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onApply(draft)
              onOpenChange(false)
            }}
            data-testid="filters-apply"
          >
            Apply
          </Button>
        </div>
      </div>
    </Popover>
  )
}

function labelFor(id: DatePresetId): string {
  return id
    .split('-')
    .map((word, i) => (i === 0 ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(' ')
}

function Section({
  name,
  title,
  hint,
  children,
}: {
  name: string
  title: string
  hint?: string
  children: React.ReactNode
}) {
  // Collapsed state persists, so a user who never filters by participant does
  // not scroll past that section every time.
  const { value: collapsed, setValue: setCollapsed } = useLocalStorage<string[]>(
    SECTION_STORAGE_KEY,
    [],
  )
  const isCollapsed = collapsed.includes(name)

  return (
    <section data-testid={`filter-section-${name}`} className="p-3">
      <Button
        variant="ghost"
        fullWidth
        onClick={() =>
          setCollapsed(isCollapsed ? collapsed.filter((n) => n !== name) : [...collapsed, name])
        }
        aria-expanded={!isCollapsed}
        className="justify-between px-0"
        rightIcon={
          <ChevronDown
            size={16}
            strokeWidth={2}
            className={cn('transition-transform duration-fast', isCollapsed && '-rotate-90')}
          />
        }
      >
        <span className="text-body-strong text-primary">{title}</span>
      </Button>

      {!isCollapsed && (
        <div className="mt-2 space-y-2">
          {hint && <p className="text-sm text-muted">{hint}</p>}
          {children}
        </div>
      )}
    </section>
  )
}

function MultiSelectSection({
  name,
  title,
  hint,
  options,
  selected,
  onChange,
}: {
  name: string
  title: string
  hint?: string
  options: readonly string[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const [search, setSearch] = useState('')

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return term ? options.filter((o) => o.toLowerCase().includes(term)) : options
  }, [options, search])

  return (
    <Section name={name} title={title} hint={hint}>
      {options.length > 6 && (
        <SearchInput
          value={search}
          onChange={setSearch}
          ariaLabel={`Search ${title.toLowerCase()}`}
          placeholder={`Search ${title.toLowerCase()}`}
          testId={`filter-search-${name}`}
        />
      )}

      <div className="max-h-48 space-y-1.5 overflow-y-auto">
        {visible.map((option) => (
          <Checkbox
            key={option}
            checked={selected.includes(option)}
            onCheckedChange={(next) =>
              onChange(next ? [...selected, option] : selected.filter((o) => o !== option))
            }
            label={option}
            testId={`filter-option-${slug(option)}`}
          />
        ))}
        {visible.length === 0 && <p className="text-sm text-muted">No matches.</p>}
      </div>
    </Section>
  )
}
