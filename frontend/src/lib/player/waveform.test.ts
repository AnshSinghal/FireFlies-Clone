import { describe, expect, it } from 'vitest'

import { parseMuted, parseRate, parseVolume } from './prefs'
import { PEAK_COUNT, pseudoPeaks } from './waveform'

describe('pseudoPeaks', () => {
  it('is stable for a given seed', () => {
    // The whole reason this exists rather than `Math.random()`: the strip must
    // be identical across renders, navigations and visual-regression runs.
    expect(pseudoPeaks(7)).toEqual(pseudoPeaks(7))
  })

  it('differs between meetings', () => {
    expect(pseudoPeaks(1)).not.toEqual(pseudoPeaks(2))
  })

  it('produces the requested number of peaks, all within range', () => {
    const peaks = pseudoPeaks(3)
    expect(peaks).toHaveLength(PEAK_COUNT)
    // Outside [0, 1] the canvas would draw bars taller than the strip, which
    // clip into the seekbar above rather than erroring.
    expect(peaks.every((peak) => peak >= 0 && peak <= 1)).toBe(true)
  })

  it('varies in amplitude rather than sitting at one level', () => {
    const peaks = pseudoPeaks(11)
    const min = Math.min(...peaks)
    const max = Math.max(...peaks)
    // A flat strip reads as "no data", which is the failure this guards.
    expect(max - min).toBeGreaterThan(0.3)
  })
})

describe('preference parsing', () => {
  it('accepts only rates the menu can show', () => {
    expect(parseRate('1.5')).toBe(1.5)
    // Hand-edited, corrupted, or written by a build with a different set —
    // all of them fall back rather than leaving the label showing a value no
    // menu item matches.
    expect(parseRate('1.37')).toBe(1)
    expect(parseRate('banana')).toBe(1)
    expect(parseRate(null)).toBe(1)
  })

  it('clamps volume to a real range', () => {
    expect(parseVolume('0.4')).toBe(0.4)
    expect(parseVolume('0')).toBe(0)
    expect(parseVolume('7')).toBe(1)
    expect(parseVolume('-1')).toBe(1)
    expect(parseVolume(null)).toBe(1)
  })

  it('treats anything but the literal "true" as unmuted', () => {
    expect(parseMuted('true')).toBe(true)
    expect(parseMuted('false')).toBe(false)
    expect(parseMuted(null)).toBe(false)
  })
})
