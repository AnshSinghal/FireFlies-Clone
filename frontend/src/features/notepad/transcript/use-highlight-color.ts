'use client'

/**
 * The last highlight colour the reader chose (T-32.2).
 *
 * Persisted, because the point of "applies the last-used colour instantly" is
 * that somebody colour-coding a transcript picks green once and then highlights
 * ten things. Losing it on reload turns a one-click action back into two.
 *
 * Read lazily inside the initialiser rather than in an effect: an effect would
 * render one frame with the wrong swatch, which is visible on the toolbar.
 * `localStorage` is unavailable during SSR, hence the guard rather than a
 * top-level read.
 */

import { useCallback, useState } from 'react'

import {
  asHighlightColor,
  DEFAULT_HIGHLIGHT_COLOR,
  LAST_COLOR_STORAGE_KEY,
  type HighlightColorName,
} from '@/lib/transcript/highlight-colors'

export function useHighlightColor(): [HighlightColorName, (color: HighlightColorName) => void] {
  const [color, setColorState] = useState<HighlightColorName>(() => {
    if (typeof window === 'undefined') return DEFAULT_HIGHLIGHT_COLOR
    try {
      return asHighlightColor(window.localStorage.getItem(LAST_COLOR_STORAGE_KEY)) ?? DEFAULT_HIGHLIGHT_COLOR
    } catch {
      // Blocked storage costs the preference, not the feature.
      return DEFAULT_HIGHLIGHT_COLOR
    }
  })

  const setColor = useCallback((next: HighlightColorName) => {
    setColorState(next)
    try {
      window.localStorage.setItem(LAST_COLOR_STORAGE_KEY, next)
    } catch {
      // As above.
    }
  }, [])

  return [color, setColor]
}
