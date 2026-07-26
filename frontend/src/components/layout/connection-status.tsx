'use client'

/**
 * Offline banner and background-refetch indicator (T-16.6, T-16.7).
 *
 * Both live directly under the topbar, because both describe the state of the
 * whole page rather than of any one panel.
 */

import { WifiOff } from 'lucide-react'
import { useIsFetching } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'

/**
 * `navigator.onLine` through `useSyncExternalStore`.
 *
 * The server snapshot is `true`: rendering "You're offline" into the HTML of a
 * page that was just successfully fetched would be absurd, and it would also
 * flash on every load before hydration corrected it.
 */
function subscribe(callback: () => void): () => void {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

export function useIsOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  )
}

export function ConnectionStatus() {
  const online = useIsOnline()
  const fetching = useIsFetching()

  if (!online) {
    return (
      <div
        role="status"
        data-testid="offline-banner"
        className="flex items-center justify-center gap-2 border-b border-subtle bg-warning-subtle px-4 py-1.5 text-sm text-primary"
      >
        <WifiOff size={14} strokeWidth={2} className="text-warning" aria-hidden="true" />
        You&apos;re offline. Showing the last data we loaded.
      </div>
    )
  }

  if (fetching > 0) {
    return (
      /*
       * A 2px bar rather than a spinner or a skeleton: a background refetch is
       * stale-while-revalidate, so the data on screen is still usable and
       * replacing it with a loading state would be a downgrade. This says
       * "working" without taking anything away.
       *
       * `aria-hidden`: a screen reader does not need to hear about every
       * revalidation, and the content it describes has not changed yet.
       */
      <div
        aria-hidden="true"
        data-testid="refetch-indicator"
        className="h-0.5 overflow-hidden bg-transparent"
      >
        <div className="ff-indeterminate h-full w-1/3 bg-accent" />
      </div>
    )
  }

  // A 2px reservation, so the layout does not shift by two pixels every time a
  // query starts.
  return <div aria-hidden="true" className="h-0.5" />
}
