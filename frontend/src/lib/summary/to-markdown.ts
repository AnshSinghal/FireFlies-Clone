/**
 * The summary as Markdown (T-23.7).
 *
 * Markdown rather than the rendered text, because what people do with a copied
 * summary is paste it into Notion, Slack or a doc — all of which understand
 * headings and bullets, and none of which can recover the structure from a
 * flattened paragraph.
 *
 * Sections that are empty are OMITTED. A copied summary with a bare
 * "## Action Items" and nothing under it reads as truncated rather than as
 * empty.
 */

import type { SummaryOut } from '@/lib/api/types'

export interface MarkdownOptions {
  title: string
  /** `MM:SS` formatter — passed in so this module has no view dependencies. */
  formatTime: (ms: number) => string
}

export function summaryToMarkdown(
  summary: SummaryOut,
  { title, formatTime }: MarkdownOptions,
): string {
  const blocks: string[] = [`# ${title}`]

  if (summary.keywords.length > 0) {
    blocks.push(`## Keywords\n\n${summary.keywords.join(' · ')}`)
  }

  if (summary.overview) {
    blocks.push(`## Meeting Overview\n\n${summary.overview}`)
  }

  if (summary.outline.length > 0) {
    const lines = summary.outline.map(
      (entry) => `- \`${formatTime(entry.start_ms)}\` ${entry.title}`,
    )
    blocks.push(`## Meeting Outline\n\n${lines.join('\n')}`)
  }

  if (summary.notes.length > 0) {
    const groups = summary.notes.map((group) => {
      const bullets = group.bullets.map((bullet) => `- ${bullet}`).join('\n')
      // The chapter as a sub-heading, so the grouping survives the paste —
      // a flat bullet list loses the thing that made the notes navigable.
      return `### ${group.chapter}\n\n${bullets}`
    })
    blocks.push(`## Bullet-Point Notes\n\n${groups.join('\n\n')}`)
  }

  return `${blocks.join('\n\n')}\n`
}

/** The same content without the syntax, for pasting into a plain-text field. */
export function summaryToPlainText(summary: SummaryOut, options: MarkdownOptions): string {
  return summaryToMarkdown(summary, options)
    .replace(/^#{1,3} /gm, '')
    .replace(/^- /gm, '• ')
    .replace(/`/g, '')
}
