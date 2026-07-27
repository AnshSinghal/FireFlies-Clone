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

      <RadioGroup
        label="Theme"
        value={theme}
        onValueChange={(value) => setTheme(value as Theme)}
        options={THEME_OPTIONS}
        testId="settings-theme"
      />
    </section>
  )
}
