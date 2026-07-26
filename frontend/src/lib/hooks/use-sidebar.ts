'use client'

/**
 * Sidebar collapse and mobile-drawer state (T-07.6, T-07.11).
 *
 * Two genuinely different things behind one hook, because they are the same
 * control at different widths: on desktop the toggle collapses the rail to
 * icons; below `md` there is no rail, so it opens a drawer.
 */

import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import { useLocalStorage } from './use-local-storage'

export const SIDEBAR_STORAGE_KEY = 'ff.sidebar.collapsed'

export function useSidebar() {
  const pathname = usePathname()
  const { value: collapsed, setValue: setCollapsed } = useLocalStorage(SIDEBAR_STORAGE_KEY, false)

  /*
   * The drawer records WHICH route it was opened on, and is only considered
   * open while that is still the current route.
   *
   * This is the "adjust state during render" pattern rather than an effect that
   * calls setState on every pathname change — which is what
   * react-hooks/set-state-in-effect objects to, and fairly: the effect version
   * renders the drawer open on the new page for one frame before closing it,
   * which is visible as a flash on a slow device.
   *
   * The behaviour it buys is not optional. Leaving the drawer open over the
   * page you just navigated to means tapping a link appears to do nothing.
   */
  const [drawer, setDrawer] = useState<{ open: boolean; route: string }>({
    open: false,
    route: pathname,
  })

  const drawerOpen = drawer.open && drawer.route === pathname

  const openDrawer = useCallback(() => setDrawer({ open: true, route: pathname }), [pathname])
  const closeDrawer = useCallback(() => setDrawer({ open: false, route: pathname }), [pathname])

  const toggleCollapsed = useCallback(() => setCollapsed(!collapsed), [collapsed, setCollapsed])

  // Escape closes it. Registered on the window rather than the panel so it
  // works regardless of where focus currently sits.
  useEffect(() => {
    if (!drawerOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawer((current) => ({ ...current, open: false }))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [drawerOpen])

  return { collapsed, toggleCollapsed, drawerOpen, openDrawer, closeDrawer }
}
