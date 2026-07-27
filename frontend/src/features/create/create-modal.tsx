'use client'

/**
 * Creating a meeting (T-26).
 *
 * Three ways in — a file, a paste, or nothing at all — and one preview step
 * before anything is written. The preview is what makes upload trustworthy:
 * it says which rule matched, what it found, and lets the speakers be
 * corrected while correcting them is still cheap.
 */

import { FileText, Upload } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'

import { Button } from '@/components/ui/button'
import { FileInput, Input, Textarea } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Tabs, TabPanel } from '@/components/ui/controls'
import { useToast } from '@/components/ui/toast'
import { ApiError } from '@/lib/api/client'
import {
  useCreateMeeting,
  useParseTranscript,
  type PreviewSegment,
  type TranscriptPreview,
} from '@/lib/api/import'
import { useDebounce } from '@/lib/hooks/use-debounce'
import { TOAST_MESSAGES } from '@/lib/toast/messages'
import { cn } from '@/lib/utils/cn'

import { SAMPLE_TRANSCRIPT } from './sample-transcript'
import { TranscriptPreviewPanel } from './transcript-preview'

/** Mirrors the API. Checked here so a wrong file never becomes a request. */
const ACCEPTED = ['.txt', '.vtt', '.srt', '.json'] as const
const MAX_BYTES = 10 * 1024 * 1024

export type CreateTab = 'upload' | 'paste' | 'manual'

export function CreateModal({
  open,
  onOpenChange,
  initialTab = 'upload',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialTab?: CreateTab
}) {
  const router = useRouter()
  const toast = useToast()

  const parse = useParseTranscript()
  const create = useCreateMeeting()

  const [tab, setTab] = useState<CreateTab>(initialTab)
  const [preview, setPreview] = useState<TranscriptPreview | null>(null)
  const [title, setTitle] = useState('')
  const [titleError, setTitleError] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  /** Renamed speakers, keyed by the name the parser found (T-26.7). */
  const [renames, setRenames] = useState<Record<string, string>>({})

  const reset = useCallback(() => {
    setPreview(null)
    setTitle('')
    setTitleError(null)
    setFileError(null)
    setRenames({})
    parse.reset()
  }, [parse])

  const acceptFile = useCallback(
    (file: File) => {
      setFileError(null)

      const extension = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`
      if (!ACCEPTED.includes(extension as (typeof ACCEPTED)[number])) {
        // Refused WITHOUT a request. The API checks too, but a round-trip to
        // be told a .pdf is a .pdf is a round-trip nobody needed.
        setFileError(`We can't read ${extension} files. Supported: ${ACCEPTED.join(', ')}.`)
        return
      }

      if (file.size > MAX_BYTES) {
        setFileError(
          `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 10 MB.`,
        )
        return
      }

      // The filename is the best guess at a title, and the user can change it.
      setTitle((current) => current || file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '))

      parse.mutate(
        { file },
        {
          onSuccess: (result) => {
            setPreview(result)
            if (result.title) setTitle(result.title)
          },
        },
      )
    },
    [parse],
  )

  const submit = () => {
    const trimmed = title.trim()
    if (!trimmed) {
      setTitleError('A meeting needs a title')
      return
    }

    const segments: PreviewSegment[] | undefined = preview?.segments.map((segment) => ({
      ...segment,
      // The corrected name, applied to every line that speaker has.
      speaker: renames[segment.speaker] ?? segment.speaker,
    }))

    create.mutate(
      {
        title: trimmed,
        participant_names: (preview?.speakers ?? []).map((name) => renames[name] ?? name),
        segments,
      },
      {
        onSuccess: (meeting) => {
          toast.success(TOAST_MESSAGES.meetingCreated)
          onOpenChange(false)
          reset()
          router.push(`/meeting/${meeting.id}`)
        },
      },
    )
  }

  const parseError = parse.error instanceof ApiError ? parse.error : null

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
      title="New meeting"
      description="Upload a transcript, paste one, or start an empty meeting."
      size="lg"
      testId="create-modal"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={create.isPending}
            // Disabled only where there is genuinely nothing to create: the
            // upload and paste tabs need a parsed transcript first.
            disabled={tab !== 'manual' && !preview}
            data-testid="create-submit"
          >
            Create meeting
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Tabs
          value={tab}
          onValueChange={(next) => {
            setTab(next as CreateTab)
            reset()
          }}
          tabs={[
            { value: 'upload', label: 'Upload file' },
            { value: 'paste', label: 'Paste transcript' },
            { value: 'manual', label: 'Create manually' },
          ]}
          testId="create-tabs"
        >
          <TabPanel value="upload" className="pt-4">
            <Dropzone
              onFile={acceptFile}
              pending={parse.isPending}
              error={fileError ?? parseError?.message ?? null}
              hint={typeof parseError?.details.hint === 'string' ? parseError.details.hint : null}
            />
          </TabPanel>

          <TabPanel value="paste" className="pt-4">
            <PasteTab
              onParsed={(result) => {
                setPreview(result)
                if (result.title) setTitle((current) => current || result.title!)
              }}
              onCleared={() => setPreview(null)}
            />
          </TabPanel>

          <TabPanel value="manual" className="pt-4">
            <p className="text-body text-secondary">
              Creates an empty meeting you can add a transcript to later. Useful for a call somebody
              took notes on by hand.
            </p>
          </TabPanel>
        </Tabs>

        <Input
          label="Title"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value)
            setTitleError(null)
          }}
          error={titleError ?? undefined}
          required
          placeholder="Q3 Product Roadmap Sync"
          data-testid="create-title"
        />

        {preview && (
          <TranscriptPreviewPanel
            preview={preview}
            renames={renames}
            onRename={(from, to) => setRenames((current) => ({ ...current, [from]: to }))}
          />
        )}
      </div>
    </Modal>
  )
}

function Dropzone({
  onFile,
  pending,
  error,
  hint,
}: {
  onFile: (file: File) => void
  pending: boolean
  error: string | null
  hint: string | null
}) {
  const [over, setOver] = useState(false)

  return (
    <div className="space-y-2">
      <label
        data-testid="create-dropzone"
        data-dragover={over || undefined}
        onDragOver={(event) => {
          // Both are required: without `preventDefault` the browser navigates
          // to the file instead of letting the page have it.
          event.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault()
          setOver(false)
          const file = event.dataTransfer.files[0]
          if (file) onFile(file)
        }}
        className={cn(
          'flex h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors duration-fast',
          over ? 'border-accent bg-accent-subtle' : 'border-strong hover:border-accent',
        )}
      >
        <Upload size={28} strokeWidth={1.5} aria-hidden="true" className="text-muted" />
        <span className="text-body-strong text-primary">
          {pending ? 'Reading…' : 'Drag and drop a transcript file'}
        </span>
        <span className="text-sm text-muted">
          or <span className="text-accent underline">browse</span>
        </span>
        <span className="text-xs text-muted">Supports {ACCEPTED.join(', ')} · max 10 MB</span>

        <FileInput
          label="Choose a transcript file"
          accept={ACCEPTED}
          onFile={onFile}
          data-testid="create-file-input"
        />
      </label>

      {error && (
        <p role="alert" data-testid="create-file-error" className="text-sm text-danger">
          {error}
          {hint && <span className="mt-1 block text-muted">{hint}</span>}
        </p>
      )}
    </div>
  )
}

function PasteTab({
  onParsed,
  onCleared,
}: {
  onParsed: (preview: TranscriptPreview) => void
  onCleared: () => void
}) {
  const parse = useParseTranscript()
  const [text, setText] = useState('')

  // 500ms, per T-26.9: long enough that typing a sentence is one parse, short
  // enough that the preview feels live.
  const debounced = useDebounce(text, 500)

  const lastParsed = useState<string | null>(null)
  const [seen, setSeen] = lastParsed

  if (debounced !== seen) {
    setSeen(debounced)
    if (debounced.trim().length > 10) {
      parse.mutate(
        { text: debounced, extension: 'txt' },
        { onSuccess: onParsed, onError: onCleared },
      )
    } else {
      onCleared()
    }
  }

  const error = parse.error instanceof ApiError ? parse.error : null

  return (
    <div className="space-y-2">
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        label="Transcript"
        placeholder={'[00:14] Sarah Chen: Good morning everyone.\n[00:22] Marcus Patel: Morning.'}
        data-testid="create-paste-input"
        className="font-mono text-sm"
        autoGrow={false}
      />

      <div className="flex items-center gap-3">
        <Button
          variant="link"
          onClick={() => setText(SAMPLE_TRANSCRIPT)}
          data-testid="create-load-sample"
          className="text-sm"
        >
          <FileText size={14} strokeWidth={1.75} aria-hidden="true" className="mr-1 inline" />
          Load sample
        </Button>
        <span className="text-xs text-muted">
          Timestamps optional — without them we estimate from reading speed.
        </span>
      </div>

      {error && (
        <p role="alert" data-testid="create-paste-error" className="text-sm text-danger">
          {error.message}
        </p>
      )}
    </div>
  )
}
