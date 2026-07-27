/**
 * The export section registry (T-34.2).
 *
 * The include-checkboxes, the `include=` query parameter, the word estimate
 * and the clipboard Markdown all derive from this ONE list, so a section that
 * exists here exists everywhere at once.
 *
 * Comments joined the list when T-31 landed, highlights when T-32 did — each
 * registration was the one line below, exactly as planned.
 *
 * This order is the CHECKBOX order only. The server ignores the order the
 * `include=` tokens arrive in and always renders its own canonical sequence,
 * so two exports of one meeting read the same however the box was ticked.
 */

export const EXPORT_SECTIONS = [
  { id: 'summary', label: 'Summary' },
  { id: 'transcript', label: 'Transcript' },
  { id: 'actions', label: 'Action items' },
  { id: 'comments', label: 'Comments' },
  { id: 'highlights', label: 'Highlights' },
] as const

export type ExportSectionId = (typeof EXPORT_SECTIONS)[number]['id']
