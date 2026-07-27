'use client'

/**
 * The create-soundbite modal (T-33.2, T-33.3).
 *
 * Opened from the selection toolbar pre-filled with the selection's range and
 * text; the trimmer refines the range, Preview loops it through the player's
 * `playRange`, and the 3s/3min bounds are enforced with a visible message
 * rather than a silent clamp (T33-C) — the server enforces the same limits.
 */

import { Pause, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { MAX_SOUNDBITE_MS, MIN_SOUNDBITE_MS, useCreateSoundbite } from '@/lib/api/soundbites'
import { usePlayer } from '@/lib/player/player-context'
import { TOAST_MESSAGES } from '@/lib/toast/messages'

import { ClipTrimmer } from './clip-trimmer'

export interface SoundbiteDraft {
  startMs: number
  endMs: number
  /** Suggested title — the selected text, cut to the server's 120-char cap. */
  title: string
}

interface SoundbiteModalProps {
  meetingId: number
  draft: SoundbiteDraft | null
  onClose: () => void
}

/** How close to the clip's end "stopped" still counts as the auto-pause. */
const LOOP_TOLERANCE_MS = 300

export function SoundbiteModal({ meetingId, draft, onClose }: SoundbiteModalProps) {
  // Mounted fresh per draft, so every open starts from ITS selection rather
  // than inheriting the previous open's edits.
  if (!draft) return null
  return <OpenSoundbiteModal meetingId={meetingId} draft={draft} onClose={onClose} />
}

function OpenSoundbiteModal({
  meetingId,
  draft,
  onClose,
}: {
  meetingId: number
  draft: SoundbiteDraft
  onClose: () => void
}) {
  const player = usePlayer()
  const toast = useToast()
  const create = useCreateSoundbite(meetingId)
  const titleRef = useRef<HTMLInputElement | null>(null)

  const [title, setTitle] = useState(draft.title)
  const [range, setRange] = useState({ startMs: draft.startMs, endMs: draft.endMs })

  /*
   * Whether the LOOP is live. A ref, not state: the visible "previewing" is
   * derived from the player itself (is OUR range armed?), which already
   * re-renders this component through the context. The ref only tells the
   * loop effect whether an auto-pause should re-arm — writing it never needs
   * a render of its own, which keeps `react-hooks/set-state-in-effect` honest.
   */
  const loopingRef = useRef(false)

  const previewing =
    player.activeRange !== null &&
    player.activeRange.startMs === range.startMs &&
    player.activeRange.endMs === range.endMs

  const length = range.endMs - range.startMs
  const lengthError =
    length < MIN_SOUNDBITE_MS
      ? 'Soundbites must be at least 3 seconds long'
      : length > MAX_SOUNDBITE_MS
        ? 'Soundbites can be at most 3 minutes long'
        : null

  /*
   * Preview LOOPS the range (T-33.3). The engine auto-pauses at the clip's end
   * and clears the constraint; this effect re-arms it — but only when the stop
   * happened AT the end. A cleared range anywhere else means the user seeked
   * away (T33-F), and yanking them back would override an explicit action.
   */
  useEffect(() => {
    if (!loopingRef.current || player.activeRange !== null) return
    if (!player.isPlaying && player.currentMs >= range.endMs - LOOP_TOLERANCE_MS) {
      player.playRange(range.startMs, range.endMs)
    } else {
      loopingRef.current = false
    }
  }, [player, range])

  const stopPreview = () => {
    loopingRef.current = false
    player.pause()
    player.clearRange()
  }

  const togglePreview = () => {
    if (previewing) {
      stopPreview()
    } else {
      loopingRef.current = true
      player.playRange(range.startMs, range.endMs)
    }
  }

  const close = () => {
    if (loopingRef.current || previewing) stopPreview()
    onClose()
  }

  const submit = () => {
    const trimmed = title.trim()
    if (!trimmed || lengthError) return
    if (previewing) stopPreview()
    create.mutate(
      {
        title: trimmed.slice(0, 120),
        start_ms: range.startMs,
        end_ms: range.endMs,
        auto_generated: false,
      },
      {
        onSuccess: () => {
          toast.success(TOAST_MESSAGES.soundbiteCreated)
          onClose()
        },
      },
    )
  }

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) close()
      }}
      title="Create soundbite"
      description="Trim the clip, give it a name, and save it to this meeting."
      size="md"
      testId="soundbite-modal"
      initialFocusRef={titleRef}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            data-testid="soundbite-create"
            loading={create.isPending}
            disabled={title.trim().length === 0 || lengthError !== null}
            onClick={submit}
          >
            Create soundbite
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          ref={titleRef}
          label="Title"
          required
          maxLength={120}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Name this clip"
          data-testid="soundbite-title"
        />

        <ClipTrimmer
          meetingId={meetingId}
          durationMs={player.durationMs}
          startMs={range.startMs}
          endMs={range.endMs}
          onChange={(startMs, endMs) => setRange({ startMs, endMs })}
        />

        <div className="flex items-center justify-between gap-3">
          <Button
            variant="secondary"
            size="sm"
            data-testid="soundbite-preview"
            disabled={lengthError !== null}
            leftIcon={
              previewing && player.isPlaying ? (
                <Pause size={14} strokeWidth={1.75} />
              ) : (
                <Play size={14} strokeWidth={1.75} />
              )
            }
            onClick={togglePreview}
          >
            {previewing ? 'Stop preview' : 'Preview'}
          </Button>

          {lengthError && (
            <p role="alert" data-testid="soundbite-length-error" className="text-sm text-danger">
              {lengthError}
            </p>
          )}
        </div>
      </div>
    </Modal>
  )
}
