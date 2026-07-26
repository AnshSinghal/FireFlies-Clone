'use client'

/**
 * Command palette scaffold (T-06.11).
 *
 * Registered NOW, before the transcript find bar in T-22 claims ⌘F, so the two
 * shortcuts are designed against each other rather than discovered in conflict.
 *
 * The palette itself is wired to global search in T-35; this owns the shortcut
 * and the open/closed state.
 */

import { useCallback, useEffect, useState } from 'react'

/** True when focus is somewhere that a bare keystroke means text, not a command. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // ⌘K / Ctrl+K. `preventDefault` because Firefox binds ⌘K to its own
      // search bar, which would steal the keystroke.
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setIsOpen((current) => !current)
        return
      }

      if (event.key === 'Escape') setIsOpen(false)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return { isOpen, open, close }
}
