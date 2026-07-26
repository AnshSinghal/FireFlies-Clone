'use client'

/**
 * usePopover — open/close state, click-outside and route-change dismissal
 * (T-08.9), written once because the topbar has three of these and a modal
 * dialog will want a fourth.
 */

import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

interface UsePopoverOptions {
  /** Escape closes it. Off for the search field, which keeps focus behaviour of its own. */
  closeOnEscape?: boolean
  onClose?: () => void
}

export function usePopover<T extends HTMLElement = HTMLDivElement>({
  closeOnEscape = true,
  onClose,
}: UsePopoverOptions = {}) {
  const pathname = usePathname()
  const ref = useRef<T>(null)

  /*
   * Same shape as useSidebar's drawer: the route the popover was opened on is
   * part of the state, so navigating closes it *during render* rather than in
   * an effect that leaves it visible over the new page for a frame.
   */
  const [state, setState] = useState<{ open: boolean; route: string }>({
    open: false,
    route: pathname,
  })
  const open = state.open && state.route === pathname

  const close = useCallback(() => setState({ open: false, route: pathname }), [pathname])
  const show = useCallback(() => setState({ open: true, route: pathname }), [pathname])
  const toggle = useCallback(
    () => setState((s) => ({ open: !(s.open && s.route === pathname), route: pathname })),
    [pathname],
  )

  // `onClose` is called from event handlers, so it must not be a dependency —
  // an inline arrow would otherwise re-register both listeners every render.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && ref.current?.contains(target)) return
      setState({ open: false, route: pathname })
      onCloseRef.current?.()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!closeOnEscape || event.key !== 'Escape') return
      event.stopPropagation()
      setState({ open: false, route: pathname })
      onCloseRef.current?.()
    }

    /*
     * `pointerdown`, not `click`. A click fires after mouseup, so a menu item
     * that unmounts on mousedown never receives it — and pointerdown also
     * dismisses before a drag starts, which is what a native menu does.
     */
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, pathname, closeOnEscape])

  return { open, show, close, toggle, ref }
}
