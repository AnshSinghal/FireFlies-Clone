'use client'

/**
 * Input and Textarea (T-10.3).
 *
 * `Field` wraps both, because a label, a helper line and an error message have
 * to be wired to the control with real ids — and doing that by hand at each
 * call site is how you end up with an error message that screen readers never
 * announce.
 */

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react'

import { cn } from '@/lib/utils/cn'

/** Shared by both controls, so a Textarea can never drift from an Input. */
const CONTROL_BASE =
  'w-full rounded-md border bg-surface-0 px-3 text-body text-primary transition-colors duration-fast placeholder:text-muted disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted'

const CONTROL_IDLE = 'border-subtle hover:border-strong focus:border-accent focus:shadow-focus'
const CONTROL_ERROR = 'border-danger focus:border-danger focus:shadow-focus'
/*
 * For input that is VALID but found nothing (T-22.8).
 *
 * A search with no results is not a mistake — danger red would tell the user
 * they typed something wrong when they typed something fine that simply is not
 * in this transcript.
 */
const CONTROL_WARNING = 'border-warning focus:border-warning focus:shadow-focus'

interface FieldShellProps {
  label?: string
  helper?: string
  error?: string
  /** Renders `current / max` under the control, right-aligned. */
  counter?: { value: number; max: number }
  required?: boolean
  children: (ids: { controlId: string; describedBy: string | undefined }) => ReactNode
}

export function Field({ label, helper, error, counter, required, children }: FieldShellProps) {
  const controlId = useId()
  const helperId = `${controlId}-helper`

  // `aria-describedby` points at whichever line is actually rendered. The error
  // wins, because when both exist the error is the one that needs saying.
  const describedBy = error || helper ? helperId : undefined

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={controlId} className="block text-body-strong text-primary">
          {label}
          {required && (
            <span className="ml-0.5 text-danger" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}

      {children({ controlId, describedBy })}

      {(error || helper || counter) && (
        <div className="flex items-start justify-between gap-3">
          <p
            id={describedBy}
            // `role="alert"` only for errors — a helper line announcing itself
            // every render would be noise.
            role={error ? 'alert' : undefined}
            className={cn('text-sm', error ? 'text-danger' : 'text-muted')}
          >
            {error ?? helper}
          </p>
          {counter && (
            <p
              className={cn(
                'tnum shrink-0 text-sm',
                counter.value > counter.max ? 'text-danger' : 'text-muted',
              )}
            >
              {counter.value} / {counter.max}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  helper?: string
  error?: string
  leading?: ReactNode
  trailing?: ReactNode
  /** Tints the border without claiming the value is invalid. See CONTROL_WARNING. */
  tone?: 'warning'
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, helper, error, leading, trailing, tone, className, required, ...props },
  ref,
) {
  return (
    <Field label={label} helper={helper} error={error} required={required}>
      {({ controlId, describedBy }) => (
        <div className="relative">
          {leading && (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
              {leading}
            </span>
          )}
          <input
            ref={ref}
            id={controlId}
            required={required}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(
              CONTROL_BASE,
              error ? CONTROL_ERROR : tone === 'warning' ? CONTROL_WARNING : CONTROL_IDLE,
              'h-input outline-none',
              leading && 'pl-9',
              trailing && 'pr-9',
              className,
            )}
            {...props}
          />
          {trailing && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">{trailing}</span>
          )}
        </div>
      )}
    </Field>
  )
})

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  helper?: string
  error?: string
  maxChars?: number
  /** Grows with content between these bounds instead of scrolling. */
  autoGrow?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, helper, error, maxChars, autoGrow = true, className, required, value, ...props },
  ref,
) {
  const length = typeof value === 'string' ? value.length : 0

  return (
    <Field
      label={label}
      helper={helper}
      error={error}
      required={required}
      counter={maxChars ? { value: length, max: maxChars } : undefined}
    >
      {({ controlId, describedBy }) => (
        <textarea
          ref={ref}
          id={controlId}
          value={value}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          /*
           * `field-sizing: content` does the auto-grow in CSS, with no ref, no
           * resize observer and no scrollHeight round-trip — the JS version
           * reads layout on every keystroke and fights React's render. Browsers
           * without it fall back to the fixed min-height, which is the same
           * behaviour a plain textarea has always had.
           */
          className={cn(
            CONTROL_BASE,
            error ? CONTROL_ERROR : CONTROL_IDLE,
            'max-h-80 min-h-20 resize-y py-2.5 outline-none',
            autoGrow && '[field-sizing:content]',
            className,
          )}
          {...props}
        />
      )}
    </Field>
  )
})

interface DateInputProps {
  label: string
  value: string
  onChange: (value: string) => void
  testId?: string
  className?: string
}

/**
 * A native `<input type="date">`, deliberately.
 *
 * T-10.4's custom `Select` exists because a native `<select>` renders with OS
 * chrome and looks unfinished beside custom fields. A date input is a different
 * case: its picker is a platform affordance people already know, it is
 * keyboard- and screen-reader-accessible for free, and re-implementing it means
 * a calendar widget's worth of bugs. The `DatePicker` primitive covers the
 * preset-driven case where the presets ARE the feature.
 *
 * It lives here rather than at the call site because T-10.18 bans raw `<input>`
 * outside `components/ui` — and the rule is right: this is the one place the
 * height, border and focus treatment should be decided.
 */
export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(function DateInput(
  { label, value, onChange, testId, className },
  ref,
) {
  const id = useId()

  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <label htmlFor={id} className="text-sm text-secondary">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        data-testid={testId}
        className={cn(CONTROL_BASE, CONTROL_IDLE, 'h-btn-md px-2 outline-none')}
      />
    </div>
  )
})
