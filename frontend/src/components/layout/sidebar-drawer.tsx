'use client'

/**
 * Off-canvas rail for mobile (T-07.11).
 *
 * Below `md` there is no rail, so the toggle opens this instead. Focus is
 * trapped while open and returned to the toggle on close — without that, a
 * keyboard user tabs straight past the menu into the page behind it, which is
 * both confusing and an axe violation.
 */

import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { SidebarNav } from './sidebar'

interface SidebarDrawerProps {
  open: boolean
  onClose: () => void
  /** Focus returns here on close — normally the toggle that opened it. */
  returnFocusTo?: React.RefObject<HTMLElement | null>
}

export function SidebarDrawer({ open, onClose, returnFocusTo }: SidebarDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const panel = panelRef.current
    if (!panel) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    // Captured now: by cleanup time the ref may point elsewhere.
    const returnTarget = returnFocusTo?.current ?? previouslyFocused

    // Move focus in, so the first Tab lands inside the drawer rather than
    // continuing through the page underneath.
    const focusables = panel.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
    focusables[0]?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return

      const items = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (items.length === 0) return

      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return

      // Wrap at both ends — that is the whole trap.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    panel.addEventListener('keydown', onKeyDown)

    // The page behind must not scroll while the drawer is over it.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      panel.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      // Returning focus is what makes this usable twice in a row.
      returnTarget?.focus()
    }
  }, [open, returnFocusTo])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-drawer md:hidden" data-testid="sidebar-drawer">
      {/* Backdrop. A button rather than a div so it is reachable and
          announced, instead of being an invisible click target. */}
      <button
        type="button"
        aria-label="Close menu"
        data-testid="sidebar-drawer-backdrop"
        onClick={onClose}
        className="bg-primary/40 absolute inset-0"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Main menu"
        className="relative flex h-full w-rail flex-col border-r border-subtle bg-surface-0 shadow-lg"
      >
        <div className="flex h-topbar items-center justify-end px-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            data-testid="sidebar-drawer-close"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors duration-fast hover:bg-surface-hover hover:text-primary"
          >
            <X size={20} strokeWidth={1.75} />
          </button>
        </div>

        <div className="min-h-0 flex-1">
          <SidebarNav inDrawer onNavigate={onClose} />
        </div>
      </div>
    </div>
  )
}
