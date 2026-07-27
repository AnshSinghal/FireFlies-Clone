'use client'

/**
 * The player, shared across the Notepad (T-19.1).
 *
 * The transcript needs the playhead to highlight the active segment, the
 * summary needs it to make timestamps clickable, and the keyboard shortcuts
 * need the transport — all of them siblings, none of them children of the
 * player card. A context is what stops that becoming three copies of the state
 * or a prop threaded through five components.
 *
 * `usePlayer` throws outside the provider rather than returning a null player.
 * A silent no-op player would leave a component rendering a seekbar that does
 * nothing, and that failure is much harder to find than a thrown error.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react'

import { usePlayer as usePlayerEngine, type PlayerApi } from './use-player'

const PlayerContext = createContext<PlayerApi | null>(null)

interface PlayerProviderProps {
  durationMs: number
  src: string | null
  children: ReactNode
}

export function PlayerProvider({ durationMs, src, children }: PlayerProviderProps) {
  const { mediaRef, ...engine } = usePlayerEngine({ durationMs, src })

  /*
   * MEMOISED on the values it actually carries.
   *
   * The spread above builds a new object on every render, and the clock renders
   * ten times a second — so without this, every effect in the app that depends
   * on `player` re-ran ten times a second, whatever it was watching for.
   */
  const player = useMemo(
    () => engine,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the fields ARE the identity
    [
      engine.currentMs,
      engine.durationMs,
      engine.isPlaying,
      engine.rate,
      engine.volume,
      engine.muted,
      engine.bufferedMs,
      engine.hasMedia,
      engine.mediaFailed,
      engine.seek,
      engine.play,
      engine.pause,
      engine.toggle,
      engine.skip,
      engine.setRate,
      engine.setVolume,
      engine.toggleMute,
    ],
  )

  return (
    <PlayerContext.Provider value={player}>
      {/*
        Rendered even with no `src` — the element then requests nothing, and
        keeping it mounted means `mediaRef` is never null on the render where
        playback starts.

        It lives HERE, next to the engine that drives it, rather than in the
        player card. A video meeting would want it visible inside the card
        instead; nothing in this build has one, and inventing the slot for a
        case that does not exist would be guessing at its shape.
      */}
      <audio
        ref={mediaRef as React.RefObject<HTMLAudioElement>}
        src={src ?? undefined}
        preload="metadata"
        className="hidden"
        data-testid="player-media"
      />
      {children}
    </PlayerContext.Provider>
  )
}

export function usePlayer(): PlayerApi {
  const player = useContext(PlayerContext)
  if (!player) throw new Error('usePlayer must be used inside a <PlayerProvider>')
  return player
}

/**
 * The playhead for components that only WATCH it.
 *
 * Same context today, but a distinct call site: when the transcript's re-render
 * cost forces the value to be split off, every consumer that only reads the
 * time is already marked.
 */
export function usePlayhead(): number {
  return usePlayer().currentMs
}
