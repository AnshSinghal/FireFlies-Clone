'use client'

/**
 * The meeting details drawer (T-15).
 *
 * Fireflies shows this from the list without leaving the page, and reproducing
 * that is the point — a modal in the centre of the screen, or a navigation, is
 * a different interaction.
 *
 * Its open state lives in `?details=<id>` (T-15.12), so it is deep-linkable and
 * survives a refresh.
 */

import { ArrowUpRight, Lock, X } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/controls'
import { IconButton } from '@/components/ui/icon-button'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonText } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { useActionItems, useToggleActionItem } from '@/lib/api/action-items'
import { useMeeting, useUpdateMeeting } from '@/lib/api/meetings'
import { useSummary } from '@/lib/api/summaries'
import type { MeetingDetail, ParticipantDetail } from '@/lib/api/types'
import { TOAST_MESSAGES } from '@/lib/toast/messages'
import { cn } from '@/lib/utils/cn'
import {
  formatDuration,
  formatFullDate,
  formatRelativeDate,
  formatTime,
  pluralize,
} from '@/lib/utils/format'
import { getSpeakerColorByIndex } from '@/lib/utils/speaker-color'

const VISIBILITY_OPTIONS = [
  { value: 'private', label: 'Private' },
  { value: 'team', label: 'Team' },
  { value: 'public', label: 'Public' },
]

interface DetailsDrawerProps {
  meetingId: number
  onClose: () => void
  /** ←/→ move between meetings without closing the drawer (T-15.11). */
  onNavigate: (direction: -1 | 1) => void
}

export function DetailsDrawer({ meetingId, onClose, onNavigate }: DetailsDrawerProps) {
  const { data: meeting, isPending } = useMeeting(meetingId)
  const panelRef = useRef<HTMLDivElement>(null)

  /*
   * Escape closes, arrows move (T-15.11).
   *
   * Bound to the window rather than the panel so it works wherever focus
   * happens to be — including on the row that opened the drawer, which is
   * where focus starts.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      } else if (event.key === 'ArrowRight') {
        onNavigate(1)
      } else if (event.key === 'ArrowLeft') {
        onNavigate(-1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, onNavigate])

  return (
    <>
      {/* Backdrop only below `sm`, where the drawer is full-width and there is
          nothing left to interact with behind it (T-15.2). */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 z-drawer bg-scrim sm:hidden"
      />

      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="false"
        aria-label="Meeting details"
        data-testid="details-drawer"
        className="ff-drawer fixed inset-y-0 right-0 z-drawer flex w-full flex-col border-l border-subtle bg-surface-0 shadow-lg sm:w-drawer"
      >
        {isPending || !meeting ? (
          <DrawerSkeleton />
        ) : (
          <DrawerBody meeting={meeting} onClose={onClose} />
        )}
      </aside>
    </>
  )
}

function DrawerBody({ meeting, onClose }: { meeting: MeetingDetail; onClose: () => void }) {
  const toast = useToast()
  const update = useUpdateMeeting(meeting.id)
  const { data: summary } = useSummary(meeting.id)
  const { data: actionItems } = useActionItems(meeting.id)

  // See the note at the call site: the preview holds still while its rows are
  // ticked, which the prioritised order the API returns would not.
  const previewItems = useMemo(
    () => [...(actionItems ?? [])].sort((a, b) => a.id - b.id).slice(0, 3),
    [actionItems],
  )
  const toggleItem = useToggleActionItem(meeting.id)

  const [expanded, setExpanded] = useState(false)

  const invited = meeting.participants ?? []
  const attended = invited.filter((p) => p.attended)
  // The longest talker sets the scale, so the bars compare people to each
  // other rather than to the meeting's length — most of which is silence.
  const longest = Math.max(1, ...attended.map((p) => p.talk_seconds))

  return (
    <>
      <header className="flex items-start gap-2 border-b border-subtle p-4">
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="line-clamp-2 text-h3 text-primary">{meeting.title}</h2>
          <Link
            href={`/meeting/${meeting.id}`}
            data-testid="details-open-full"
            className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
          >
            Open full view
            <ArrowUpRight size={14} strokeWidth={2} />
          </Link>
        </div>
        <IconButton
          label="Close details"
          icon={<X size={18} strokeWidth={2} />}
          onClick={onClose}
          data-testid="details-close"
          hideTooltip
        />
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <section className="space-y-2">
          <MetaRow field="host" label="Host" value={meeting.host.name} />
          <MetaRow
            field="date"
            label="Date"
            value={formatRelativeDate(meeting.started_at)}
            title={formatFullDate(meeting.started_at)}
          />
          <MetaRow field="time" label="Time" value={formatTime(meeting.started_at)} />
          <MetaRow
            field="duration"
            label="Duration"
            value={formatDuration(meeting.duration_seconds * 1000)}
          />
          <MetaRow field="language" label="Language" value={meeting.language.toUpperCase()} />
          {meeting.comment_count > 0 && (
            <MetaRow
              field="comments"
              label="Comments"
              value={pluralize(meeting.comment_count, 'comment')}
            />
          )}
          {/* `capitalize` only here: a channel slug is lowercase by design, and
              a person's name is already however they wrote it. */}
          <MetaRow field="source" label="Source" value={meeting.source} capitalize />
          {meeting.channel && (
            <MetaRow field="channel" label="Channel" value={`#${meeting.channel.slug}`} />
          )}
        </section>

        <section className="space-y-1.5" data-testid="details-meta-privacy">
          <div className="flex items-center gap-1.5 text-label uppercase text-muted">
            <Lock size={12} strokeWidth={2} aria-hidden="true" />
            Privacy
          </div>
          <Select
            label="Privacy"
            hideLabel
            value={meeting.visibility}
            onValueChange={(visibility) =>
              update.mutate(
                { visibility: visibility as MeetingDetail['visibility'] },
                { onSuccess: () => toast.success(TOAST_MESSAGES.changesSaved) },
              )
            }
            options={VISIBILITY_OPTIONS}
            testId="details-privacy-select"
            className="w-full"
          />
        </section>

        {summary?.overview && (
          <section className="space-y-1.5">
            <h3 className="text-label uppercase text-muted">Summary</h3>
            <p
              data-testid="details-overview"
              className={cn('text-body text-secondary', !expanded && 'line-clamp-4')}
            >
              {summary.overview}
            </p>
            <Button
              variant="link"
              size="sm"
              onClick={() => setExpanded((v) => !v)}
              data-testid="details-overview-toggle"
            >
              {expanded ? 'Show less' : 'Show more'}
            </Button>
          </section>
        )}

        <section className="space-y-2">
          <h3 className="text-label uppercase text-muted">
            Attended · {pluralize(attended.length, 'person', 'people')}
          </h3>
          <ul className="space-y-2.5" data-testid="details-attended-list">
            {attended.map((person) => (
              <AttendeeRow key={person.id} person={person} longest={longest} />
            ))}
            {attended.length === 0 && <li className="text-sm text-muted">Nobody attended.</li>}
          </ul>
        </section>

        <section className="space-y-2">
          <h3 className="text-label uppercase text-muted">
            Invited · {pluralize(invited.length, 'person', 'people')}
          </h3>
          <ul className="space-y-2" data-testid="details-invited-list">
            {invited.map((person) => (
              <li key={person.id} className="flex items-center gap-2.5">
                <Avatar name={person.display_name} src={person.avatar_url} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body text-primary">
                    {person.display_name}
                  </span>
                  {person.email && (
                    <span className="block truncate text-sm text-muted">{person.email}</span>
                  )}
                </span>
                {!person.attended && <span className="shrink-0 text-xs text-muted">Invited</span>}
              </li>
            ))}
          </ul>
        </section>

        {actionItems && actionItems.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-label uppercase text-muted">Action items</h3>
            <ul className="space-y-2">
              {/*
                A STABLE three, ordered by id.
                
                The API returns items prioritised — open first, then by due
                date (T-24.1) — which is right for the Notepad's full list and
                wrong for a three-item preview: ticking one moves it past the
                cut and it vanishes from under the cursor, with no way to
                untick it. Sorting the preview by id keeps the same three rows
                on screen whatever their status, and the prioritised list is
                one click away.
              */}
              {previewItems.map((item) => (
                <li key={item.id} className="flex items-start gap-2.5">
                  <Checkbox
                    checked={item.status === 'completed'}
                    onCheckedChange={(checked) =>
                      toggleItem.mutate({
                        id: item.id,
                        status: checked ? 'completed' : 'open',
                      })
                    }
                    ariaLabel={item.text}
                    testId={`details-action-item-${item.id}`}
                  />
                  <span
                    className={cn(
                      'min-w-0 flex-1 text-body',
                      item.status === 'completed' ? 'text-muted line-through' : 'text-primary',
                    )}
                  >
                    {item.text}
                  </span>
                </li>
              ))}
            </ul>
            {actionItems.length > 3 && (
              <Link
                href={`/meeting/${meeting.id}`}
                className="text-sm text-accent hover:underline"
                data-testid="details-view-all-actions"
              >
                View all {actionItems.length} →
              </Link>
            )}
          </section>
        )}
      </div>
    </>
  )
}

function MetaRow({
  field,
  label,
  value,
  title,
  capitalize,
}: {
  field: string
  label: string
  value: string
  title?: string
  /** For enum values that arrive lowercase. NOT for names or slugs. */
  capitalize?: boolean
}) {
  return (
    <div className="flex items-baseline gap-3" data-testid={`details-meta-${field}`}>
      <span className="w-20 shrink-0 text-label uppercase text-muted">{label}</span>
      <span
        className={cn('min-w-0 flex-1 truncate text-body text-primary', capitalize && 'capitalize')}
        title={title}
      >
        {value}
      </span>
    </div>
  )
}

function AttendeeRow({ person, longest }: { person: ParticipantDetail; longest: number }) {
  const share = person.talk_seconds / longest

  return (
    <li className="flex items-center gap-2.5">
      <Avatar name={person.display_name} src={person.avatar_url} size="sm" />
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-body text-primary">{person.display_name}</span>
          <span className="tnum shrink-0 text-sm text-muted">
            {formatDuration(person.talk_seconds * 1000)}
          </span>
        </span>
        {/*
          The talk-time bar, in this person's SPEAKER colour — the same one
          they have in the transcript and the outline, because it comes from
          the server-assigned index (ADR-013). This is the detail that makes
          the drawer read as Fireflies rather than as a generic side panel.
        */}
        <span aria-hidden="true" className="block h-1 overflow-hidden rounded-full bg-surface-2">
          <span
            className="block h-full rounded-full"
            style={{
              width: `${Math.round(share * 100)}%`,
              backgroundColor:
                person.color_index === null || person.color_index === undefined
                  ? 'var(--ff-text-muted)'
                  : getSpeakerColorByIndex(person.color_index),
            }}
          />
        </span>
      </span>
    </li>
  )
}

function DrawerSkeleton() {
  return (
    <div
      className="space-y-5 p-4"
      role="status"
      aria-busy="true"
      aria-label="Loading meeting details"
    >
      <Skeleton variant="text" className="h-6 w-2/3" />
      <SkeletonText lines={5} />
      <SkeletonText lines={4} />
    </div>
  )
}
