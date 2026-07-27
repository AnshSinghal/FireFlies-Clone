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
  FolderInput,
  Info,
  Languages,
  Link2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Trash2,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { AvatarGroup } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dropdown, DropdownItem, DropdownSeparator, DropdownSub } from '@/components/ui/dropdown'
import { IconButton } from '@/components/ui/icon-button'
import { InlineEdit } from '@/components/ui/inline-edit'
import { Popover } from '@/components/ui/popover'
import { useToast } from '@/components/ui/toast'
import { SuggestedTags } from '@/features/tags/suggested-tags'
import { MeetingTagEditor } from '@/features/tags/tag-editor'
import { TagChipList } from '@/features/tags/tag-chip'
import { useTagFilter } from '@/features/tags/use-tag-filter'
import { useChannels } from '@/lib/api/channels'
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
  onEditDetails: () => void
  onAskFred: () => void
  askFredOpen: boolean
  /** Opens the export modal (T-34) — the view owns it, like the other modals. */
  onExport: () => void
}

export function NotepadHeader({
  meeting,
  onRegenerate,
  onDelete,
  onEditDetails,
  onAskFred,
  askFredOpen,
  onExport,
}: NotepadHeaderProps) {
  const router = useRouter()
  const toast = useToast()
  const client = useQueryClient()
  // Shared by the metadata line's tag affordance and the kebab's `Edit tags`
  // (T-36.3): two entry points, one editor.
  const [tagsOpen, setTagsOpen] = useState(false)

  const { data: channels } = useChannels()
  const update = useUpdateMeeting(meeting.id)

  /** T-36.7: one channel per meeting, so moving is a single PATCH. */
  const moveToChannel = (channel: { id: number; slug: string }) => {
    update.mutate(
      { channel_id: channel.id },
      {
        onSuccess: () => {
          // The sidebar's per-channel counts just changed.
          void client.invalidateQueries({ queryKey: ['channels'] })
          toast.success(`Moved to #${channel.slug}`)
        },
      },
    )
  }

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
        <MetadataLine meeting={meeting} tagsOpen={tagsOpen} onTagsOpenChange={setTagsOpen} />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Sparkles size={16} strokeWidth={1.75} />}
          onClick={onAskFred}
          aria-pressed={askFredOpen}
          data-testid="notepad-askfred"
          className={cn(askFredOpen && 'bg-accent-subtle text-accent hover:bg-accent-subtle')}
        >
          Ask Fred
        </Button>

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
          <DropdownItem
            icon={<SlidersHorizontal size={16} strokeWidth={1.75} />}
            onSelect={onEditDetails}
            testId="notepad-edit-details"
          >
            Edit details
          </DropdownItem>
          <DropdownItem
            icon={<Tag size={16} strokeWidth={1.75} />}
            onSelect={() => setTagsOpen(true)}
            testId="notepad-edit-tags"
          >
            Edit tags
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
          <DropdownItem
            icon={<Download size={16} strokeWidth={1.75} />}
            onSelect={onExport}
            testId="notepad-export"
          >
            Export
          </DropdownItem>
          <DropdownSub label="Move to channel" icon={<FolderInput size={16} strokeWidth={1.75} />}>
            {(channels?.channels ?? []).map((channel) => (
              <DropdownItem
                key={channel.id}
                // The channel the meeting is already in is not a move.
                disabled={meeting.channel?.id === channel.id}
                onSelect={() => moveToChannel({ id: channel.id, slug: channel.slug })}
                testId={`notepad-move-${channel.slug}`}
              >
                #{channel.slug}
              </DropdownItem>
            ))}
            {(channels?.channels ?? []).length === 0 && (
              <DropdownItem disabled>No channels yet</DropdownItem>
            )}
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

function MetadataLine({
  meeting,
  tagsOpen,
  onTagsOpenChange,
}: {
  meeting: MeetingDetail
  tagsOpen: boolean
  onTagsOpenChange: (open: boolean) => void
}) {
  const participants = meeting.participants ?? []
  const applyTagFilter = useTagFilter()
  const tags = meeting.tags ?? []

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

      {/*
        The FULL tag list (T-36.2) plus suggestions (T-36.4), inline in the
        metadata line — the header's height is fixed, so overflow scrolls
        horizontally rather than wrapping into a second line. Chips filter the
        notebook: from here that is a navigation, not a URL tweak.
      */}
      <Separator />
      <span
        className="flex min-w-0 shrink items-center gap-1 overflow-x-auto"
        data-testid="notepad-tags"
      >
        <TagChipList tags={tags} size="sm" onFilter={applyTagFilter} />
        <SuggestedTags meetingId={meeting.id} currentTags={tags} size="sm" />
        <MeetingTagEditor
          meetingId={meeting.id}
          tags={tags}
          open={tagsOpen}
          onOpenChange={onTagsOpenChange}
          align="start"
          trigger={
            <IconButton
              size="sm"
              label={tags.length > 0 ? 'Edit tags' : 'Add tags'}
              icon={<Tag size={14} strokeWidth={1.75} />}
              data-testid="notepad-tags-edit"
            />
          }
        />
      </span>
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
