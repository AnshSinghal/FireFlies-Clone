'use client'

/**
 * Tag management (T-36.6) — `/settings/tags`.
 *
 * The list with live usage counts, inline rename (propagates by id linkage),
 * recolour, merge and delete. Merge IS delete-with-reassignment on the wire
 * (`DELETE /tags/{id}?merge_into=`), which keeps the API path verb-free; the
 * UI still calls it merging because that is what the user is doing.
 *
 * Every destructive confirm names its blast radius in meetings — the house
 * style set by the speaker-rename popover ("Renaming will update N segments").
 */

import { Merge, Palette, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { ColorSwatchPicker } from '@/components/ui/color-swatch-picker'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { IconButton } from '@/components/ui/icon-button'
import { InlineEdit } from '@/components/ui/inline-edit'
import { Popover } from '@/components/ui/popover'
import { Select } from '@/components/ui/select'
import { SkeletonText } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { ApiError } from '@/lib/api/client'
import {
  MAX_TAG_NAME_LENGTH,
  useDeleteTag,
  useTags,
  useUpdateTag,
  type TagOut,
} from '@/lib/api/tags'
import { TOAST_MESSAGES } from '@/lib/toast/messages'
import { pluralize } from '@/lib/utils/format'
import { getSpeakerColorByIndex, SPEAKER_COLOR_COUNT } from '@/lib/utils/speaker-color'
import { slug } from '@/lib/utils/slug'
import { getTagColor } from '@/lib/utils/tag-color'

import { SettingsNav } from '@/features/placeholders/settings/settings-nav'

import { TagColorDot } from './tag-chip'

const SWATCHES = Array.from({ length: SPEAKER_COLOR_COUNT }, (_, i) => getSpeakerColorByIndex(i))

export function TagsSettingsView() {
  const { data, isPending } = useTags()
  const tags = data?.items ?? []

  const [merging, setMerging] = useState<TagOut | null>(null)
  const [deleting, setDeleting] = useState<TagOut | null>(null)

  return (
    <div className="flex flex-col gap-6 py-6 md:flex-row" data-testid="settings-view">
      <SettingsNav active="tags" />

      <section className="min-w-0 flex-1 space-y-6" data-testid="tags-settings-page">
        <header className="space-y-1">
          <h2 className="text-h3 text-primary">Tags</h2>
          <p className="text-sm text-secondary">
            Rename, recolour, merge or delete the tags on your meetings. A rename follows the tag
            everywhere it appears.
          </p>
        </header>

        {isPending && <SkeletonText lines={5} />}

        {!isPending && tags.length === 0 && (
          <p className="text-sm text-muted" data-testid="tags-settings-empty">
            No tags yet. Create one from any meeting&rsquo;s tag editor.
          </p>
        )}

        {tags.length > 0 && (
          <ul className="divide-y divide-subtle rounded-lg border border-subtle" data-testid="tags-settings-list">
            {tags.map((tag) => (
              <TagRow
                key={tag.id}
                tag={tag}
                canMerge={tags.length > 1}
                onMerge={() => setMerging(tag)}
                onDelete={() => setDeleting(tag)}
              />
            ))}
          </ul>
        )}

        <MergeDialog tags={tags} source={merging} onClose={() => setMerging(null)} />
        <DeleteDialog tag={deleting} onClose={() => setDeleting(null)} />
      </section>
    </div>
  )
}

function TagRow({
  tag,
  canMerge,
  onMerge,
  onDelete,
}: {
  tag: TagOut
  canMerge: boolean
  onMerge: () => void
  onDelete: () => void
}) {
  const toast = useToast()
  const updateTag = useUpdateTag()
  const [recolouring, setRecolouring] = useState(false)

  const rename = (name: string) => {
    const next = name.replace(/^#+/, '').trim()
    if (!next || next === tag.name) return
    if (next.length > MAX_TAG_NAME_LENGTH) {
      toast.warning(`Tag names are limited to ${MAX_TAG_NAME_LENGTH} characters`)
      return
    }
    updateTag.mutate(
      { id: tag.id, name: next },
      {
        onSuccess: () => toast.success(TOAST_MESSAGES.changesSaved),
        // 409 DUPLICATE_TAG names the tag that already owns the name (T36-J).
        onError: (error) =>
          toast.warning(error instanceof ApiError ? error.message : TOAST_MESSAGES.saveFailed),
      },
    )
  }

  return (
    <li className="flex items-center gap-3 px-3 py-2.5" data-testid={`tag-row-${slug(tag.name)}`}>
      <TagColorDot tag={tag} />

      <span className="flex min-w-0 flex-1 items-baseline gap-0.5">
        <span aria-hidden="true" className="shrink-0 text-body text-muted">
          #
        </span>
        <InlineEdit
          value={tag.name}
          onSave={rename}
          ariaLabel={`Rename tag ${tag.name}`}
          emptyError="Tag name cannot be empty"
          testId={`tag-rename-${slug(tag.name)}`}
          className="text-body text-primary"
        />
      </span>

      <span className="tnum shrink-0 text-sm text-muted" data-testid="tag-usage-count">
        {pluralize(tag.usage_count, 'meeting')}
      </span>

      <span className="flex shrink-0 items-center gap-1">
        <Popover
          open={recolouring}
          onOpenChange={setRecolouring}
          label={`Recolour ${tag.name}`}
          align="end"
          testId="tag-recolour-popover"
          trigger={
            <IconButton
              size="sm"
              label={`Recolour #${tag.name}`}
              icon={<Palette size={14} strokeWidth={1.75} />}
              data-testid="tag-recolour"
            />
          }
        >
          <ColorSwatchPicker
            colors={SWATCHES}
            // The swatch that is ALREADY this tag's colour reads as selected,
            // whether it came from an explicit recolour or the name hash —
            // `getTagColor` resolves both to one of these eight values.
            value={SWATCHES.indexOf(getTagColor(tag))}
            onChange={(index) => {
              setRecolouring(false)
              updateTag.mutate(
                { id: tag.id, color_index: index },
                { onSuccess: () => toast.success(TOAST_MESSAGES.changesSaved) },
              )
            }}
            label={`Colour for #${tag.name}`}
            testId="tag-swatch"
          />
        </Popover>

        {canMerge && (
          <IconButton
            size="sm"
            label={`Merge #${tag.name} into another tag`}
            icon={<Merge size={14} strokeWidth={1.75} />}
            onClick={onMerge}
            data-testid="tag-merge"
          />
        )}

        <IconButton
          size="sm"
          variant="danger"
          label={`Delete #${tag.name}`}
          icon={<Trash2 size={14} strokeWidth={1.75} />}
          onClick={onDelete}
          data-testid="tag-delete"
        />
      </span>
    </li>
  )
}

/**
 * Merge = pick the survivor, then `DELETE source?merge_into=survivor`.
 * The survivor defaults to the first OTHER tag, so confirm is always valid.
 */
function MergeDialog({
  tags,
  source,
  onClose,
}: {
  tags: TagOut[]
  source: TagOut | null
  onClose: () => void
}) {
  const toast = useToast()
  const deleteTag = useDeleteTag()
  const [survivorId, setSurvivorId] = useState<number | null>(null)

  const others = tags.filter((tag) => tag.id !== source?.id)
  const survivor =
    others.find((tag) => tag.id === survivorId) ?? others[0]

  return (
    <ConfirmDialog
      open={source !== null}
      onOpenChange={(next) => {
        if (!next) {
          setSurvivorId(null)
          onClose()
        }
      }}
      title="Merge tags?"
      objectName={source ? `#${source.name}` : ''}
      body={
        <span className="block space-y-3">
          <span className="block">
            will be deleted, and the {pluralize(source?.usage_count ?? 0, 'meeting')} carrying it
            will keep the tag you merge into instead. No meeting ends up with a duplicate.
          </span>
          <Select
            label="Merge into"
            value={String(survivor?.id ?? '')}
            onValueChange={(value) => setSurvivorId(Number(value))}
            options={others.map((tag) => ({ value: String(tag.id), label: `#${tag.name}` }))}
            testId="tag-merge-into"
            className="w-full"
          />
        </span>
      }
      confirmLabel="Merge"
      destructive={false}
      testId="tag-merge-dialog"
      onConfirm={async () => {
        if (!source || !survivor) return
        await deleteTag.mutateAsync({ id: source.id, mergeInto: survivor.id })
        toast.success(TOAST_MESSAGES.tagsMerged)
        setSurvivorId(null)
        onClose()
      }}
    />
  )
}

function DeleteDialog({ tag, onClose }: { tag: TagOut | null; onClose: () => void }) {
  const toast = useToast()
  const deleteTag = useDeleteTag()

  return (
    <ConfirmDialog
      open={tag !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title="Delete tag?"
      objectName={tag ? `#${tag.name}` : ''}
      // The blast radius, named before the click (T36-H).
      body={`will be removed from ${pluralize(tag?.usage_count ?? 0, 'meeting')}. This cannot be undone.`}
      confirmLabel="Delete"
      testId="tag-delete-dialog"
      onConfirm={async () => {
        if (!tag) return
        await deleteTag.mutateAsync({ id: tag.id })
        toast.success(TOAST_MESSAGES.tagDeleted)
        onClose()
      }}
    />
  )
}
