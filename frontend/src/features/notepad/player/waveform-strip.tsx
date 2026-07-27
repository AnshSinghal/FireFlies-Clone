'use client'

/**
 * The waveform strip (T-19.9).
 *
 * Canvas rather than 400 divs: at this bar count the DOM version costs a
 * measurable amount on every repaint, and none of the bars need to be
 * individually addressable.
 *
 * DECORATIVE, and marked so. The seekbar below it is the accessible control;
 * a screen reader gains nothing from a second slider that reports the same
 * position. Clicking still seeks, because a waveform that ignores clicks is a
 * picture pretending to be a control.
 */

import { useEffect, useRef, useState } from 'react'

import { decodePeaks, pseudoPeaks, readCachedPeaks, writeCachedPeaks } from '@/lib/player/waveform'

interface WaveformStripProps {
  meetingId: number
  /** Decoded when present; falls back to the seeded waveform on any failure. */
  src: string | null
  progress: number
  onSeekRatio: (ratio: number) => void
}

const HEIGHT = 48
const BAR_GAP = 1

export function WaveformStrip({ meetingId, src, progress, onSeekRatio }: WaveformStripProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  /*
   * The cache is read in the INITIALISER, not in an effect.
   *
   * An effect would render the seeded waveform first and replace it a frame
   * later — a visible flicker on every remount, for a value that was already
   * available. Nothing here reaches the server-rendered HTML (the peaks only
   * ever reach a canvas, which is painted in an effect), so there is no
   * hydration mismatch to trade against.
   *
   * This component is KEYED by meeting id at its call site, so opening another
   * meeting remounts it and this runs again.
   */
  const [peaks, setPeaks] = useState<number[]>(
    () => readCachedPeaks(meetingId) ?? pseudoPeaks(meetingId),
  )
  const [width, setWidth] = useState(0)

  /*
   * Repaint on THEME switch (T-38.8).
   *
   * The paint reads its colours from CSS variables at draw time, which makes
   * it theme-correct on mount — but a canvas is pixels, not styles, so nothing
   * re-runs when `data-theme` changes and the strip would stay light on a dark
   * page. Observing the attribute closes that gap.
   */
  const [themeEpoch, setThemeEpoch] = useState(0)
  useEffect(() => {
    const observer = new MutationObserver(() => setThemeEpoch((epoch) => epoch + 1))
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => observer.disconnect()
  }, [])

  // ── Peaks ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (readCachedPeaks(meetingId)) return

    if (!src) {
      // Nothing to decode: the seeded waveform is already in state from the
      // initialiser, so this only records it for the next mount.
      writeCachedPeaks(meetingId, pseudoPeaks(meetingId))
      return
    }

    const controller = new AbortController()

    /*
     * DEFERRED until the browser is idle.
     *
     * Decoding means fetching the whole media file — the same file the
     * `<audio>` element is fetching to start playback. Racing it costs the
     * thing the user actually asked for: press play, and the first seconds go
     * to buffering a download that exists to draw a picture. The strip already
     * shows the seeded waveform, so there is nothing to wait for.
     */
    const start = () =>
      decodePeaks(src, controller.signal)
        .then((decoded) => {
          setPeaks(decoded)
          writeCachedPeaks(meetingId, decoded)
        })
        .catch(() => {
          /*
           * Expected often enough to be the normal path.
           *
           * Chromium builds without proprietary codecs cannot decode AAC at all,
           * and a 3MB fetch can be aborted mid-navigation. Either way the seeded
           * waveform is a perfectly good strip — this is a visual, and failing to
           * decode it is not something to tell the user about.
           */
          setPeaks(pseudoPeaks(meetingId))
        })

    /*
     * `requestIdleCallback` is unavailable in Safari, where a timeout is the
     * same intent with a fixed delay instead of a measured one.
     *
     * Checked with `typeof` rather than truthiness because the DOM types
     * declare it as always present — the check is about the RUNTIME, and the
     * compiler is right that the type says otherwise.
     */
    const hasIdle = typeof window.requestIdleCallback === 'function'
    const handle = hasIdle
      ? window.requestIdleCallback(start, { timeout: 5000 })
      : window.setTimeout(start, 1500)

    return () => {
      controller.abort()
      if (hasIdle) window.cancelIdleCallback(handle)
      else window.clearTimeout(handle)
    }
  }, [meetingId, src])

  // ── Size ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(wrap)
    setWidth(wrap.clientWidth)

    return () => observer.disconnect()
  }, [])

  // ── Paint ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width === 0) return

    const context = canvas.getContext('2d')
    if (!context) return

    // Backing store at device resolution, CSS box at layout resolution —
    // without this the strip is soft on every retina screen.
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(HEIGHT * dpr)
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.clearRect(0, 0, width, HEIGHT)

    /*
     * Read through the DOM so the strip follows the theme: hard-coding the
     * colours here would leave a violet-on-white waveform in dark mode.
     *
     * The fallback is the inherited TEXT colour, not a hex literal. A literal
     * would be a second copy of a palette value living outside tokens.css —
     * which is exactly what the token test forbids, and for good reason: it
     * would go stale silently the first time the palette moved.
     */
    const styles = getComputedStyle(canvas)
    const played = styles.getPropertyValue('--ff-accent').trim() || styles.color
    const unplayed = styles.getPropertyValue('--ff-border-strong').trim() || styles.color

    const barWidth = Math.max(1, width / peaks.length - BAR_GAP)
    const step = width / peaks.length
    const playedUntil = width * progress

    peaks.forEach((peak, index) => {
      const x = index * step
      // A floor of 2px: bars that round to zero leave visual holes that read
      // as missing data rather than as quiet.
      const height = Math.max(2, peak * (HEIGHT - 4))
      const y = (HEIGHT - height) / 2

      context.fillStyle = x + barWidth / 2 <= playedUntil ? played : unplayed
      context.fillRect(x, y, barWidth, height)
    })
    // `themeEpoch` has no reader inside — it exists to re-run this paint when
    // `data-theme` flips, because the colours are read from CSS variables at
    // draw time and a canvas does not restyle itself.
  }, [peaks, width, progress, themeEpoch])

  return (
    <div
      ref={wrapRef}
      data-testid="player-waveform"
      // Decorative: the seekbar carries the semantics (see the note above).
      aria-hidden="true"
      className="w-full cursor-pointer"
      style={{ height: HEIGHT }}
      onPointerDown={(event) => {
        const box = event.currentTarget.getBoundingClientRect()
        if (box.width === 0) return
        onSeekRatio(Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)))
      }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: HEIGHT }} />
    </div>
  )
}
