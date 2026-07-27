/**
 * Deterministic tag colours (T-36.2, test T36-L).
 *
 * Same authority rule as speakers (ADR-013): a SERVER-STORED index wins, and
 * the name hash is only the fallback for a tag that has never been explicitly
 * recoloured (`color_index: null`). Re-hashing on render would recolour a tag
 * the moment it was renamed, which is exactly what storing the index prevents.
 *
 * Tags reuse the eight speaker hues rather than introducing a parallel
 * palette: the values are already calibrated for both themes in tokens.css,
 * and `var(--ff-speaker-N)` re-points under `[data-theme='dark']` for free.
 */

import { getSpeakerColor, getSpeakerColorByIndex } from './speaker-color'

/** The two fields colour needs — satisfied by `TagRef`, `TagFacet` and `TagOut`. */
export interface TagColorSource {
  name: string
  color_index?: number | null
}

/** CSS value for a tag's colour — always a `var(--ff-speaker-N)`, never a hex. */
export function getTagColor(tag: TagColorSource): string {
  return tag.color_index === null || tag.color_index === undefined
    ? getSpeakerColor(tag.name)
    : getSpeakerColorByIndex(tag.color_index)
}
