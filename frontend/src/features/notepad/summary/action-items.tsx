'use client'

/**
 * Action items (T-24).
 *
 * Grouped by assignee, open before completed, with Unassigned last. The
 * grouping is what makes the list answerable — "what do I owe from this
 * meeting" is the question people bring to it, and a flat list makes them scan
 * for their own name.
 */

import { Check, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/controls'
import { Dropdown, DropdownItem } from '@/components/ui/dropdown'
import { InlineEdit } from '@/components/ui/inline-edit'
import { IconButton } from '@/components/ui/icon-button'
import { TimestampButton } from '@/components/ui/media-controls'
import { SkeletonText } from '@/components/ui/skeleton'
import { StateView } from '@/components/ui/state-view'
import { useToast } from '@/components/ui/toast'
import {
  useActionItems,
  useCreateActionItem,
  useDeleteActionItem,
  useToggleActionItem,
  useUpdateActionItem,
} from '@/lib/api/action-items'
import type { ActionItemOut, ParticipantDetail } from '@/lib/api/types'
import { describeDueDate, type DueTone } from '@/lib/action-items/due-date'
import { useNotepadCommands } from '@/lib/notepad/commands'
import { TOAST_MESSAGES } from '@/lib/toast/messages'
import { cn } from '@/lib/utils/cn'
import { formatTimestamp } from '@/lib/utils/format'

import { ActionItemComposer } from './action-item-composer'

type Filter = 'all' | 'open' | 'completed'

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'completed', label: 'Completed' },
]

const DUE_TONE: Record<DueTone, string> = {
  overdue: 'bg-danger-subtle text-danger',
  today: 'bg-warning-subtle text-warning',
  upcoming: 'text-muted',
}

interface ActionItemsProps {
  meetingId: number
  participants: ParticipantDetail[]
}

export function ActionItems({ meetingId, participants }: ActionItemsProps) {
  const { data: items, isPending } = useActionItems(meetingId)
  const toggle = useToggleActionItem(meetingId)
  const update = useUpdateActionItem(meetingId)
  const remove = useDeleteActionItem(meetingId)
  const create = useCreateActionItem(meetingId)
  const { seekTo } = useNotepadCommands()
  const toast = useToast()

  const [filter, setFilter] = useState<Filter>('all')
  const [composing, setComposing] = useState(false)

  const all = useMemo(() => items ?? [], [items])
  const completed = all.filter((item) => item.status === 'completed').length

  const visible = useMemo(
    () =>
      all.filter((item) =>
        filter === 'all'
          ? true
          : filter === 'open'
            ? item.status === 'open'
            : item.status === 'completed',
      ),
    [all, filter],
  )

  /*
   * Grouped by assignee, UNASSIGNED LAST.
   *
   * The server already ordered the items, so the groups are built by walking
   * that order — which keeps "open before completed, then by due date" true
   * inside each group without sorting twice.
   */
  const groups = useMemo(() => {
    const byAssignee = new Map<number | null, ActionItemOut[]>()
    for (const item of visible) {
      const key = item.assignee_participant_id
      const existing = byAssignee.get(key)
      if (existing) existing.push(item)
      else byAssignee.set(key, [item])
    }

    return [...byAssignee.entries()]
      .map(([id, groupItems]) => ({
        id,
        name: groupItems[0]?.assignee_name ?? 'Unassigned',
        avatar: groupItems[0]?.assignee_avatar_url ?? null,
        items: groupItems,
      }))
      .sort((a, b) => (a.id === null ? 1 : b.id === null ? -1 : 0))
  }, [visible])

  if (isPending) return <SkeletonText lines={5} />

  return (
    <div data-testid="action-items-section" className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="tnum text-xs text-muted" data-testid="action-items-progress-label">
          {completed} of {all.length} completed
        </span>

        <span className="ml-auto flex items-center gap-1">
          {FILTERS.map((entry) => (
            <Button
              key={entry.value}
              variant="ghost"
              size="sm"
              aria-pressed={filter === entry.value}
              onClick={() => setFilter(entry.value)}
              data-testid={`action-items-filter-${entry.value}`}
              className={cn(filter === entry.value && 'bg-surface-2 text-primary')}
            >
              {entry.label}
            </Button>
          ))}
          <IconButton
            label="Add action item"
            size="sm"
            icon={<Plus size={16} strokeWidth={2} />}
            onClick={() => setComposing(true)}
            data-testid="action-item-add"
          />
        </span>
      </div>

      {/*
        The progress bar (T-24.4). `aria-hidden` because the count beside it
        already says the same thing in words — announcing both is repetition.
      */}
      {all.length > 0 && (
        <div
          aria-hidden="true"
          data-testid="action-items-progress"
          className="h-1 overflow-hidden rounded-full bg-surface-2"
        >
          <div
            className="h-full rounded-full bg-success transition-[width] duration-base"
            style={{ width: `${(completed / all.length) * 100}%` }}
          />
        </div>
      )}

      {composing && (
        <ActionItemComposer
          participants={participants}
          pending={create.isPending}
          onCancel={() => setComposing(false)}
          onSubmit={(payload) => create.mutate(payload)}
        />
      )}

      {all.length === 0 && !composing && (
        <StateView
          variant="empty"
          testId="action-items-empty"
          title="No action items"
          body="Add one manually, or regenerate the summary to extract them."
          className="border-0 py-6"
        />
      )}

      {groups.map((group) => (
        <div
          key={group.id ?? 'unassigned'}
          data-testid={`action-items-group-container-${group.id ?? 'unassigned'}`}
          className="space-y-1"
        >
          <h4
            className="flex items-center gap-2 text-xs text-muted"
            data-testid={`action-items-group-${group.id ?? 'unassigned'}`}
          >
            {group.id !== null && <Avatar name={group.name} src={group.avatar} size="sm" />}
            {group.name}
            <span className="tnum">({group.items.length})</span>
          </h4>

          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const done = item.status === 'completed'
              // No due badge once it is done: the deadline is moot, and a
              // completed task still shouting "13 days overdue" is the app
              // nagging about something already handled.
              const due = done ? null : describeDueDate(item.due_date)

              return (
                <li
                  key={item.id}
                  data-testid={`action-item-${item.id}`}
                  data-status={item.status}
                  className={cn(
                    'group/item flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors duration-fast',
                    done ? 'bg-success-subtle' : 'hover:bg-surface-hover',
                  )}
                >
                  <span className="pt-0.5">
                    <Checkbox
                      checked={done}
                      onCheckedChange={(next) =>
                        toggle.mutate({ id: item.id, status: next ? 'completed' : 'open' })
                      }
                      ariaLabel={item.text}
                      testId={`action-item-checkbox-${item.id}`}
                    />
                  </span>

                  <span className="min-w-0 flex-1 space-y-0.5">
                    <InlineEdit
                      value={item.text}
                      ariaLabel="Action item"
                      emptyError="An action item cannot be empty"
                      testId={`action-item-text-${item.id}`}
                      hideIcon
                      multiline
                      className={cn('text-body', done ? 'text-muted line-through' : 'text-primary')}
                      onSave={(text) => update.mutate({ id: item.id, text })}
                    />

                    <span className="flex flex-wrap items-center gap-2">
                      {due && (
                        <span
                          data-testid={`action-item-due-${item.id}`}
                          data-tone={due.tone}
                          className={cn('rounded-full px-1.5 text-xs', DUE_TONE[due.tone])}
                        >
                          {due.label}
                        </span>
                      )}

                      {item.start_ms !== null && (
                        <TimestampButton
                          data-testid={`action-item-timestamp-${item.id}`}
                          time={formatTimestamp(item.start_ms)}
                          label={`Play from ${formatTimestamp(item.start_ms)}, where this was said`}
                          onClick={() => seekTo(item.start_ms!, { play: true, reveal: true })}
                          className="flex items-center gap-1"
                        />
                      )}

                      {item.source === 'manual' && (
                        <span className="text-xs text-muted" title="Added by hand">
                          <Check size={12} strokeWidth={2} aria-hidden="true" className="inline" />
                        </span>
                      )}
                    </span>
                  </span>

                  <span className="opacity-0 transition-opacity duration-fast focus-within:opacity-100 group-hover/item:opacity-100">
                    <Dropdown
                      align="end"
                      testId={`action-item-menu-${item.id}`}
                      trigger={
                        <IconButton
                          label="Action item options"
                          size="sm"
                          icon={<span aria-hidden="true">⋯</span>}
                          hideTooltip
                          data-testid={`action-item-kebab-${item.id}`}
                        />
                      }
                    >
                      <DropdownItem
                        danger
                        icon={<Trash2 size={16} strokeWidth={1.75} />}
                        testId={`action-item-delete-${item.id}`}
                        onSelect={() => {
                          remove.mutate(item.id)
                          // Undo rather than a confirm dialog: the item is one
                          // line and cheap to restore, and a modal for it is
                          // heavy-handed (T-24.7).
                          toast.success({
                            message: TOAST_MESSAGES.actionItemDeleted,
                            action: {
                              label: 'Undo',
                              /*
                               * Re-CREATED rather than restored, because the
                               * delete is hard — one line of text with no
                               * children does not need the soft-delete
                               * machinery meetings have.
                               *
                               * The values are captured here, not read from a
                               * row: this handler outlives the row it came
                               * from (ADR-026).
                               */
                              onClick: () =>
                                create.mutate({
                                  text: item.text,
                                  assignee_participant_id: item.assignee_participant_id,
                                  due_date: item.due_date,
                                  start_ms: item.start_ms,
                                }),
                            },
                          })
                        }}
                      >
                        Delete
                      </DropdownItem>
                    </Dropdown>
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      {all.length > 0 && visible.length === 0 && (
        <StateView
          variant="no-matches"
          testId="action-items-filtered-empty"
          title={`No ${filter} items`}
          body="Change the filter to see the rest."
          className="border-0 py-6"
        />
      )}
    </div>
  )
}
