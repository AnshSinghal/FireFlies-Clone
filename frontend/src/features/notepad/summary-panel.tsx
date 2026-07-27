'use client'

/**
 * The summary panel — the five sections and the action items are T-23.
 *
 * What is settled here is the panel's place in the layout, that it owns its own
 * scroll container (T-18.10), and that its outline chapters SEEK (T-21.6).
 */

import { SkeletonText } from '@/components/ui/skeleton'
import { StateView } from '@/components/ui/state-view'
import { TimestampButton } from '@/components/ui/media-controls'
import { useSummary } from '@/lib/api/summaries'
import { useNotepadCommands } from '@/lib/notepad/commands'
import { formatTimestamp } from '@/lib/utils/format'

export function SummaryPanel({ meetingId }: { meetingId: number }) {
  const { data: summary, isPending, isError } = useSummary(meetingId)
  const { seekTo } = useNotepadCommands()

  return (
    /*
     * `min-h-0` + `overflow-y-auto` on the panel itself. Without `min-h-0` a
     * flex child refuses to shrink below its content, so the PAGE scrolls
     * instead of the panel and the header scrolls away with it.
     */
    <section
      data-testid="summary-panel"
      aria-label="Summary"
      className="flex h-full min-h-0 flex-col overflow-y-auto p-5"
    >
      {isPending && <SkeletonText lines={10} />}

      {isError && (
        <StateView
          variant="error"
          title="Couldn't load the summary"
          body="The transcript is unaffected — one failing panel does not blank the page."
          className="border-0"
        />
      )}

      {summary && !summary.overview && (
        <StateView
          variant="empty"
          title="Not summarised yet"
          body="This meeting has no summary."
          className="border-0"
        />
      )}

      {summary?.overview && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <h2 className="text-label uppercase text-muted">Overview</h2>
            <p data-testid="summary-overview" className="text-body text-secondary">
              {summary.overview}
            </p>
          </div>

          {summary.outline.length > 0 && (
            <div className="space-y-1.5">
              <h2 className="text-label uppercase text-muted">Outline</h2>
              <ol className="space-y-1" data-testid="summary-outline">
                {summary.outline.map((entry) => (
                  <li
                    key={entry.sequence}
                    className="flex items-baseline gap-2 text-body text-secondary"
                  >
                    {/*
                      An explicit "take me there": it seeks, starts playback and
                      reveals the line in the transcript even if the reader has
                      scrolled away (T-21.6).
                    */}
                    <TimestampButton
                      data-testid={`outline-timestamp-${entry.sequence}`}
                      time={formatTimestamp(entry.start_ms)}
                      label={`Play ${entry.title}, from ${formatTimestamp(entry.start_ms)}`}
                      onClick={() => seekTo(entry.start_ms, { play: true, reveal: true })}
                    />
                    <span className="min-w-0 flex-1">{entry.title}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
