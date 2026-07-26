'use client'

/**
 * Global player shortcuts (T-19.11).
 *
 * The hard part is not the bindings, it is knowing when NOT to fire. `Space`
 * inside the transcript search box must type a space; `M` while renaming a
 * speaker must type an M; arrows inside an open menu must move the highlight.
 * A shortcut that steals a keystroke from a text field is worse than no
 * shortcut at all — the user cannot type, and there is nothing on screen
 * explaining why.
 */

import { useEffect } from 'react'

import type { PlayerApi } from './use-player'

const VOLUME_STEP = 0.1
const ARROW_STEP_MS = 5000
const JL_STEP_MS = 10_000

/**
 * Contexts that own the keyboard while they are focused.
 *
 * Menus, dialogs and listboxes are included because Radix puts focus on a
 * ROLE-bearing div, not an input — so the "is it a text field" check alone
 * would let `Space` toggle playback while a menu item is highlighted.
 */
const OWNS_KEYBOARD =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"], [role="menu"], [role="menuitem"], [role="dialog"], [role="listbox"], [role="slider"]'

function typingInto(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest(OWNS_KEYBOARD))
}

interface Options {
  player: PlayerApi
  /** Opens the shortcuts help modal — bound to `?`. */
  onShowHelp: () => void
  /** The element to make fullscreen for `F`. Only meaningful for video. */
  fullscreenTarget?: React.RefObject<HTMLElement | null>
  enabled?: boolean
}

export function usePlayerShortcuts({
  player,
  onShowHelp,
  fullscreenTarget,
  enabled = true,
}: Options): void {
  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (event: KeyboardEvent) => {
      // Modified keystrokes belong to the browser and the OS: ⌘L is the
      // address bar, not "forward ten seconds".
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (typingInto(event.target)) return

      // `?` is Shift+/ on most layouts, so it is checked before the general
      // shift-free rule below.
      if (event.key === '?') {
        event.preventDefault()
        onShowHelp()
        return
      }

      if (event.shiftKey) return

      switch (event.key) {
        case ' ':
        case 'k':
          // Space scrolls the page by default. That is precisely the wrong
          // thing to do to a fixed-chrome workspace.
          event.preventDefault()
          player.toggle()
          return
        case 'ArrowLeft':
          event.preventDefault()
          player.skip(-ARROW_STEP_MS)
          return
        case 'ArrowRight':
          event.preventDefault()
          player.skip(ARROW_STEP_MS)
          return
        case 'j':
          event.preventDefault()
          player.skip(-JL_STEP_MS)
          return
        case 'l':
          event.preventDefault()
          player.skip(JL_STEP_MS)
          return
        case 'ArrowUp':
          event.preventDefault()
          player.setVolume(player.volume + VOLUME_STEP)
          return
        case 'ArrowDown':
          event.preventDefault()
          player.setVolume(player.volume - VOLUME_STEP)
          return
        case 'm':
          event.preventDefault()
          player.toggleMute()
          return
        case 'f': {
          const element = fullscreenTarget?.current
          if (!element) return
          event.preventDefault()
          if (document.fullscreenElement) void document.exitFullscreen()
          // Rejects when the browser refuses (no user gesture, or an iframe
          // without `allowfullscreen`). Nothing useful to say about it.
          else void element.requestFullscreen().catch(() => {})
          return
        }
        default:
          break
      }

      // 0–9 seek to that tenth of the recording — `3` is 30% in.
      if (event.key >= '0' && event.key <= '9') {
        event.preventDefault()
        player.seek((Number(event.key) / 10) * player.durationMs)
      }
    }

    // Bubble phase, so a handler that calls `stopPropagation` — the seekbar's
    // own arrow keys — can keep this from firing a second time.
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, player, onShowHelp, fullscreenTarget])
}

/** The bindings, shared with the help modal so the two cannot drift apart. */
export const SHORTCUTS: Array<{ keys: string; description: string }> = [
  { keys: 'Space / K', description: 'Play or pause' },
  { keys: '← / →', description: 'Back or forward 5 seconds' },
  { keys: 'J / L', description: 'Back or forward 10 seconds' },
  { keys: '↑ / ↓', description: 'Volume up or down' },
  { keys: 'M', description: 'Mute or unmute' },
  { keys: '0 – 9', description: 'Jump to 0%–90% of the recording' },
  { keys: 'F', description: 'Fullscreen (video meetings)' },
  { keys: '?', description: 'Show this list' },
]
