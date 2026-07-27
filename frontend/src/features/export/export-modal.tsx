'use client'

/**
 * The export modal (T-34.2, T-34.8 – T-34.10, T-34.12).
 *
 * One modal, two targets: a single meeting (Notepad header, Notebook row
 * kebab) or a bulk selection (Notebook bulk bar → one zip, T-34.9). It lives
 * in `features/export` because BOTH notebook and notepad open it — the same
 * shape as `features/edit`, the recorded precedent for a shared feature
 * module (and, like `edit`, it is outside the eslint cross-import fence).
 *
 * The download is a raw fetch, not a mutation: nothing in the cache changes,
 * so the global MutationCache error handler (providers.tsx) never sees it —
 * success AND failure toasts are owned here. While the request runs the modal
 * is not dismissible, the submit button carries the spinner, and a status line
 * flips to "still working" at 10s so a slow PDF is never a dead spinner
 * (T-34.8).
 */

import { useQueryClient } from '@tanstack/react-query'
import { AlignLeft, Copy, FileCode, FileText, FileType } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/controls'
import { Modal } from '@/components/ui/modal'
import { RadioCardGroup, type RadioCardOption } from '@/components/ui/radio-card'
import { useToast } from '@/components/ui/toast'
import { useActionItems } from '@/lib/api/action-items'
import type { CommentOut } from '@/lib/api/comments'
import {
  bulkExportUrl,
  downloadExport,
  fallbackExportFilename,
  meetingExportUrl,
  type ExportFormat,
} from '@/lib/api/export'
import { useMeeting } from '@/lib/api/meetings'
import { qk } from '@/lib/api/query-keys'
import { useSummary } from '@/lib/api/summaries'
import { useTranscript } from '@/lib/api/transcript'
import type { HighlightOut, MeetingDetail, Page } from '@/lib/api/types'
import { summaryToMarkdown } from '@/lib/summary/to-markdown'
import { TOAST_MESSAGES } from '@/lib/toast/messages'
import { LOCALE, formatTimestamp, pluralize } from '@/lib/utils/format'

import { estimateExportSize } from './estimate'
import { buildMeetingMarkdown } from './meeting-markdown'
import { EXPORT_SECTIONS, type ExportSectionId } from './sections'

export type ExportTarget =
  { kind: 'single'; meeting: MeetingDetail } | { kind: 'bulk'; ids: readonly number[] }

const FORMAT_OPTIONS: ReadonlyArray<RadioCardOption<ExportFormat>> = [
  {
    value: 'pdf',
    label: 'PDF',
    description: 'Paginated and branded — best for sharing',
    icon: <FileText size={16} strokeWidth={1.75} />,
  },
  {
    value: 'md',
    label: 'Markdown',
    description: 'Pastes cleanly into Notion or GitHub',
    icon: <FileCode size={16} strokeWidth={1.75} />,
  },
  {
    value: 'txt',
    label: 'Plain text',
    description: 'Fixed-width, no markup',
    icon: <AlignLeft size={16} strokeWidth={1.75} />,
  },
  {
    value: 'docx',
    label: 'Word',
    description: 'An editable .docx document',
    icon: <FileType size={16} strokeWidth={1.75} />,
  },
]

/** When "Preparing…" becomes "Still working…" (T-34.8: never a dead spinner). */
const SLOW_AFTER_MS = 10_000

const NUMBER = new Intl.NumberFormat(LOCALE)

interface ExportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: ExportTarget
}

export function ExportModal({ open, onOpenChange, target }: ExportModalProps) {
  const toast = useToast()

  const [format, setFormat] = useState<ExportFormat>('pdf')
  // Everything checked by default: the include parameter is always sent
  // explicitly, so what the user sees ticked is exactly what the file holds.
  const [include, setInclude] = useState<ReadonlySet<ExportSectionId>>(
    () => new Set(EXPORT_SECTIONS.map((section) => section.id)),
  )
  const [pending, setPending] = useState(false)
  const [slow, setSlow] = useState(false)

  // Same double-fire guard as ConfirmDialog: `pending` disables on the next
  // render, the ref is true synchronously, so two clicks in one frame cannot
  // both start a download.
  const fired = useRef(false)

  // Focus lands on the checked format card — the first decision to make.
  const formatRef = useRef<HTMLButtonElement>(null)

  /*
   * Estimate + clipboard sources, single-target only. All three queries are
   * already warm when the modal opens from the Notepad (its panels fetched
   * them), so these are cache hits; from the Notebook row they load once on
   * open. Bulk mode fetches nothing — an estimate across N unloaded meetings
   * would mean N requests for a number.
   */
  const meetingId = open && target.kind === 'single' ? target.meeting.id : null
  const { data: summary } = useSummary(meetingId)
  const { data: transcript } = useTranscript(meetingId)
  const { data: actionItems } = useActionItems(meetingId)

  /*
   * Comments are READ from the cache rather than subscribed to, because the
   * export modal is not a reason to fetch them: the notepad's flyout has
   * already loaded them whenever the user is somewhere they'd think about
   * comments, and from a Notebook row an absent cache simply contributes
   * nothing to the estimate and no section to the clipboard copy.
   */
  const client = useQueryClient()
  const comments =
    meetingId === null
      ? undefined
      : client.getQueryData<Page<CommentOut>>(qk.meetings.comments(meetingId))?.items
  // Same contract as comments: cache-only, absent contributes nothing.
  const highlights =
    meetingId === null
      ? undefined
      : client.getQueryData<HighlightOut[]>(qk.meetings.highlights(meetingId))

  const estimate = useMemo(
    () => estimateExportSize({ include, summary, transcript, actionItems, comments, highlights }),
    [include, summary, transcript, actionItems, comments, highlights],
  )

  const includeList = EXPORT_SECTIONS.filter((section) => include.has(section.id)).map(
    (section) => section.id,
  )
  const nothingSelected = includeList.length === 0

  /** True once every INCLUDED section's data is loaded — excluded sections
   * cannot hold the estimate (or the copy button) hostage. Comments are absent
   * from this list on purpose: nothing here fetches them, so waiting on them
   * would be waiting forever. */
  const sourcesReady =
    (!include.has('summary') || summary !== undefined) &&
    (!include.has('transcript') || transcript !== undefined) &&
    (!include.has('actions') || actionItems !== undefined)

  const toggle = (id: ExportSectionId, next: boolean) =>
    setInclude((current) => {
      const set = new Set(current)
      if (next) set.add(id)
      else set.delete(id)
      return set
    })

  const submit = async () => {
    if (fired.current) return
    fired.current = true
    setPending(true)
    const slowTimer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS)

    try {
      if (target.kind === 'single') {
        await downloadExport(
          meetingExportUrl(target.meeting.id, format, includeList),
          fallbackExportFilename(target.meeting.title, target.meeting.started_at, format),
        )
      } else {
        await downloadExport(
          bulkExportUrl(target.ids, format, includeList),
          `meetings-export-${new Date().toISOString().slice(0, 10)}.zip`,
        )
      }
      toast.success(TOAST_MESSAGES.exportReady)
      onOpenChange(false)
    } catch {
      // Reported HERE or nowhere — no MutationCache behind a raw fetch. The
      // modal stays open with every choice intact, ready to retry (T-34.8).
      toast.error(TOAST_MESSAGES.exportFailed)
    } finally {
      window.clearTimeout(slowTimer)
      setSlow(false)
      setPending(false)
      fired.current = false
    }
  }

  const copy = async (text: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(successMessage)
    } catch {
      toast.error(TOAST_MESSAGES.copyFailed)
    }
  }

  const copyMarkdown = () => {
    if (target.kind !== 'single') return
    const text = buildMeetingMarkdown({
      meeting: target.meeting,
      include,
      summary,
      transcript,
      actionItems,
      comments,
      highlights,
    })
    void copy(text, TOAST_MESSAGES.markdownCopied)
  }

  const copySummary = () => {
    if (target.kind !== 'single' || !summary) return
    const text = summaryToMarkdown(summary, {
      title: target.meeting.title,
      formatTime: formatTimestamp,
    })
    void copy(text, TOAST_MESSAGES.summaryCopied)
  }

  const title =
    target.kind === 'single'
      ? 'Export meeting'
      : `Export ${pluralize(target.ids.length, 'meeting')}`

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Choose a format and which sections to include."
      size="md"
      testId="export-modal"
      // Closing mid-request would leave the user unsure whether a file is
      // coming — same call as ConfirmDialog while a delete is in flight.
      dismissible={!pending}
      initialFocusRef={formatRef}
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          {target.kind === 'single' && (
            <span className="mr-auto flex flex-wrap items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<Copy size={14} strokeWidth={1.75} />}
                onClick={copyMarkdown}
                disabled={pending || nothingSelected || !sourcesReady}
                data-testid="export-copy-markdown"
              >
                Copy as Markdown
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={copySummary}
                disabled={pending || !summary}
                data-testid="export-copy-summary"
              >
                Copy summary only
              </Button>
            </span>
          )}
          <Button
            variant="primary"
            onClick={() => void submit()}
            loading={pending}
            disabled={nothingSelected}
            data-testid="export-submit"
          >
            Export
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <p className="text-label uppercase text-muted">Format</p>
          <RadioCardGroup
            value={format}
            onValueChange={setFormat}
            options={FORMAT_OPTIONS}
            label="Export format"
            testIdPrefix="export-format"
            focusRef={formatRef}
          />
        </div>

        <div className="space-y-2">
          <p className="text-label uppercase text-muted">Include</p>
          <div className="flex flex-col items-start gap-2">
            {EXPORT_SECTIONS.map((section) => (
              <Checkbox
                key={section.id}
                checked={include.has(section.id)}
                onCheckedChange={(next) => toggle(section.id, next)}
                label={section.label}
                disabled={pending}
                testId={`export-include-${section.id}`}
              />
            ))}
          </div>
        </div>

        {target.kind === 'single' ? (
          <p aria-live="polite" className="text-sm text-muted" data-testid="export-estimate">
            {nothingSelected ? (
              'Choose at least one section to export'
            ) : !sourcesReady ? (
              'Estimating size…'
            ) : (
              <>
                {'≈ '}
                <span className="tnum">{NUMBER.format(estimate.words)}</span>
                {estimate.words === 1 ? ' word' : ' words'}
                {(format === 'pdf' || format === 'docx') && (
                  <>
                    {' · ≈ '}
                    <span className="tnum">{estimate.pages}</span>
                    {estimate.pages === 1 ? ' page' : ' pages'}
                  </>
                )}
              </>
            )}
          </p>
        ) : (
          <p className="text-sm text-muted" data-testid="export-estimate">
            <span className="tnum">{target.ids.length}</span>
            {target.ids.length === 1 ? ' meeting' : ' meetings'} will download as a single .zip
            file, one document per meeting.
          </p>
        )}

        {pending && (
          <p role="status" className="text-sm text-secondary" data-testid="export-status">
            {slow ? 'Still working — large exports can take a moment…' : 'Preparing your export…'}
          </p>
        )}
      </div>
    </Modal>
  )
}

/**
 * The modal for callers that only hold an id — the Notebook row kebab. Same
 * shape as EditMeetingModalById: a list row is a title and some counts, so the
 * detail is fetched when the modal opens rather than shipped with every row.
 */
export function ExportModalById({
  meetingId,
  onClose,
}: {
  meetingId: number | null
  onClose: () => void
}) {
  const { data: meeting } = useMeeting(meetingId)

  if (meetingId === null || !meeting) return null

  return (
    <ExportModal
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      target={{ kind: 'single', meeting }}
    />
  )
}
