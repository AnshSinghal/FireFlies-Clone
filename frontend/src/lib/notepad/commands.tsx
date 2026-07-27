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

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

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

  const seekTo = useCallback(
    (ms: number, options?: SeekOptions) => {
      player.seek(ms)
      if (options?.play && !player.isPlaying) player.play()
      if (options?.reveal) setRevealNonce((current) => current + 1)
    },
    [player],
  )

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
