/**
 * Deterministic speaker colours (T-02.9).
 *
 * A speaker's colour must be identical in the transcript, the outline, the
 * participants list, the avatar group and the talk-time bars. Assigning by
 * array position cannot guarantee that — the same person appears at different
 * indices in different lists, and inserting a speaker would recolour everyone
 * after them. Hashing the NAME makes the colour a property of the person.
 *
 * FNV-1a is used because it is tiny, has no dependencies, and — unlike
 * `String.prototype.hashCode`-style sums — does not collide on anagrams, which
 * matters when a meeting contains both "Marcus Patel" and "Patel Marcus".
 */

/** Number of hues in the palette. Must match --ff-speaker-N in tokens.css. */
export const SPEAKER_COLOR_COUNT = 8

const FNV_OFFSET_BASIS = 2166136261
const FNV_PRIME = 16777619

/**
 * Normalises a display name so trivial differences do not change the colour.
 * "Sarah Chen", "sarah chen" and " Sarah  Chen " are all the same person.
 */
function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * FNV-1a, 32-bit. Returns a non-negative integer.
 *
 * `Math.imul` keeps the multiply in 32-bit space; a plain `*` would silently
 * exceed Number.MAX_SAFE_INTEGER and lose the low bits that carry the entropy.
 */
export function hashString(value: string): number {
  let hash = FNV_OFFSET_BASIS
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, FNV_PRIME)
  }
  // `>>> 0` reinterprets the result as unsigned, so the value is never negative.
  return hash >>> 0
}

/** Maps any string to a stable index in [0, buckets). */
export function hashToIndex(value: string, buckets: number = SPEAKER_COLOR_COUNT): number {
  if (buckets <= 0) {
    throw new RangeError(`buckets must be positive, received ${buckets}`)
  }
  return hashString(normalize(value)) % buckets
}

/**
 * The palette index for a speaker. Pair with `speakerColorVar` for a CSS value
 * or the `text-speaker-N` / `bg-speaker-N` Tailwind classes.
 */
export function getSpeakerColorIndex(name: string): number {
  return hashToIndex(name, SPEAKER_COLOR_COUNT)
}

/**
 * The CSS custom property reference for a speaker's colour.
 *
 * Returns `var(--ff-speaker-N)` rather than a hex, so the value follows the
 * theme — the dark palette re-points these and this function needs no changes.
 */
export function getSpeakerColor(name: string): string {
  return `var(--ff-speaker-${getSpeakerColorIndex(name)})`
}

/**
 * The colour for a server-assigned index.
 *
 * Distinct from `getSpeakerColor(name)`, which hashes: when the API has already
 * decided a speaker's index it is AUTHORITATIVE (ADR-013), and re-hashing the
 * name here would give the same person two different colours depending on which
 * component drew them.
 */
export function getSpeakerColorByIndex(index: number): string {
  // Wrapped rather than clamped: an out-of-range index is a bug, but cycling
  // gives a stable colour instead of collapsing everyone onto the last one.
  const safe = ((index % SPEAKER_COLOR_COUNT) + SPEAKER_COLOR_COUNT) % SPEAKER_COLOR_COUNT
  return `var(--ff-speaker-${safe})`
}
