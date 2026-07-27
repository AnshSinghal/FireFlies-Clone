/**
 * The export section registry (T-34.2).
 *
 * The include-checkboxes, the `include=` query parameter, the word estimate
 * and the clipboard Markdown all derive from this ONE list, so a section that
 * exists here exists everywhere at once.
 *
 * Comments (T-31) and Highlights (T-32) are being built on parallel branches.
 * The API contract already ACCEPTS their `include` values and renders them
 * only once their tables exist — so when their data hooks land client-side,
 * registering the section below is the whole frontend wiring job:
 *
 *   { id: 'comments', label: 'Comments' },     // ← T-31 lands
 *   { id: 'highlights', label: 'Highlights' }, // ← T-32 lands
 */

export const EXPORT_SECTIONS = [
  { id: 'summary', label: 'Summary' },
  { id: 'transcript', label: 'Transcript' },
  { id: 'actions', label: 'Action items' },
] as const

export type ExportSectionId = (typeof EXPORT_SECTIONS)[number]['id']
