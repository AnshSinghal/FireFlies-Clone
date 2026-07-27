/**
 * The comments section of the export modal (T-31 wired into T-34).
 *
 * Both client-side derivations — the size estimate and the clipboard Markdown
 * — have to agree with the server renderer, because the same modal offers
 * "Export" and "Copy as Markdown" side by side and a reader would notice one
 * of them dropping a thread.
 */

import { describe, expect, it } from 'vitest'

import type { CommentOut } from '@/lib/api/comments'
import type { MeetingDetail } from '@/lib/api/types'

import { estimateExportSize } from './estimate'
import { buildMeetingMarkdown } from './meeting-markdown'
import type { ExportSectionId } from './sections'
import { EXPORT_SECTIONS } from './sections'

const AUTHOR = { id: 1, name: 'Sarah Chen', avatar_url: null }

function comment(overrides: Partial<CommentOut> & { id: number; body: string }): CommentOut {
  return {
    segment_id: null,
    parent_id: null,
    start_ms: null,
    author: AUTHOR,
    mentions: [],
    is_resolved: false,
    is_deleted: false,
    is_edited: false,
    created_at: '2026-07-24T09:00:00Z',
    replies: [],
    ...overrides,
  }
}

const THREADS: CommentOut[] = [
  comment({
    id: 1,
    body: 'The pricing tiers here need a second look.',
    segment_id: 7,
    start_ms: 13_200,
    replies: [comment({ id: 2, parent_id: 1, start_ms: 13_200, body: 'I will pull the numbers.' })],
  }),
  comment({ id: 3, body: 'Who owns the board deck?', is_resolved: true }),
  comment({
    id: 4,
    body: '',
    is_deleted: true,
    replies: [comment({ id: 5, parent_id: 4, body: 'Kept so the thread does not collapse.' })],
  }),
]

const MEETING = {
  id: 1,
  title: 'Q3 Product Roadmap Sync',
  started_at: '2026-07-24T09:00:00Z',
  duration_seconds: 1_800,
  participants: [],
} as unknown as MeetingDetail

const ALL: ReadonlySet<ExportSectionId> = new Set(EXPORT_SECTIONS.map((section) => section.id))

describe('the Comments checkbox', () => {
  it('is registered alongside the other sections', () => {
    expect(EXPORT_SECTIONS.map((section) => section.id)).toEqual([
      'summary',
      'transcript',
      'actions',
      'comments',
      // T-32 landed exactly as this file's header predicted: one line.
      'highlights',
    ])
  })
})

describe('estimateExportSize', () => {
  it('counts every live body, replies included', () => {
    const { words } = estimateExportSize({ include: ALL, comments: THREADS })

    // 8 + 5 + 5 + 0 (the tombstone) + 7.
    expect(words).toBe(25)
  })

  it('contributes nothing when the section is unticked', () => {
    const include: ReadonlySet<ExportSectionId> = new Set(['summary'])

    expect(estimateExportSize({ include, comments: THREADS }).words).toBe(0)
  })

  it('contributes nothing when the comments query is not cached', () => {
    expect(estimateExportSize({ include: ALL }).words).toBe(0)
  })
})

describe('buildMeetingMarkdown', () => {
  const markdown = (comments?: readonly CommentOut[], include = ALL) =>
    buildMeetingMarkdown({ meeting: MEETING, include, comments })

  it('matches the server renderer, thread for thread', () => {
    const text = markdown(THREADS)

    expect(text).toContain('## Comments')
    expect(text).toContain('- **Sarah Chen** [00:13] — The pricing tiers here need a second look.')
    // A reply indents one level and drops the timestamp it inherited.
    expect(text).toContain('  - **Sarah Chen** — I will pull the numbers.')
    expect(text).toContain('- **Sarah Chen** (resolved) — Who owns the board deck?')
    expect(text).toContain('- *Comment deleted*')
    expect(text).toContain('  - **Sarah Chen** — Kept so the thread does not collapse.')
  })

  it('collapses a body that would otherwise break out of its list item', () => {
    const text = markdown([comment({ id: 9, body: 'Two\n\nparagraphs   here.' })])

    expect(text).toContain('- **Sarah Chen** — Two paragraphs here.')
  })

  it('omits the heading when the section is unticked or the cache is empty', () => {
    expect(markdown(THREADS, new Set(['summary']))).not.toContain('## Comments')
    expect(markdown([])).not.toContain('## Comments')
    expect(markdown(undefined)).not.toContain('## Comments')
  })
})
