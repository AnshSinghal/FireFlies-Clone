'use client'

/**
 * The Comments flyout (T-31.6, T-31.9, T-31.11).
 *
 * Every thread for the meeting in timeline order, each carrying its segment
 * snippet and timestamp. Clicking an entry is a navigation: it seeks the
 * player AND reveals the segment in the transcript — the same dual move a
 * chapter click makes (T-21.6). Resolved threads hide behind a
 * `Show resolved (n)` toggle so the default view is the open work.
 */

import { MessageSquare } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/chip'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { StateView } from '@/components/ui/state-view'
import { useComments, type CachedComment } from '@/lib/api/comments'
import { useTranscript } from '@/lib/api/transcript'
import { useNotepadCommands } from '@/lib/notepad/commands'
import { formatRelativeDate, formatTimestamp } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'

export function CommentsPanel({ meetingId }: { meetingId: number }) {
  const { data, isPending } = useComments(meetingId)
  const { data: transcript } = useTranscript(meetingId)
  const { seekTo } = useNotepadCommands()
  const [showResolved, setShowResolved] = useState(false)

  const snippets = useMemo(() => {
    const map = new Map<number, string>()
    for (const segment of transcript?.segments ?? []) {
      map.set(segment.id, segment.text)
    }
    return map
  }, [transcript])

  if (isPending) {
    return (
      <div className="space-y-3" data-testid="comments-flyout-loading">
        <Skeleton className="h-16 w-full rounded-md" />
        <Skeleton className="h-16 w-full rounded-md" />
      </div>
    )
  }

  const threads = data?.items ?? []
  const open = threads.filter((thread) => !thread.is_resolved)
  const resolved = threads.filter((thread) => thread.is_resolved)

  if (threads.length === 0) {
    return (
      <StateView
        variant="empty"
        title="No comments yet"
        body="Select transcript text to start a discussion."
        className="border-0 py-8"
        testId="comments-flyout-empty"
      />
    )
  }

  return (
    <div className="space-y-2" data-testid="comments-flyout">
      {open.map((thread) => (
        <FlyoutEntry
          key={thread.id}
          thread={thread}
          snippet={thread.segment_id != null ? snippets.get(thread.segment_id) : undefined}
          onOpen={() => {
            if (thread.start_ms != null) seekTo(thread.start_ms, { play: true, reveal: true })
          }}
        />
      ))}

      {resolved.length > 0 && (
        <div className="space-y-2 border-t border-subtle pt-2">
          <Button
            variant="ghost"
            size="sm"
            fullWidth
            className="justify-start text-muted"
            data-testid="comments-show-resolved"
            onClick={() => setShowResolved((current) => !current)}
          >
            {showResolved ? 'Hide' : 'Show'} resolved ({resolved.length})
          </Button>
          {showResolved &&
            resolved.map((thread) => (
              <FlyoutEntry
                key={thread.id}
                thread={thread}
                snippet={
                  thread.segment_id != null ? snippets.get(thread.segment_id) : undefined
                }
                onOpen={() => {
                  if (thread.start_ms != null) seekTo(thread.start_ms, { play: true, reveal: true })
                }}
              />
            ))}
        </div>
      )}
    </div>
  )
}

function FlyoutEntry({
  thread,
  snippet,
  onOpen,
}: {
  thread: CachedComment
  snippet: string | undefined
  onOpen: () => void
}) {
  const replyCount = thread.replies.length

  return (
    <Button
      variant="ghost"
      fullWidth
      data-testid={`comments-flyout-entry-${thread.id}`}
      className={cn('h-auto flex-col items-start gap-1 rounded-md border border-subtle p-3')}
      onClick={onOpen}
    >
      <span className="flex w-full items-center gap-2 text-sm">
        <MessageSquare size={14} strokeWidth={1.75} className="shrink-0 text-muted" />
        <span className="text-body-strong text-primary">{thread.author.name}</span>
        {thread.start_ms != null && (
          <span className="tnum text-muted">{formatTimestamp(thread.start_ms)}</span>
        )}
        {thread.is_resolved && <Badge variant="success">Resolved</Badge>}
        <span className="ml-auto tnum text-xs text-muted">
          {formatRelativeDate(thread.created_at)}
        </span>
      </span>
      <span className="line-clamp-2 w-full whitespace-normal text-left text-body text-primary">
        {thread.is_deleted ? 'Comment deleted' : thread.body}
      </span>
      {snippet && (
        <span className="line-clamp-1 w-full whitespace-normal text-left text-sm text-muted">
          on: “{snippet}”
        </span>
      )}
      {replyCount > 0 && (
        <span className="text-xs text-muted">
          {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
        </span>
      )}
    </Button>
  )
}
