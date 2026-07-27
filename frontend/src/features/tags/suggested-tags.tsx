'use client'

/**
 * AI-proposed tags (T-36.4).
 *
 * Dashed chips under a `Suggested` label — visibly NOT yet part of the
 * meeting. Accepting one is client-orchestrated: create the tag if it does
 * not exist, then PUT the full list. Dismissals are local (localStorage,
 * per-meeting key) because a rejected suggestion is a UI preference, not
 * server state.
 */

import { X } from 'lucide-react'

import { Chip, type ChipSize } from '@/components/ui/chip'
import { IconButton } from '@/components/ui/icon-button'
import { useToast } from '@/components/ui/toast'
import { ApiError } from '@/lib/api/client'
import {
  MAX_TAGS_PER_MEETING,
  useCreateTag,
  useSetMeetingTags,
  useTagProposals,
  type TagLike,
  type TagProposal,
} from '@/lib/api/tags'
import { useLocalStorage } from '@/lib/hooks/use-local-storage'
import { TOAST_MESSAGES } from '@/lib/toast/messages'
import { slug } from '@/lib/utils/slug'

interface SuggestedTagsProps {
  meetingId: number
  /** The meeting's current tags — an applied suggestion stops being one. */
  currentTags: readonly TagLike[]
  size?: ChipSize
}

export function SuggestedTags({ meetingId, currentTags, size = 'md' }: SuggestedTagsProps) {
  const toast = useToast()
  const { data } = useTagProposals(meetingId)
  const createTag = useCreateTag()
  const setTags = useSetMeetingTags(meetingId)

  // Lower-cased names, so `Sales` dismissed once stays dismissed as `sales`.
  const { value: dismissed, setValue: setDismissed } = useLocalStorage<string[]>(
    `ff.tags.dismissed-${meetingId}`,
    [],
  )

  const applied = new Set(currentTags.map((tag) => tag.name.toLowerCase()))
  const visible = (data?.items ?? []).filter(
    (proposal) =>
      !applied.has(proposal.name.toLowerCase()) && !dismissed.includes(proposal.name.toLowerCase()),
  )

  if (visible.length === 0) return null

  const accept = async (proposal: TagProposal) => {
    if (currentTags.length >= MAX_TAGS_PER_MEETING) {
      toast.warning(TOAST_MESSAGES.tagLimit)
      return
    }
    try {
      const tagId = proposal.tag_id ?? (await createTag.mutateAsync({ name: proposal.name })).id
      await setTags.mutateAsync([...currentTags.map((tag) => tag.id), tagId])
      toast.success(TOAST_MESSAGES.tagsUpdated)
    } catch (error) {
      toast.warning(error instanceof ApiError ? error.message : TOAST_MESSAGES.saveFailed)
    }
  }

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5" data-testid="tag-suggestions">
      <span className="shrink-0 text-xs text-muted">Suggested</span>
      {visible.map((proposal) => (
        <span key={proposal.name} className="inline-flex shrink-0 items-center gap-0.5">
          <Chip
            variant="dashed"
            size={size}
            onAction={() => void accept(proposal)}
            actionLabel={`Add suggested tag #${proposal.name}`}
            testId={`tag-suggestion-${slug(proposal.name)}`}
          >
            #{proposal.name}
          </Chip>
          <IconButton
            size="sm"
            label={`Dismiss suggested tag #${proposal.name}`}
            icon={<X size={12} strokeWidth={2} />}
            onClick={() => setDismissed([...dismissed, proposal.name.toLowerCase()])}
            data-testid={`tag-suggestion-dismiss-${slug(proposal.name)}`}
          />
        </span>
      ))}
    </span>
  )
}
