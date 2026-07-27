/**
 * The whole meeting as clipboard Markdown (T-34.10).
 *
 * A CLIENT-side composition mirroring the server's T-34.3 generator: the modal
 * already holds the summary, transcript, action items and comments in the
 * query cache, so "Copy as Markdown" costs zero requests — which is the point
 * of the feature ("often what the user actually wants").
 *
 * Shape per T-34.3: `# Title`, a metadata block, `## Meeting Overview`,
 * `## Meeting Outline` (timestamps as `[04:32]`), `## Bullet-Point Notes`,
 * `## Action Items` (`- [ ]` / `- [x]`), `## Transcript` (`**Speaker** [00:14]`
 * then the turn's text), `## Comments` (a nested bullet per thread). Empty
 * sections are OMITTED — a bare heading reads as truncation, not emptiness
 * (same call as lib/summary/to-markdown.ts).
 */

import type { CommentOut } from '@/lib/api/comments'
import type { HighlightOut } from '@/lib/api/types'
import type { ActionItemOut, MeetingDetail, SummaryOut, TranscriptPage } from '@/lib/api/types'
import { markTurns } from '@/lib/transcript/grouping'
import { formatDuration, formatFullDate, formatTimestamp } from '@/lib/utils/format'

import type { ExportSectionId } from './sections'

/** The flyout's wording for a tombstone, mirrored by the server renderer. */
const DELETED_NOTE = 'Comment deleted'

export function buildMeetingMarkdown(input: {
  meeting: MeetingDetail
  include: ReadonlySet<ExportSectionId>
  summary?: SummaryOut
  transcript?: TranscriptPage
  actionItems?: readonly ActionItemOut[]
  comments?: readonly CommentOut[]
  highlights?: readonly HighlightOut[]
}): string {
  const { meeting, include, summary, transcript, actionItems, comments, highlights } = input

  const blocks: string[] = [`# ${meeting.title}`, metadataBlock(meeting)]

  if (include.has('summary') && summary) {
    if (summary.overview) {
      blocks.push(`## Meeting Overview\n\n${summary.overview}`)
    }

    if (summary.outline.length > 0) {
      const lines = summary.outline.map(
        (entry) => `- [${formatTimestamp(entry.start_ms)}] ${entry.title}`,
      )
      blocks.push(`## Meeting Outline\n\n${lines.join('\n')}`)
    }

    if (summary.notes.length > 0) {
      const groups = summary.notes.map(
        (group) => `### ${group.chapter}\n\n${group.bullets.map((b) => `- ${b}`).join('\n')}`,
      )
      blocks.push(`## Bullet-Point Notes\n\n${groups.join('\n\n')}`)
    }
  }

  if (include.has('actions') && actionItems && actionItems.length > 0) {
    const lines = actionItems.map((item) => {
      const box = item.status === 'completed' ? '[x]' : '[ ]'
      const assignee = item.assignee_name ? ` — ${item.assignee_name}` : ''
      return `- ${box} ${item.text}${assignee}`
    })
    blocks.push(`## Action Items\n\n${lines.join('\n')}`)
  }

  if (include.has('transcript') && transcript && transcript.segments.length > 0) {
    blocks.push(`## Transcript\n\n${transcriptBlocks(transcript)}`)
  }

  if (include.has('comments') && comments && comments.length > 0) {
    blocks.push(`## Comments\n\n${commentLines(comments).join('\n')}`)
  }

  if (include.has('highlights') && highlights && highlights.length > 0) {
    const lines = highlights.map((highlight) => {
      const note = highlight.note ? ` — ${highlight.note}` : ''
      return `- [${formatTimestamp(highlight.start_ms)}] ${highlight.speaker}: “${highlight.text}”${note}`
    })
    blocks.push(`## Highlights\n\n${lines.join('\n')}`)
  }

  return `${blocks.join('\n\n')}\n`
}

/** Bulleted rather than bare lines: GitHub and Notion both merge consecutive
 * plain lines into one paragraph, and a merged metadata block is unreadable. */
function metadataBlock(meeting: MeetingDetail): string {
  const names = (meeting.participants ?? []).map((person) => person.display_name)
  const lines = [
    `- **Date:** ${formatFullDate(meeting.started_at)}`,
    `- **Duration:** ${formatDuration(meeting.duration_seconds * 1000)}`,
  ]
  if (names.length > 0) lines.push(`- **Participants:** ${names.join(', ')}`)
  return lines.join('\n')
}

/**
 * A nested bullet per comment, matching the server's Markdown renderer line
 * for line: `- **Author** [MM:SS] (resolved) — body`, replies indented two
 * spaces, a tombstone as `- *Comment deleted*`.
 *
 * Only a thread's opener carries the timestamp — a reply inherited the same
 * one from its parent, so repeating it is noise. Bodies have their whitespace
 * collapsed because a hard line break inside a list item ends the list, taking
 * the replies underneath it with them.
 */
function commentLines(comments: readonly CommentOut[]): string[] {
  const line = (comment: CommentOut, depth: number): string => {
    const indent = '  '.repeat(depth)
    if (comment.is_deleted) return `${indent}- *${DELETED_NOTE}*`

    const markers = [
      depth === 0 && comment.start_ms !== null ? `[${formatTimestamp(comment.start_ms)}]` : null,
      comment.is_resolved ? '(resolved)' : null,
    ].filter(Boolean)
    const lead = [`**${comment.author.name}**`, ...markers].join(' ')
    return `${indent}- ${lead} — ${comment.body.replace(/\s+/g, ' ').trim()}`
  }

  return comments.flatMap((thread) => [
    line(thread, 0),
    ...thread.replies.map((reply) => line(reply, 1)),
  ])
}

/**
 * One block per speaker TURN, not per segment — nine consecutive lines from
 * one speaker paste as one paragraph under one `**Name** [MM:SS]` header,
 * reusing the same turn boundaries the transcript panel draws (markTurns).
 */
function transcriptBlocks(transcript: TranscriptPage): string {
  const labelById = new Map(transcript.speakers.map((speaker) => [speaker.id, speaker.label]))

  const turns: string[] = []
  let current: string[] = []

  for (const segment of markTurns(transcript.segments)) {
    if (segment.startsTurn) {
      if (current.length > 0) turns.push(current.join('\n'))
      const speaker = labelById.get(segment.speaker_id) ?? 'Speaker'
      current = [`**${speaker}** [${formatTimestamp(segment.start_ms)}]`, segment.text]
    } else {
      current.push(segment.text)
    }
  }
  if (current.length > 0) turns.push(current.join('\n'))

  return turns.join('\n\n')
}
