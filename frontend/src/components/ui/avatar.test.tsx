import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { getInitials } from './avatar'

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
