/**
 * The live size estimate (T-34.2, asserted by T34-H).
 *
 * Heuristic, stated plainly because the API exposes no word counts:
 *
 * - WORDS are whitespace-delimited tokens summed over every text field of each
 *   INCLUDED section — the summary contributes its overview, outline titles
 *   and note bullets; the transcript contributes each segment's text; action
 *   items contribute each item's text. All three sources are already in the
 *   query cache when the modal opens from the Notepad, so this costs no
 *   requests.
 * - PAGES are words / 450, rounded up, minimum 1. ~450 words is what a dense
 *   A4 page carries at the export's type scale once headings and the metadata
 *   table take their share. It is an order-of-magnitude aid, not a promise —
 *   its real job is that unchecking Transcript visibly shrinks the number.
 */

import type { ActionItemOut, SummaryOut, TranscriptPage } from '@/lib/api/types'

import type { ExportSectionId } from './sections'

export const WORDS_PER_PAGE = 450

export function countWords(text: string | null | undefined): number {
  if (!text) return 0
  const trimmed = text.trim()
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length
}

export function estimateExportSize(input: {
  include: ReadonlySet<ExportSectionId>
  summary?: SummaryOut
  transcript?: TranscriptPage
  actionItems?: readonly ActionItemOut[]
}): { words: number; pages: number } {
  const { include, summary, transcript, actionItems } = input
  let words = 0

  if (include.has('summary') && summary) {
    words += countWords(summary.overview)
    for (const entry of summary.outline) words += countWords(entry.title)
    for (const group of summary.notes) {
      words += countWords(group.chapter)
      for (const bullet of group.bullets) words += countWords(bullet)
    }
  }

  if (include.has('transcript') && transcript) {
    for (const segment of transcript.segments) words += countWords(segment.text)
  }

  if (include.has('actions') && actionItems) {
    for (const item of actionItems) words += countWords(item.text)
  }

  return { words, pages: Math.max(1, Math.ceil(words / WORDS_PER_PAGE)) }
}
