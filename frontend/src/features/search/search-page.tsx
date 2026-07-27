'use client'

/**
 * The /search results page (T-35.4 to T-35.10).
 *
 * The payoff is the snippet link: clicking one lands on
 * `/meeting/{id}?t=<sec>&find=<q>` — the player at the moment it was said,
 * the find bar primed with the query. A search page whose results dump you at
 * the top of a meeting answers "where" with "somewhere in here".
 */

import { HelpCircle, Search } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Chip, ToggleChip } from '@/components/ui/chip'
import { Highlighter } from '@/components/ui/highlighter'
import { TimestampButton } from '@/components/ui/media-controls'
import { Popover } from '@/components/ui/popover'
import { Select } from '@/components/ui/select'
import { SkeletonText } from '@/components/ui/skeleton'
import { StateView } from '@/components/ui/state-view'
import { useMeetingFacets } from '@/lib/api/meetings'
import { useSearchPage } from '@/lib/api/search'
import type { MeetingHit, TranscriptHit } from '@/lib/api/types'
import { useQueryParams } from '@/lib/hooks/use-query-params'
import { pluralize } from '@/lib/utils/format'
import { formatMeetingMeta, formatTimestamp } from '@/lib/utils/format'

/** The seeded corpus's most common keywords, for the zero state (T-35.10). */
const SUGGESTED = ['pricing', 'onboarding', 'incident', 'roadmap', 'billing']

/** Snippets shown per meeting card before "and N more". */
const SNIPPETS_PER_MEETING = 3

export function SearchPage() {
  const { params, setParams } = useQueryParams()

  const query = params.q ?? ''
  const host = params.shost ?? null
  const scope = params.stype ?? 'all'
  const [grouped, setGrouped] = useState(true)

  const { data: facets } = useMeetingFacets()
  const search = useSearchPage(query, { host, scope })

  // Memoised so the empty fallback is not a new array each render — the
  // grouping memo below keys on it.
  const pages = useMemo(() => search.data?.pages ?? [], [search.data])
  const first = pages[0]
  const transcripts = useMemo(() => pages.flatMap((page) => page.transcripts), [pages])
  const meetings = first?.meetings ?? []
  const total = first?.total ?? 0

  /*
   * Grouped by meeting (T-35.6): the hits under one title collapse into one
   * card with up to three snippets. Order follows each meeting's BEST hit —
   * the pages arrive rank-ordered, so first appearance is best rank.
   */
  const groups = useMemo(() => {
    const byMeeting = new Map<number, { title: string; hits: TranscriptHit[] }>()
    for (const hit of transcripts) {
      const existing = byMeeting.get(hit.meeting_id)
      if (existing) existing.hits.push(hit)
      else byMeeting.set(hit.meeting_id, { title: hit.meeting_title, hits: [hit] })
    }
    return [...byMeeting.entries()].map(([meetingId, group]) => ({ meetingId, ...group }))
  }, [transcripts])

  const deepLink = (hit: TranscriptHit) =>
    `/meeting/${hit.meeting_id}?t=${Math.floor(hit.start_ms / 1000)}&find=${encodeURIComponent(query)}`

  return (
    <div data-testid="search-page" className="flex h-full min-h-0 flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-h2 text-primary">
          {query ? (
            <span data-testid="search-total">
              {pluralize(total, 'result')} for <span className="text-accent">“{query}”</span>
            </span>
          ) : (
            'Search'
          )}
        </h1>

        <Popover
          label="Search syntax"
          align="start"
          testId="search-syntax"
          trigger={
            <Button variant="ghost" size="sm" data-testid="search-syntax-button">
              <HelpCircle size={14} strokeWidth={1.75} aria-hidden="true" className="mr-1 inline" />
              Syntax
            </Button>
          }
        >
          <dl className="w-72 space-y-2 text-sm">
            {(
              [
                ['"pricing model"', 'this exact phrase'],
                ['-churn', 'exclude a word'],
                ['speaker:Sarah', 'only what one person said'],
                ['after:2026-07-01', 'meetings on or after a date'],
                ['before:2026-07-01', 'meetings before a date'],
              ] as const
            ).map(([syntax, meaning]) => (
              <div key={syntax} className="flex items-baseline justify-between gap-3">
                <dt>
                  <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">{syntax}</code>
                </dt>
                <dd className="text-right text-muted">{meaning}</dd>
              </div>
            ))}
          </dl>
        </Popover>

        <span className="ml-auto">
          <ToggleChip
            selected={grouped}
            onToggle={() => setGrouped((value) => !value)}
            testId="search-group-toggle"
          >
            Group by meeting
          </ToggleChip>
        </span>
      </header>

      <div className="flex min-h-0 flex-1 gap-6">
        {/* ── Filters (T-35.4) ─────────────────────────────────────────── */}
        <aside className="w-52 shrink-0 space-y-4" aria-label="Search filters">
          <Select
            label="Type"
            value={scope}
            onValueChange={(value) => setParams({ stype: value === 'all' ? null : value })}
            testId="search-filter-type"
            options={[
              { value: 'all', label: 'Everything' },
              { value: 'meetings', label: 'Meeting titles' },
              { value: 'transcript', label: 'Transcripts' },
            ]}
          />

          <Select
            label="Host"
            value={host ?? 'anyone'}
            onValueChange={(value) => setParams({ shost: value === 'anyone' ? null : value })}
            testId="search-filter-host"
            options={[
              { value: 'anyone', label: 'Anyone' },
              ...(facets?.hosts ?? []).map((name) => ({ value: name, label: name })),
            ]}
          />

          <p className="text-xs text-muted">Dates filter through the query itself — see Syntax.</p>
        </aside>

        {/* ── Results ──────────────────────────────────────────────────── */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-6" data-testid="search-results">
          {search.isPending && query && <SkeletonText lines={10} />}

          {!query && (
            <StateView
              variant="empty"
              title="Search every meeting"
              body="Titles and transcripts, ranked. Try one of these:"
              action={<SuggestionChips onPick={(term) => setParams({ q: term })} />}
              className="border-0"
            />
          )}

          {query && first && total === 0 && (
            <StateView
              variant="no-results"
              testId="search-zero"
              title={`Nothing for “${query}”`}
              body="Check your spelling, try fewer words, or search titles only."
              action={<SuggestionChips onPick={(term) => setParams({ q: term })} />}
              className="border-0"
            />
          )}

          {/* Title matches rank above transcript matches (T-35.7). */}
          {meetings.map((meeting, index) => (
            <MeetingCard key={meeting.id} meeting={meeting} best={index === 0} query={query} />
          ))}

          {grouped
            ? groups.map((group) => (
                <section
                  key={group.meetingId}
                  data-testid={`search-result-${group.meetingId}`}
                  className="space-y-1.5 rounded-lg border border-subtle p-4"
                >
                  <Link
                    href={`/meeting/${group.meetingId}`}
                    className="text-title-row text-accent hover:underline"
                  >
                    {group.title}
                  </Link>
                  <SnippetList hits={group.hits.slice(0, SNIPPETS_PER_MEETING)} toHref={deepLink} />
                  {group.hits.length > SNIPPETS_PER_MEETING && (
                    <p className="text-xs text-muted">
                      and {group.hits.length - SNIPPETS_PER_MEETING} more in this meeting
                    </p>
                  )}
                </section>
              ))
            : transcripts.length > 0 && (
                <section className="space-y-1.5 rounded-lg border border-subtle p-4">
                  <SnippetList hits={transcripts} toHref={deepLink} withMeeting />
                </section>
              )}

          {first?.has_more && (
            <div className="flex justify-center">
              <Button
                variant="secondary"
                onClick={() => void search.fetchNextPage()}
                loading={search.isFetchingNextPage}
                data-testid="search-load-more"
              >
                Load more
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SuggestionChips({ onPick }: { onPick: (term: string) => void }) {
  return (
    <span className="flex flex-wrap justify-center gap-1.5">
      {SUGGESTED.map((term) => (
        <Chip
          key={term}
          onAction={() => onPick(term)}
          actionLabel={`Search for ${term}`}
          testId={`search-suggestion-${term}`}
        >
          <Search size={12} strokeWidth={1.75} aria-hidden="true" />
          {term}
        </Chip>
      ))}
    </span>
  )
}

function MeetingCard({
  meeting,
  best,
  query,
}: {
  meeting: MeetingHit
  best: boolean
  query: string
}) {
  return (
    <section
      data-testid={`search-result-${meeting.id}`}
      className="space-y-1 rounded-lg border border-subtle p-4"
    >
      <div className="flex items-center gap-2">
        <Link
          href={`/meeting/${meeting.id}?find=${encodeURIComponent(query)}`}
          className="text-title-row text-accent hover:underline"
        >
          <Highlighter text={meeting.title} ranges={meeting.matches} />
        </Link>
        {best && (
          // Ranking transparency (T-35.7): the top hit says WHY it is first.
          <span
            data-testid="search-best-match"
            className="rounded-full bg-accent-subtle px-2 py-0.5 text-xs text-accent"
          >
            Best match
          </span>
        )}
      </div>
      <p className="text-sm text-muted">
        {formatMeetingMeta(meeting.started_at, meeting.duration_seconds)}
      </p>
    </section>
  )
}

function SnippetList({
  hits,
  toHref,
  withMeeting = false,
}: {
  hits: TranscriptHit[]
  toHref: (hit: TranscriptHit) => string
  withMeeting?: boolean
}) {
  return (
    <ul className="space-y-1.5">
      {hits.map((hit, index) => (
        <li key={hit.segment_id} className="flex items-baseline gap-2">
          <TimestampButton
            time={formatTimestamp(hit.start_ms)}
            label={`Open at ${formatTimestamp(hit.start_ms)}`}
            // A Link would be more idiomatic, but the timestamp style already
            // exists as a button primitive; navigation happens via href below.
            onClick={() => {
              window.location.href = toHref(hit)
            }}
            data-testid={`search-snippet-${index}`}
          />
          <span className="min-w-0 text-body text-secondary">
            {withMeeting && <span className="mr-1 text-xs text-muted">{hit.meeting_title} ·</span>}
            <span className="mr-1 text-body-strong text-primary">{hit.speaker}:</span>
            <Link href={toHref(hit)} className="hover:underline">
              <Highlighter text={hit.snippet} ranges={hit.matches} />
            </Link>
          </span>
        </li>
      ))}
    </ul>
  )
}
