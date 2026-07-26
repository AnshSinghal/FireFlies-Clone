'use client'

/**
 * The ⌘K binding (T-06.11, T-08.4).
 *
 * Registered in one place, before the transcript find bar in T-22 claims ⌘F, so
 * the two shortcuts are designed against each other rather than discovered in
 * conflict.
 *
 * **This is a shortcut, not a piece of state.** The first version owned an
 * `isOpen` boolean and the search field mirrored it into its own state in an
 * effect. That is a cascading render, and worse, it let the two copies
 * disagree: clicking outside closed the field but left the flag true, so the
 * next ⌘K toggled the stale flag to false and appeared to do nothing. Firing a
 * callback means there is exactly one copy of "is the search open", owned by
 * the component that renders it.
 */

import { useEffect, useRef } from 'react'

/** True when focus is somewhere that a bare keystroke means text, not a command. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

interface CommandShortcutHandlers {
  /** ⌘K / Ctrl+K. */
  onTrigger: () => void
  /** Escape, from anywhere in the window. */
  onEscape?: () => void
}

export function useCommandPalette({ onTrigger, onEscape }: CommandShortcutHandlers) {
  // Handlers are read through a ref so a caller can pass inline arrows without
  // re-registering the window listener on every render.
  const handlers = useRef({ onTrigger, onEscape })
  useEffect(() => {
    handlers.current = { onTrigger, onEscape }
  })

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // `preventDefault` because Firefox binds ⌘K to its own search bar, which
      // would otherwise steal the keystroke.
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        handlers.current.onTrigger()
        return
      }

      if (event.key === 'Escape') handlers.current.onEscape?.()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
