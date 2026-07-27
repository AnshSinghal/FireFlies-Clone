'use client'

/**
 * The bulk action bar (T-14.4 – T-14.6, T-36.7, T-36.9).
 *
 * A floating pill OVERLAYING the list, not a strip inserted above it: pushing
 * the content down would move the very rows the user is selecting out from
 * under the pointer.
 *
 * `Move` and `Tag` are pickers, not actions: each opens its chooser and the
 * caller applies the result to every selected meeting, reporting back with one
 * summary toast — the selection must not be burned on a misclick.
 */

import { Download, FolderInput, Tag, Trash2, X } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dropdown, DropdownItem, DropdownLabel } from '@/components/ui/dropdown'
import { IconButton } from '@/components/ui/icon-button'
import { useToast } from '@/components/ui/toast'
import { TagEditor } from '@/features/tags/tag-editor'
import { useChannels } from '@/lib/api/channels'
import { pluralize } from '@/lib/utils/format'

interface BulkBarProps {
  count: number
  /** Total matching the current filters — for the "select all N" affordance. */
  total: number
  /** True when every row on this page is selected but not every match. */
  canSelectAllMatching: boolean
  onSelectAllMatching: () => void
  onClear: () => void
  onDelete: () => Promise<void>
  /** Moves every selected meeting to the picked channel (T-36.7). */
  onMove: (channel: { id: number; slug: string }) => Promise<void>
  /** Adds the picked tags to every selected meeting (T-36.9). */
  onAddTags: (tagIds: number[]) => Promise<void>
  /** Opens the export modal in bulk mode (T-34.9). The view holds the ids. */
  onExport: () => void
}

export function BulkBar({
  count,
  total,
  canSelectAllMatching,
  onSelectAllMatching,
  onClear,
  onDelete,
  onMove,
  onAddTags,
  onExport,
}: BulkBarProps) {
  const toast = useToast()
  const [confirming, setConfirming] = useState(false)
  const [tagsOpen, setTagsOpen] = useState(false)
  const { data: channels } = useChannels()

  if (count === 0) return null

  return (
    <>
      <div
        data-testid="bulk-bar"
        // `role="status"` so the count is announced as it changes, rather than
        // the bar appearing silently for a screen-reader user.
        role="status"
        className="ff-bulk-bar fixed inset-x-0 bottom-6 z-toast flex justify-center px-4"
      >
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-subtle bg-surface-0 py-2 pl-4 pr-2 shadow-lg">
          <span className="text-body-strong text-primary" data-testid="bulk-count">
            {pluralize(count, 'selected', 'selected')}
          </span>

          {canSelectAllMatching && (
            <Button
              variant="link"
              size="sm"
              onClick={onSelectAllMatching}
              data-testid="bulk-select-all-matching"
            >
              Select all {total}
            </Button>
          )}

          <span aria-hidden="true" className="mx-1 h-5 w-px bg-surface-2" />

          <TagEditor
            open={tagsOpen}
            onOpenChange={setTagsOpen}
            // ADDING to many meetings, so the draft starts empty and there is
            // no meaningful per-meeting cap to enforce here — the caller skips
            // any meeting the extra tags would push past the limit.
            appliedIds={[]}
            maxSelected={Infinity}
            onCommit={(ids) => void onAddTags(ids)}
            align="center"
            side="top"
            trigger={
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<Tag size={16} strokeWidth={1.75} />}
                data-testid="bulk-tag"
              >
                Tag
              </Button>
            }
          />

          <Dropdown
            testId="bulk-move-menu"
            side="top"
            align="center"
            trigger={
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<FolderInput size={16} strokeWidth={1.75} />}
                data-testid="bulk-move"
              >
                Move
              </Button>
            }
          >
            <DropdownLabel>Move to channel</DropdownLabel>
            {(channels?.channels ?? []).map((channel) => (
              <DropdownItem
                key={channel.id}
                onSelect={() => void onMove({ id: channel.id, slug: channel.slug })}
                testId={`bulk-move-${channel.slug}`}
              >
                #{channel.slug}
              </DropdownItem>
            ))}
            {(channels?.channels ?? []).length === 0 && (
              <DropdownItem disabled>No channels yet</DropdownItem>
            )}
          </Dropdown>

          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Download size={16} strokeWidth={1.75} />}
            onClick={onExport}
            data-testid="bulk-export"
          >
            Export
          </Button>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Trash2 size={16} strokeWidth={1.75} />}
            onClick={() => setConfirming(true)}
            data-testid="bulk-delete"
            className="text-danger hover:bg-danger-subtle"
          >
            Delete
          </Button>

          <IconButton
            label="Clear selection"
            icon={<X size={16} strokeWidth={2} />}
            onClick={onClear}
            data-testid="bulk-clear"
            hideTooltip
          />
        </div>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        // Names the COUNT, so the user can see the scope of what they are about
        // to destroy rather than trusting the selection.
        title={`Delete ${pluralize(count, 'meeting')}?`}
        body="Their transcripts, summaries and action items will be deleted. You can undo this."
        confirmLabel="Delete"
        onConfirm={onDelete}
        testId="bulk-confirm"
      />
    </>
  )
}
