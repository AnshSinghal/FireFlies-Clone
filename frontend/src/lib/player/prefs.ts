/**
 * Player preferences that outlive the meeting (T-19.6, T-19.7).
 *
 * Rate and volume are properties of the LISTENER, not of the recording. Someone
 * who listens at 1.5× listens at 1.5× to the next meeting too, and resetting
 * that on every navigation is the kind of small forgetfulness that makes an app
 * feel like it isn't paying attention.
 *
 * Reads are defensive because localStorage is a shared, user-writable,
 * cross-version store: a value written by an older build, hand-edited, or
 * corrupted must not be able to throw during render. Storage access itself
 * lives in `use-pref.ts`; what is here is only the validation.
 */

export const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const

export type PlaybackRate = (typeof RATES)[number]

export const PREF_KEYS = {
  rate: 'ff.player.rate',
  volume: 'ff.player.volume',
  muted: 'ff.player.muted',
} as const

export const DEFAULT_RATE: PlaybackRate = 1
export const DEFAULT_VOLUME = 1

export function isPlaybackRate(value: number): value is PlaybackRate {
  return (RATES as readonly number[]).includes(value)
}

/*
 * The parsers below are the whole defence against a store anyone can edit.
 * Each answers the same question — "is this a value this build can use?" — and
 * falls back to the default rather than trusting what it found.
 */

export function parseRate(raw: string | null): PlaybackRate {
  const value = Number(raw)
  // Only a rate the menu can show: a stored 1.37 would leave the label
  // displaying a value no menu item matches.
  return isPlaybackRate(value) ? value : DEFAULT_RATE
}

export function parseVolume(raw: string | null): number {
  const value = Number(raw)
  if (raw === null || !Number.isFinite(value) || value < 0 || value > 1) return DEFAULT_VOLUME
  return value
}

export function parseMuted(raw: string | null): boolean {
  return raw === 'true'
}

export const serialiseNumber = (value: number): string => String(value)
export const serialiseBoolean = (value: boolean): string => String(value)
