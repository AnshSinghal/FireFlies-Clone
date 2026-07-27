/**
 * `playRange` (T-33.6) at the engine level.
 *
 * Runs the VIRTUAL transport: no media element, position driven by the 100ms
 * interval measuring `performance.now()`. Faking both — the interval through
 * vitest's timers, the clock through a spy — lets the test walk playback
 * deterministically, which is exactly the property the spec's "not a
 * setTimeout" requirement buys: the range end is enforced by the same clock
 * the playhead runs on.
 */

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { usePlayer } from './use-player'

const DURATION_MS = 60_000
const TICK_MS = 100

let now = 0

/**
 * Advance the fake clock and the interval together, one tick at a time.
 *
 * Each tick gets its OWN `act`, so the state a tick commits — the auto-pause
 * at a range end — is flushed and the interval torn down before the next tick
 * fires, exactly as it would be across real frames. One big `act` would keep
 * the cleared interval running and the clock drifting past the pause.
 */
function advance(ms: number): void {
  for (let elapsed = 0; elapsed < ms; elapsed += TICK_MS) {
    act(() => {
      now += TICK_MS
      vi.advanceTimersByTime(TICK_MS)
    })
  }
}

function setup() {
  return renderHook(() => usePlayer({ durationMs: DURATION_MS, src: null }))
}

beforeEach(() => {
  now = 0
  vi.useFakeTimers()
  // The interval callback measures elapsed time rather than trusting its
  // schedule, so the test must drive performance.now in step with the timers.
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('playRange (T-33.6)', () => {
  it('seeks to the start, plays, and reports the armed range', () => {
    const { result } = setup()

    act(() => result.current.playRange(10_000, 15_000))

    expect(result.current.currentMs).toBe(10_000)
    expect(result.current.isPlaying).toBe(true)
    expect(result.current.activeRange).toEqual({ startMs: 10_000, endMs: 15_000 })
  })

  it('auto-pauses at the range end, driven by the clock (T33-E)', () => {
    const { result } = setup()

    act(() => result.current.playRange(10_000, 12_000))
    advance(2_500)

    expect(result.current.isPlaying).toBe(false)
    expect(result.current.currentMs).toBe(12_000)
    expect(result.current.activeRange).toBeNull()
  })

  it('a seek OUTSIDE the range cancels the constraint cleanly (T33-F)', () => {
    const { result } = setup()

    act(() => result.current.playRange(10_000, 20_000))
    advance(1_000)
    act(() => result.current.seek(30_000))

    expect(result.current.activeRange).toBeNull()

    // Normal playback resumes: the position sails past where the range would
    // have ended, without pausing.
    advance(1_000)
    expect(result.current.isPlaying).toBe(true)
    expect(result.current.currentMs).toBeGreaterThan(30_000)
  })

  it('a seek INSIDE the range keeps the constraint', () => {
    const { result } = setup()

    act(() => result.current.playRange(10_000, 20_000))
    act(() => result.current.seek(18_000))

    expect(result.current.activeRange).toEqual({ startMs: 10_000, endMs: 20_000 })

    advance(2_500)
    expect(result.current.isPlaying).toBe(false)
    expect(result.current.currentMs).toBe(20_000)
  })

  it('pausing mid-clip keeps the range armed, so resuming still auto-pauses', () => {
    const { result } = setup()

    act(() => result.current.playRange(10_000, 12_000))
    advance(500)
    act(() => result.current.pause())

    expect(result.current.activeRange).toEqual({ startMs: 10_000, endMs: 12_000 })

    act(() => result.current.play())
    advance(2_500)
    expect(result.current.isPlaying).toBe(false)
    expect(result.current.currentMs).toBe(12_000)
  })

  it('clearRange disarms the constraint without touching playback', () => {
    const { result } = setup()

    act(() => result.current.playRange(10_000, 12_000))
    act(() => result.current.clearRange())

    expect(result.current.activeRange).toBeNull()
    expect(result.current.isPlaying).toBe(true)

    advance(2_500)
    // Past the former end and still going.
    expect(result.current.isPlaying).toBe(true)
    expect(result.current.currentMs).toBeGreaterThan(12_000)
  })

  it('arming a new range replaces the old one', () => {
    const { result } = setup()

    act(() => result.current.playRange(10_000, 20_000))
    act(() => result.current.playRange(30_000, 33_000))

    expect(result.current.currentMs).toBe(30_000)
    expect(result.current.activeRange).toEqual({ startMs: 30_000, endMs: 33_000 })

    advance(3_500)
    expect(result.current.isPlaying).toBe(false)
    expect(result.current.currentMs).toBe(33_000)
  })

  it('clamps the range to the meeting duration', () => {
    const { result } = setup()

    act(() => result.current.playRange(59_000, 90_000))

    expect(result.current.activeRange).toEqual({ startMs: 59_000, endMs: DURATION_MS })

    advance(1_500)
    expect(result.current.isPlaying).toBe(false)
    expect(result.current.currentMs).toBe(DURATION_MS)
    expect(result.current.activeRange).toBeNull()
  })

  it('rejects an empty or inverted range', () => {
    const { result } = setup()

    act(() => result.current.playRange(10_000, 10_000))
    expect(result.current.activeRange).toBeNull()
    expect(result.current.isPlaying).toBe(false)

    act(() => result.current.playRange(20_000, 15_000))
    expect(result.current.activeRange).toBeNull()
    expect(result.current.isPlaying).toBe(false)
  })
})
