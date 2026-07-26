'use client'

/**
 * Grid view (T-12.13).
 *
 * The secondary view, behind a toggle. The reference's primary view is a list
 * and the plan's ❌ list is explicit that a card grid must not be the default —
 * this is the opt-in.
 */

import { FileAudio, Play } from 'lucide-react'
import Link from 'next/link'

import { AvatarGroup } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/chip'
import { Highlighter } from '@/components/ui/highlighter'
import type { MeetingListItem } from '@/lib/api/types'
import { formatDuration, formatRelativeDate } from '@/lib/utils/format'

export function MeetingGrid({
  meetings,
  query,
}: {
  meetings: readonly MeetingListItem[]
  query?: string
}) {
  return (
    <ul
      data-testid="meeting-grid"
      // `auto-fill` with a 300px floor: the columns follow the container rather
      // than a breakpoint, so the grid works inside the Notepad's resizable
      // panel as well as full width.
      className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4"
    >
      {meetings.map((meeting) => (
        <li key={meeting.id}>
          <Link
            href={`/meeting/${meeting.id}`}
            data-testid={`meeting-card-${meeting.id}`}
            className="flex h-full flex-col overflow-hidden rounded-lg border border-subtle bg-surface-0 transition-colors duration-fast hover:border-strong"
          >
            <span
              className={`flex h-24 items-center justify-center ${
                meeting.has_media ? 'bg-accent-subtle' : 'bg-surface-2'
              }`}
              aria-hidden="true"
            >
              {meeting.has_media ? (
                <Play size={24} strokeWidth={2} className="fill-accent text-accent" />
              ) : (
                <FileAudio size={24} strokeWidth={1.5} className="text-muted" />
              )}
            </span>

            <span className="flex flex-1 flex-col gap-2 p-3">
              {/* Two lines then ellipsis. `min-h` reserves both, so a one-line
                  title does not make its card shorter than its neighbours. */}
              <Highlighter
                text={meeting.title}
                query={query}
                testId="meeting-card-title"
                className="line-clamp-2 min-h-11 text-title-row text-primary"
              />

              <span className="flex items-center gap-1.5 text-sm text-muted">
                <span data-testid="meeting-card-date">
                  {formatRelativeDate(meeting.started_at)}
                </span>
                <span aria-hidden="true">·</span>
                <span className="tnum">{formatDuration(meeting.duration_seconds * 1000)}</span>
              </span>

              <span className="mt-auto flex items-center justify-between gap-2">
                <AvatarGroup
                  size="sm"
                  max={3}
                  total={Math.max(meeting.participant_count, 1)}
                  people={[
                    { name: meeting.host.name, avatar_url: meeting.host.avatar_url },
                    ...(meeting.participants ?? [])
                      .filter((p) => p.display_name !== meeting.host.name)
                      .map((p) => ({ name: p.display_name, avatar_url: p.avatar_url })),
                  ]}
                />
                {meeting.action_item_counts.open > 0 && (
                  <Badge variant="accent">{meeting.action_item_counts.open} open</Badge>
                )}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
