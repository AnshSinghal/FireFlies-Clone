'use client'

/**
 * The player engine (T-19.1).
 *
 * ONE interface, two transports. When the meeting has media, an `<audio>`
 * element is the clock; when it does not — six of the eight seeded meetings —
 * a virtual clock is. Consumers cannot tell the
 * difference, which is the whole point: the transcript sync, the seekbar, the
 * chapter markers and the keyboard shortcuts are written once and work in both
 * modes. A player that only worked with real audio would be dead on most of
 * this app's data.
 *
 * The TIMELINE is the meeting's `duration_seconds`, never the media file's.
 * The sample audio is 18 minutes of filtered noise attached to a 9-minute
 * meeting; if the file's duration drove the seekbar, the chapter ticks and the
 * transcript would sit in the wrong places.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  DEFAULT_RATE,
  DEFAULT_VOLUME,
  isPlaybackRate,
  parseMuted,
  parseRate,
  parseVolume,
  PREF_KEYS,
  serialiseBoolean,
  serialiseNumber,
  type PlaybackRate,
} from './prefs'
import { usePref } from '@/lib/hooks/use-pref'

/**
 * How often the clock ticks.
 *
 * An interval, not `requestAnimationFrame`. rAF is tied to PAINTING: a
 * backgrounded, occluded or throttled page stops getting frames, and the
 * playhead would freeze while the audio kept going — the two would then
 * disagree by however long the page was out of sight. Audio does not stop when
 * you look away, so its clock must not either.
 *
 * 10Hz because sixty state commits a second would re-render the transcript
 * sixty times a second. The seekbar would visibly step at that rate, so its
 * fill carries a matching linear CSS transition and the browser interpolates
 * between commits: ten updates a second, sixty frames of motion.
 *
 * Every tick works from the elapsed time it MEASURES rather than assuming it
 * ran on schedule, so a throttled interval (browsers clamp hidden tabs to 1Hz)
 * still keeps correct time — it just updates less often while nobody is
 * looking.
 */
const TICK_MS = 100

/** Media that has neither loaded nor errored by now is treated as unavailable. */
const MEDIA_TIMEOUT_MS = 8000

/** `HTMLMediaElement.HAVE_METADATA` — duration known, no data buffered yet. */
const HAVE_METADATA = 1

/** A soundbite's bounds, armed by `playRange` (T-33.6). */
export interface PlaybackRange {
  startMs: number
  endMs: number
}

/**
 * What consumers get. Deliberately WITHOUT the media element's ref: a ref is
 * not render data, and handing one out invites components to read
 * `.current` mid-render. The provider owns the element (see
 * `player-context.tsx`).
 */
export interface PlayerApi {
  currentMs: number
  durationMs: number
  isPlaying: boolean
  rate: PlaybackRate
  volume: number
  muted: boolean
  /** How far the media has buffered, in ms from zero. Full in virtual mode. */
  bufferedMs: number
  /** True when a real media element is driving the clock. */
  hasMedia: boolean
  /** The meeting has media but it could not be loaded or decoded (T-19.14). */
  mediaFailed: boolean
  /** The armed soundbite range, or null when playback is unconstrained. */
  activeRange: PlaybackRange | null
  seek: (ms: number) => void
  play: () => void
  pause: () => void
  toggle: () => void
  skip: (deltaMs: number) => void
  /** Seek to `startMs`, play, and auto-pause at `endMs` (T-33.6). */
  playRange: (startMs: number, endMs: number) => void
  /** Disarm the range without touching playback. */
  clearRange: () => void
  setRate: (rate: PlaybackRate) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
}

/** The engine's own return: the public API plus the element it drives. */
export interface PlayerEngine extends PlayerApi {
  mediaRef: React.RefObject<HTMLMediaElement | null>
}

interface UsePlayerOptions {
  durationMs: number
  /** Absolute or app-relative media URL, or null for the virtual clock. */
  src: string | null
}

export function usePlayer({ durationMs, src }: UsePlayerOptions): PlayerEngine {
  const mediaRef = useRef<HTMLMediaElement | null>(null)

  const [currentMs, setCurrentMs] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [bufferedMs, setBufferedMs] = useState(0)
  const [mediaFailed, setMediaFailed] = useState(false)
  const [mediaReady, setMediaReady] = useState(false)

  // Persisted, and read through `useSyncExternalStore` so the server and the
  // client agree on the first render without a load-then-correct flash.
  const [rate, setRateState] = usePref<PlaybackRate>(
    PREF_KEYS.rate,
    parseRate,
    serialiseNumber,
    DEFAULT_RATE,
  )
  const [volume, setVolumeState] = usePref(
    PREF_KEYS.volume,
    parseVolume,
    serialiseNumber,
    DEFAULT_VOLUME,
  )
  const [muted, setMutedState] = usePref(PREF_KEYS.muted, parseMuted, serialiseBoolean, false)

  // The live clock, kept in a ref so the loop never reads a stale closure and
  // never has to re-subscribe when the time changes.
  const positionRef = useRef(0)

  /**
   * Where a seek is HEADING, while the element is still getting there.
   *
   * Setting `currentTime` starts an asynchronous seek. Until it completes the
   * element keeps reporting the OLD time — so a clock that trusts
   * `currentTime` on its next tick overwrites the new position with the stale
   * one, and the playhead visibly snaps back. Clicking a transcript line while
   * playing did exactly that, and only while playing, because a stopped clock
   * has no tick to undo it with.
   */
  const pendingSeekMs = useRef<number | null>(null)
  const usingMedia = Boolean(src) && mediaReady && !mediaFailed

  /*
   * The soundbite constraint (T-33.6): state for the UI, a ref for the clock.
   *
   * The tick must read the CURRENT range without re-subscribing the interval —
   * the same reason the position lives in `positionRef` — so the ref is the
   * authority and `activeRange` is the committed copy consumers render from.
   */
  const [activeRange, setActiveRange] = useState<PlaybackRange | null>(null)
  const rangeRef = useRef<PlaybackRange | null>(null)

  const clearRange = useCallback(() => {
    if (rangeRef.current === null) return
    rangeRef.current = null
    setActiveRange(null)
  }, [])

  const commit = useCallback(
    (ms: number) => {
      const clamped = Math.max(0, Math.min(ms, durationMs))
      positionRef.current = clamped
      setCurrentMs(clamped)
      return clamped
    },
    [durationMs],
  )

  // ── The clock ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isPlaying) return

    let last = performance.now()

    const tick = () => {
      const now = performance.now()
      const delta = now - last
      last = now

      const media = mediaRef.current
      if (usingMedia && media) {
        if (pendingSeekMs.current !== null && media.seeking) {
          // Mid-seek: the target is the truth, not what the element reports.
          positionRef.current = pendingSeekMs.current
        } else {
          pendingSeekMs.current = null
          positionRef.current = media.currentTime * 1000
        }
      } else {
        // Scaled by rate, so 2× really does cover the meeting in half the time.
        positionRef.current += delta * rate
      }

      /*
       * Range-constrained playback (T-33.6): the clip's end is checked the
       * same way the track's end is below — in the clock, against the measured
       * position. NOT a `setTimeout`: a timer armed at play time drifts from
       * the transport the moment the rate changes, the media stalls, or the
       * user pauses mid-clip, and it would fire at a wall-clock moment that no
       * longer corresponds to the position it was scheduled for.
       */
      const range = rangeRef.current
      if (range && positionRef.current >= range.endMs) {
        commit(range.endMs)
        setIsPlaying(false)
        media?.pause()
        clearRange()
        return
      }

      if (positionRef.current >= durationMs) {
        commit(durationMs)
        setIsPlaying(false)
        media?.pause()
        // A range that reached the end of the track is finished either way.
        clearRange()
        return
      }

      setCurrentMs(positionRef.current)

      if (media?.buffered.length) {
        // The end of the range the playhead is INSIDE — what is playable from
        // here, not the total downloaded across all ranges.
        let end = 0
        for (let i = 0; i < media.buffered.length; i += 1) {
          if (media.buffered.start(i) <= media.currentTime) end = media.buffered.end(i)
        }
        setBufferedMs(end * 1000)
      }
    }

    const timer = window.setInterval(tick, TICK_MS)
    return () => window.clearInterval(timer)
  }, [isPlaying, usingMedia, rate, durationMs, commit, clearRange])

  // ── Media element wiring ──────────────────────────────────────────────────

  useEffect(() => {
    if (!src) return

    const media = mediaRef.current
    if (!media) return

    const onReady = () => setMediaReady(true)

    /*
     * Checked as well as listened for.
     *
     * `loadedmetadata` can fire BEFORE this effect runs — a cached file is
     * ready almost immediately — and an event that has already happened never
     * arrives again. Without this the element would stay "not ready" forever
     * on exactly the fast path it was meant to reward.
     */
    if (media.readyState >= HAVE_METADATA) setMediaReady(true)

    const onError = () => {
      // A 404, an unsupported codec (headless Chromium ships no AAC), a
      // decode failure — all of them land here, and all of them mean the same
      // thing to the user: fall back to the timeline (T-19.14).
      setMediaFailed(true)
      setMediaReady(false)
    }

    media.addEventListener('loadedmetadata', onReady)
    media.addEventListener('error', onError)

    // Some failures are silent: a request that hangs fires neither event, and
    // the play button would sit there doing nothing forever.
    const timer = window.setTimeout(() => {
      if (media.readyState === 0) setMediaFailed(true)
    }, MEDIA_TIMEOUT_MS)

    return () => {
      media.removeEventListener('loadedmetadata', onReady)
      media.removeEventListener('error', onError)
      window.clearTimeout(timer)
    }
  }, [src])

  // Keep the element's own properties in step with our state.
  useEffect(() => {
    const media = mediaRef.current
    if (!media) return
    media.playbackRate = rate
    media.volume = volume
    media.muted = muted
  }, [rate, volume, muted, usingMedia])

  /*
   * Reconcile the ELEMENT to `isPlaying`, rather than calling `play()` once
   * from the button.
   *
   * The transport can change underneath a player that is already running: press
   * play before the metadata has loaded and the virtual clock starts, then
   * `loadedmetadata` arrives, `usingMedia` flips to true, and the clock begins
   * reading `currentTime` from an element nobody ever started — the playhead
   * snaps back to zero and freezes there. A one-shot call in the handler cannot
   * see that transition; an effect that depends on it can.
   */
  useEffect(() => {
    const media = mediaRef.current
    if (!usingMedia || !media) return

    if (isPlaying && media.paused) {
      // Hand the virtual clock's position over, so taking control mid-playback
      // continues from where the user actually is.
      pendingSeekMs.current = positionRef.current
      media.currentTime = positionRef.current / 1000
      void media.play().catch(() => setMediaFailed(true))
    } else if (!isPlaying && !media.paused) {
      media.pause()
    }
  }, [isPlaying, usingMedia])

  // ── Actions ───────────────────────────────────────────────────────────────

  const play = useCallback(() => {
    // Replaying from the end restarts rather than sitting stuck at the finish.
    if (positionRef.current >= durationMs) commit(0)
    // Only the flag: the effect above drives the element from it.
    setIsPlaying(true)
  }, [durationMs, commit])

  const pause = useCallback(() => {
    setIsPlaying(false)
    // Commit the live position so the display matches where it stopped.
    setCurrentMs(positionRef.current)
  }, [])

  const toggle = useCallback(() => {
    if (isPlaying) pause()
    else play()
  }, [isPlaying, play, pause])

  const seek = useCallback(
    (ms: number) => {
      const target = commit(ms)

      /*
       * A seek OUTSIDE the armed range cancels the constraint (T33-F).
       *
       * Scrubbing away from a clip is the user leaving it, and playback must
       * continue normally rather than auto-pausing at a boundary that no
       * longer means anything. A seek WITHIN the range — nudging around inside
       * the clip — keeps it, so previewing stays constrained while trimming.
       */
      const range = rangeRef.current
      if (range && (target < range.startMs || target >= range.endMs)) clearRange()

      const media = mediaRef.current
      if (usingMedia && media) {
        pendingSeekMs.current = target
        media.currentTime = target / 1000
      }
    },
    [commit, usingMedia, clearRange],
  )

  const skip = useCallback((deltaMs: number) => seek(positionRef.current + deltaMs), [seek])

  const playRange = useCallback(
    (startMs: number, endMs: number) => {
      const start = Math.max(0, Math.min(startMs, durationMs))
      const end = Math.max(0, Math.min(endMs, durationMs))
      if (end <= start) return

      // Seek FIRST: `seek` clears any previously armed range (the new start is
      // usually outside it), so the old constraint can never outlive this call.
      seek(start)

      const range: PlaybackRange = { startMs: start, endMs: end }
      rangeRef.current = range
      setActiveRange(range)
      // The flag directly — `play()`'s restart-from-the-end special case would
      // fight the seek that just happened.
      setIsPlaying(true)
    },
    [durationMs, seek],
  )

  const setRate = useCallback(
    (next: PlaybackRate) => {
      if (!isPlaybackRate(next)) return
      setRateState(next)
    },
    [setRateState],
  )

  const setVolume = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(1, next))
      setVolumeState(clamped)
      // Dragging up from silence unmutes: leaving it muted while the slider
      // says 70% is a control that lies about the state it displays.
      if (clamped > 0) setMutedState(false)
    },
    [setVolumeState, setMutedState],
  )

  const toggleMute = useCallback(() => setMutedState(!muted), [muted, setMutedState])

  return {
    currentMs,
    durationMs,
    isPlaying,
    rate,
    volume,
    muted,
    // Nothing to buffer without a network transport, so the whole track is
    // "available" and the buffered bar simply doesn't show.
    bufferedMs: usingMedia ? bufferedMs : durationMs,
    hasMedia: usingMedia,
    mediaFailed: Boolean(src) && mediaFailed,
    activeRange,
    seek,
    play,
    pause,
    toggle,
    skip,
    playRange,
    clearRange,
    setRate,
    setVolume,
    toggleMute,
    mediaRef,
  }
}
