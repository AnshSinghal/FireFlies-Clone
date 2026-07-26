'use client'

/**
 * The meetings library — MINIMAL, proving the data layer end to end.
 *
 * T-12 builds the real thing: the exact row anatomy, hover behaviour, the
 * leading thumbnail/checkbox swap, kebab menus, grid view. What this settles is
 * that the URL drives the query, the query drives the render, and every state
 * (loading, empty, error) has somewhere to go.
 *
 * Note the open question in design.md §2.2 — the reference screenshots show
 * date-grouped CARDS rather than the column table PLAN.md A2.1 specifies. That
 * gets decided in T-12; this renders neither, deliberately.
 */

import { AlertTriangle, Trash2 } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { EmptyInbox, EmptySearch, EmptyState as UiEmptyState } from '@/components/ui/empty-state'
import { IconButton } from '@/components/ui/icon-button'
import { MeetingListSkeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api/client'
import { useMeetings } from '@/lib/api/meetings'
import { useDeleteWithUndo } from '@/lib/hooks/use-delete-with-undo'
import { useNotebookParams } from '@/lib/hooks/use-query-params'
import { formatDuration, formatRelativeDate, pluralize } from '@/lib/utils/format'

export function NotebookView() {
  const { filters } = useNotebookParams()
  const { data, isPending, isError, error, refetch } = useMeetings(filters)

  return (
    <div data-testid="notebook-page">
      <header className="mb-6 flex items-baseline gap-3">
        <h1 className="text-display text-primary">Meetings</h1>
        {data && (
          <span className="text-sm text-muted" data-testid="notebook-count">
            {pluralize(data.total, 'meeting')}
          </span>
        )}
      </header>

      {isPending && <MeetingListSkeleton />}

      {isError && <ErrorState error={error} onRetry={() => void refetch()} />}

      {data && data.items.length === 0 && <EmptyState hasQuery={Boolean(filters.q)} />}

      {data && data.items.length > 0 && (
        <ul className="rounded-lg border border-subtle" data-testid="meeting-list">
          {data.items.map((meeting) => (
            <li
              key={meeting.id}
              className="relative border-b border-subtle last:border-b-0"
              data-testid="meeting-row"
            >
              <Link
                href={`/meeting/${meeting.id}`}
                data-testid={`meeting-row-${meeting.id}`}
                className="flex h-row items-center gap-4 px-4 pr-14 transition-colors duration-fast hover:bg-surface-hover"
              >
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-title-row text-primary"
                    data-testid="meeting-row-title"
                  >
                    {meeting.title}
                  </p>
                  {meeting.overview_preview && (
                    <p className="truncate text-sm text-muted">{meeting.overview_preview}</p>
                  )}
                </div>

                {/* Secondary columns drop out below md. Four fixed-width
                    columns plus gaps need ~420px and the mobile viewport is
                    393 — keeping them forces the whole page to scroll
                    sideways. Title and duration are what a phone needs. */}
                <span
                  className="hidden w-24 shrink-0 text-sm text-muted md:block"
                  data-testid="meeting-row-date"
                >
                  {formatRelativeDate(meeting.started_at)}
                </span>

                <span
                  className="tnum w-16 shrink-0 text-right text-sm text-muted"
                  data-testid="meeting-row-duration"
                >
                  {formatDuration(meeting.duration_seconds * 1000)}
                </span>

                <span
                  className="hidden w-20 shrink-0 text-right text-xs text-muted lg:block"
                  data-testid="meeting-row-participants"
                >
                  {pluralize(meeting.participant_count, 'person', 'people')}
                </span>

                <span
                  className="hidden w-20 shrink-0 text-right md:block"
                  data-testid="meeting-row-actions"
                >
                  {meeting.action_item_counts.open > 0 ? (
                    <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-xs text-accent-strong">
                      {meeting.action_item_counts.open} open
                    </span>
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </span>
              </Link>

              {/*
                PROVISIONAL. T-12.11 replaces this with the row kebab
                (`Open`, `Copy link`, `Rename`, … `Delete`). It exists now
                because T-09's undo flow is the deliverable and a toast with no
                way to trigger it is a toast that is never tested.

                A sibling of the Link, not a child: a button inside an anchor is
                invalid, and the click would navigate before it deleted.
              */}
              <DeleteButton id={meeting.id} title={meeting.title} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function DeleteButton({ id, title }: { id: number; title: string }) {
  const deleteWithUndo = useDeleteWithUndo()

  return (
    <IconButton
      variant="danger"
      // Names the meeting, so eight identical buttons are eight distinct
      // controls to a screen reader.
      label={`Delete ${title}`}
      icon={<Trash2 size={16} strokeWidth={1.75} />}
      onClick={() => void deleteWithUndo(id)}
      data-testid={`meeting-delete-${id}`}
      className="absolute right-3 top-1/2 -translate-y-1/2"
    />
  )
}

function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  // Two genuinely different situations, two different messages (T-13.10).
  // Reusing one for both is on the ❌ list.
  return (
    <UiEmptyState
      testId="notebook-empty"
      illustration={hasQuery ? <EmptySearch /> : <EmptyInbox />}
      title={hasQuery ? 'No meetings match your search' : 'No meetings yet'}
      body={
        hasQuery
          ? 'Try a different term, or clear the search to see everything.'
          : 'Upload a transcript or create a meeting to get started.'
      }
    />
  )
}

function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const code = error instanceof ApiError ? error.code : 'NETWORK_ERROR'
  const message =
    error instanceof Error ? error.message : 'Something went wrong loading your meetings.'

  return (
    <UiEmptyState
      testId="notebook-error"
      illustration={
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-subtle">
          <AlertTriangle size={24} strokeWidth={1.75} className="text-danger" aria-hidden="true" />
        </span>
      }
      title="Couldn't load meetings"
      body={message}
      action={
        <Button variant="primary" onClick={onRetry} data-testid="notebook-retry">
          Try again
        </Button>
      }
      // The code is for whoever is reading the console alongside this; it is
      // deliberately quiet rather than part of the message.
      secondaryAction={<code className="text-xs text-muted">{code}</code>}
    />
  )
}
