import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { getInitials, overflowLabel } from './avatar'

describe('getInitials', () => {
  it('takes the first and LAST word, not the first two', () => {
    // "Priya Devi Raghunathan" is PR — a middle name should not displace the
    // surname, which is the letter people actually recognise.
    expect(getInitials('Priya Raghunathan')).toBe('PR')
    expect(getInitials('Priya Devi Raghunathan')).toBe('PR')
  })

  it('gives one letter for a single word', () => {
    // "AL" from "Alex" reads as a surname that is not there.
    expect(getInitials('Alex')).toBe('A')
    expect(getInitials('Cher')).toBe('C')
  })

  it('uppercases', () => {
    expect(getInitials('marcus bell')).toBe('MB')
  })

  it('survives extra whitespace', () => {
    expect(getInitials('  Marcus   Bell  ')).toBe('MB')
  })

  it('never returns an empty string', () => {
    // An empty circle looks like a rendering failure.
    expect(getInitials('')).toBe('?')
    expect(getInitials('   ')).toBe('?')
  })
})

describe('Avatar', () => {
  it('renders initials when there is no image', async () => {
    const { Avatar } = await import('./avatar')
    render(<Avatar name="Marcus Bell" />)
    expect(screen.getByText('MB')).toBeDefined()
  })

  it('gives the same person the same colour every time', async () => {
    const { Avatar } = await import('./avatar')
    // The point of hashing the name rather than using an array index: a
    // speaker keeps their colour across the transcript, the outline and the
    // participant list (ADR-013).
    const first = render(<Avatar name="Priya Raghunathan" />)
    const a = first.container.querySelector('span')?.getAttribute('style')
    first.unmount()

    const second = render(<Avatar name="Priya Raghunathan" />)
    const b = second.container.querySelector('span')?.getAttribute('style')

    expect(a).toBe(b)
    expect(a).toContain('background-color')
  })
})

describe('overflowLabel', () => {
  it('lists the hidden names', () => {
    // "+21" on its own is a dead end for anyone who cannot hover, which is
    // every touch user and most screen-reader users.
    expect(overflowLabel(['Ana Diaz', 'Bo Chen'])).toBe('Ana Diaz, Bo Chen')
  })

  it('caps the list and counts the remainder', () => {
    const names = Array.from({ length: 21 }, (_, i) => `Person ${i + 1}`)
    const label = overflowLabel(names)

    expect(label).toContain('Person 1')
    expect(label).toContain('Person 10')
    expect(label).not.toContain('Person 11,')
    expect(label).toContain('and 11 more')
  })

  it('agrees with the tooltip about where to cut', () => {
    // The two render the same list; a mismatch would tell hover users and
    // screen-reader users different things.
    const names = Array.from({ length: 12 }, (_, i) => `P${i}`)
    expect(overflowLabel(names).split(', ').length).toBe(11) // 10 names + "and N more"
  })

  it('handles a single hidden person without a count clause', () => {
    expect(overflowLabel(['Solo Person'])).toBe('Solo Person')
  })
})
