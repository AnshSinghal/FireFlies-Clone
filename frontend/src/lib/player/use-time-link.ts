'use client'

/**
 * The `?t=` deep link (T-19.12).
 *
 * Two directions, and they must not fight each other. On mount the URL wins:
 * a pasted link is an instruction. After that the PLAYER wins, writing its
 * position back so the address bar always points at what is on screen.
 *
 * Written with `history.replaceState`, never `push`: a player that pushed a
 * history entry every few seconds would make Back useless — thirty presses to
 * leave a page you opened once (ADR-041 covers the same choice for filters).
 */

import { useEffect, useRef } from 'react'

import { parseTimeParam } from '@/lib/utils/format'

/** How often the playing position is written back. */
const WRITE_INTERVAL_MS = 5000

export function useTimeLink({
  currentMs,
  isPlaying,
  ready,
  onSeek,
}: {
  currentMs: number
  isPlaying: boolean
  /** Hold off until the duration is known, or the seek would be clamped to 0. */
  ready: boolean
  onSeek: (ms: number) => void
}): void {
  const applied = useRef(false)
  const lastWrite = useRef(0)

  // ── URL → player, once ────────────────────────────────────────────────────

  useEffect(() => {
    if (!ready || applied.current) return
    applied.current = true

    const ms = parseTimeParam(new URLSearchParams(window.location.search).get('t'))
    if (ms !== null) onSeek(ms)
  }, [ready, onSeek])

  // ── Player → URL, throttled ───────────────────────────────────────────────

  useEffect(() => {
    if (!isPlaying || !applied.current) return

    const seconds = Math.floor(currentMs / 1000)
    const now = currentMs

    /*
     * Throttled on the PLAYHEAD, not on wall-clock time: at 2× the position
     * moves twice as fast and the link should keep up with it.
     *
     * On the ABSOLUTE difference, because a seek backwards moves the playhead
     * behind the last write — and a plain `now - last` comparison would then
     * suppress every write until playback caught back up.
     */
    if (Math.abs(now - lastWrite.current) < WRITE_INTERVAL_MS) return
    lastWrite.current = now

    const url = new URL(window.location.href)
    if (url.searchParams.get('t') === String(seconds)) return

    url.searchParams.set('t', String(seconds))
    window.history.replaceState(window.history.state, '', url)
  }, [currentMs, isPlaying])
}
