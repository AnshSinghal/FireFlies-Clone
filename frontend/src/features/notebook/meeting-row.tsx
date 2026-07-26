'use client'

/**
 * One meeting in the Notebook (T-12.5 – T-12.12).
 *
 * A bordered CARD in a date-grouped list, not a row in a column table — see
 * ADR-036. The whole card is a `<Link>` so middle-click and ⌘-click behave
 * like links, with the checkbox and kebab stopping propagation.
 */

import {
  ChevronRight,
  Copy,
  Download,
  FileAudio,
  FolderInput,
  MoreHorizontal,
  Pencil,
  Play,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { AvatarGroup } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/chip'
import { Checkbox } from '@/components/ui/controls'
import { Dropdown, DropdownItem, DropdownSeparator, DropdownSub } from '@/components/ui/dropdown'
import { Highlighter } from '@/components/ui/highlighter'
import { IconButton } from '@/components/ui/icon-button'
import { Tooltip } from '@/components/ui/tooltip'
import type { MeetingListItem } from '@/lib/api/types'
import { cn } from '@/lib/utils/cn'
import { formatDuration, formatFullDate, formatRelativeDate, formatTime } from '@/lib/utils/format'

interface MeetingRowProps {
  meeting: MeetingListItem
  selected: boolean
  onSelectedChange: (selected: boolean) => void
  /** True while ANY row is selected — keeps every checkbox visible mid-selection. */
  anySelected: boolean
  /** Highlights the matching term in the title. */
  query?: string
  onDelete: (id: number) => void
  /** Roving tabindex: only the focused row is tabbable (T-12.12). */
  tabIndex: number
  onFocus: () => void
}

export function MeetingRow({
  meeting,
  selected,
  onSelectedChange,
  anySelected,
  query,
  onDelete,
  tabIndex,
  onFocus,
}: MeetingRowProps) {
  const [hovered, setHovered] = useState(false)
  const showCheckbox = hovered || anySelected || selected

  const { open, completed } = meeting.action_item_counts
  const href = `/meeting/${meeting.id}`

  return (
    <li
      data-testid="meeting-row"
      data-selected={selected || undefined}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      className={cn(
        // `h-row` (72px) on the CARD, so its height is a token rather than the
        // sum of whatever is inside it. The skeleton uses the same token, which
        // is what keeps the two from drifting and the layout from jumping when
        // data lands.
        'group relative h-row rounded-lg border transition-colors duration-fast',
        selected
          ? 'border-accent-subtle bg-accent-subtle'
          : 'border-subtle bg-surface-0 hover:border-strong',
      )}
    >
      {/* The 2px accent edge on a selected card. A sibling rather than a
          border-left so the card's own border stays continuous behind it. */}
      {selected && (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-0.5 rounded-l-lg bg-accent"
        />
      )}

      <Link
        href={href}
        data-testid={`meeting-row-${meeting.id}`}
        tabIndex={tabIndex}
        onFocus={onFocus}
        className="flex h-full items-center gap-3 rounded-lg px-3 focus-visible:outline-none"
      >
        {/*
          Leading cell (T-12.6). The 40×40 box is reserved by the WRAPPER, and
          the two children swap inside it, so nothing shifts on hover — T12-D
          asserts the title's bounding box is unchanged.
        */}
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center">
          <span
            className={cn(
              'absolute inset-0 flex items-center justify-center rounded-md transition-opacity duration-fast',
              meeting.has_media ? 'bg-accent-subtle' : 'bg-surface-2',
              showCheckbox ? 'opacity-0' : 'opacity-100',
            )}
            aria-hidden="true"
          >
            {meeting.has_media ? (
              <Play size={16} strokeWidth={2} className="fill-accent text-accent" />
            ) : (
              <FileAudio size={16} strokeWidth={1.75} className="text-muted" />
            )}
          </span>

          <span
            className={cn(
              'absolute inset-0 flex items-center justify-center transition-opacity duration-fast',
              showCheckbox ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
            // Inside a Link: without this the click navigates instead of
            // selecting (T12-F).
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
          >
            <Checkbox
              checked={selected}
              onCheckedChange={onSelectedChange}
              ariaLabel={`Select ${meeting.title}`}
              testId="meeting-row-checkbox"
            />
          </span>
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1">
            <Highlighter
              text={meeting.title}
              query={query}
              testId="meeting-row-title"
              // `title` so a truncated name is readable on hover (T-12.5).
              className="truncate text-title-row text-primary"
            />
            <ChevronRight
              size={14}
              strokeWidth={2}
              aria-hidden="true"
              className="shrink-0 text-muted opacity-0 transition-opacity duration-fast group-hover:opacity-100"
            />
          </span>

          {/*
            One metadata line, as the reference has it: date · time · duration ·
            host. Not four columns — see ADR-036.
          */}
          <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted">
            <Tooltip content={formatFullDate(meeting.started_at)}>
              <span data-testid="meeting-row-date">{formatRelativeDate(meeting.started_at)}</span>
            </Tooltip>
            <Separator />
            <span>{formatTime(meeting.started_at)}</span>
            <Separator />
            {/* tnum so durations line up down the list even unaligned. */}
            <span className="tnum" data-testid="meeting-row-duration">
              {formatDuration(meeting.duration_seconds * 1000)}
            </span>
            <Separator />
            <span className="truncate">{meeting.host.name}</span>
          </span>

          {/* Why a meeting with an unrelated title matched (T-11.3). */}
          {meeting.match_context && (
            <span
              data-testid="meeting-row-match"
              className="mt-0.5 flex min-w-0 items-baseline gap-1.5 text-sm"
            >
              <span className="shrink-0 text-muted">{meeting.match_context.speaker}:</span>
              <Highlighter
                text={meeting.match_context.snippet}
                query={query}
                className="truncate text-secondary"
              />
            </span>
          )}
        </span>

        <span
          className="hidden shrink-0 items-center gap-3 sm:flex"
          data-testid="meeting-row-participants"
        >
          <AvatarGroup
            size="sm"
            people={buildPeople(meeting)}
            max={3}
            // The API sends at most five participants but reports the real
            // total, so `+N` has to come from the total.
            total={Math.max(meeting.participant_count, 1)}
          />
        </span>

        <span
          className="hidden w-24 shrink-0 justify-end md:flex"
          data-testid="meeting-row-actions"
        >
          {/* Never a bare number: "4" beside a meeting means nothing on its own. */}
          {open > 0 ? (
            <Badge variant="accent">{open} open</Badge>
          ) : completed > 0 ? (
            <Badge variant="success">All done</Badge>
          ) : (
            <span className="text-sm text-muted">—</span>
          )}
        </span>
      </Link>

      {/*
        The kebab sits OUTSIDE the Link. Nesting a menu trigger inside an
        anchor is invalid, and Radix's trigger would fight the navigation.
      */}
      <span
        className={cn(
          'absolute right-2 top-1/2 -translate-y-1/2 transition-opacity duration-fast',
          // Always in the DOM so it is reachable by keyboard; only visible on
          // hover or focus, so the resting list stays quiet.
          'opacity-0 focus-within:opacity-100 group-hover:opacity-100',
        )}
      >
        <Dropdown
          testId={`meeting-row-menu-${meeting.id}`}
          trigger={
            <IconButton
              label={`Actions for ${meeting.title}`}
              icon={<MoreHorizontal size={16} strokeWidth={2} />}
              data-testid="meeting-row-kebab"
              hideTooltip
              className="bg-surface-0"
            />
          }
        >
          <DropdownItem icon={<ChevronRight size={16} strokeWidth={1.75} />} href={href}>
            Open
          </DropdownItem>
          <DropdownItem
            icon={<Copy size={16} strokeWidth={1.75} />}
            onSelect={() => {
              void navigator.clipboard?.writeText(`${window.location.origin}${href}`)
            }}
            testId="meeting-row-copy-link"
          >
            Copy link
          </DropdownItem>
          <DropdownItem icon={<Pencil size={16} strokeWidth={1.75} />} soon>
            Rename
          </DropdownItem>
          <DropdownItem icon={<SlidersHorizontal size={16} strokeWidth={1.75} />} soon>
            Edit details
          </DropdownItem>
          <DropdownSub label="Export" icon={<Download size={16} strokeWidth={1.75} />}>
            <DropdownItem soon>PDF</DropdownItem>
            <DropdownItem soon>Markdown</DropdownItem>
            <DropdownItem soon>Plain text</DropdownItem>
          </DropdownSub>
          <DropdownSub label="Move to channel" icon={<FolderInput size={16} strokeWidth={1.75} />}>
            <DropdownItem soon>Choose a channel</DropdownItem>
          </DropdownSub>
          <DropdownSeparator />
          <DropdownItem
            danger
            icon={<Trash2 size={16} strokeWidth={1.75} />}
            onSelect={() => onDelete(meeting.id)}
            testId="meeting-row-delete"
          >
            Delete
          </DropdownItem>
        </Dropdown>
      </span>
    </li>
  )
}

function Separator() {
  return (
    <span aria-hidden="true" className="shrink-0">
      ·
    </span>
  )
}

/**
 * Host first, then the other participants.
 *
 * The host is who you remember a meeting by, so they lead the group rather
 * than appearing wherever the participant list happens to put them. Only real
 * people are returned — the true count is passed separately, because padding
 * the array to reach it would put fabricated names in the tooltip.
 */
function buildPeople(meeting: MeetingListItem) {
  const host = { name: meeting.host.name, avatar_url: meeting.host.avatar_url }
  const others = (meeting.participants ?? [])
    .filter((p) => p.display_name !== meeting.host.name)
    .map((p) => ({ name: p.display_name, avatar_url: p.avatar_url }))

  return [host, ...others]
}
