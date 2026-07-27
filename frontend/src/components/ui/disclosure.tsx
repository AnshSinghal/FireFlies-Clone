'use client'

/**
 * The trigger for a collapsible region.
 *
 * A section heading that is also a button — so it carries the label's type
 * scale rather than a button's, which is why it cannot be `Button` with a
 * className: both would set the font size and the winner would depend on the
 * order Tailwind emitted them in (`cn` joins, it does not resolve — see
 * `lib/utils/cn.ts`).
 *
 * `aria-expanded` and `aria-controls` are required, not optional. A disclosure
 * without them is a button that announces nothing about what it does.
 */

import { ChevronRight } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'

import { cn } from '@/lib/utils/cn'

interface DisclosureToggleProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label: string
  open: boolean
  onToggle: () => void
  /** The id of the region this controls. */
  controls: string
}

export function DisclosureToggle({
  label,
  open,
  onToggle,
  controls,
  className,
  ...rest
}: DisclosureToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      className={cn(
        'rounded flex min-w-0 items-center gap-1.5 text-label uppercase text-muted',
        'transition-colors duration-fast hover:text-secondary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        className,
      )}
      {...rest}
    >
      <ChevronRight
        size={14}
        strokeWidth={2.5}
        aria-hidden="true"
        className={cn('shrink-0 transition-transform duration-fast', open && 'rotate-90')}
      />
      {label}
    </button>
  )
}
