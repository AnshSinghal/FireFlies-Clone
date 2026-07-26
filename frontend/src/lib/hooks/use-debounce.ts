'use client'

import { useEffect, useState } from 'react'

/**
 * Delays a value until it stops changing.
 *
 * Backs the search inputs, where the requirement is explicit: six characters
 * typed quickly must produce at most two requests (T13-B), not six.
 */
export function useDebounce<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    // Clearing on every change is what makes this a debounce rather than a
    // series of independent delays — each keystroke cancels the pending one.
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
