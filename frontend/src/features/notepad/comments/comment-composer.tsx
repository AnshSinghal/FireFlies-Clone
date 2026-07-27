'use client'

/**
 * Inline comment composer (T-31.3, T-31.4).
 *
 * Anchored below a segment or a thread: avatar + textarea + Cancel/Comment,
 * `⌘Enter` submits. Typing `@` opens an autocomplete over THIS meeting's
 * participants; a pick inserts `@Display Name` into the text and records the
 * participant id, and the id is only submitted if its token is still present
 * when the comment is posted — deleting the text deletes the mention.
 *
 * The text deliberately survives a failed post (T31-G): it clears on success,
 * never on error — losing a paragraph to a 500 is the cardinal composer sin.
 */

import { useRef, useState } from 'react'

import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { useCurrentUser } from '@/lib/api/me'
import type { CommentCreate } from '@/lib/api/comments'

export interface MentionOption {
  id: number
  displayName: string
}

interface CommentComposerProps {
  participants: MentionOption[]
  onSubmit: (payload: Pick<CommentCreate, 'body' | 'mentions'>) => Promise<unknown>
  onCancel: () => void
  placeholder?: string
  autoFocus?: boolean
  testId?: string
}

export function CommentComposer({
  participants,
  onSubmit,
  onCancel,
  placeholder = 'Add a comment…',
  autoFocus = true,
  testId = 'comment-composer',
}: CommentComposerProps) {
  const { data: user } = useCurrentUser()
  const [body, setBody] = useState('')
  const [picked, setPicked] = useState<MentionOption[]>([])
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const suggestions =
    mentionQuery === null
      ? []
      : participants.filter((participant) =>
          participant.displayName.toLowerCase().startsWith(mentionQuery.toLowerCase()),
        )

  function trackMentionQuery(value: string, caret: number) {
    // The query is whatever sits between the last `@` and the caret, provided
    // the `@` starts a word — `email@host` must not open the picker.
    const upToCaret = value.slice(0, caret)
    const at = upToCaret.lastIndexOf('@')
    if (at < 0 || (at > 0 && !/\s/.test(upToCaret[at - 1] ?? ''))) {
      setMentionQuery(null)
      return
    }
    const query = upToCaret.slice(at + 1)
    setMentionQuery(/^[\w ]{0,40}$/.test(query) ? query : null)
  }

  function pick(option: MentionOption) {
    const element = textareaRef.current
    const caret = element?.selectionStart ?? body.length
    const upToCaret = body.slice(0, caret)
    const at = upToCaret.lastIndexOf('@')
    const next = `${body.slice(0, at)}@${option.displayName} ${body.slice(caret)}`
    setBody(next)
    setPicked((current) =>
      current.some((mention) => mention.id === option.id) ? current : [...current, option],
    )
    setMentionQuery(null)
    element?.focus()
  }

  async function submit() {
    const trimmed = body.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    try {
      await onSubmit({
        body: trimmed,
        // Only tokens still present count — the text is the source of truth.
        mentions: picked
          .filter((mention) => trimmed.includes(`@${mention.displayName}`))
          .map((mention) => mention.id),
      })
      setBody('')
      setPicked([])
      onCancel()
    } catch {
      // Keep the text (T31-G); the global mutation handler owns the toast.
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex gap-2.5" data-testid={testId}>
      <Avatar name={user?.name ?? 'You'} src={user?.avatar_url} size="sm" />
      <div className="relative min-w-0 flex-1 space-y-2">
        <Textarea
          ref={textareaRef}
          value={body}
          rows={2}
          placeholder={placeholder}
          autoFocus={autoFocus}
          data-testid={`${testId}-input`}
          onChange={(event) => {
            setBody(event.target.value)
            trackMentionQuery(event.target.value, event.target.selectionStart ?? 0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              void submit()
            }
            if (event.key === 'Escape') onCancel()
          }}
        />

        {suggestions.length > 0 && (
          <ul
            role="listbox"
            aria-label="Mention a participant"
            data-testid="comment-mention-list"
            className="absolute z-popover w-56 rounded-md border border-subtle bg-surface-0 py-1 shadow-lg"
          >
            {suggestions.slice(0, 5).map((option) => (
              <li key={option.id}>
                <Button
                  variant="ghost"
                  size="sm"
                  role="option"
                  aria-selected="false"
                  fullWidth
                  data-testid={`comment-mention-${option.id}`}
                  className="justify-start gap-2 rounded-none px-3"
                  leftIcon={<Avatar name={option.displayName} size="sm" />}
                  onClick={() => pick(option)}
                >
                  <span className="truncate">{option.displayName}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!body.trim() || submitting}
            onClick={() => void submit()}
            data-testid="comment-submit"
          >
            Comment
          </Button>
        </div>
      </div>
    </div>
  )
}
