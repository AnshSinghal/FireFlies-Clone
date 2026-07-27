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
        <h2 className="text-h3 text-primary">Preferences</h2>
        <p className="text-sm text-secondary">
          Defaults for the Notebook and the player. A link with its own sort or page still wins —
          shared links look the same for everyone.
        </p>
      </header>

      {/*
        Each control in its own BLOCK wrapper.

        `Select` renders an `inline-flex` span — deliberately, because the
        Notebook toolbar's sort dropdown and the pagination size picker sit
        inline beside other controls. Three of them as direct siblings
        therefore flowed onto one line, and `space-y-*` (a `margin-top` rule)
        does nothing about that: the labels butted together and read as
        "Meetings per pagePlayback rate".

        A `flex` class on the Select would be the obvious fix and the wrong
        one — `inline-flex` and `flex` both set `display`, `cn` deliberately
        does not resolve conflicts, and the winner would be Tailwind's class
        order rather than this file's intent (ADR-103). A wrapper cannot lose
        that argument.
      */}
      <div className="space-y-5">
        <div>
          <Select
            label="Default sort"
            value={defaultSort}
            onValueChange={(value) => setDefaultSort(value as SortValue)}
            options={SORT_OPTIONS.map((option) => ({ ...option }))}
            testId="settings-default-sort"
            className="w-full"
          />
        </div>

        <div>
          <Select
            label="Meetings per page"
            value={String(pageSize)}
            onValueChange={(value) => setPageSize(Number(value) as PageSize)}
            options={PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) }))}
            testId="settings-page-size"
            className="w-full"
          />
        </div>

        <div>
          <Select
            label="Playback rate"
            value={String(rate)}
            onValueChange={(value) => setRate(parseRate(value))}
            options={RATES.map((value) => ({ value: String(value), label: `${value}×` }))}
            testId="settings-playback-rate"
            className="w-full"
          />
        </div>

        <Switch
          checked={autoplay}
          onCheckedChange={setAutoplay}
          label="Autoplay on open"
          description="Start playback when you open a meeting."
          testId="settings-autoplay"
        />

        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-body text-primary">Date format</p>
            <p className="text-sm text-muted">Relative (“Yesterday”) or absolute dates.</p>
          </div>
          <Badge variant="neutral" testId="settings-date-format-soon">
            Soon
          </Badge>
        </div>
      </div>
    </section>
  )
}
