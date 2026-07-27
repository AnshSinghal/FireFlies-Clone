'use client'

/**
 * The three controls a media player needs that no existing primitive covers
 * (T-19.2, T-19.7, T-19.8).
 *
 * They live here rather than in `features/notepad/player` because `Button` and
 * `IconButton` cannot be bent into these shapes: `cn` joins classes without
 * resolving conflicts (a deliberate choice — see `lib/utils/cn.ts`), so
 * passing `size-10 rounded-full` to a button that already declares `h-btn-md`
 * and `rounded-md` produces a control whose appearance depends on the order
 * Tailwind happened to emit its utilities in. Each of these carries ONE
 * complete class set, which is the convention that rule protects.
 */

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/utils/cn'

interface CircleButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** The control's name — this button is icon-only, so it is not optional. */
  label: string
  icon: React.ReactNode
}

/** The 40px accent circle that anchors a transport row. */
export function CircleButton({ label, icon, className, ...rest }: CircleButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-inverse transition-colors duration-fast',
        'hover:bg-accent-hover active:bg-accent-pressed',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  )
}

interface TrackMarkerProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label: string
  /** Position along the track, 0–1. */
  ratio: number
  /**
   * Drawn instead of the default 2px tick.
   *
   * Two kinds of mark share this timeline — the meeting's own chapters and the
   * reader's bookmarks (T-32.9) — and two identical ticks at the same second
   * would be one indistinguishable mark. The glyph is what tells them apart.
   */
  glyph?: ReactNode
}

/**
 * A clickable tick on a timeline.
 *
 * 2px wide to look right, but with 5px of transparent padding either side so
 * the hit area is 12px — a 2px target is a target nobody can hit, and padding
 * is the way to widen it without widening the mark.
 */
export function TrackMarker({ label, ratio, glyph, className, style, ...rest }: TrackMarkerProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        'group/marker pointer-events-auto absolute -top-1 h-3.5 -translate-x-1/2 px-[5px]',
        'focus-visible:outline-none',
        className,
      )}
      style={{ left: `${Math.min(1, Math.max(0, ratio)) * 100}%`, ...style }}
      {...rest}
    >
      {glyph ?? (
        <span
          aria-hidden="true"
          className="block h-full w-0.5 rounded-full bg-brand-amber transition-transform duration-fast group-hover/marker:scale-y-125 group-focus-visible/marker:ring-2 group-focus-visible/marker:ring-accent"
        />
      )}
    </button>
  )
}

interface SliderProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange'
> {
  label: string
  value: number
  onValueChange: (value: number) => void
  min?: number
  max?: number
  step?: number
}

/**
 * A single-value slider.
 *
 * A native `range` rather than a Radix slider: it is the one input the platform
 * already gets right — keyboard, touch, screen readers and RTL all work with no
 * code — and the only thing missing is the paint, which `.ff-range` supplies.
 */
export function Slider({
  label,
  value,
  onValueChange,
  min = 0,
  max = 1,
  step = 0.05,
  className,
  ...rest
}: SliderProps) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onValueChange(Number(event.target.value))}
      aria-label={label}
      className={cn('ff-range h-1 cursor-pointer', className)}
      {...rest}
    />
  )
}

interface TimestampButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Already formatted — `MM:SS`. */
  time: string
  label: string
}

/**
 * A timestamp that seeks (T-20.5, T-21.2).
 *
 * Its own primitive rather than `Button variant="link"`: that variant sets a
 * text colour of its own, and `cn` does not resolve the conflict with the
 * muted colour a timestamp wants — leaving which one wins up to the order
 * Tailwind emitted them in.
 */
export function TimestampButton({ time, label, className, ...rest }: TimestampButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        'tnum rounded shrink-0 px-1 text-xs text-muted transition-colors duration-fast',
        'hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        className,
      )}
      {...rest}
    >
      {time}
    </button>
  )
}

interface ResultRowProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children: React.ReactNode
}

/**
 * A clickable result row (T-22.10, and the T-30..T-34 rail panels after it).
 *
 * Not `Button`: that primitive declares `whitespace-nowrap` and a fixed height,
 * because it is for actions with a label. A result is two lines of wrapped
 * text, and stretching a Button around it means overriding half its base — the
 * conflict `cn` deliberately does not resolve.
 */
export function ResultRow({ children, className, ...rest }: ResultRowProps) {
  return (
    <button
      type="button"
      className={cn(
        'w-full rounded-md px-2 py-1.5 text-left transition-colors duration-fast',
        'hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
