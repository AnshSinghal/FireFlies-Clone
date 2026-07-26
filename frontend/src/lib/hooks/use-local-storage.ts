'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * Persisted UI preference — sidebar collapsed, panel split, playback rate.
 *
 * Built on `useSyncExternalStore` rather than `useState` + `useEffect`.
 * localStorage genuinely IS an external store, and this is the primitive React
 * provides for reading one: it handles the server snapshot (localStorage does
 * not exist during SSR) without a hydration mismatch, and subscribing to the
 * `storage` event gives cross-tab sync for free — change the theme in one tab
 * and the others follow.
 *
 * The effect-based version also tripped `react-hooks/set-state-in-effect`,
 * which was a fair complaint rather than a rule to silence.
 *
 * Anything that would FLASH visibly (the theme) still needs a before-paint
 * inline script instead (T-38.2) — the first client render necessarily sees the
 * server snapshot.
 */

/** Module-level so every hook instance for a key shares one subscription. */
const listeners = new Map<string, Set<() => void>>()

function subscribe(key: string, onChange: () => void): () => void {
  let forKey = listeners.get(key)
  if (!forKey) {
    forKey = new Set()
    listeners.set(key, forKey)
  }
  forKey.add(onChange)

  // Fires only for changes made by OTHER tabs; same-tab writes notify directly.
  const onStorage = (event: StorageEvent) => {
    if (event.key === key) onChange()
  }
  window.addEventListener('storage', onStorage)

  return () => {
    forKey.delete(onChange)
    window.removeEventListener('storage', onStorage)
  }
}

function notify(key: string): void {
  for (const listener of listeners.get(key) ?? []) listener()
}

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    // Storage disabled entirely — Safari private mode throws on access.
    return null
  }
}

export function useLocalStorage<T>(key: string, fallback: T) {
  const getSnapshot = useCallback(() => readRaw(key), [key])

  // The server has no localStorage. Returning null keeps the first client
  // render identical to the server's, which is what avoids a hydration error.
  const getServerSnapshot = useCallback(() => null, [])

  const raw = useSyncExternalStore(
    useCallback((onChange: () => void) => subscribe(key, onChange), [key]),
    getSnapshot,
    getServerSnapshot,
  )

  let value = fallback
  if (raw !== null) {
    try {
      value = JSON.parse(raw) as T
    } catch {
      // Corrupt entry — fall back rather than crashing the page over a
      // preference.
    }
  }

  const setValue = useCallback(
    (next: T) => {
      try {
        window.localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // Quota exceeded or storage unavailable. Still notify, so the current
        // session reflects the change even though it will not persist.
      }
      notify(key)
    },
    [key],
  )

  return { value, setValue, hydrated: raw !== null || typeof window !== 'undefined' }
}
