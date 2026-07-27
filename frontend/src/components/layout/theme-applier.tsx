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
  const [theme, setTheme] = useThemePref()

  /*
   * ⌘⇧L cycles light → dark → system (T-38.9).
   *
   * A CYCLE rather than a light/dark flip, because `system` is a real state —
   * a toggle that can only reach two of the three settings strands keyboard
   * users on whichever third they started in.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) return
      // `code`, not `key`: with Shift held, `key` is "L" but keeps layout
      // quirks; the physical key is the contract the shortcut names.
      if (event.code !== 'KeyL') return

      event.preventDefault()
      const order = ['light', 'dark', 'system'] as const
      setTheme(order[(order.indexOf(theme as (typeof order)[number]) + 1) % order.length]!)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [theme, setTheme])

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
