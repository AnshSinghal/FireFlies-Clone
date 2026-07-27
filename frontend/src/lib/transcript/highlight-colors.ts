/**
 * The four marker colours, and the classes that paint them (T-32.3).
 *
 * Written out in full rather than composed as `bg-hl-${color}`. Tailwind scans
 * source text for literal class names; an interpolated one is never emitted,
 * and the highlight would render with no background at all — a failure that
 * only appears in a production build, where the JIT has no dev-mode safety net.
 */

import type { HighlightColorName } from './segment-spans'

export { HIGHLIGHT_COLORS, type HighlightColorName } from './segment-spans'

interface ColorStyle {
  /** Human name, for the swatch's accessible label. */
  label: string
  /** Wash plus underline, applied to the text itself. */
  mark: string
  /** A filled circle, for the picker and the flyout's group headers. */
  swatch: string
}

export const HIGHLIGHT_STYLES: Record<HighlightColorName, ColorStyle> = {
  amber: {
    label: 'Amber',
    mark: 'bg-hl-amber decoration-hl-amber-line',
    swatch: 'bg-hl-amber border-hl-amber-line',
  },
  green: {
    label: 'Green',
    mark: 'bg-hl-green decoration-hl-green-line',
    swatch: 'bg-hl-green border-hl-green-line',
  },
  blue: {
    label: 'Blue',
    mark: 'bg-hl-blue decoration-hl-blue-line',
    swatch: 'bg-hl-blue border-hl-blue-line',
  },
  pink: {
    label: 'Pink',
    mark: 'bg-hl-pink decoration-hl-pink-line',
    swatch: 'bg-hl-pink border-hl-pink-line',
  },
}

/** The colour a new highlight gets. Overridden by the last one the user picked. */
export const DEFAULT_HIGHLIGHT_COLOR: HighlightColorName = 'amber'

export const LAST_COLOR_STORAGE_KEY = 'ff.highlight.color'

/** Narrow an unknown string — a stored preference, or a server enum — to a colour. */
export function asHighlightColor(value: string | null | undefined): HighlightColorName | null {
  return value !== null && value !== undefined && value in HIGHLIGHT_STYLES
    ? (value as HighlightColorName)
    : null
}
