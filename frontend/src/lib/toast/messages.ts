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
  markdownCopied: 'Markdown copied to clipboard',
  exportReady: 'Export downloaded',
  highlightRemoved: 'Highlight removed',
  bookmarkAdded: 'Bookmarked',
  bookmarkRemoved: 'Bookmark removed',

  saveFailed: "Couldn't save changes. Please try again.",
  exportFailed: "Couldn't export. Please try again.",
  /*
   * T-32.11: a selection spanning two lines is refused rather than split.
   * Splitting would create marks at both ends the user never drew, and the
   * message has to say what to do instead — "not supported" alone is a wall.
   */
  highlightCrossSegment: 'Highlights stay within one line — select inside a single segment',
  highlightFailed: "Couldn't save that highlight. Please try again.",
  // The clipboard API refuses on an insecure origin and when the user has
  // denied permission. Both leave a button that appears to do nothing.
  copyFailed: "Couldn't copy — your browser blocked clipboard access",
  regenerateFailed: "Couldn't regenerate the summary. Please try again.",
  invalidFileType: 'File must be .txt, .vtt, .srt or .json',

  /** Every `Soon` affordance uses this exact sentence, so the build is honest about its edges. */
  comingSoon: "Coming soon — this feature isn't part of this build",
} as const

export type ToastMessageKey = keyof typeof TOAST_MESSAGES
