'use client'

import { useSyncExternalStore } from 'react'

/**
 * A media query as React state.
 *
 * `useSyncExternalStore` rather than an effect: `matchMedia` IS an external
 * store, and the effect version renders one frame at the wrong breakpoint
 * before correcting itself — visible as a flash of the desktop layout on a
 * phone.
 *
 * The server snapshot is `false`, so server-rendered HTML is the wide layout.
 * That is the right default for a dual-pane workspace, and hydration corrects
 * it before paint on a narrow screen.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (callback) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', callback)
      return () => list.removeEventListener('change', callback)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
