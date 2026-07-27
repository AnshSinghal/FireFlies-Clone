'use client'

/**
 * Comment body renderer (T-31.4).
 *
 * The STORED mentions drive the accent tokens — the body is split on each
 * mentioned participant's `@Display Name` occurrence, and everything else
 * renders as plain text nodes. Never `dangerouslySetInnerHTML`: a comment of
 * `<script>` stays a comment about a script tag (T31-K).
 */

import type { ReactNode } from 'react'

import type { CommentOut } from '@/lib/api/comments'

export function MentionText({ body, mentions }: Pick<CommentOut, 'body' | 'mentions'>) {
  if (mentions.length === 0) return <>{body}</>

  const names = mentions.map((mention) => `@${mention.display_name}`)
  // Longest first, so "@Priya Sharma" wins over a hypothetical "@Priya".
  names.sort((a, b) => b.length - a.length)

  const nodes: ReactNode[] = []
  let rest = body
  let key = 0
  while (rest.length > 0) {
    const hit = names
      .map((name) => ({ name, at: rest.indexOf(name) }))
      .filter((candidate) => candidate.at >= 0)
      .sort((a, b) => a.at - b.at || b.name.length - a.name.length)[0]

    if (!hit) {
      nodes.push(rest)
      break
    }
    if (hit.at > 0) nodes.push(rest.slice(0, hit.at))
    nodes.push(
      <span key={key++} className="rounded-sm bg-accent-subtle px-1 text-accent-strong">
        {hit.name}
      </span>,
    )
    rest = rest.slice(hit.at + hit.name.length)
  }

  return <>{nodes}</>
}
