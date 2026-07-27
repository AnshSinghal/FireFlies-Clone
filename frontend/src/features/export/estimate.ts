/**
 * The live size estimate (T-34.2, asserted by T34-H).
 *
 * Heuristic, stated plainly because the API exposes no word counts:
 *
 * - WORDS are whitespace-delimited tokens summed over every text field of each
 *   INCLUDED section — the summary contributes its overview, outline titles
 *   and note bullets; the transcript contributes each segment's text; action
 *   items contribute each item's text; comments contribute every live body,
 *   replies included. All four sources are already in the query cache when the
 *   modal opens from the Notepad, so this costs no requests.
 * - Comments are counted ONLY when their query is already cached. The modal
 *   never fetches them for a number, so from a Notebook row they contribute 0
 *   — an estimate that is low by a few comment bodies, rather than a request
 *   the user did not ask for.
 * - PAGES are words / 450, rounded up, minimum 1. ~450 words is what a dense
 *   A4 page carries at the export's type scale once headings and the metadata
 *   table take their share. It is an order-of-magnitude aid, not a promise —
 *   its real job is that unchecking Transcript visibly shrinks the number.
 */

import type { CommentOut } from '@/lib/api/comments'
import type { ActionItemOut, HighlightOut, SummaryOut, TranscriptPage } from '@/lib/api/types'

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
  comments?: readonly CommentOut[]
  highlights?: readonly HighlightOut[]
}): { words: number; pages: number } {
  const { include, summary, transcript, actionItems, comments, highlights } = input
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

  if (include.has('highlights') && highlights) {
    for (const highlight of highlights) {
      words += countWords(highlight.text)
      words += countWords(highlight.note)
    }
  }

  if (include.has('comments') && comments) {
    // A tombstone's body is the empty string, so it counts 0 without a guard.
    for (const thread of comments) {
      words += countWords(thread.body)
      for (const reply of thread.replies) words += countWords(reply.body)
    }
  }

  return { words, pages: Math.max(1, Math.ceil(words / WORDS_PER_PAGE)) }
}
