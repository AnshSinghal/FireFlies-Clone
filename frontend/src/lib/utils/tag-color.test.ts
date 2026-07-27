import { describe, expect, it } from 'vitest'

import { getSpeakerColor } from './speaker-color'
import { slug } from './slug'
import { getTagColor } from './tag-color'

describe('getTagColor', () => {
  it('uses the stored color_index when present', () => {
    expect(getTagColor({ name: 'sales', color_index: 3 })).toBe('var(--ff-speaker-3)')
  })

  it('falls back to the name hash when no index is stored', () => {
    expect(getTagColor({ name: 'roadmap', color_index: null })).toBe(getSpeakerColor('roadmap'))
    expect(getTagColor({ name: 'roadmap' })).toBe(getSpeakerColor('roadmap'))
  })

  it('renders identically for the same tag wherever it appears (T36-L)', () => {
    expect(getTagColor({ name: 'urgent', color_index: null })).toBe(
      getTagColor({ name: 'urgent', color_index: null }),
    )
  })

  it('does not recolour on rename once an index is stored', () => {
    // The index survives the rename, so the colour must too.
    expect(getTagColor({ name: 'renamed-tag', color_index: 3 })).toBe(
      getTagColor({ name: 'original-tag', color_index: 3 }),
    )
  })

  it('wraps an out-of-range stored index rather than clamping', () => {
    expect(getTagColor({ name: 'x', color_index: 9 })).toBe('var(--ff-speaker-1)')
  })
})

describe('slug', () => {
  it('kebab-cases arbitrary names', () => {
    expect(slug('Q3 Roadmap!')).toBe('q3-roadmap')
    expect(slug('  sales  ')).toBe('sales')
  })
})
