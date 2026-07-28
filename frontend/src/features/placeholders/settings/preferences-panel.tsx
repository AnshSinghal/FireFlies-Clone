'use client'

/**
 * Preferences — the second genuinely functional tab (T-30.7).
 *
 * Four live settings and one honestly deferred:
 * - default sort / page size → the Notebook's defaults when the URL doesn't
 *   say otherwise (`use-query-params`); an explicit `?sort=` still wins
 * - playback rate → writes the SAME `ff.player.rate` key the player already
 *   persists (T-19.6), so the two surfaces can never disagree
 * - autoplay → whether opening a meeting starts playback (player-card)
 * - date format → stored nowhere yet, so it says `Soon` instead of lying
 */

import { SettingCard, SettingGroup } from './setting-card'
import { Badge } from '@/components/ui/chip'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/controls'
import { SORT_OPTIONS, type SortValue } from '@/lib/meetings/sort-options'
import {
  PREF_KEYS as PLAYER_PREF_KEYS,
  RATES,
  parseRate,
  type PlaybackRate,
} from '@/lib/player/prefs'
import { usePref } from '@/lib/hooks/use-pref'
import {
  PAGE_SIZES,
  useAutoplayPref,
  useDefaultSortPref,
  usePageSizePref,
  type PageSize,
} from '@/lib/prefs/app-prefs'

function usePlaybackRatePref() {
  return usePref<PlaybackRate>(PLAYER_PREF_KEYS.rate, parseRate, String, 1)
}

export function PreferencesPanel() {
  const [defaultSort, setDefaultSort] = useDefaultSortPref()
  const [pageSize, setPageSize] = usePageSizePref()
  const [rate, setRate] = usePlaybackRatePref()
  const [autoplay, setAutoplay] = useAutoplayPref()

  return (
    <section className="space-y-6" data-testid="settings-preferences">
      <header className="space-y-1">
        <h2 className="text-display text-primary">Preferences</h2>
        <p className="text-sm text-secondary">
          Defaults for the Notebook and the player. A link with its own sort or page still wins —
          shared links look the same for everyone.
        </p>
      </header>

      {/*
        Cards, not a flat form — the reference's anatomy (T-46.1 item 10). The
        label moves into the card and the control renders bare via `hideLabel`
        / `ariaLabel`, which both primitives already support.

        This also retires the older hazard recorded here: `Select` renders an
        `inline-flex` span, so three as direct siblings under `space-y-*` flowed
        onto one line and read "Meetings per pagePlayback rate". A `flex` class
        on the Select would have been the obvious fix and the wrong one —
        `inline-flex` and `flex` both set `display` and `cn` does not resolve
        conflicts (ADR-103). Each select now sits alone in a card, so the
        collision cannot recur.
      */}
      <SettingGroup title="Notebook">
        <SettingCard
          title="Default sort"
          description="How the meetings list is ordered when no sort is in the URL."
          control={
            <Select
              label="Default sort"
              hideLabel
              value={defaultSort}
              onValueChange={(value) => setDefaultSort(value as SortValue)}
              options={SORT_OPTIONS.map((option) => ({ ...option }))}
              testId="settings-default-sort"
              className="w-full"
            />
          }
        />

        <SettingCard
          title="Meetings per page"
          description="Rows per page before pagination."
          control={
            <Select
              label="Meetings per page"
              hideLabel
              value={String(pageSize)}
              onValueChange={(value) => setPageSize(Number(value) as PageSize)}
              options={PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) }))}
              testId="settings-page-size"
              className="w-full"
            />
          }
        />

        <SettingCard
          title="Date format"
          description="Relative (“Yesterday”) or absolute dates."
          trailing={
            <Badge variant="neutral" testId="settings-date-format-soon">
              Soon
            </Badge>
          }
        />
      </SettingGroup>

      <SettingGroup title="Player">
        <SettingCard
          title="Playback rate"
          description="The speed a meeting starts at."
          control={
            <Select
              label="Playback rate"
              hideLabel
              value={String(rate)}
              onValueChange={(value) => setRate(parseRate(value))}
              options={RATES.map((value) => ({ value: String(value), label: `${value}×` }))}
              testId="settings-playback-rate"
              className="w-full"
            />
          }
        />

        <SettingCard
          title="Autoplay on open"
          description="Start playback when you open a meeting."
          trailing={
            <Switch
              checked={autoplay}
              onCheckedChange={setAutoplay}
              ariaLabel="Autoplay on open"
              testId="settings-autoplay"
            />
          }
        />
      </SettingGroup>
    </section>
  )
}
