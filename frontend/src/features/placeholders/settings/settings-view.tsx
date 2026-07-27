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

      <div className="min-w-0 flex-1">
        {active === 'appearance' && <AppearancePanel />}
        {active === 'preferences' && <PreferencesPanel />}
        {activeTab.soon && <SoonPanel tab={activeTab} />}
      </div>
    </div>
  )
}
