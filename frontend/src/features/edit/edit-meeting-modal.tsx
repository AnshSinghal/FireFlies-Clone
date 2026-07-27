'use client'

/**
 * Editing a meeting's metadata (T-27).
 *
 * Reachable from the Notebook kebab, the details drawer and the Notepad kebab —
 * all three read the same query cache, so a save updates every one of them
 * without any of them knowing about the others.
 *
 * `Save` sends ONLY what changed. A PATCH that resends every field is a PUT
 * wearing the wrong verb, and it overwrites concurrent edits to fields the
 * user never touched.
 */

import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { useMeeting, useUpdateMeeting } from '@/lib/api/meetings'
import type { MeetingDetail } from '@/lib/api/types'
import { TOAST_MESSAGES } from '@/lib/toast/messages'
import { formatDuration } from '@/lib/utils/format'

import { ParticipantEditor } from './participant-editor'

/** The API's ceiling. The counter appears in the last twenty characters. */
const TITLE_MAX = 200
const COUNTER_FROM = 180

interface Draft {
  title: string
  description: string
  language: string
  visibility: string
  participants: string[]
  hostParticipantId: number | null
}

function toDraft(meeting: MeetingDetail): Draft {
  return {
    title: meeting.title,
    description: meeting.description ?? '',
    language: meeting.language,
    visibility: meeting.visibility,
    participants: (meeting.participants ?? []).map((person) => person.display_name),
    hostParticipantId:
      (meeting.participants ?? []).find((person) => person.display_name === meeting.host?.name)
        ?.id ?? null,
  }
}

export function EditMeetingModal({
  meeting,
  open,
  onOpenChange,
}: {
  meeting: MeetingDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const update = useUpdateMeeting(meeting.id)
  const toast = useToast()

  const initial = useMemo(() => toDraft(meeting), [meeting])
  const [draft, setDraft] = useState<Draft>(initial)
  const [titleError, setTitleError] = useState<string | null>(null)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  /*
   * What actually CHANGED (T-27.6).
   *
   * Computed against the meeting as loaded rather than tracked with a dirty
   * flag per field: one comparison, and it stays correct when a field is
   * changed and then changed back — which a flag would call dirty forever.
   */
  const patch = useMemo(() => {
    const body: Record<string, unknown> = {}

    if (draft.title.trim() !== initial.title) body.title = draft.title.trim()
    if (draft.description !== initial.description) {
      // Empty means "no description", which is null rather than "".
      body.description = draft.description.trim() || null
    }
    if (draft.language !== initial.language) body.language = draft.language
    if (draft.visibility !== initial.visibility) body.visibility = draft.visibility
    if (draft.hostParticipantId !== initial.hostParticipantId) {
      body.host_participant_id = draft.hostParticipantId
    }

    const sameParticipants =
      draft.participants.length === initial.participants.length &&
      draft.participants.every((name, index) => name === initial.participants[index])
    if (!sameParticipants) body.participant_names = draft.participants

    return body
  }, [draft, initial])

  const dirty = Object.keys(patch).length > 0

  const close = () => {
    // Nothing to lose, so no question to ask (T-27.5).
    if (!dirty) {
      onOpenChange(false)
      return
    }
    setConfirmingDiscard(true)
  }

  const save = () => {
    if (!draft.title.trim()) {
      setTitleError('A meeting needs a title')
      return
    }

    update.mutate(patch, {
      onSuccess: () => {
        toast.success(TOAST_MESSAGES.changesSaved)
        onOpenChange(false)
      },
      /*
       * No `onError` here, deliberately.
       *
       * The global mutation handler already raises the failure with a Retry
       * that re-runs this exact mutation (T-09.11) — a second toast from here
       * would say the same thing twice, which is how the first version of this
       * failed its own test.
       *
       * What this modal owns is staying OPEN with the input intact (T-27.10),
       * and it does that by not closing except on success.
       */
    })
  }

  const hostOptions = (meeting.participants ?? []).filter((person) => person.user_id !== null)

  return (
    <>
      <Modal
        open={open}
        onOpenChange={(next) => (next ? onOpenChange(true) : close())}
        title="Edit details"
        description="Changes apply everywhere this meeting appears."
        size="md"
        testId="edit-modal"
        footer={
          <>
            <Button variant="secondary" onClick={close} data-testid="edit-cancel">
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={save}
              loading={update.isPending}
              // Saving nothing is not a save. Disabled until something differs
              // from what was loaded.
              disabled={!dirty}
              data-testid="edit-save"
            >
              Save changes
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <Input
              label="Title"
              value={draft.title}
              maxLength={TITLE_MAX}
              onChange={(event) => {
                set('title', event.target.value)
                setTitleError(null)
              }}
              error={titleError ?? undefined}
              required
              data-testid="edit-title"
            />
            {draft.title.length >= COUNTER_FROM && (
              // Only near the limit: a counter on every title is noise about a
              // ceiling nobody is near.
              <p className="tnum text-right text-xs text-muted" data-testid="edit-title-counter">
                {draft.title.length} / {TITLE_MAX}
              </p>
            )}
          </div>

          <Textarea
            label="Description"
            value={draft.description}
            onChange={(event) => set('description', event.target.value)}
            placeholder="What was this meeting for?"
            data-testid="edit-description"
          />

          <ParticipantEditor
            names={draft.participants}
            speakerNames={meeting.participants?.map((person) => person.display_name) ?? []}
            onChange={(names) => set('participants', names)}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Host"
              value={draft.hostParticipantId === null ? '' : String(draft.hostParticipantId)}
              onValueChange={(value) => set('hostParticipantId', value ? Number(value) : null)}
              testId="edit-host"
              // Only people with an account: the host is a user, and a
              // participant without one cannot be it.
              options={hostOptions.map((person) => ({
                value: String(person.id),
                label: person.display_name,
              }))}
              placeholder="Choose a host"
            />

            <Select
              label="Visibility"
              value={draft.visibility}
              onValueChange={(value) => set('visibility', value)}
              testId="edit-visibility"
              options={[
                { value: 'private', label: 'Private' },
                { value: 'team', label: 'Team' },
                { value: 'public', label: 'Public' },
              ]}
            />
          </div>

          {/*
            Read-only, with the reason (T-27.2). Duration is derived from the
            last segment — a field that accepted a number would let the two
            disagree, and the transcript is the one telling the truth.
          */}
          <p className="text-sm text-muted" data-testid="edit-duration">
            Duration {formatDuration(meeting.duration_seconds * 1000)} · derived from the
            transcript, so it is not editable here.
          </p>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmingDiscard}
        onOpenChange={setConfirmingDiscard}
        title="Discard changes?"
        body="Your edits to this meeting will be lost."
        confirmLabel="Discard"
        onConfirm={() => {
          setDraft(initial)
          setConfirmingDiscard(false)
          onOpenChange(false)
        }}
      />
    </>
  )
}

/**
 * The modal, for callers that only have an id (T-27.1).
 *
 * The Notebook's rows are LIST ITEMS — a title and some counts, not the
 * participants or description the editor needs — so the detail is fetched when
 * the modal opens rather than shipped with every row of a twenty-row page.
 */
export function EditMeetingModalById({
  meetingId,
  onClose,
}: {
  meetingId: number | null
  onClose: () => void
}) {
  const { data: meeting } = useMeeting(meetingId)

  // Nothing is rendered until the meeting arrives: a modal that opens empty and
  // fills in is a modal whose fields move under the cursor.
  if (meetingId === null || !meeting) return null

  return (
    <EditMeetingModal
      meeting={meeting}
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    />
  )
}
