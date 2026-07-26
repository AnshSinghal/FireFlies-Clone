'use client'

/**
 * A localStorage-backed value, read the way React wants external state read.
 *
 * The obvious version — `useState(default)` plus an effect that loads the
 * stored value — works, but it renders once with the wrong value and then
 * immediately again with the right one, on every mount. `useSyncExternalStore`
 * exists precisely for this: it gives the server a defined snapshot, gives the
 * client the real one, and React reconciles the difference during hydration
 * without a mismatch warning and without a cascading render.
 *
 * The subscription is a shared bus rather than per-key listeners, because two
 * components reading the same preference must not be able to disagree about
 * it — the volume icon and the volume slider are exactly that pair.
 */

import { useCallback, useSyncExternalStore } from 'react'

type Listener = () => void

const listeners = new Set<Listener>()

/**
 * Snapshots are CACHED because `useSyncExternalStore` compares them by
 * identity and calls `getSnapshot` on every render. Parsing the stored string
 * fresh each time would return a new object for an unchanged value on
 * non-primitive prefs, and React would loop.
 */
const snapshots = new Map<string, unknown>()

function emit(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  /*
   * `storage` fires in OTHER tabs, which is exactly right: change the playback
   * rate in one tab and the meeting open in the next tab agrees.
   */
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

/**
 * @param key       the storage key
 * @param parse     turns the stored string into a value, defaulting when it is
 *                  missing or nonsense — a user-writable store can contain
 *                  anything, including what an older build wrote
 * @param serialise the inverse
 */
export function usePref<T>(
  key: string,
  parse: (raw: string | null) => T,
  serialise: (value: T) => string,
  serverValue: T,
): [T, (value: T) => void] {
  const getSnapshot = useCallback((): T => {
    if (snapshots.has(key)) return snapshots.get(key) as T

    let raw: string | null = null
    try {
      raw = window.localStorage.getItem(key)
    } catch {
      // Safari in private mode throws on access, not only on write.
    }

    const value = parse(raw)
    snapshots.set(key, value)
    return value
  }, [key, parse])

  const getServerSnapshot = useCallback(() => serverValue, [serverValue])

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const setValue = useCallback(
    (next: T) => {
      snapshots.set(key, next)
      try {
        window.localStorage.setItem(key, serialise(next))
      } catch {
        // A full or blocked store costs persistence, not the setting itself.
      }
      emit()
    },
    [key, serialise],
  )

  return [value, setValue]
}
