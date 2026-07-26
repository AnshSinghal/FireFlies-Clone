'use client'

/**
 * EmptyState (T-10.14).
 *
 * The illustration is inline SVG line-art, drawn here. A stock 3D illustration
 * clashes with a dense productivity UI — it reads as a marketing page dropped
 * into a tool — and it is also a third-party asset, which this build does not
 * ship.
 */

import type { ReactNode } from 'react'

import { cn } from '@/lib/utils/cn'

interface EmptyStateProps {
  illustration?: ReactNode
  title: string
  /** Two lines at most. Longer than that and it is documentation, not an empty state. */
  body?: string
  action?: ReactNode
  secondaryAction?: ReactNode
  className?: string
  testId?: string
}

export function EmptyState({
  illustration,
  title,
  body,
  action,
  secondaryAction,
  className,
  testId,
}: EmptyStateProps) {
  return (
    <div
      data-testid={testId}
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-lg border border-subtle px-6 py-16 text-center',
        className,
      )}
    >
      {illustration ?? <EmptyInbox />}

      <div className="max-w-prose space-y-1">
        <h2 className="text-h3 text-primary">{title}</h2>
        {body && <p className="line-clamp-2 text-body text-secondary">{body}</p>}
      </div>

      {(action || secondaryAction) && (
        <div className="flex items-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  )
}

/**
 * Muted line-art: a stack of documents with one lifted away.
 *
 * `currentColor` throughout so it inherits the muted text colour and re-points
 * with the theme, rather than carrying its own hex.
 */
export function EmptyInbox() {
  return (
    <svg
      width="72"
      height="72"
      viewBox="0 0 72 72"
      fill="none"
      aria-hidden="true"
      className="text-muted"
    >
      <rect
        x="14"
        y="24"
        width="36"
        height="34"
        rx="4"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.45"
      />
      <rect
        x="20"
        y="18"
        width="36"
        height="34"
        rx="4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M27 28h22M27 35h22M27 42h14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  )
}

/** For "no results", which is a different situation from "nothing here yet". */
export function EmptySearch() {
  return (
    <svg
      width="72"
      height="72"
      viewBox="0 0 72 72"
      fill="none"
      aria-hidden="true"
      className="text-muted"
    >
      <circle cx="32" cy="32" r="14" stroke="currentColor" strokeWidth="1.5" />
      <path d="M42 42l10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M26 32h12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  )
}
