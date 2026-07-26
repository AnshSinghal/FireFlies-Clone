'use client'

/**
 * IconButton (T-10.2).
 *
 * `label` is REQUIRED and is not optional-with-a-default. It becomes both the
 * `aria-label` and the tooltip, so an icon-only control cannot ship nameless —
 * which the plan calls out as a recurring accessibility deduction, and which is
 * the single easiest a11y bug to introduce.
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

import { cn } from '@/lib/utils/cn'

import { Tooltip } from './tooltip'

export type IconButtonVariant = 'ghost' | 'secondary' | 'danger'
export type IconButtonSize = 'sm' | 'md'

const VARIANT: Record<IconButtonVariant, string> = {
  ghost: 'text-muted hover:bg-surface-hover hover:text-primary',
  secondary: 'border border-strong bg-surface-0 text-primary hover:bg-surface-hover',
  danger: 'text-muted hover:bg-danger-subtle hover:text-danger',
}

const SIZE: Record<IconButtonSize, string> = {
  sm: 'h-7 w-7',
  md: 'h-btn-sm w-btn-sm',
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** The control's name. Becomes `aria-label` AND the tooltip — not optional. */
  label: string
  icon: ReactNode
  variant?: IconButtonVariant
  size?: IconButtonSize
  /** Hides the tooltip only. The `aria-label` always ships. */
  hideTooltip?: boolean
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left'
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = 'ghost', size = 'md', hideTooltip, tooltipSide, className, ...props },
  ref,
) {
  return (
    <Tooltip content={label} side={tooltipSide} disabled={hideTooltip}>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-md transition-colors duration-fast active:translate-y-[0.5px]',
          'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0',
          VARIANT[variant],
          SIZE[size],
          className,
        )}
        {...props}
      >
        {icon}
      </button>
    </Tooltip>
  )
})
