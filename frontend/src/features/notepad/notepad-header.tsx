'use client'

/**
 * Notepad header (T-18.2 to T-18.6).
 *
 * Sticky under the topbar, 64px, and the only chrome that moves is the title
 * turning into an input in place.
 */

import {
  ArrowLeft,
  Download,
  Info,
  Languages,
  Link2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Share2,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import { useRouter } from 'next/navigation'

import { AvatarGroup } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dropdown, DropdownItem, DropdownSeparator, DropdownSub } from '@/components/ui/dropdown'
import { IconButton } from '@/components/ui/icon-button'
import { InlineEdit } from '@/components/ui/inline-edit'
import { Popover } from '@/components/ui/popover'
import { useToast } from '@/components/ui/toast'
import { useUpdateMeeting } from '@/lib/api/meetings'
import type { MeetingDetail } from '@/lib/api/types'
import { notebookReturnUrl } from '@/lib/notebook-return'
import { TOAST_MESSAGES } from '@/lib/toast/messages'
import { cn } from '@/lib/utils/cn'
import { formatDuration, formatFullDate, pluralize } from '@/lib/utils/format'

interface NotepadHeaderProps {
  meeting: MeetingDetail
  onRegenerate: () => void
  onDelete: () => void
}

export function NotepadHeader({ meeting, onRegenerate, onDelete }: NotepadHeaderProps) {
  const router = useRouter()
  const toast = useToast()

  return (
    <header
      data-testid="notepad-header"
      className="sticky top-0 z-topbar flex h-16 shrink-0 items-center gap-3 border-b border-subtle bg-surface-0 px-4"
    >
      <IconButton
        label="Back to meetings"
        icon={<ArrowLeft size={18} strokeWidth={2} />}
        onClick={() => router.push(notebookReturnUrl())}
        data-testid="notepad-back"
      />

      <div className="min-w-0 flex-1">
        <EditableTitle meeting={meeting} />
        <MetadataLine meeting={meeting} />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <IconButton
          label="Copy link"
          icon={<Link2 size={18} strokeWidth={1.75} />}
          data-testid="notepad-copy-link"
          onClick={() => {
            // The CURRENT url, including `?t=` — the point of copying a link to
            // a meeting is usually to point at a moment in it (T-18.5).
            void navigator.clipboard?.writeText(window.location.href)
            toast.success(TOAST_MESSAGES.linkCopied)
          }}
        />

        <Popover
          label="Share"
          align="end"
          testId="notepad-share"
          trigger={
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Share2 size={16} strokeWidth={1.75} />}
              data-testid="notepad-share-button"
            >
              Share
            </Button>
          }
        >
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-body-strong text-primary">Share this meeting</p>
              <p className="text-sm text-muted">
                Anyone with the link can view it. Team sharing is not part of this build.
              </p>
            </div>
            <Button
              variant="secondary"
              fullWidth
              leftIcon={<Link2 size={16} strokeWidth={1.75} />}
              data-testid="notepad-share-copy"
              onClick={() => {
                void navigator.clipboard?.writeText(window.location.href)
                toast.success(TOAST_MESSAGES.linkCopied)
              }}
            >
              Copy public link
            </Button>
          </div>
        </Popover>

        <Dropdown
          testId="notepad-menu"
          trigger={
            <IconButton
              label="More actions"
              icon={<MoreHorizontal size={18} strokeWidth={2} />}
              data-testid="notepad-kebab"
              hideTooltip
            />
          }
        >
          <DropdownItem icon={<Pencil size={16} strokeWidth={1.75} />} soon>
            Rename
          </DropdownItem>
          <DropdownItem icon={<SlidersHorizontal size={16} strokeWidth={1.75} />} soon>
            Edit details
          </DropdownItem>
          <DropdownItem
            icon={<RefreshCw size={16} strokeWidth={1.75} />}
            onSelect={onRegenerate}
            testId="notepad-regenerate"
          >
            Regenerate summary
          </DropdownItem>
          <DropdownItem icon={<Languages size={16} strokeWidth={1.75} />} soon>
            Change language
          </DropdownItem>
          <DropdownSub label="Download" icon={<Download size={16} strokeWidth={1.75} />}>
            <DropdownItem soon>PDF</DropdownItem>
            <DropdownItem soon>Markdown</DropdownItem>
            <DropdownItem soon>Plain text</DropdownItem>
          </DropdownSub>
          <DropdownItem icon={<Info size={16} strokeWidth={1.75} />} soon>
            Meeting info
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem
            danger
            icon={<Trash2 size={16} strokeWidth={1.75} />}
            onSelect={onDelete}
            testId="notepad-delete"
          >
            Delete meeting
          </DropdownItem>
        </Dropdown>
      </div>
    </header>
  )
}

function EditableTitle({ meeting }: { meeting: MeetingDetail }) {
  const toast = useToast()
  const update = useUpdateMeeting(meeting.id)

  return (
    <InlineEdit
      value={meeting.title}
      ariaLabel="Meeting title"
      emptyError="Title cannot be empty"
      testId="notepad-title"
      className="text-h3 text-primary"
      onSave={(title) =>
        update.mutate({ title }, { onSuccess: () => toast.success(TOAST_MESSAGES.changesSaved) })
      }
    />
  )
}

function MetadataLine({ meeting }: { meeting: MeetingDetail }) {
  const participants = meeting.participants ?? []

  return (
    <div className="flex min-w-0 items-center gap-2 text-sm text-muted" data-testid="notepad-meta">
      <span className="truncate">{formatFullDate(meeting.started_at)}</span>
      <Separator />
      <span className="tnum">{formatDuration(meeting.duration_seconds * 1000)}</span>
      <Separator />

      <Popover
        label="Participants"
        align="start"
        testId="notepad-participants"
        trigger={
          <Button
            variant="link"
            size="sm"
            data-testid="notepad-participant-count"
            className="shrink-0 text-sm text-muted hover:text-primary"
          >
            {pluralize(participants.length, 'participant')}
          </Button>
        }
      >
        <div className="space-y-2">
          <AvatarGroup
            size="sm"
            max={5}
            people={participants.map((p) => ({ name: p.display_name, avatar_url: p.avatar_url }))}
          />
          <ul className="max-h-64 space-y-1.5 overflow-y-auto">
            {participants.map((person) => (
              <li key={person.id} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-body text-primary">
                  {person.display_name}
                </span>
                {!person.attended && <span className="shrink-0 text-xs text-muted">Invited</span>}
              </li>
            ))}
          </ul>
        </div>
      </Popover>

      <Separator />
      <span className={cn('shrink-0 uppercase')}>{meeting.language}</span>
    </div>
  )
}

function Separator() {
  return (
    <span aria-hidden="true" className="shrink-0">
      ·
    </span>
  )
}
