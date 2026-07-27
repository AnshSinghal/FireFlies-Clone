/**
 * Loading placeholders (T-06.9, T-10.13).
 *
 * The geometry matters more than the shimmer. A skeleton row must be EXACTLY as
 * tall as the row it stands in for, or content jumps when data lands and the
 * page scores badly on CLS (T06-I asks for < 0.1).
 *
 * The shimmer is a background-position animation, which the reduced-motion rule
 * in globals.css collapses automatically — no separate handling needed here.
 */

import { cn } from '@/lib/utils/cn'

export type SkeletonVariant = 'text' | 'circle' | 'rect'

const VARIANT: Record<SkeletonVariant, string> = {
  // `text` carries its own height, so the common case needs no className at all
  // and every text skeleton in the app is the same height.
  text: 'h-3.5 rounded-sm',
  circle: 'rounded-full',
  rect: 'rounded-md',
}

export function Skeleton({
  variant = 'rect',
  className = '',
}: {
  variant?: SkeletonVariant
  className?: string
}) {
  return (
    <div
      aria-hidden="true"
      className={cn('ff-shimmer bg-surface-2', VARIANT[variant], className)}
      data-testid="skeleton"
    />
  )
}

/** A block of text lines, the last one short so it reads as a paragraph. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} data-testid="skeleton-text">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} variant="text" className={i === lines - 1 ? 'w-2/3' : 'w-full'} />
      ))}
    </div>
  )
}

/**
 * One meeting card's placeholder.
 *
 * MIRRORS the real card's box model exactly — same border, same padding, same
 * leading square, same two text lines — rather than approximating it with a
 * fixed height. A skeleton whose height is maintained separately from the thing
 * it stands in for drifts the first time the row changes, and the symptom is
 * content jumping when data lands (T06-I asks for CLS < 0.1).
 *
 * The Notebook is a date-grouped card list, not a table (ADR-036), so this is
 * a card and not a row.
 */
export function MeetingRowSkeleton({ idSuffix = '' }: { idSuffix?: string }) {
  return (
    <div
      className="flex h-row items-center gap-3 rounded-lg border border-subtle bg-surface-0 px-3"
      data-testid={`meeting-row-skeleton${idSuffix}`}
    >
      <Skeleton variant="rect" className="h-10 w-10 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/* The two lines are sized to the type they replace — 22px title,
            18px meta — so the card is the same height either way. */}
        <Skeleton variant="text" className="h-[22px] w-1/3" />
        <Skeleton variant="text" className="h-[18px] w-2/3" />
      </div>
      <Skeleton variant="circle" className="h-6 w-16 shrink-0" />
      <Skeleton variant="text" className="h-5 w-16 shrink-0" />
    </div>
  )
}

/**
 * How many cards sit under each date heading while loading.
 *
 * The real list is grouped by day, and the headings take vertical space. A flat
 * run of cards therefore starts its first row ~30px higher than the real list
 * does, and everything jumps down when the data lands — which is precisely the
 * shift a skeleton exists to prevent (T16-F).
 *
 * The exact grouping is unknowable in advance; what matters is that a heading
 * is reserved above the first card, which is where the offset comes from.
 */
const SKELETON_GROUPS = [2, 3, 3]

/**
 * @param idSuffix  set by the PRERENDER fallbacks, and by nothing else.
 *
 * Three components render this: the route's `loading.tsx`, the Notebook page's
 * Suspense fallback, and the view's own pending state. The first two can be on
 * screen at the same instant as the third — React keeps a boundary's fallback
 * mounted, and hidden, until the boundary resolves.
 *
 * If all three carried the same testids, a locator would bind to whichever came
 * first in the DOM, pass a visibility check against the live one, and then
 * measure the hidden one — `boundingBox()` returning null on a test that had
 * just asserted the element was visible. That is what CI caught, and it is why
 * the suffix applies to the ROWS as well as to the container: renaming only the
 * container left the rows colliding, and the rows are what the height
 * assertions measure.
 *
 * Only the view's own skeleton, the one that actually stands in for the list,
 * carries the plain ids.
 */
export function MeetingListSkeleton({
  rows = 8,
  idSuffix = '',
}: {
  rows?: number
  idSuffix?: string
}) {
  const groups: number[] = []
  let remaining = rows
  for (const size of SKELETON_GROUPS) {
    if (remaining <= 0) break
    groups.push(Math.min(size, remaining))
    remaining -= size
  }
  if (remaining > 0) groups.push(remaining)

  return (
    <div
      data-testid={`meeting-list-skeleton${idSuffix}`}
      // `status` is the role that both permits the label and announces the
      // loading state — a bare div with aria-label is an axe violation.
      role="status"
      aria-busy="true"
      aria-label="Loading meetings"
      // Matches the real list's group spacing, so the whole block is the same
      // height as what replaces it.
      className="space-y-group-gap"
    >
      {groups.map((size, groupIndex) => (
        <div key={groupIndex} className="space-y-2">
          {/* The date heading, at the same height as the real one. */}
          <div className="flex items-center gap-2.5 px-1">
            <Skeleton variant="rect" className="h-4 w-4 shrink-0" />
            <Skeleton variant="text" className="h-[22px] w-24" />
          </div>
          {/*
            The rows get their OWN wrapper, because the real list spaces
            heading-to-first-card (8px, this div) differently from card-to-card
            (`row-gap`, the <ul>). Flattening both into one `space-y-2` here —
            which is what this used to do — would make the skeleton shorter
            than the list it stands in for, and the content would jump the
            moment real rows arrived. That is the one thing a skeleton exists
            to prevent.
          */}
          <div className="space-y-row-gap">
            {Array.from({ length: size }, (_, index) => (
              <MeetingRowSkeleton key={index} idSuffix={idSuffix} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
