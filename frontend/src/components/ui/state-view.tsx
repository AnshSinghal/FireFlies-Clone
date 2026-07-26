'use client'

/**
 * One component for every empty, error and offline state (T-16.12).
 *
 * The failure this prevents is subtle and common: four different situations —
 * no data at all, no matches for a filter, no matches for a search, a request
 * that failed — quietly collapsing into one "No data" screen because each was
 * written where it was needed. They are genuinely different, and the user's
 * next action differs in each case.
 *
 * Driving them from one variant means the visual language cannot drift, while
 * the COPY and the CTA are per-variant by construction.
 */

import { AlertTriangle, Inbox, SearchX, SlidersHorizontal, WifiOff } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils/cn'

export type StateVariant = 'empty' | 'no-matches' | 'no-results' | 'error' | 'offline'

const ICON: Record<StateVariant, typeof Inbox> = {
  empty: Inbox,
  'no-matches': SlidersHorizontal,
  'no-results': SearchX,
  error: AlertTriangle,
  offline: WifiOff,
}

/** Error is the only one that earns a red circle; the rest are unremarkable. */
const TONE: Record<StateVariant, { circle: string; icon: string }> = {
  empty: { circle: 'bg-surface-2', icon: 'text-muted' },
  'no-matches': { circle: 'bg-surface-2', icon: 'text-muted' },
  'no-results': { circle: 'bg-surface-2', icon: 'text-muted' },
  error: { circle: 'bg-danger-subtle', icon: 'text-danger' },
  offline: { circle: 'bg-warning-subtle', icon: 'text-warning' },
}

interface StateViewProps {
  variant: StateVariant
  title: string
  body?: string
  /** Shown under the body in muted mono — an error code, or the active filters. */
  detail?: ReactNode
  action?: ReactNode
  secondaryAction?: ReactNode
  className?: string
  testId?: string
}

export function StateView({
  variant,
  title,
  body,
  detail,
  action,
  secondaryAction,
  className,
  testId,
}: StateViewProps) {
  const Icon = ICON[variant]
  const tone = TONE[variant]

  return (
    <div
      data-testid={testId}
      data-variant={variant}
      // `role="status"` so a screen reader hears the state change rather than
      // finding an empty list and drawing its own conclusion.
      role="status"
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-lg border border-subtle px-6 py-16 text-center',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn('flex h-12 w-12 items-center justify-center rounded-full', tone.circle)}
      >
        <Icon size={24} strokeWidth={1.5} className={tone.icon} />
      </span>

      <div className="max-w-prose space-y-1">
        <h2 className="text-h3 text-primary">{title}</h2>
        {body && <p className="text-body text-secondary">{body}</p>}
        {detail && <div className="pt-1 text-sm text-muted">{detail}</div>}
      </div>

      {(action || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  )
}
