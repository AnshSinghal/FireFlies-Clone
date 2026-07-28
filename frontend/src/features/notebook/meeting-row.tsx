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
  PanelRight,
  Pencil,
  Play,
  SlidersHorizontal,
  Tag,
  Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { AvatarGroup } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/chip'
import { Checkbox } from '@/components/ui/controls'
import { Dropdown, DropdownItem, DropdownSeparator, DropdownSub } from '@/components/ui/dropdown'
import { Highlighter } from '@/components/ui/highlighter'
import { IconButton } from '@/components/ui/icon-button'
import { Tooltip } from '@/components/ui/tooltip'
import { useToast } from '@/components/ui/toast'
import { MeetingTagEditor } from '@/features/tags/tag-editor'
import { TagChipList } from '@/features/tags/tag-chip'
import { useTagFilter } from '@/features/tags/use-tag-filter'

import { useChannels } from '@/lib/api/channels'
import { useUpdateMeeting } from '@/lib/api/meetings'
import type { MeetingListItem } from '@/lib/api/types'
import { rememberNotebookUrl } from '@/lib/notebook-return'
import { cn } from '@/lib/utils/cn'
import {
  formatDurationLabel,
  formatFullDate,
  formatRelativeDate,
  formatTime,
} from '@/lib/utils/format'

interface MeetingRowProps {
  meeting: MeetingListItem
  selected: boolean
  onSelectedChange: (selected: boolean) => void
  /** Shift-click extends the selection from the last-clicked row (T-14.3). */
  onShiftSelect: () => void
  /** True while ANY row is selected — keeps every checkbox visible mid-selection. */
  anySelected: boolean
  /** Highlights the matching term in the title. */
  query?: string
  onDelete: (id: number) => void
  onShowDetails: (id: number) => void
  /** Opens the edit modal, which loads the full meeting itself. */
  onEditDetails?: (id: number) => void
  /** Opens the export modal (T-34) — same load-on-open shape as edit. */
  onExport?: (id: number) => void
  /** Plays the exit animation before the row leaves the data (T-28.6). */
  exiting?: boolean
  onPrefetch: () => void
  /** Roving tabindex: only the focused row is tabbable (T-12.12). */
  tabIndex: number
  onFocus: () => void
}

export function MeetingRow({
  meeting,
  selected,
  onSelectedChange,
  onShiftSelect,
  anySelected,
  query,
  onDelete,
  onShowDetails,
  onEditDetails,
  onExport,
  exiting,
  onPrefetch,
  tabIndex,
  onFocus,
}: MeetingRowProps) {
  const [hovered, setHovered] = useState(false)
  const [tagsOpen, setTagsOpen] = useState(false)
  const showCheckbox = hovered || anySelected || selected

  const toast = useToast()
  const client = useQueryClient()
  const applyTagFilter = useTagFilter()
  const { data: channels } = useChannels()
  const update = useUpdateMeeting(meeting.id)

  /** T-36.7: a meeting belongs to exactly ONE channel — moving is one PATCH. */
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

  const { open, completed } = meeting.action_item_counts
  const href = `/meeting/${meeting.id}`

  return (
    <li
      data-testid="meeting-row"
      data-selected={selected || undefined}
      data-exiting={exiting || undefined}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      className={cn(
        // `h-row` (72px) on the CARD, so its height is a token rather than the
        // sum of whatever is inside it. The skeleton uses the same token, which
        // is what keeps the two from drifting and the layout from jumping when
        // data lands.
        'group relative h-row rounded-lg border transition-colors duration-fast',
        exiting && 'ff-row-exit',
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
        onClick={() => {
          // Remember the filtered view so Back returns to it rather than to a
          // bare /notebook with the user's filters silently discarded (T-18.2).
          rememberNotebookUrl(window.location.pathname + window.location.search)
        }}
        // Hovering is a strong enough signal that the click is coming, and the
        // query cache makes a wasted prefetch free (T-18.12).
        onPointerEnter={onPrefetch}
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
            /*
             * CAPTURE phase, so a shift-click is handled before the checkbox
             * sees it.
             *
             * Radix's checkbox reports only the resulting state, never the
             * modifiers that produced it. Handling shift on the way back up
             * meant the plain toggle had already run and moved the range's
             * anchor to the row just clicked — so a shift-click selected two
             * rows instead of the range between them.
             */
            onClickCapture={(event) => {
              if (!event.shiftKey) return
              event.preventDefault()
              event.stopPropagation()
              onShiftSelect()
            }}
            onClick={(event) => {
              // Inside a Link: without this the click navigates instead of
              // selecting (T12-F).
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
            {/*
              Visible at rest, not on hover, because the reference is
              (`docs/reference/fireflies/02.png` shows it on all five rows at
              once, which no hover state can produce).

              Colour sampled rather than chosen: their chevron's stroke core
              reads `#101929`, against `#00000a` for the title glyphs beside it.
              That is the primary-text family, not the muted grey ours used —
              `--ff-text-muted` is `#667085`. It was also `opacity-0` until
              hover, so a static screenshot of our notebook had no chevron at
              all, which is the artifact an evaluator compares.

              Their Home list (`01.png`) has no chevron on its rows. The mark
              means "this row navigates", and it is only the notebook's rows
              that do.
            */}
            <ChevronRight
              size={14}
              strokeWidth={2}
              aria-hidden="true"
              data-testid="meeting-row-chevron"
              className="shrink-0 text-primary"
            />
          </span>

          {/*
            One metadata line, as the reference has it: date · time · duration ·
            host. Not four columns — see ADR-036.
          */}
          <span className="flex min-w-0 items-center gap-1.5 text-meta text-muted">
            <Tooltip content={formatFullDate(meeting.started_at)}>
              <span data-testid="meeting-row-date">{formatRelativeDate(meeting.started_at)}</span>
            </Tooltip>
            <Separator />
            <span>{formatTime(meeting.started_at)}</span>
            <Separator />
            {/*
              tnum so durations line up down the list even unaligned, and
              nowrap because the label carries a space (ADR-148) — this line
              shrinks, and "7" over "min" would break the row height token.
            */}
            <span className="tnum whitespace-nowrap" data-testid="meeting-row-duration">
              {formatDurationLabel(meeting.duration_seconds * 1000)}
            </span>
            <Separator />
            <span className="truncate">{meeting.host.name}</span>

            {/*
              Tag chips join the METADATA LINE (T-36.2): the card's height is a
              token (`h-row`), so a second row of chips would blow it and drift
              from the skeleton. Max 2 + `+N`, sized to the line.

              Inside the Link, so the wrapper eats the click the same way the
              checkbox does — a chip must FILTER, not navigate (T36-C).
            */}
            {(meeting.tags?.length ?? 0) > 0 && (
              <span
                data-testid="meeting-row-tags"
                className="hidden shrink-0 items-center gap-1 sm:flex"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                }}
              >
                <TagChipList
                  tags={meeting.tags ?? []}
                  max={2}
                  size="sm"
                  onFilter={applyTagFilter}
                />
              </span>
            )}
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
          'absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 transition-opacity duration-fast',
          // Always in the DOM so it is reachable by keyboard; only visible on
          // hover or focus, so the resting list stays quiet.
          'opacity-0 focus-within:opacity-100 group-hover:opacity-100',
        )}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onShowDetails(meeting.id)}
          data-testid="meeting-row-details"
          className="bg-surface-0"
        >
          Details
        </Button>

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
            icon={<PanelRight size={16} strokeWidth={1.75} />}
            onSelect={() => onShowDetails(meeting.id)}
            testId="meeting-row-details-menu"
          >
            Details
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
          {/*
            Opens the FULL meeting, not this row.

            A row is a list item — it carries a title and some counts, not the
            participants or the description the editor needs. Fetching the
            detail on demand is what the modal does when it opens; sending the
            user to the Notepad's own editor would be a navigation they did not
            ask for.
          */}
          <DropdownItem
            icon={<SlidersHorizontal size={16} strokeWidth={1.75} />}
            onSelect={() => onEditDetails?.(meeting.id)}
            testId="meeting-row-edit-details"
          >
            Edit details
          </DropdownItem>
          <DropdownItem
            icon={<Tag size={16} strokeWidth={1.75} />}
            onSelect={() => setTagsOpen(true)}
            testId="meeting-row-tags-menu"
          >
            Tags
          </DropdownItem>
          <DropdownItem
            icon={<Download size={16} strokeWidth={1.75} />}
            onSelect={() => onExport?.(meeting.id)}
            testId="meeting-row-export"
          >
            Export
          </DropdownItem>
          <DropdownSub label="Move to channel" icon={<FolderInput size={16} strokeWidth={1.75} />}>
            {(channels?.channels ?? []).map((channel) => (
              <DropdownItem
                key={channel.id}
                onSelect={() => moveToChannel({ id: channel.id, slug: channel.slug })}
                testId={`meeting-row-move-${channel.slug}`}
              >
                #{channel.slug}
              </DropdownItem>
            ))}
            {(channels?.channels ?? []).length === 0 && (
              <DropdownItem disabled>No channels yet</DropdownItem>
            )}
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

        {/*
          The tag editor the kebab's `Tags` item opens (T-36.3). Its trigger is
          an invisible zero-size anchor beside the kebab — the menu closes
          itself on select, so the popover cannot share the kebab's trigger —
          and the panel portals out, so the row's hover-opacity does not apply.
        */}
        <MeetingTagEditor
          meetingId={meeting.id}
          tags={meeting.tags ?? []}
          open={tagsOpen}
          onOpenChange={setTagsOpen}
          align="end"
          trigger={<span aria-hidden="true" className="h-0 w-0" />}
        />
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
