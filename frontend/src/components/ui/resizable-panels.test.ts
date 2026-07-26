import { describe, expect, it } from 'vitest'

import { DEFAULT_RATIO, MAX_RATIO, MIN_RATIO, clampRatio } from './resizable-panels'

describe('clampRatio', () => {
  it('leaves a ratio inside the bounds alone', () => {
    expect(clampRatio(0.5)).toBe(0.5)
    expect(clampRatio(0.42)).toBe(0.42)
  })

  it('clamps a drag past either edge (T10-H)', () => {
    // Dragging to 20% must stop at 30%, not let the panel become unreadable.
    expect(clampRatio(0.2)).toBe(MIN_RATIO)
    expect(clampRatio(0.9)).toBe(MAX_RATIO)
  })

  it('clamps the impossible values a fast drag actually produces', () => {
    // `(clientX - box.left) / box.width` goes negative the moment the pointer
    // passes the container's left edge, which pointer capture makes routine.
    expect(clampRatio(-3)).toBe(MIN_RATIO)
    expect(clampRatio(12)).toBe(MAX_RATIO)
    expect(clampRatio(Number.POSITIVE_INFINITY)).toBe(MAX_RATIO)
  })

  it('is idempotent', () => {
    for (const value of [-1, 0, 0.3, 0.5, 0.7, 1, 2]) {
      expect(clampRatio(clampRatio(value))).toBe(clampRatio(value))
    }
  })

  it('has a default inside its own bounds', () => {
    // A guard against someone tightening the bounds and leaving the
    // double-click reset outside them.
    expect(clampRatio(DEFAULT_RATIO)).toBe(DEFAULT_RATIO)
  })
})
