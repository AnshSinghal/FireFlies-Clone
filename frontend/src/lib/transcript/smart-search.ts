/**
 * Smart Search presets (T-22.10).
 *
 * Four questions people actually ask of a transcript — what was asked, what was
 * committed to, what the numbers were, when things are due — answered with
 * pattern matching over the segment text. No model, no server round-trip, and
 * honest about what it is: these are heuristics, and the panel says so.
 */

export type PresetId = 'questions' | 'tasks' | 'metrics' | 'dates'

export interface Preset {
  id: PresetId
  label: string
  description: string
  test: (text: string) => boolean
}

/**
 * Verbs that mark a commitment.
 *
 * Deliberately narrow. Widening it to every verb that could imply an action
 * turns the preset into "most of the transcript", which is worth less than
 * nothing — a filter that matches everything reads as a broken filter.
 */
const TASK_PATTERN =
  /\b(?:I'?ll|we'?ll|let'?s|can you|could you|please|need to|needs to|going to|will (?:take|send|write|follow|set|get|check|draft|review|update|share))\b/i

/** Currency, percentages, or a bare number with at least two digits. */
const METRIC_PATTERN = /(?:[$£€]\s?\d|\d+(?:\.\d+)?\s?%|\b\d{2,}(?:[.,]\d+)?\b)/

const DATE_PATTERN =
  /\b(?:today|tomorrow|yesterday|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|next (?:week|month|quarter|year)|this (?:week|month|quarter)|end of (?:the )?(?:week|month|quarter|year)|by (?:then|friday|monday)|Q[1-4])\b/i

export const PRESETS: readonly Preset[] = [
  {
    id: 'questions',
    label: 'Questions',
    description: 'Lines that ask something',
    // A question MARK, not a leading "what" — "what we agreed was" is not a
    // question, and the punctuation is the only reliable signal in speech.
    test: (text) => text.trimEnd().endsWith('?'),
  },
  {
    id: 'tasks',
    label: 'Tasks',
    description: 'Commitments and requests',
    test: (text) => TASK_PATTERN.test(text),
  },
  {
    id: 'metrics',
    label: 'Metrics',
    description: 'Numbers, money and percentages',
    test: (text) => METRIC_PATTERN.test(text),
  },
  {
    id: 'dates',
    label: 'Dates',
    description: 'When things happen',
    test: (text) => DATE_PATTERN.test(text),
  },
]

export function presetById(id: string): Preset | undefined {
  return PRESETS.find((preset) => preset.id === id)
}

export function applyPreset<T extends { text: string }>(
  preset: Preset,
  segments: readonly T[],
): T[] {
  return segments.filter((segment) => preset.test(segment.text))
}
