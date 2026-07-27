/**
 * One non-overlapping span list per segment (T-32.4).
 *
 * Two range systems paint the same string: user highlights (coloured, stored
 * server-side as character offsets) and search matches (amber `<mark>`s,
 * recomputed per query). Rendered independently they nest incorrectly the
 * moment they overlap — `<mark><span>` opened inside one system and closed
 * inside the other is exactly the broken markup T32-C forbids.
 *
 * So neither system renders itself. Both are flattened HERE into atoms — the
 * intervals between every boundary of every range — and each atom knows which
 * highlight covers it and which match covers it. The renderer walks the atoms
 * once; nesting is then structural (a mark strictly inside a highlight span),
 * never emergent. Atoms partition the whole string, so characters cannot be
 * lost or doubled no matter how the ranges land.
 */

import type { HighlightRange } from '@/components/ui/highlighter'
import type { HighlightOut } from '@/lib/api/types'

export interface SegmentAtom {
  text: string
  /** The highlight covering this atom, if any — later-created wins overlaps. */
  highlight: HighlightOut | null
  /** Index into the MERGED match list, or -1. Two atoms can share one match
   *  when a highlight boundary splits it — they are one logical match. */
  matchIndex: number
}

/**
 * Merge overlapping/adjacent search ranges, mirroring `splitByRanges` in the
 * Highlighter so "3 of 17" counts the same things with or without highlights.
 */
function mergeMatches(text: string, ranges: readonly HighlightRange[]): HighlightRange[] {
  const clean = ranges
    .map((r) => ({
      start: Math.max(0, Math.min(r.start, text.length)),
      end: Math.max(0, Math.min(r.end, text.length)),
    }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start)

  const merged: HighlightRange[] = []
  for (const range of clean) {
    const last = merged.at(-1)
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end)
    else merged.push({ ...range })
  }
  return merged
}

export function buildSegmentAtoms(
  text: string,
  highlights: readonly HighlightOut[],
  matchRanges: readonly HighlightRange[] = [],
): SegmentAtom[] {
  if (!text) return []

  const matches = mergeMatches(text, matchRanges)
  // Ordered so that on overlap the LATEST highlight paints — the one the user
  // just made is the one they must see win.
  const marks = highlights
    .map((h) => ({
      ...h,
      start_offset: Math.max(0, Math.min(h.start_offset, text.length)),
      end_offset: Math.max(0, Math.min(h.end_offset, text.length)),
    }))
    .filter((h) => h.end_offset > h.start_offset)
    .sort((a, b) => a.id - b.id)

  // Every boundary of every range slices the string into atoms.
  const cuts = new Set<number>([0, text.length])
  for (const m of matches) {
    cuts.add(m.start)
    cuts.add(m.end)
  }
  for (const h of marks) {
    cuts.add(h.start_offset)
    cuts.add(h.end_offset)
  }
  const points = [...cuts].sort((a, b) => a - b)

  const atoms: SegmentAtom[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i]!
    const end = points[i + 1]!

    let highlight: HighlightOut | null = null
    for (const h of marks) {
      if (h.start_offset <= start && h.end_offset >= end) highlight = h
    }

    let matchIndex = -1
    for (let m = 0; m < matches.length; m++) {
      if (matches[m]!.start <= start && matches[m]!.end >= end) {
        matchIndex = m
        break
      }
    }

    atoms.push({ text: text.slice(start, end), highlight, matchIndex })
  }
  return atoms
}

/**
 * Group consecutive atoms that share a highlight, so the renderer can emit ONE
 * span per contiguous highlighted run (with marks nested inside it) instead of
 * one span per atom — fewer nodes, and the underline is continuous.
 */
export interface SegmentRun {
  highlight: HighlightOut | null
  atoms: SegmentAtom[]
}

export function groupAtomsIntoRuns(atoms: readonly SegmentAtom[]): SegmentRun[] {
  const runs: SegmentRun[] = []
  for (const atom of atoms) {
    const last = runs.at(-1)
    if (last && (last.highlight?.id ?? null) === (atom.highlight?.id ?? null)) {
      last.atoms.push(atom)
    } else {
      runs.push({ highlight: atom.highlight, atoms: [atom] })
    }
  }
  return runs
}
