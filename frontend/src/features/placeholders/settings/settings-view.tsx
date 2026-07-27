'use client'

/**
 * Settings shell (T-30.7).
 *
 * A left sub-nav mirroring Fireflies' settings groups, with the genuinely
 * functional tabs — Appearance, Preferences, and Tags (its own route) — and
 * the rest visibly deferred. Working tabs are what separates "placeholder"
 * from "unfinished".
 *
 * The active tab lives in `?tab=`, not component state: every view in this
 * app is shareable by copying the URL, and Back must undo a tab change the
 * same way it undoes a filter change. Plain links, so the browser does the
 * history work. Tags is the exception — a real route at `/settings/tags`
 * (T-36.6), linked from the same nav.
 */

import { useSearchParams } from 'next/navigation'

import { AppearancePanel } from './appearance-panel'
import { PreferencesPanel } from './preferences-panel'
import { APPEARANCE_TAB, SETTINGS_TABS, SettingsNav } from './settings-nav'
import { SoonPanel } from './soon-panel'

export function SettingsView() {
  const searchParams = useSearchParams()
  const requested = searchParams.get('tab')
  // An unknown ?tab= falls back to the first tab rather than a blank panel.
  // Route-backed tabs (Tags) are never active here — they render elsewhere.
  const activeTab = SETTINGS_TABS.find((tab) => tab.id === requested && !tab.href) ?? APPEARANCE_TAB
  const active = activeTab.id

  return (
    <div className="flex flex-col gap-6 py-6 md:flex-row" data-testid="settings-view">
      <SettingsNav active={active} />

      {/*
        `mx-auto max-w-xl` on the BODY, not on each panel.

        Measured against `docs/reference/fireflies/07.png` (T-46.1): Fireflies
        constrains its settings measure too — the card group spans 927px of a
        1608px column, 57.6%, with gutters equal within 3% (336 and 345). Ours
        was a 384px `max-w-sm` form in a 953px column, flush left: a 0px gutter
        against a 570px one. Not a margin, a page that looks like it stopped
        rendering.

        576px here is 60.4% of the column with symmetric ~188px gutters, which
        puts the measure and the symmetry where the reference has them. The
        panels no longer set their own width — one place decides it, so a new
        tab cannot reintroduce the asymmetry by forgetting.
      */}
      <div className="mx-auto w-full min-w-0 max-w-xl flex-1">
        {active === 'appearance' && <AppearancePanel />}
        {active === 'preferences' && <PreferencesPanel />}
        {activeTab.soon && <SoonPanel tab={activeTab} />}
      </div>
    </div>
  )
}
