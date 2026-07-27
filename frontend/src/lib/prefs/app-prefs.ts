'use client'

/**
 * App-level preferences (T-30.7) — Settings → Preferences and Appearance.
 *
 * Same architecture as the player's rate/volume (T-19.6): validated parsers
 * over a user-writable localStorage, consumed through `usePref` so every
 * reader agrees and other tabs stay in sync. The parsers are the whole
 * defence — a hand-edited or stale value must degrade to a default, never
 * throw during render.
 *
 * These are DEFAULTS, not state: the URL always wins where one exists
 * (`?sort=` beats the preference), because a shared link must mean the same
 * thing on the recipient's machine.
 */

import { useLocalStorage } from '@/lib/hooks/use-local-storage'
import { usePref } from '@/lib/hooks/use-pref'
import { DEFAULT_SORT, isSortValue, type SortValue } from '@/lib/meetings/sort-options'

export const APP_PREF_KEYS = {
  // `ff.theme` predates this module — the avatar menu's switcher (T-08.9)
  // already wrote it, so Settings → Appearance adopts the same key and the
  // same `useLocalStorage` bus rather than shipping a second theme store the
  // two surfaces would disagree through.
  theme: 'ff.theme',
  defaultSort: 'ff.app.default-sort',
  pageSize: 'ff.app.page-size',
  autoplay: 'ff.app.autoplay',
  dateFormat: 'ff.app.date-format',
  highlightColor: 'ff.app.highlight-color',
} as const

// ── Theme ───────────────────────────────────────────────────────────────────

export const THEMES = ['light', 'dark', 'system'] as const
export type Theme = (typeof THEMES)[number]
//: `system` (T-38.1). This was pinned to light until dark mode was signed
//: off, so an OS-dark visitor never saw a half-finished theme; T-38's axe
//: sweep now holds dark to zero contrast violations, and following the OS is
//: the default every native app has taught people to expect.
export const DEFAULT_THEME: Theme = 'system'

/** What actually lands on `<html data-theme>` — `system` resolves at read time. */
export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export function useThemePref(): [Theme, (theme: Theme) => void] {
  const { value, setValue } = useLocalStorage<Theme>(APP_PREF_KEYS.theme, DEFAULT_THEME)
  // The store is user-writable; clamp anything this build can't render.
  const theme = (THEMES as readonly string[]).includes(value) ? value : DEFAULT_THEME
  return [theme, setValue]
}

// ── Notebook defaults ───────────────────────────────────────────────────────

export function parseDefaultSort(raw: string | null): SortValue {
  return raw !== null && isSortValue(raw) ? raw : DEFAULT_SORT
}

export function useDefaultSortPref() {
  return usePref(APP_PREF_KEYS.defaultSort, parseDefaultSort, (value) => value, DEFAULT_SORT)
}

export const PAGE_SIZES = [10, 20, 50] as const
export type PageSize = (typeof PAGE_SIZES)[number]
export const DEFAULT_PAGE_SIZE: PageSize = 20

export function parsePageSize(raw: string | null): PageSize {
  const value = Number(raw)
  return (PAGE_SIZES as readonly number[]).includes(value) ? (value as PageSize) : DEFAULT_PAGE_SIZE
}

export function usePageSizePref() {
  return usePref(APP_PREF_KEYS.pageSize, parsePageSize, String, DEFAULT_PAGE_SIZE)
}

// ── Playback & display ──────────────────────────────────────────────────────

export function parseBooleanPref(raw: string | null): boolean {
  return raw === 'true'
}

/** Whether opening a meeting starts playback (consumed by the Notepad player). */
export function useAutoplayPref() {
  return usePref(APP_PREF_KEYS.autoplay, parseBooleanPref, String, false)
}

export const DATE_FORMATS = ['relative', 'absolute'] as const
export type DateFormat = (typeof DATE_FORMATS)[number]

export function parseDateFormat(raw: string | null): DateFormat {
  return (DATE_FORMATS as readonly string[]).includes(raw ?? '') ? (raw as DateFormat) : 'relative'
}

export function useDateFormatPref() {
  return usePref(APP_PREF_KEYS.dateFormat, parseDateFormat, (value) => value, 'relative')
}

// ── Highlights (T-32.2) ─────────────────────────────────────────────────────

export const HIGHLIGHT_COLOR_VALUES = ['amber', 'green', 'blue', 'pink'] as const
export type HighlightColorPref = (typeof HIGHLIGHT_COLOR_VALUES)[number]

export function parseHighlightColor(raw: string | null): HighlightColorPref {
  return (HIGHLIGHT_COLOR_VALUES as readonly string[]).includes(raw ?? '')
    ? (raw as HighlightColorPref)
    : 'amber'
}

/** The last-used colour — what the toolbar's main Highlight button applies. */
export function useHighlightColorPref() {
  return usePref(APP_PREF_KEYS.highlightColor, parseHighlightColor, String, 'amber')
}
