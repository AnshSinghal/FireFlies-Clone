'use client'

/**
 * The AI summary panel (T-23).
 *
 * Five sections, in the reference product's order and with its labels:
 * Keywords, Meeting Overview, Meeting Outline, Bullet-Point Notes, Action
 * Items. The order is not decoration — it is how someone who has used Fireflies
 * knows where to look, and renaming "Meeting Overview" to "TL;DR" costs that
 * for nothing.
 *
 * Action Items is a stub pointing at T-24, which owns it. It sits in the right
 * place now rather than appearing later and shifting everything above it.
 */

import { Copy, MoreHorizontal, RefreshCw, Sparkles } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import {
  Dropdown,
  DropdownItem,
  DropdownRadioGroup,
  DropdownRadioItem,
} from '@/components/ui/dropdown'
import { IconButton } from '@/components/ui/icon-button'
import { TimestampButton } from '@/components/ui/media-controls'
import { SkeletonText } from '@/components/ui/skeleton'
import { StateView } from '@/components/ui/state-view'
import { useToast } from '@/components/ui/toast'
import { Tooltip } from '@/components/ui/tooltip'
import { useRegenerateSummary, useSummary } from '@/lib/api/summaries'
import type { ParticipantDetail } from '@/lib/api/types'
import { useNotepadCommands } from '@/lib/notepad/commands'
import { usePlayer } from '@/lib/player/player-context'
import { summaryToMarkdown, summaryToPlainText } from '@/lib/summary/to-markdown'
import { TOAST_MESSAGES } from '@/lib/toast/messages'
import { cn } from '@/lib/utils/cn'
import { formatRelativeDate, formatTimestamp } from '@/lib/utils/format'

import { ActionItems } from './summary/action-items'
import { SummarySection } from './summary/summary-section'

/** Only the first is real; the rest exist because the reference has them. */
const TEMPLATES = [
  { value: 'general', label: 'General Summary' },
  { value: 'sales', label: 'Sales Call' },
  { value: 'interview', label: 'Interview' },
  { value: 'standup', label: 'Standup' },
] as const

/** Fireflies shows six. More is a tag cloud, which is not a summary. */
const MAX_KEYWORDS = 6

/** Longer than this and the overview is worth clamping. */
const CLAMP_ABOVE_CHARS = 400

interface SummaryPanelProps {
  meetingId: number
  title: string
  /** Assignable people. An action item belongs to somebody who was here. */
  participants: ParticipantDetail[]
}

export function SummaryPanel({ meetingId, title, participants }: SummaryPanelProps) {
  const { data: summary, isPending, isError, refetch } = useSummary(meetingId)
  const regenerate = useRegenerateSummary(meetingId)
  const { seekTo, requestFind } = useNotepadCommands()
  const player = usePlayer()
  const toast = useToast()

  const [template, setTemplate] = useState('general')

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text)
        toast.success(TOAST_MESSAGES.summaryCopied)
      } catch {
        toast.error(TOAST_MESSAGES.copyFailed)
      }
    },
    [toast],
  )

  /*
   * Which outline chapter is playing (T-23.4).
   *
   * The last one that has STARTED — the same rule the transcript uses for
   * segments, and for the same reason: between chapters the honest answer is
   * still the one you are inside.
   */
  const activeChapter = useMemo(() => {
    if (!summary) return -1
    let found = -1
    summary.outline.forEach((entry, index) => {
      if (entry.start_ms <= player.currentMs) found = index
    })
    return found
  }, [summary, player.currentMs])

  const onRegenerate = () =>
    regenerate.mutate(undefined, {
      onSuccess: () => toast.success(TOAST_MESSAGES.summaryRegenerated),
      onError: () => toast.error(TOAST_MESSAGES.regenerateFailed),
    })

  const markdownOptions = { title, formatTime: formatTimestamp }

  return (
    <section
      data-testid="summary-panel"
      aria-label="Summary"
      className="flex h-full min-h-0 flex-col"
    >
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-subtle px-4">
        <Dropdown
          testId="summary-template-select"
          trigger={
            <Button variant="ghost" size="sm" data-testid="summary-template">
              {TEMPLATES.find((entry) => entry.value === template)?.label}
            </Button>
          }
        >
          <DropdownRadioGroup value={template} onValueChange={setTemplate}>
            <DropdownRadioItem value="general" testId="summary-template-general">
              General Summary
            </DropdownRadioItem>
          </DropdownRadioGroup>
          {/*
            The other four are `soon`, so choosing one explains itself instead
            of silently doing nothing — and the template does not change, which
            is the half of T23-N that is easy to get wrong.
          */}
          {TEMPLATES.filter((entry) => entry.value !== 'general').map((entry) => (
            <DropdownItem key={entry.value} soon testId={`summary-template-${entry.value}`}>
              {entry.label}
            </DropdownItem>
          ))}
          <DropdownItem soon>Custom…</DropdownItem>
        </Dropdown>

        {summary?.is_stale && (
          <Tooltip content="The transcript changed after this summary was generated">
            <span
              data-testid="summary-stale-badge"
              className="rounded-full bg-warning-subtle px-2 py-0.5 text-xs text-warning-strong"
            >
              Outdated
            </span>
          </Tooltip>
        )}

        <span className="ml-auto flex items-center gap-1">
          <IconButton
            label="Copy summary"
            size="sm"
            icon={<Copy size={16} strokeWidth={1.75} />}
            disabled={!summary?.overview}
            data-testid="summary-copy"
            onClick={() => summary && void copy(summaryToMarkdown(summary, markdownOptions))}
          />
          <IconButton
            label="Regenerate summary"
            size="sm"
            icon={
              <RefreshCw
                size={16}
                strokeWidth={1.75}
                className={cn(regenerate.isPending && 'animate-spin')}
              />
            }
            disabled={regenerate.isPending || !summary}
            data-testid="summary-regenerate"
            onClick={onRegenerate}
          />
          <Dropdown
            testId="summary-menu"
            align="end"
            trigger={
              <IconButton
                label="Summary options"
                size="sm"
                icon={<MoreHorizontal size={16} strokeWidth={2} />}
                hideTooltip
                data-testid="summary-kebab"
              />
            }
          >
            <DropdownItem
              testId="summary-copy-plain"
              onSelect={() => summary && void copy(summaryToPlainText(summary, markdownOptions))}
            >
              Copy as plain text
            </DropdownItem>
            <DropdownItem soon>Share summary</DropdownItem>
          </Dropdown>
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-5" data-testid="summary-scroll">
        {isPending && (
          <div className="space-y-6" role="status" aria-busy="true" aria-label="Loading summary">
            <SkeletonText lines={2} />
            <SkeletonText lines={5} />
            <SkeletonText lines={6} />
          </div>
        )}

        {isError && (
          <StateView
            variant="error"
            testId="summary-error"
            title="Couldn't load the summary"
            body="The transcript is unaffected — one failing panel does not blank the page."
            action={
              <Button
                variant="secondary"
                onClick={() => void refetch()}
                data-testid="summary-retry"
              >
                Try again
              </Button>
            }
            className="border-0"
          />
        )}

        {summary && !summary.overview && (
          <StateView
            variant="empty"
            testId="summary-empty"
            title="No summary yet"
            body="This meeting has not been summarised."
            action={
              <Button
                variant="primary"
                onClick={onRegenerate}
                loading={regenerate.isPending}
                data-testid="summary-generate"
              >
                Generate summary
              </Button>
            }
            className="border-0"
          />
        )}

        {summary?.overview && (
          <>
            {summary.keywords.length > 0 && (
              <SummarySection id="keywords" label="Keywords" meetingId={meetingId}>
                <div className="flex flex-wrap gap-1.5">
                  {summary.keywords.slice(0, MAX_KEYWORDS).map((keyword, index) => (
                    <Chip
                      key={keyword}
                      testId={`summary-keyword-${index}`}
                      // Searching the transcript for it connects two features
                      // that were built separately (T-23.2), and costs nothing.
                      onAction={() => requestFind(keyword)}
                      actionLabel={`Find "${keyword}" in the transcript`}
                    >
                      {keyword}
                    </Chip>
                  ))}
                </div>
              </SummarySection>
            )}

            <SummarySection id="overview" label="Meeting Overview" meetingId={meetingId}>
              <Overview text={summary.overview} />
            </SummarySection>

            {summary.outline.length > 0 && (
              <SummarySection id="outline" label="Meeting Outline" meetingId={meetingId}>
                <ol data-testid="summary-outline" className="space-y-0.5">
                  {summary.outline.map((entry, index) => (
                    <li
                      key={entry.sequence}
                      data-testid={`summary-outline-item-${index}`}
                      data-active={index === activeChapter || undefined}
                      className={cn(
                        'flex items-baseline gap-2 rounded-md px-2 py-1 transition-colors duration-fast',
                        index === activeChapter ? 'bg-accent-subtle' : 'hover:bg-surface-hover',
                      )}
                    >
                      <TimestampButton
                        data-testid={`summary-outline-time-${index}`}
                        time={formatTimestamp(entry.start_ms)}
                        label={`Play ${entry.title}, from ${formatTimestamp(entry.start_ms)}`}
                        onClick={() => seekTo(entry.start_ms, { play: true, reveal: true })}
                        className={cn(index === activeChapter && 'text-accent')}
                      />
                      <span className="min-w-0 flex-1 text-body text-secondary">{entry.title}</span>
                    </li>
                  ))}
                </ol>
              </SummarySection>
            )}

            {summary.notes.length > 0 && (
              <SummarySection id="notes" label="Bullet-Point Notes" meetingId={meetingId}>
                <div className="space-y-4" data-testid="summary-notes">
                  {summary.notes.map((group) => (
                    <div key={group.chapter} className="space-y-2">
                      <h3
                        className="text-body-strong text-primary"
                        data-testid="summary-note-group"
                      >
                        {group.chapter}
                      </h3>
                      <ul className="space-y-2">
                        {group.bullets.map((bullet) => (
                          <li
                            key={bullet}
                            className="flex gap-2 text-body text-secondary"
                            data-testid="summary-note-bullet"
                          >
                            <span aria-hidden="true" className="shrink-0 text-muted">
                              •
                            </span>
                            <span className="min-w-0">{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </SummarySection>
            )}

            <SummarySection id="actions" label="Action Items" meetingId={meetingId}>
              <ActionItems meetingId={meetingId} participants={participants} />
            </SummarySection>

            {/*
              Attribution (T-23.10). Small and muted, but present: a summary
              that does not say a machine wrote it is the one thing on this
              panel that would actually mislead someone.
            */}
            <p
              data-testid="summary-attribution"
              className="mt-8 flex items-center gap-1.5 text-xs text-muted"
            >
              <Sparkles size={12} strokeWidth={2} aria-hidden="true" />
              Generated by {summary.provider}
              {summary.model ? ` · ${summary.model}` : ''}
              {summary.generated_at ? ` · ${formatRelativeDate(summary.generated_at)}` : ''}
            </p>
          </>
        )}
      </div>
    </section>
  )
}

/**
 * The overview paragraph, clamped to six lines (T-23.3).
 *
 * `max-w-prose` because a line much longer than about 70 characters is
 * measurably harder to read — and this panel can be dragged wide.
 */
function Overview({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="max-w-prose space-y-1">
      <p
        data-testid="summary-overview"
        className={cn('text-body text-secondary', !expanded && 'line-clamp-6')}
      >
        {text}
      </p>
      {text.length > CLAMP_ABOVE_CHARS && (
        <Button
          variant="link"
          onClick={() => setExpanded((value) => !value)}
          data-testid="summary-overview-toggle"
          className="text-sm"
        >
          {expanded ? 'Show less' : 'Show more'}
        </Button>
      )}
    </div>
  )
}
