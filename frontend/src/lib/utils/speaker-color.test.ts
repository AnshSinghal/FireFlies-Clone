import { describe, expect, it } from 'vitest'

import {
  SPEAKER_COLOR_COUNT,
  getSpeakerColor,
  getSpeakerColorIndex,
  hashString,
  hashToIndex,
} from './speaker-color'

/** The seeded cast from T-05.5 — the names this will actually run against. */
const CAST = [
  'Sarah Chen',
  'Marcus Patel',
  'Priya Raman',
  'James Okafor',
  'Elena Volkov',
  'Tom Bradley',
  'Aisha Khan',
  'David Kim',
  'Nina Alvarez',
  'Raj Mehta',
  'Chloe Dubois',
  'Yuki Tanaka',
]

describe('getSpeakerColor', () => {
  // T02-A
  it('is stable across repeated calls', () => {
    const first = getSpeakerColor('Sarah Chen')
    for (let i = 0; i < 100; i += 1) {
      expect(getSpeakerColor('Sarah Chen')).toBe(first)
    }
  })

  // T02-B
  it('normalises case and surrounding whitespace', () => {
    const expected = getSpeakerColor('Sarah Chen')

    expect(getSpeakerColor('sarah chen ')).toBe(expected)
    expect(getSpeakerColor('  SARAH CHEN')).toBe(expected)
    expect(getSpeakerColor('Sarah  Chen')).toBe(expected)
  })

  it('treats genuinely different names as different people', () => {
    expect(getSpeakerColor('Sarah Chen')).not.toBe(getSpeakerColor('Sarah Chena'))
  })

  // T02-C — collisions are tolerated; clustering is not.
  it('spreads twelve real names across most of the palette', () => {
    const used = new Set(CAST.map(getSpeakerColorIndex))
    expect(used.size).toBeGreaterThanOrEqual(6)
  })

  it('always returns an in-range CSS variable reference', () => {
    for (const name of CAST) {
      expect(getSpeakerColor(name)).toMatch(/^var\(--ff-speaker-[0-7]\)$/)
    }
  })

  it('returns a token reference, never a hex literal', () => {
    // A hex here would defeat theming: dark mode re-points these variables.
    expect(getSpeakerColor('Sarah Chen')).not.toMatch(/#[0-9a-f]{3,8}/i)
  })

  it('handles the degenerate inputs a transcript will eventually contain', () => {
    for (const name of ['', ' ', 'Speaker 1', '张伟', '🙂', 'a'.repeat(500)]) {
      const index = getSpeakerColorIndex(name)
      expect(Number.isInteger(index)).toBe(true)
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(SPEAKER_COLOR_COUNT)
    }
  })

  it('does not collide on anagrams', () => {
    // Asserted on the HASH, not the bucket. A summing hash would give these
    // identical hashes; FNV-1a does not. They may still share a bucket — with
    // eight hues that happens roughly one time in eight, and T02-C explicitly
    // tolerates collisions. What must not happen is the hash itself colliding.
    expect(hashString('marcus patel')).not.toBe(hashString('patel marcus'))
    expect(hashString('elena volkov')).not.toBe(hashString('volkov elena'))
  })
})

describe('hashToIndex', () => {
  it('respects an arbitrary bucket count', () => {
    for (const name of CAST) {
      expect(hashToIndex(name, 3)).toBeLessThan(3)
    }
  })

  it('distributes acceptably over a large synthetic set', () => {
    const counts = new Array<number>(SPEAKER_COLOR_COUNT).fill(0)
    for (let i = 0; i < 800; i += 1) {
      const bucket = hashToIndex(`Speaker ${i}`)
      counts[bucket] = (counts[bucket] ?? 0) + 1
    }
    // Perfectly uniform is 100 per bucket. Assert nothing is starved or swamped.
    expect(Math.min(...counts)).toBeGreaterThan(50)
    expect(Math.max(...counts)).toBeLessThan(160)
  })

  it('rejects a non-positive bucket count', () => {
    expect(() => hashToIndex('Sarah Chen', 0)).toThrow(RangeError)
  })
})
