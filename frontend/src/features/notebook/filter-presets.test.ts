import { describe, expect, it } from 'vitest'

import type { MeetingFilters } from '@/lib/api/query-keys'

import {
  DATE_PRESET_IDS,
  DURATION_PRESETS,
  activeFilterChips,
  datePresetRange,
  draftFromFilters,
  filtersFromDraft,
  recognizeDatePreset,
  recognizeDurationPreset,
} from './filter-presets'
import type { FilterDraft } from './filters-panel'

/** A Monday, so week boundaries are unambiguous. */
const NOW = new Date(2026, 6, 27, 12, 0)

const EMPTY_DRAFT: FilterDraft = {
  hosts: [],
  participants: [],
  datePreset: 'any-time',
  durationPreset: 'any',
  tags: [],
  tagsMode: 'or',
  hasActionItems: false,
}

describe('datePresetRange', () => {
  it('makes Last 7 days seven days, not eight', () => {
    // Six days back PLUS today. The classic off-by-one, and invisible in the
    // UI because the result still looks plausible.
    const range = datePresetRange('last-7-days', NOW)
    expect(range.from).toBe('2026-07-21')
    expect(range.to).toBe('2026-07-27')
  })

  it('makes Last 30 days thirty days', () => {
    const range = datePresetRange('last-30-days', NOW)
    expect(range.from).toBe('2026-06-28')
    expect(range.to).toBe('2026-07-27')
  })

  it('collapses Today and Yesterday to a single day', () => {
    expect(datePresetRange('today', NOW)).toEqual({ from: '2026-07-27', to: '2026-07-27' })
    expect(datePresetRange('yesterday', NOW)).toEqual({ from: '2026-07-26', to: '2026-07-26' })
  })

  it('starts This month on the first', () => {
    expect(datePresetRange('this-month', NOW).from).toBe('2026-07-01')
  })

  it('constrains nothing for Any time or Custom', () => {
    expect(datePresetRange('any-time', NOW)).toEqual({ from: null, to: null })
    expect(datePresetRange('custom', NOW)).toEqual({ from: null, to: null })
  })
})

describe('recognizeDatePreset', () => {
  it('round-trips every preset', () => {
    // This is what makes a shared URL reconstruct the panel: the preset is
    // RECOGNISED from the range rather than stored as a separate marker the
    // server would also have to understand.
    for (const id of DATE_PRESET_IDS) {
      if (id === 'any-time' || id === 'custom') continue
      const range = datePresetRange(id, NOW)
      expect(recognizeDatePreset(range.from ?? undefined, range.to ?? undefined, NOW)).toBe(id)
    }
  })

  it('reports Any time for an unset range', () => {
    expect(recognizeDatePreset(undefined, undefined, NOW)).toBe('any-time')
  })

  it('reports Custom for a range that is not a preset', () => {
    expect(recognizeDatePreset('2026-03-01', '2026-03-09', NOW)).toBe('custom')
  })

  it('reports Custom for a half-open range', () => {
    // `?from=` with no `to=` is a real, hand-writable URL and is not any preset.
    expect(recognizeDatePreset('2026-07-21', undefined, NOW)).toBe('custom')
  })
})

describe('duration presets', () => {
  it('are contiguous and non-overlapping', () => {
    // A meeting must fall in exactly one bucket; overlapping bounds would make
    // two radio options both look correct.
    const bounded = DURATION_PRESETS.filter((p) => p.id !== 'any')
    for (let i = 0; i < bounded.length - 1; i++) {
      expect(bounded[i]!.max).toBe(bounded[i + 1]!.min)
    }
  })

  it('round-trip through recognition', () => {
    for (const preset of DURATION_PRESETS) {
      expect(recognizeDurationPreset(preset.min, preset.max)).toBe(preset.id)
    }
  })
})

describe('filtersFromDraft', () => {
  it('nulls every key it does not set', () => {
    /*
     * The reason this returns nulls rather than a partial object: `setFilter`
     * reads null as "remove". A partial return would leave a cleared filter's
     * parameter in the URL, so the panel would show it off while it was still
     * filtering.
     */
    const params = filtersFromDraft(EMPTY_DRAFT, NOW)
    expect(Object.values(params).every((v) => v === null)).toBe(true)
  })

  it('sends only true for the action-items switch', () => {
    // `false` would filter to meetings with NOTHING outstanding, which is not
    // what an unchecked switch means.
    expect(filtersFromDraft({ ...EMPTY_DRAFT, hasActionItems: false }, NOW).has_action_items).toBe(
      null,
    )
    expect(filtersFromDraft({ ...EMPTY_DRAFT, hasActionItems: true }, NOW).has_action_items).toBe(
      'true',
    )
  })

  it('expands a duration preset into bounds', () => {
    const params = filtersFromDraft({ ...EMPTY_DRAFT, durationPreset: '15-30' }, NOW)
    expect(params.min_duration).toBe('900')
    expect(params.max_duration).toBe('1800')
  })

  it('leaves the open end of a bounded preset unset', () => {
    const params = filtersFromDraft({ ...EMPTY_DRAFT, durationPreset: 'over-60' }, NOW)
    expect(params.min_duration).toBe('3600')
    expect(params.max_duration).toBeNull()
  })

  it('keeps custom dates verbatim', () => {
    const params = filtersFromDraft(
      { ...EMPTY_DRAFT, datePreset: 'custom', from: '2026-01-01', to: '2026-02-01' },
      NOW,
    )
    expect(params.from).toBe('2026-01-01')
    expect(params.to).toBe('2026-02-01')
  })
})

describe('draft ↔ filters round trip', () => {
  it('survives a full round trip', () => {
    const draft: FilterDraft = {
      hosts: ['Sarah Chen'],
      participants: ['Marcus Bell'],
      datePreset: 'last-7-days',
      durationPreset: '30-60',
      tags: ['q3', 'urgent'],
      tagsMode: 'and',
      channel: 'product',
      hasActionItems: true,
    }

    const params = filtersFromDraft(draft, NOW)
    const filters: MeetingFilters = {
      host: params.host as string,
      participant: params.participant as string,
      from: params.from as string,
      to: params.to as string,
      minDuration: Number(params.min_duration),
      maxDuration: Number(params.max_duration),
      tags: params.tags as string[],
      tagsMode: params.tags_mode === 'and' ? 'and' : undefined,
      channel: params.channel as string,
      hasActionItems: params.has_action_items === 'true',
    }

    expect(draftFromFilters(filters, NOW)).toMatchObject({
      hosts: ['Sarah Chen'],
      participants: ['Marcus Bell'],
      datePreset: 'last-7-days',
      durationPreset: '30-60',
      tags: ['q3', 'urgent'],
      tagsMode: 'and',
      channel: 'product',
      hasActionItems: true,
    })
  })

  it('keeps AND out of the URL when it has nothing to combine (T-36.8)', () => {
    // OR is the default and never serialises; AND without tags means nothing.
    expect(filtersFromDraft({ ...EMPTY_DRAFT, tagsMode: 'and' }, NOW).tags_mode).toBeNull()
    expect(
      filtersFromDraft({ ...EMPTY_DRAFT, tags: ['q3'], tagsMode: 'and' }, NOW).tags_mode,
    ).toBe('and')
    expect(filtersFromDraft({ ...EMPTY_DRAFT, tags: ['q3'] }, NOW).tags_mode).toBeNull()
  })
})

describe('activeFilterChips', () => {
  it('produces nothing for an unfiltered view', () => {
    expect(activeFilterChips({}, NOW)).toEqual([])
  })

  it('gives a date chip BOTH keys', () => {
    // Removing "Last 7 days" must clear `from` and `to` together — dropping
    // one would leave a half-range that filters something nobody asked for.
    const [chip] = activeFilterChips({ from: '2026-07-21', to: '2026-07-27' }, NOW)
    expect(chip!.keys).toEqual(['from', 'to'])
    expect(chip!.label).toBe('Last 7 days')
  })

  it('gives each tag its own chip', () => {
    // However tags combine (OR default, AND toggled), removing one chip must
    // not clear the others.
    const chips = activeFilterChips({ tags: ['q3', 'urgent'] }, NOW)
    expect(chips).toHaveLength(2)
    expect(chips.map((c) => c.keys)).toEqual([['tags:q3'], ['tags:urgent']])
  })

  it('names the host rather than showing a bare value', () => {
    expect(activeFilterChips({ host: 'Sarah Chen' }, NOW)[0]!.label).toBe('Host: Sarah Chen')
  })

  it('ignores q, sort and page', () => {
    // The search field and the sort control are already visible; counting them
    // as filters sends the user hunting for something to clear.
    expect(activeFilterChips({ q: 'roadmap', sort: 'title', page: 3 }, NOW)).toEqual([])
  })

  it('gives every chip a unique id', () => {
    const chips = activeFilterChips(
      { host: 'A', participant: 'B', tags: ['x', 'y'], channel: 'c', hasActionItems: true },
      NOW,
    )
    expect(new Set(chips.map((c) => c.id)).size).toBe(chips.length)
  })
})
