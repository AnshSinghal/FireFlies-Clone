/**
 * Kebab-case slug for test ids and URL fragments.
 *
 * Hoisted out of `features/notebook/filters-panel.tsx` for T-36: tag chips
 * render in the notebook AND the notepad, and cross-feature imports are banned
 * — shared helpers live in `lib/`.
 */
export function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
