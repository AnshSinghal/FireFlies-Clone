'use client'

/**
 * The summary panel — SHELL ONLY (T-18).
 *
 * T-20 builds the five sections, the outline and the action items. What is
 * settled here is the panel's place in the layout and the fact that it owns its
 * own scroll container, which is the property T-18.10 exists for.
 */

import { StateView } from '@/components/ui/state-view'
import { SkeletonText } from '@/components/ui/skeleton'
import { useSummary } from '@/lib/api/summaries'

export function SummaryPanel({ meetingId }: { meetingId: number }) {
  const { data: summary, isPending, isError } = useSummary(meetingId)

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
                  <li key={entry.sequence} className="text-body text-secondary">
                    {entry.title}
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
