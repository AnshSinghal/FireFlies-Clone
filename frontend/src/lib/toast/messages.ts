/**
 * Toast copy, written once (T-09.10).
 *
 * The reason this file exists rather than string literals at call sites:
 * "Meeting deleted" and "Meeting was deleted" and "Deleted meeting" would all
 * ship, and the inconsistency is exactly the kind of thing a reviewer notices
 * in a demo. Wording is a design decision, so it lives with the other ones.
 *
 * Style: past tense for things that happened, no exclamation marks, no
 * trailing period on a single clause. Errors say what to do next.
 */

export const TOAST_MESSAGES = {
  meetingDeleted: 'Meeting deleted',
  meetingRestored: 'Meeting restored',
  meetingCreated: 'Meeting created',
  changesSaved: 'Changes saved',
  actionItemAdded: 'Action item added',
  actionItemDeleted: 'Action item deleted',
  soundbiteCreated: 'Soundbite created',
  soundbiteDeleted: 'Soundbite deleted',
  summaryRegenerated: 'Summary regenerated',
  linkCopied: 'Link copied to clipboard',
  segmentCopied: 'Segment copied to clipboard',
  selectionCopied: 'Selection copied to clipboard',
  transcriptCopied: 'Transcript copied to clipboard',
  summaryCopied: 'Summary copied to clipboard',
  answerCopied: 'Answer copied to clipboard',
  markdownCopied: 'Markdown copied to clipboard',
  exportReady: 'Export downloaded',

  tagCreated: 'Tag created',
  tagsUpdated: 'Tags updated',
  tagDeleted: 'Tag deleted',
  tagsMerged: 'Tags merged',
  tagLimit: 'A meeting can have at most 10 tags',

  saveFailed: "Couldn't save changes. Please try again.",
  exportFailed: "Couldn't export. Please try again.",
  // The clipboard API refuses on an insecure origin and when the user has
  // denied permission. Both leave a button that appears to do nothing.
  copyFailed: "Couldn't copy — your browser blocked clipboard access",
  highlightOneSegment: 'Highlights live within a single line — select inside one segment',
  regenerateFailed: "Couldn't regenerate the summary. Please try again.",
  invalidFileType: 'File must be .txt, .vtt, .srt or .json',

  /** Every `Soon` affordance uses this exact sentence, so the build is honest about its edges. */
  comingSoon: "Coming soon — this feature isn't part of this build",
} as const
