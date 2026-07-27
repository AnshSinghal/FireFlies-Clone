'use client'

/**
 * The inline add-item composer (T-24.5).
 *
 * INLINE, not a modal. A modal for one line of text stops everything else to
 * ask for a sentence, and the thing people actually do here is add three items
 * in a row — so `Enter` saves and keeps the composer open, ready for the next.
 */

import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import type { ActionItemPatch } from '@/lib/api/action-items'
import type { ParticipantDetail } from '@/lib/api/types'

interface ActionItemComposerProps {
  participants: ParticipantDetail[]
  pending: boolean
  onSubmit: (payload: ActionItemPatch) => void
  onCancel: () => void
}

export function ActionItemComposer({
  participants,
  pending,
  onSubmit,
  onCancel,
}: ActionItemComposerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  const [text, setText] = useState('')
  const [assignee, setAssignee] = useState('unassigned')
  const [dueDate, setDueDate] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submit = () => {
    const trimmed = text.trim()

    if (!trimmed) {
      /*
       * Blocked HERE, with no request sent.
       *
       * The API rejects it too — that is the half that cannot be bypassed —
       * but a round-trip to be told the empty box is empty is a round-trip
       * that did not need to happen.
       */
      setError('An action item needs some text')
      inputRef.current?.focus()
      return
    }

    onSubmit({
      text: trimmed,
      assignee_participant_id: assignee === 'unassigned' ? null : Number(assignee),
      due_date: dueDate,
    })

    // Cleared but still open, for the next one. The assignee and date are kept
    // — adding three tasks for the same person is the common case.
    setText('')
    setError(null)
    inputRef.current?.focus()
  }

  return (
    <div
      data-testid="action-item-composer"
      className="space-y-2 rounded-lg border border-subtle bg-surface-1 p-2"
    >
      <Input
        ref={inputRef}
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          setError(null)
        }}
        placeholder="What needs doing?"
        aria-label="Action item text"
        error={error ?? undefined}
        data-testid="action-item-composer-text"
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            submit()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
          }
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Select
          label="Assignee"
          hideLabel
          value={assignee}
          onValueChange={setAssignee}
          testId="action-item-composer-assignee"
          options={[
            { value: 'unassigned', label: 'Unassigned' },
            // Participants only: an action item belongs to somebody who was
            // in the meeting, and the API enforces the same rule.
            ...participants.map((person) => ({
              value: String(person.id),
              label: person.display_name,
            })),
          ]}
        />

        {/*
          A native date input rather than the `DatePicker` primitive: that one
          picks a RANGE, for the Notebook's filters. This is one day, and the
          platform's own control brings a calendar, keyboard entry and locale
          formatting with nothing to maintain.
        */}
        <Input
          type="date"
          value={dueDate ?? ''}
          onChange={(event) => setDueDate(event.target.value || null)}
          aria-label="Due date"
          data-testid="action-item-composer-due"
          className="w-40"
        />

        <span className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            data-testid="action-item-composer-cancel"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={submit}
            loading={pending}
            data-testid="action-item-composer-save"
          >
            Add
          </Button>
        </span>
      </div>
    </div>
  )
}
