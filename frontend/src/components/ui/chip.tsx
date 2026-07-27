'use client'

/**
 * Chip (T-10.6) and Badge (T-10.7).
 *
 * They look similar and are not the same thing: a Chip is an affordance
 * (filter, tag, keyword) and a Badge is a readout (count, status). Chips are
 * pressable; badges are never interactive. Keeping them in one file makes the
 * shared height and radius obvious and the difference in role explicit.
 */

import { X } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils/cn'

const CHIP_BASE =
  'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs transition-colors duration-fast'

/**
 * `Chip` builds its classes from these parts instead of `CHIP_BASE`, because
 * it is the one chip that comes in two sizes — `sm` fits a metadata line
 * (T-36.2's row tag chips) where the full 28px would blow the fixed row
 * height. `cn` does not resolve conflicts, so a size must be a complete set
 * of classes rather than an override.
 */
const CHIP_CORE = 'inline-flex shrink-0 items-center rounded-full transition-colors duration-fast'

export type ChipSize = 'sm' | 'md'

const CHIP_SIZE: Record<ChipSize, string> = {
  sm: 'h-5 gap-1 px-2 text-xs',
  md: 'h-7 gap-1.5 px-2.5 text-xs',
}

export type ChipVariant = 'solid' | 'dashed'

/** `dashed` is a PROPOSAL — present but not yet accepted (T-36.4). */
const CHIP_VARIANT: Record<ChipVariant, string> = {
  solid: 'bg-surface-2 text-secondary',
  dashed: 'border border-dashed border-strong bg-transparent text-secondary',
}

interface ChipBaseProps {
  children: ReactNode
  icon?: ReactNode
  className?: string
  testId?: string
}

interface ChipProps extends ChipBaseProps {
  /** Makes the chip a button. */
  onAction?: () => void
  /** Required with `onAction` — the visible text alone rarely says what happens. */
  actionLabel?: string
  size?: ChipSize
  variant?: ChipVariant
}

/**
 * A keyword or tag.
 *
 * Static by default — no hover, no cursor change, because most chips are
 * labels. Pass `onAction` and it becomes a real `<button>` with the affordances
 * to match: a chip that responds to clicks while looking inert is worse than
 * one that does nothing at all.
 */
export function Chip({
  children,
  icon,
  className,
  testId,
  onAction,
  actionLabel,
  size = 'md',
  variant = 'solid',
}: ChipProps) {
  const content = (
    <>
      {icon}
      {children}
    </>
  )

  if (!onAction) {
    return (
      <span
        data-testid={testId}
        className={cn(CHIP_CORE, CHIP_SIZE[size], CHIP_VARIANT[variant], className)}
      >
        {content}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={onAction}
      aria-label={actionLabel}
      data-testid={testId}
      className={cn(
        CHIP_CORE,
        CHIP_SIZE[size],
        CHIP_VARIANT[variant],
        'cursor-pointer hover:bg-surface-hover hover:text-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        className,
      )}
    >
      {content}
    </button>
  )
}

interface ToggleChipProps extends ChipBaseProps {
  selected: boolean
  onToggle: () => void
}

/** A filter. `aria-pressed` rather than a checkbox role — it toggles a view, not a value. */
export function ToggleChip({
  children,
  icon,
  selected,
  onToggle,
  className,
  testId,
}: ToggleChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      data-testid={testId}
      data-selected={selected}
      className={cn(
        CHIP_BASE,
        selected
          ? 'border border-accent-subtle bg-accent-subtle text-accent'
          : // A transparent border in the OFF state, so selecting one does not
            // shift the row by the border's width.
            'border border-transparent bg-surface-2 text-secondary hover:bg-surface-hover hover:text-primary',
        className,
      )}
    >
      {icon}
      {children}
    </button>
  )
}

/*
 * Takes `label`, not `children`. The text has to appear verbatim inside
 * "Remove <label>" on the button, so it must be a string the component can
 * read — arbitrary ReactNode children could not be interpolated there, and the
 * remove button would end up unnamed.
 */
interface RemovableChipProps extends Omit<ChipBaseProps, 'children'> {
  label: string
  onRemove: () => void
}

export function RemovableChip({ label, icon, onRemove, className, testId }: RemovableChipProps) {
  return (
    <span
      data-testid={testId}
      className={cn(CHIP_BASE, 'bg-surface-2 pr-1 text-secondary', className)}
    >
      {icon}
      {label}
      <button
        type="button"
        onClick={onRemove}
        // Names what it removes. "Remove" alone is useless in a list of eight
        // identical buttons.
        aria-label={`Remove ${label}`}
        className="ml-0.5 rounded-full p-0.5 text-muted transition-colors duration-fast hover:bg-surface-0 hover:text-primary"
      >
        <X size={12} strokeWidth={2.5} />
      </button>
    </span>
  )
}

export type BadgeVariant = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

const BADGE_VARIANT: Record<BadgeVariant, string> = {
  neutral: 'bg-surface-2 text-secondary',
  accent: 'bg-accent-subtle text-accent-strong',
  success: 'bg-success-subtle text-success-strong',
  // `-strong` because this is TEXT on the subtle fill (T-38.5).
  warning: 'bg-warning-subtle text-warning-strong',
  danger: 'bg-danger-subtle text-danger-strong',
}

const DOT_VARIANT: Record<BadgeVariant, string> = {
  neutral: 'bg-muted',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

interface BadgeProps {
  children?: ReactNode
  variant?: BadgeVariant
  /** `count` is pill-shaped and tabular; `text` is a rounded rect. */
  shape?: 'text' | 'count'
  /** Prefixes a status dot. Colour alone never carries the meaning — the text does. */
  dot?: boolean
  className?: string
  testId?: string
}

export function Badge({
  children,
  variant = 'neutral',
  shape = 'text',
  dot = false,
  className,
  testId,
}: BadgeProps) {
  return (
    <span
      data-testid={testId}
      data-variant={variant}
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1.5 px-2 text-xs',
        shape === 'count' ? 'tnum min-w-5 justify-center rounded-full' : 'rounded-sm',
        BADGE_VARIANT[variant],
        className,
      )}
    >
      {dot && (
        <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', DOT_VARIANT[variant])} />
      )}
      {children}
    </span>
  )
}
