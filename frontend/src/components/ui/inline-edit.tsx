'use client'

/**
 * Edit-in-place text (T-18.3).
 *
 * The whole point is that NOTHING SHIFTS when it switches modes: the input
 * inherits the display element's typography and carries no border or padding of
 * its own. A styled input here makes the header jump on every edit, which is
 * the tell that an inline edit is really a form in disguise.
 *
 * A primitive rather than a one-off because the same interaction is wanted for
 * speaker names (T-23) and action-item text (T-24) — and because T-10.18 bans
 * raw `<input>` outside `components/ui`, which is the rule that surfaced the
 * duplication before it happened.
 */

import { Pencil } from 'lucide-react'
import { useRef, useState } from 'react'

import { cn } from '@/lib/utils/cn'

interface InlineEditProps {
  value: string
  /** Called only when the value actually CHANGED and passed validation. */
  onSave: (value: string) => void
  /** Applied to both the display element and the input, so they match exactly. */
  className?: string
  ariaLabel: string
  /** Message shown when the trimmed value is empty. */
  emptyError?: string
  testId?: string
  /** Hides the hover pencil, for places where the affordance would be noise. */
  hideIcon?: boolean
}

export function InlineEdit({
  value,
  onSave,
  className,
  ariaLabel,
  emptyError = 'This cannot be empty',
  testId,
  hideIcon,
}: InlineEditProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState<string | null>(null)

  const start = () => {
    setDraft(value)
    setError(null)
    setEditing(true)
    // After paint: the input does not exist until this render commits.
    requestAnimationFrame(() => inputRef.current?.select())
  }

  const commit = () => {
    const next = draft.trim()

    if (!next) {
      /*
       * Rejected INLINE, and editing continues.
       *
       * Silently reverting an empty value looks like a failed save — the user
       * cannot tell "you cannot do that" from "it did not work".
       */
      setError(emptyError)
      inputRef.current?.focus()
      return
    }

    setEditing(false)
    setError(null)
    if (next !== value) onSave(next)
  }

  const cancel = () => {
    // Reverts WITHOUT saving. No mutation fires, which T18-C asserts.
    setEditing(false)
    setDraft(value)
    setError(null)
  }

  if (!editing) {
    return (
      <span className="group/inline flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          onClick={start}
          data-testid={testId}
          className={cn('min-w-0 truncate text-left hover:underline', className)}
        >
          {value}
        </button>
        {!hideIcon && (
          <Pencil
            size={13}
            strokeWidth={2}
            aria-hidden="true"
            className="shrink-0 text-muted opacity-0 transition-opacity duration-fast group-hover/inline:opacity-100"
          />
        )}
      </span>
    )
  }

  return (
    <span className="block min-w-0">
      <input
        ref={inputRef}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value)
          setError(null)
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            cancel()
          }
        }}
        aria-label={ariaLabel}
        aria-invalid={error ? true : undefined}
        data-testid={testId ? `${testId}-input` : undefined}
        // No border, no padding, no background — only the inherited typography.
        className={cn('w-full bg-transparent outline-none', className)}
      />
      {error && (
        <span
          role="alert"
          data-testid={testId ? `${testId}-error` : undefined}
          className="block text-sm text-danger"
        >
          {error}
        </span>
      )}
    </span>
  )
}
