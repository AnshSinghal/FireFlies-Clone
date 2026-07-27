'use client'

/**
 * The tag editor popover (T-36.3).
 *
 * Search over the existing tags, a checkbox multi-select, and a
 * `Create "<query>"` row when nothing matches. APPLIED ON CLOSE, as one PUT —
 * the same draft-then-commit shape as the filters panel (ADR-039), and for the
 * same reason: five checkbox flips should be five local updates and one
 * request, not five requests racing each other.
 *
 * Creation is the one thing that fires immediately: a created tag needs its
 * server id before it can be part of the draft at all.
 */

import { Plus } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/controls'
import { Popover } from '@/components/ui/popover'
import { SearchInput } from '@/components/ui/search-input'
import { useToast } from '@/components/ui/toast'
import { ApiError } from '@/lib/api/client'
import {
  MAX_TAG_NAME_LENGTH,
  MAX_TAGS_PER_MEETING,
  useCreateTag,
  useSetMeetingTags,
  useTags,
  type TagLike,
} from '@/lib/api/tags'
import { TOAST_MESSAGES } from '@/lib/toast/messages'
import { slug } from '@/lib/utils/slug'

import { TagColorDot } from './tag-chip'

interface TagEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: ReactNode
  /** The APPLIED tag ids, reseeding the draft each time the editor opens. */
  appliedIds: number[]
  /** Called on close, only when the draft actually changed. */
  onCommit: (ids: number[]) => void
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'right' | 'bottom' | 'left'
  /** The cap. `Infinity` for contexts that are not one meeting (bulk add). */
  maxSelected?: number
}

export function TagEditor({
  open,
  onOpenChange,
  trigger,
  appliedIds,
  onCommit,
  align = 'end',
  side = 'bottom',
  maxSelected = MAX_TAGS_PER_MEETING,
}: TagEditorProps) {
  const toast = useToast()
  const { data, isPending } = useTags(open)
  const createTag = useCreateTag()

  const [draft, setDraft] = useState<number[]>(appliedIds)
  const [search, setSearch] = useState('')

  // Reseeded on open, keyed on `open` — the filters panel's exact guard, and
  // for the same reason: reseeding while open would wipe in-progress edits.
  const [seededFor, setSeededFor] = useState(false)
  if (open !== seededFor) {
    setSeededFor(open)
    if (open) {
      setDraft(appliedIds)
      setSearch('')
    }
  }

  const tags = useMemo(() => data?.items ?? [], [data])

  // A pasted `#sales` means `sales` — same rule the server applies on create.
  const term = search.trim().replace(/^#+/, '')
  const visible = useMemo(() => {
    const lower = term.toLowerCase()
    return lower ? tags.filter((tag) => tag.name.toLowerCase().includes(lower)) : tags
  }, [tags, term])

  const exactMatch = tags.some((tag) => tag.name.toLowerCase() === term.toLowerCase())
  const tooLong = term.length > MAX_TAG_NAME_LENGTH
  const canCreate = term.length > 0 && !tooLong && !exactMatch && !isPending

  const toggle = (id: number, next: boolean) => {
    if (next && draft.length >= maxSelected) {
      // Blocked WITH a message (T36-I) — a checkbox that silently refuses
      // reads as broken.
      toast.warning(TOAST_MESSAGES.tagLimit)
      return
    }
    setDraft(next ? [...draft, id] : draft.filter((d) => d !== id))
  }

  const create = async () => {
    try {
      const created = await createTag.mutateAsync({ name: term })
      toast.success(TOAST_MESSAGES.tagCreated)
      setSearch('')
      toggle(created.id, true)
    } catch (error) {
      // 409 DUPLICATE_TAG names the existing tag in its message (T36-J).
      toast.warning(error instanceof ApiError ? error.message : TOAST_MESSAGES.saveFailed)
    }
  }

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next)
    if (next) return
    // Radix fires this for Escape and outside-click too, which is exactly the
    // "applied on close" contract.
    const changed =
      draft.length !== appliedIds.length || draft.some((id) => !appliedIds.includes(id))
    if (changed) onCommit(draft)
  }

  return (
    <Popover
      open={open}
      onOpenChange={handleOpenChange}
      label="Edit tags"
      align={align}
      side={side}
      testId="tag-editor"
      className="w-flyout p-0"
      trigger={trigger}
    >
      <div className="flex max-h-80 flex-col">
        <div className="shrink-0 border-b border-subtle p-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            ariaLabel="Search or create tags"
            placeholder="Search or create tags"
            testId="tag-editor-search"
          />
        </div>

        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
          {isPending && <p className="px-1 py-0.5 text-sm text-muted">Loading tags…</p>}

          {visible.map((tag) => (
            <div key={tag.id} className="flex items-center justify-between gap-2 px-1 py-0.5">
              <Checkbox
                checked={draft.includes(tag.id)}
                onCheckedChange={(next) => toggle(tag.id, next)}
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <TagColorDot tag={tag} />#{tag.name}
                  </span>
                }
                testId={`tag-option-${slug(tag.name)}`}
              />
              {/* The count says what checking this actually filters. */}
              <span className="tnum shrink-0 text-xs text-muted">{tag.usage_count}</span>
            </div>
          ))}

          {!isPending && visible.length === 0 && !canCreate && (
            <p className="px-1 py-0.5 text-sm text-muted">
              {tags.length === 0 ? 'No tags yet. Type a name to create one.' : 'No matches.'}
            </p>
          )}

          {tooLong && (
            <p className="px-1 py-0.5 text-sm text-danger">
              Tag names are limited to {MAX_TAG_NAME_LENGTH} characters
            </p>
          )}

          {canCreate && (
            <Button
              variant="ghost"
              size="sm"
              fullWidth
              leftIcon={<Plus size={14} strokeWidth={2} />}
              loading={createTag.isPending}
              onClick={() => void create()}
              data-testid="tag-create"
              className="justify-start"
            >
              Create “#{term}”
            </Button>
          )}
        </div>

        <p className="shrink-0 border-t border-subtle px-3 py-2 text-xs text-muted">
          Applied when the editor closes
        </p>
      </div>
    </Popover>
  )
}

interface MeetingTagEditorProps {
  meetingId: number
  /** The meeting's current tags, whichever payload shape they arrived in. */
  tags: readonly TagLike[]
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: ReactNode
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'right' | 'bottom' | 'left'
}

/** The editor bound to ONE meeting: commit = a single `PUT /meetings/{id}/tags`. */
export function MeetingTagEditor({
  meetingId,
  tags,
  open,
  onOpenChange,
  trigger,
  align,
  side,
}: MeetingTagEditorProps) {
  const toast = useToast()
  const setTags = useSetMeetingTags(meetingId)

  return (
    <TagEditor
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger}
      align={align}
      side={side}
      appliedIds={tags.map((tag) => tag.id)}
      onCommit={(ids) =>
        setTags.mutate(ids, {
          onSuccess: () => toast.success(TOAST_MESSAGES.tagsUpdated),
          onError: (error) =>
            toast.warning(
              error instanceof ApiError && error.code === 'TAG_LIMIT'
                ? TOAST_MESSAGES.tagLimit
                : TOAST_MESSAGES.saveFailed,
            ),
        })
      }
    />
  )
}
