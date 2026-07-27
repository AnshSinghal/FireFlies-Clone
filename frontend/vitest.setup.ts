/**
 * Node ≥22 ships an experimental `localStorage` global (backed by
 * `--localstorage-file`). Under vitest's jsdom environment on Node 25 it
 * shadows jsdom's working implementation with a stub whose methods don't
 * exist — `window.localStorage.clear is not a function` — which failed every
 * test that touches a preference. Detected at setup and replaced with a real
 * in-memory Storage, so the suite behaves identically on every Node.
 */

if (typeof window !== 'undefined' && typeof window.localStorage?.clear !== 'function') {
  const store = new Map<string, string>()
  const shim: Storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, String(value))
    },
    removeItem: (key) => {
      store.delete(key)
    },
    clear: () => store.clear(),
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size
    },
  }
  Object.defineProperty(window, 'localStorage', { value: shim, configurable: true })
}
