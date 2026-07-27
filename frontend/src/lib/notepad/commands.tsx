'use client'

/**
 * The Notepad's command bus (T-21.8).
 *
 * Five things seek: a transcript line, a transcript timestamp, an outline
 * chapter, a chapter tick on the seekbar, and a `?t=` link — with comments,
 * soundbites and search results to come. Written five times, they drift: one
 * starts playback and another does not, one scrolls the transcript and another
 * leaves it where it was, and the difference is invisible until someone
 * notices the app behaves differently depending on which timestamp they
 * clicked.
 *
 * So there is exactly one: `seekTo`.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { usePlayer } from '@/lib/player/player-context'

export interface SeekOptions {
  /** Start playing if paused. A timestamp does; a line does not (T-21.1, T-21.2). */
  play?: boolean
  /**
   * Bring the target into view even if the reader has scrolled away.
   *
   * An outline chapter is an explicit "take me there", so it OVERRIDES the
   * auto-scroll suspension. The playhead moving on its own does not.
   */
  reveal?: boolean
}

interface NotepadCommands {
  seekTo: (ms: number, options?: SeekOptions) => void
  /**
   * Bumped by every `reveal` seek.
   *
   * A counter rather than a boolean: two reveals to the same position must
   * both be observable, and a boolean that is already `true` is not.
   */
  revealNonce: number
}

const CommandsContext = createContext<NotepadCommands | null>(null)

export function NotepadCommandsProvider({ children }: { children: ReactNode }) {
  const player = usePlayer()
  const [revealNonce, setRevealNonce] = useState(0)

  /*
   * The player is read through a REF so `seekTo` can have no dependencies.
   *
   * Depending on `player` looks harmless and is not: the player changes ten
   * times a second with the clock, so `seekTo` did too — and the transcript
   * rows are memoised with a comparator that deliberately ignores callbacks.
   * Every row therefore kept the `seekTo` from the render it mounted on, which
   * was before the audio metadata had loaded, whose `seek` only moved the
   * virtual clock and never touched the media element.
   *
   * The visible symptom: clicking a line while playing jumped the display to
   * the right time and then snapped back a tenth of a second later, as the
   * clock re-read the element that had never been asked to move. While paused
   * it looked correct and silently left the audio behind.
   *
   * Updated in an effect rather than during render, and only ever read from an
   * event handler — by which time the effect has run.
   */
  const playerRef = useRef(player)
  useEffect(() => {
    playerRef.current = player
  }, [player])

  const seekTo = useCallback((ms: number, options?: SeekOptions) => {
    const current = playerRef.current
    current.seek(ms)
    if (options?.play && !current.isPlaying) current.play()
    if (options?.reveal) setRevealNonce((value) => value + 1)
  }, [])

  const value = useMemo(() => ({ seekTo, revealNonce }), [seekTo, revealNonce])

  return <CommandsContext.Provider value={value}>{children}</CommandsContext.Provider>
}

export function useNotepadCommands(): NotepadCommands {
  const commands = useContext(CommandsContext)
  if (!commands) {
    throw new Error('useNotepadCommands must be used inside a <NotepadCommandsProvider>')
  }
  return commands
}
