'use client'

/**
 * Appearance — one of the two genuinely functional tabs (T-30.7).
 *
 * Writes the theme preference; `ThemeApplier` (mounted in Providers) applies
 * it to `<html data-theme>` and follows the OS while `system` is selected.
 * This is the user-facing half of T-38's theming.
 */

import { useThemePref, type Theme } from '@/lib/prefs/app-prefs'

import { RadioGroup } from '@/components/ui/controls'

import { SettingCard, SettingGroup } from './setting-card'

const THEME_OPTIONS: ReadonlyArray<{ value: Theme; label: string; description: string }> = [
  { value: 'light', label: 'Light', description: 'The default look.' },
  { value: 'dark', label: 'Dark', description: 'Easier on the eyes in low light.' },
  { value: 'system', label: 'System', description: 'Follows your OS setting, live.' },
]

export function AppearancePanel() {
  const [theme, setTheme] = useThemePref()

  return (
    <section className="space-y-4" data-testid="settings-appearance">
      <header className="space-y-1">
        <h2 className="text-h3 text-primary">Appearance</h2>
        <p className="text-sm text-secondary">How the app looks. Applies immediately.</p>
      </header>

      {/*
        A card, like Preferences and like the reference (T-46.1 item 10).
        Converting only one tab left the two halves of Settings speaking
        different visual languages, which was worse than the flat form both
        started as — and it was visible the moment the captures sat side by
        side, not while reading either file.

        `RadioGroup` needs no change: its `label` is already `aria-label` only
        and never renders, so the visible title moves to the card while the
        accessible name stays put. Third primitive in a row with that seam
        already present (`Select.hideLabel`, `Switch.ariaLabel`).
      */}
      <SettingGroup title="Theme">
        <SettingCard
          title="Colour scheme"
          description="Applies immediately, and tracks your OS while System is selected."
          control={
            <RadioGroup
              label="Theme"
              value={theme}
              onValueChange={(value) => setTheme(value as Theme)}
              options={THEME_OPTIONS}
              testId="settings-theme"
            />
          }
        />
      </SettingGroup>
    </section>
  )
}
