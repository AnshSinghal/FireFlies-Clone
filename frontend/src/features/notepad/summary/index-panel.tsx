'use client'

/**
 * The Index flyout (T-23.13).
 *
 * A table of contents for the summary panel: the five sections, then each
 * outline chapter. Section links scroll the summary; chapter links seek the
 * player, because a chapter is a place in the recording and jumping there is
 * more useful than jumping to a line about it.
 */

import { ResultRow } from '@/components/ui/media-controls'
import { StateView } from '@/components/ui/state-view'
import { useSummary } from '@/lib/api/summaries'
import { useNotepadCommands } from '@/lib/notepad/commands'
import { formatTimestamp } from '@/lib/utils/format'

const SECTIONS = [
  { id: 'keywords', label: 'Keywords' },
  { id: 'overview', label: 'Meeting Overview' },
  { id: 'outline', label: 'Meeting Outline' },
  { id: 'notes', label: 'Bullet-Point Notes' },
  { id: 'actions', label: 'Action Items' },
] as const

export function IndexPanel({ meetingId }: { meetingId: number }) {
  const { data: summary } = useSummary(meetingId)
  const { seekTo } = useNotepadCommands()

  if (!summary?.overview) {
    return (
      <StateView
        variant="empty"
        title="Nothing to index yet"
        body="The index lists the summary's sections once there is a summary."
        className="border-0 py-6"
      />
    )
  }

  const scrollTo = (id: string) => {
    /*
     * Found by testid rather than by a ref passed across panels.
     *
     * The two panels are siblings with a resizable split between them, and
     * threading a ref through that would couple them for one scroll. A section
     * that is COLLAPSED still renders its heading, so the target always exists.
     */
    document
      .querySelector(`[data-testid="summary-section-${id}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <nav data-testid="index-panel" aria-label="Summary index" className="space-y-3">
      <ul className="space-y-0.5">
        {SECTIONS.map((section) => (
          <li key={section.id}>
            <ResultRow
              data-testid={`index-section-${section.id}`}
              onClick={() => scrollTo(section.id)}
            >
              <span className="text-body text-secondary">{section.label}</span>
            </ResultRow>
          </li>
        ))}
      </ul>

      {summary.outline.length > 0 && (
        <div className="space-y-1 border-t border-subtle pt-3">
          <h3 className="px-2 text-label uppercase text-muted">Chapters</h3>
          <ul className="space-y-0.5">
            {summary.outline.map((entry, index) => (
              <li key={entry.sequence}>
                <ResultRow
                  data-testid={`index-chapter-${index}`}
                  onClick={() => seekTo(entry.start_ms, { play: true, reveal: true })}
                >
                  <span className="flex items-baseline gap-2">
                    <span className="tnum shrink-0 text-xs text-muted">
                      {formatTimestamp(entry.start_ms)}
                    </span>
                    <span className="min-w-0 text-sm text-secondary">{entry.title}</span>
                  </span>
                </ResultRow>
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  )
}
