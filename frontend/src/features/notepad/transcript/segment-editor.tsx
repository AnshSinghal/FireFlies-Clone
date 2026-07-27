'use client'

/**
 * A transcript line, editable in place (T-25.2, T-25.10).
 *
 * A `textarea` that inherits the paragraph's typography exactly, so switching
 * modes moves nothing. Auto-grows, because a transcript line wraps to three or
 * four lines and a fixed-height box with its own scrollbar inside a scrolling
 * list is two scrollbars competing for the same gesture.
 */

import { useEffect, useRef, useState } from 'react'

import { Textarea } from '@/components/ui/input'
import { cn } from '@/lib/utils/cn'

interface SegmentEditorProps {
  segmentId: number
  value: string
  /** Fires on every keystroke; the session debounces the save. */
  onChange: (previous: string, next: string) => void
  /** Fires on blur and on ⌘S. */
  onCommit: () => void
}

/** The ceiling the API enforces; checked here so the message is immediate. */
const MAX_CHARS = 5000

export function SegmentEditor({ segmentId, value, onChange, onCommit }: SegmentEditorProps) {
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState<string | null>(null)

  /*
   * The draft FOLLOWS the segment when it changes underneath.
   *
   * An undo writes the previous text to the server and the new value arrives
   * as a prop — but a draft held in state ignores it, so ⌘Z appeared to do
   * nothing while the database said otherwise. This is React's documented
   * recipe for adjusting state to a prop: compare against the last value seen,
   * during render, so there is no frame where the two disagree.
   */
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    setDraft(value)
  }

  // What the line said when this editor mounted — the `previous` an undo
  // restores, and what an empty draft reverts to.
  const original = useRef(value)

  useEffect(() => {
    original.current = value
  }, [value])

  const commit = () => {
    const trimmed = draft.trim()

    if (!trimmed) {
      /*
       * REJECTED, and the line is put back (T-25.10).
       *
       * An empty transcript line is not an edit, it is a deletion by accident
       * — and the API refuses it too, so accepting it here would only produce
       * a 422 the user cannot act on.
       */
      setError('A line cannot be empty')
      setDraft(original.current)
      return
    }

    if (trimmed.length > MAX_CHARS) {
      setError(`A line cannot be longer than ${MAX_CHARS.toLocaleString()} characters`)
      return
    }

    setError(null)
    onCommit()
  }

  return (
    <span className="block">
      <Textarea
        value={draft}
        aria-label="Edit transcript line"
        aria-invalid={error ? true : undefined}
        data-testid={`segment-editor-${segmentId}`}
        autoGrow
        error={error ?? undefined}
        onChange={(event) => {
          const next = event.target.value
          setDraft(next)
          setError(null)
          if (next.trim()) onChange(original.current, next.trim())
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            setDraft(original.current)
            setError(null)
            event.currentTarget.blur()
          } else if (event.key === 's' && (event.metaKey || event.ctrlKey)) {
            // Explicit save, for people who do not trust autosave — and there
            // is no reason not to honour it (T-25.3).
            event.preventDefault()
            commit()
          }
        }}
        // The paragraph's typography, exactly: same size, same leading, no
        // border of its own, so the switch into edit mode reflows nothing.
        className={cn(
          'min-h-0 resize-none border-transparent bg-transparent px-0 py-0 text-transcript',
          'focus:border-transparent focus:shadow-none',
        )}
      />
    </span>
  )
}
