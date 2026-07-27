'use client'

/**
 * Keeps `<html data-theme>` in step with the theme preference (T-30.7, the
 * runtime half of T-38's theming).
 *
 * Renders nothing. It subscribes to the same pref bus the Appearance tab
 * writes through, so changing the theme anywhere applies everywhere — and
 * while the preference is `system`, it follows the OS live via matchMedia.
 * First paint is handled separately by the inline boot script in the root
 * layout; this component takes over from there.
 */

import { useEffect } from 'react'

import { resolveTheme, useThemePref } from '@/lib/prefs/app-prefs'

export function ThemeApplier() {
  const [theme] = useThemePref()

  useEffect(() => {
    document.documentElement.dataset.theme = resolveTheme(theme)
    if (theme !== 'system') return

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const follow = () => {
      document.documentElement.dataset.theme = resolveTheme('system')
    }
    media.addEventListener('change', follow)
    return () => media.removeEventListener('change', follow)
  }, [theme])

  return null
}
