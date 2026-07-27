'use client'

/**
 * AskFred (T-37) — chat about this meeting, grounded in its transcript.
 *
 * The interaction that makes it real is the citation chip: every answer points
 * back into the transcript, and clicking a chip seeks the player and reveals
 * the cited line. An answer that cannot show its sources is a paragraph with
 * good posture.
 */

import { Copy, ListPlus, RotateCcw, Send, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Input } from '@/components/ui/input'
import { TimestampButton } from '@/components/ui/media-controls'
import { useToast } from '@/components/ui/toast'
import { Tooltip } from '@/components/ui/tooltip'
import { useCreateActionItem } from '@/lib/api/action-items'
import { useAskFred } from '@/lib/api/ask'
import { ApiError } from '@/lib/api/client'
import type { AskCitation } from '@/lib/api/types'
import { useNotepadCommands } from '@/lib/notepad/commands'
import { TOAST_MESSAGES } from '@/lib/toast/messages'
import { cn } from '@/lib/utils/cn'
import { formatTimestamp } from '@/lib/utils/format'

/** Openers derived from what every meeting has, not from this one's content. */
const SUGGESTED = [
  'What were the main decisions?',
  'What are the next steps?',
  'Were there any objections?',
  'Who committed to what?',
]

interface Message {
  role: 'user' | 'assistant'
  text: string
  citations?: AskCitation[]
  /** Set when the request failed — renders the retry affordance in place. */
  failed?: boolean
  /** The guardrail state: an honest "not in this meeting". */
  grounded?: boolean
}

/**
 * Does this answer read like something somebody agreed to DO? (T-37.10)
 *
 * A heuristic, deliberately loose: offering "Save as action item" on a
 * paragraph that is not a commitment costs one ignorable button; hiding it on
 * one that is costs the feature.
 */
const COMMITMENT =
  /\b(will|by (monday|tuesday|wednesday|thursday|friday|next|end)|due|follow[ -]?up|schedule|send|deadline|action|to-?do|owns?|take care)\b/i

export function AskFredPanel({ meetingId }: { meetingId: number }) {
  const ask = useAskFred(meetingId)
  const createActionItem = useCreateActionItem(meetingId)
  const { seekTo } = useNotepadCommands()
  const toast = useToast()

  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [provider, setProvider] = useState<string | null>(null)

  const listRef = useRef<HTMLDivElement | null>(null)

  // The newest message stays in view — a chat that does not follow itself
  // makes the user chase the answer they just asked for.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, ask.isPending])

  const mutateAsk = useCallback(
    (question: string, history: { role: 'user' | 'assistant'; text: string }[]) => {
      ask.mutate(
        { question, history },
        {
          onSuccess: (response) => {
            setProvider(response.provider)
            setMessages((current) => [
              ...current,
              {
                role: 'assistant',
                text: response.answer,
                citations: response.citations,
                grounded: response.grounded,
              },
            ])
          },
          onError: (error) => {
            const rateLimited = error instanceof ApiError && error.status === 429
            setMessages((current) => [
              ...current,
              {
                role: 'assistant',
                failed: !rateLimited,
                text: rateLimited
                  ? "You're asking faster than Fred can think — try again in a moment."
                  : "That didn't go through.",
              },
            ])
          },
        },
      )
    },
    [ask],
  )

  /**
   * History is what was SAID, not what failed: a failed turn carries no answer
   * and would teach the provider a lopsided conversation. The server truncates
   * to its own window, so everything said can be sent.
   */
  const toHistory = (list: Message[]) =>
    list
      .filter((message) => !message.failed)
      .map((message) => ({ role: message.role, text: message.text }))

  const send = useCallback(
    (question: string) => {
      const trimmed = question.trim()
      if (!trimmed || ask.isPending) return

      setMessages([...messages, { role: 'user', text: trimmed }])
      setDraft('')
      mutateAsk(trimmed, toHistory(messages))
    },
    [ask.isPending, messages, mutateAsk],
  )

  /**
   * Retry re-asks WITHOUT a second user bubble: the failed pair (question +
   * error) is lifted out, and the question rejoins the bottom of the chat
   * where its answer will land.
   */
  const retry = useCallback(
    (failedIndex: number, question: string) => {
      if (ask.isPending) return
      const base = messages.filter((_, index) => index !== failedIndex && index !== failedIndex - 1)
      setMessages([...base, { role: 'user', text: question }])
      mutateAsk(question, toHistory(base))
    },
    [ask.isPending, messages, mutateAsk],
  )

  return (
    <div data-testid="askfred-panel" className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        {provider === 'mock' && (
          // Honesty about what is answering (T-37.11). It pre-empts the
          // obvious question rather than waiting to be asked it.
          <Tooltip content="Answers are retrieved from the transcript, not generated by a language model.">
            <span
              data-testid="askfred-mode-badge"
              className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted"
            >
              Extractive mode
            </span>
          </Tooltip>
        )}
        {messages.length > 0 && (
          <span className="ml-auto">
            <IconButton
              label="New chat"
              size="sm"
              icon={<RotateCcw size={14} strokeWidth={1.75} />}
              onClick={() => setMessages([])}
              data-testid="askfred-new-chat"
            />
          </span>
        )}
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-secondary">
              Ask anything about this meeting. Answers cite the transcript.
            </p>
            <div className="flex flex-col items-start gap-1.5">
              {SUGGESTED.map((question, index) => (
                <Button
                  key={question}
                  variant="secondary"
                  size="sm"
                  onClick={() => send(question)}
                  data-testid={`askfred-suggested-${index}`}
                >
                  {question}
                </Button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <MessageRow
            key={index}
            index={index}
            message={message}
            onCite={(citation) => seekTo(citation.start_ms, { play: true, reveal: true })}
            onCopy={(text) => {
              void navigator.clipboard
                .writeText(text)
                .then(() => toast.success(TOAST_MESSAGES.answerCopied))
                .catch(() => toast.error(TOAST_MESSAGES.copyFailed))
            }}
            onRetry={(text) => retry(index, text)}
            onSaveActionItem={(saved) => {
              createActionItem.mutate(
                {
                  // The API caps text at 500; clip on a word so a long answer
                  // becomes a readable task, not a mid-word amputation.
                  text:
                    saved.text.length > 500
                      ? `${saved.text.slice(0, 496).replace(/\s+\S*$/, '')}…`
                      : saved.text,
                  start_ms: saved.citations?.[0]?.start_ms ?? null,
                },
                {
                  onSuccess: () => toast.success(TOAST_MESSAGES.actionItemAdded),
                  onError: () => toast.error(TOAST_MESSAGES.saveFailed),
                },
              )
            }}
            previousUserText={messages[index - 1]?.text ?? ''}
          />
        ))}

        {ask.isPending && (
          <div
            data-testid="askfred-thinking"
            className="flex items-center gap-2 text-sm text-muted"
            aria-live="polite"
          >
            <Sparkles size={14} strokeWidth={1.75} aria-hidden="true" className="animate-pulse" />
            Fred is reading the transcript…
          </div>
        )}
      </div>

      <form
        className="flex shrink-0 items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          send(draft)
        }}
      >
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask about this meeting…"
          aria-label="Ask a question about this meeting"
          data-testid="askfred-input"
          className="flex-1"
        />
        <IconButton
          label="Send"
          icon={<Send size={16} strokeWidth={1.75} />}
          type="submit"
          disabled={!draft.trim() || ask.isPending}
          data-testid="askfred-send"
        />
      </form>
    </div>
  )
}

function MessageRow({
  message,
  index,
  onCite,
  onCopy,
  onRetry,
  onSaveActionItem,
  previousUserText,
}: {
  message: Message
  index: number
  onCite: (citation: AskCitation) => void
  onCopy: (text: string) => void
  onRetry: (text: string) => void
  onSaveActionItem: (message: Message) => void
  previousUserText: string
}) {
  if (message.role === 'user') {
    return (
      <p
        data-testid={`askfred-message-${index}`}
        className="ml-8 rounded-lg bg-accent-subtle px-3 py-2 text-body text-primary"
      >
        {message.text}
      </p>
    )
  }

  return (
    <div data-testid={`askfred-message-${index}`} className="space-y-1.5">
      <div className="flex items-start gap-2">
        <span
          aria-hidden="true"
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-inverse"
        >
          F
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p
            className={cn(
              'whitespace-pre-wrap text-body',
              message.grounded === false || message.failed ? 'text-muted' : 'text-primary',
            )}
          >
            {message.text}
          </p>

          {message.failed && (
            <Button
              variant="link"
              size="sm"
              onClick={() => onRetry(previousUserText)}
              data-testid={`askfred-retry-${index}`}
              className="text-sm"
            >
              Try again
            </Button>
          )}

          {message.citations && message.citations.length > 0 && (
            <span className="flex flex-wrap gap-1.5">
              {message.citations.map((citation, citationIndex) => (
                <TimestampButton
                  key={`${citation.segment_id}-${citationIndex}`}
                  data-testid={`askfred-citation-${citationIndex}`}
                  time={`${formatTimestamp(citation.start_ms)} ${citation.speaker}`}
                  label={`Play from ${formatTimestamp(citation.start_ms)}, where ${citation.speaker} said this`}
                  onClick={() => onCite(citation)}
                  className="rounded-full bg-surface-2 px-2 py-0.5"
                />
              ))}
            </span>
          )}
        </div>

        {!message.failed && (
          <span className="flex shrink-0 items-center gap-0.5">
            {message.grounded && COMMITMENT.test(message.text) && (
              <IconButton
                label="Save as action item"
                size="sm"
                icon={<ListPlus size={14} strokeWidth={1.75} />}
                onClick={() => onSaveActionItem(message)}
                data-testid={`askfred-save-action-${index}`}
              />
            )}
            <IconButton
              label="Copy answer"
              size="sm"
              icon={<Copy size={14} strokeWidth={1.75} />}
              onClick={() => onCopy(message.text)}
              data-testid={`askfred-copy-${index}`}
            />
          </span>
        )}
      </div>
    </div>
  )
}
