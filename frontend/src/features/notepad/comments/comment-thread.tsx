'use client'

/**
 * One thread rendered inline beneath its segment (T-31.5, T-31.7, T-31.9).
 *
 * Replies indent 32px behind a 2px left border. A deleted parent renders as a
 * "Comment deleted" tombstone above its surviving replies. Resolved threads
 * collapse to a one-line summary with a `Resolved` badge — the segment keeps
 * the record without the noise.
 */

import { Check, MessageSquare, Pencil, Trash2, Undo2 } from 'lucide-react'
import { useState } from 'react'

import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/chip'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Textarea } from '@/components/ui/input'
import {
  useCreateComment,
  useDeleteComment,
  useUpdateComment,
  type CachedComment,
} from '@/lib/api/comments'
import { useCurrentUser } from '@/lib/api/me'
import { formatRelativeDate } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'

import { CommentComposer, type MentionOption } from './comment-composer'
import { MentionText } from './mention-text'

interface CommentThreadProps {
  meetingId: number
  thread: CachedComment
  participants: MentionOption[]
}

export function CommentThread({ meetingId, thread, participants }: CommentThreadProps) {
  const update = useUpdateComment(meetingId)
  const create = useCreateComment(meetingId)
  const [replying, setReplying] = useState(false)
  const [expanded, setExpanded] = useState(false)

  if (thread.is_resolved && !expanded) {
    return (
      <div
        data-testid={`comment-${thread.id}`}
        className="flex items-center gap-2 rounded-md bg-surface-1 px-3 py-1.5"
      >
        <Badge variant="success">Resolved</Badge>
        <span className="min-w-0 flex-1 truncate text-sm text-muted">
          {thread.is_deleted ? 'Comment deleted' : thread.body}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setExpanded(true)}>
          Show
        </Button>
      </div>
    )
  }

  return (
    <div data-testid={`comment-${thread.id}`} className="space-y-2">
      <CommentBody
        meetingId={meetingId}
        comment={thread}
        onToggleResolve={() =>
          update.mutate({ id: thread.id, patch: { is_resolved: !thread.is_resolved } })
        }
      />

      {thread.replies.length > 0 && (
        <div className="ml-8 space-y-2 border-l-2 border-subtle pl-3">
          {thread.replies.map((reply) => (
            <CommentBody key={reply.id} meetingId={meetingId} comment={reply} />
          ))}
        </div>
      )}

      <div className="ml-8 pl-3">
        {replying ? (
          <CommentComposer
            participants={participants}
            placeholder="Reply…"
            testId={`comment-reply-composer-${thread.id}`}
            onSubmit={(payload) =>
              create.mutateAsync({ ...payload, parent_id: thread.id })
            }
            onCancel={() => setReplying(false)}
          />
        ) : (
          !thread.is_deleted && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted"
              data-testid={`comment-reply-${thread.id}`}
              onClick={() => setReplying(true)}
            >
              Reply
            </Button>
          )
        )}
      </div>
    </div>
  )
}

function CommentBody({
  meetingId,
  comment,
  onToggleResolve,
}: {
  meetingId: number
  comment: CachedComment
  onToggleResolve?: () => void
}) {
  const { data: user } = useCurrentUser()
  const update = useUpdateComment(meetingId)
  const remove = useDeleteComment(meetingId)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body)

  if (comment.is_deleted) {
    return (
      <p className="flex items-center gap-2 text-sm italic text-muted">
        <MessageSquare size={14} strokeWidth={1.75} aria-hidden="true" />
        Comment deleted
      </p>
    )
  }

  const own = user != null && user.id === comment.author.id
  const pending = comment.pending === true

  return (
    <div
      className={cn('flex gap-2.5', pending && 'opacity-60')}
      data-pending={pending || undefined}
    >
      <Avatar name={comment.author.name} src={comment.author.avatar_url} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="text-body-strong text-primary">{comment.author.name}</span>
          <time className="tnum text-muted">{formatRelativeDate(comment.created_at)}</time>
          {comment.is_edited && <span className="text-muted">(edited)</span>}
        </p>

        {editing ? (
          <div className="mt-1 space-y-2">
            <Textarea value={draft} rows={2} onChange={(event) => setDraft(event.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!draft.trim()}
                onClick={() => {
                  update.mutate({ id: comment.id, patch: { body: draft.trim() } })
                  setEditing(false)
                }}
              >
                Save
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-body text-primary">
            <MentionText body={comment.body} mentions={comment.mentions} />
          </p>
        )}
      </div>

      {!pending && !editing && (
        <span className="flex shrink-0 items-start gap-0.5">
          {onToggleResolve && (
            <IconButton
              label={comment.is_resolved ? 'Unresolve thread' : 'Resolve thread'}
              icon={
                comment.is_resolved ? (
                  <Undo2 size={14} strokeWidth={1.75} />
                ) : (
                  <Check size={14} strokeWidth={1.75} />
                )
              }
              data-testid={`comment-resolve-${comment.id}`}
              onClick={onToggleResolve}
            />
          )}
          {own && (
            <>
              <IconButton
                label="Edit comment"
                icon={<Pencil size={14} strokeWidth={1.75} />}
                data-testid={`comment-edit-${comment.id}`}
                onClick={() => {
                  setDraft(comment.body)
                  setEditing(true)
                }}
              />
              <IconButton
                label="Delete comment"
                icon={<Trash2 size={14} strokeWidth={1.75} />}
                data-testid={`comment-delete-${comment.id}`}
                onClick={() => remove.mutate(comment.id)}
              />
            </>
          )}
        </span>
      )}
    </div>
  )
}
