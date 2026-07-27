'use client'

/**
 * Analytics placeholder charts (T-30.5).
 *
 * The rule here is honesty about provenance: meetings-per-week is computed
 * from the real meetings list, because it trivially can be; talk-time and
 * sentiment would need per-segment aggregation the API doesn't expose, so
 * they are static and every fabricated chart carries a visible `Sample data`
 * badge. Fabricated-but-unlabelled is the one thing this page must never be.
 *
 * Hand-rolled bars and one SVG polyline — a charting dependency for three
 * placeholder charts is weight the bundle pays forever.
 */

import { Badge } from '@/components/ui/chip'
import { Skeleton } from '@/components/ui/skeleton'
import { useMeetings } from '@/lib/api/meetings'

/** Monday of the week containing `date`, as a yyyy-mm-dd key. */
function weekKey(date: Date): string {
  const monday = new Date(date)
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  return monday.toISOString().slice(0, 10)
}

function ChartCard({
  title,
  sample,
  testId,
  children,
}: {
  title: string
  sample?: boolean
  testId: string
  children: React.ReactNode
}) {
  return (
    <section
      data-testid={testId}
      className="flex flex-col gap-3 rounded-lg border border-subtle bg-surface-0 p-4"
    >
      <header className="flex items-center justify-between">
        <h2 className="text-body-strong text-primary">{title}</h2>
        {sample && (
          <Badge variant="warning" testId={`${testId}-sample-badge`}>
            Sample data
          </Badge>
        )}
      </header>
      {children}
    </section>
  )
}

/** Real: bucketed from the meetings list the Notebook already serves. */
function MeetingsPerWeek() {
  const { data, isPending } = useMeetings({ pageSize: 100, sort: '-started_at' })

  if (isPending) {
    return (
      <ChartCard title="Meetings per week" testId="analytics-meetings-per-week">
        <Skeleton className="h-32 w-full" />
      </ChartCard>
    )
  }

  const buckets = new Map<string, number>()
  for (const meeting of data?.items ?? []) {
    const key = weekKey(new Date(meeting.started_at))
    buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }
  const weeks = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-6)
  const peak = Math.max(1, ...weeks.map(([, count]) => count))

  return (
    <ChartCard title="Meetings per week" testId="analytics-meetings-per-week">
      {/*
        `items-stretch` (the default) rather than `items-end`, and the bar sits
        in its own `flex-1` track.

        The previous markup drew every bar 4px tall whatever the count — a bar
        chart with no bars. `items-end` sizes each column to its content, so the
        bar's `height: 20%` resolved against a parent with no definite height,
        which CSS treats as `auto`; `minHeight: 4` then became the only rule in
        play. Stretching the column gives the percentage something real to
        resolve against, and putting the bar in a `flex-1` track means the two
        labels take their space first instead of competing with it.
      */}
      <div className="flex h-32 gap-2" role="img" aria-label="Meetings per week">
        {weeks.map(([week, count]) => (
          <div key={week} className="flex flex-1 flex-col items-center gap-1">
            <span className="tnum text-xs text-secondary">{count}</span>
            <div className="flex w-full flex-1 items-end">
              <div
                className="w-full rounded-t-sm bg-accent"
                style={{ height: `${(count / peak) * 100}%`, minHeight: 4 }}
              />
            </div>
            <span className="tnum text-[10px] text-muted">{week.slice(5)}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted">From your seeded meetings — this one is real.</p>
    </ChartCard>
  )
}

const TALK_TIME = [
  { name: 'Sarah Chen', share: 38 },
  { name: 'Priya Sharma', share: 27 },
  { name: 'Marcus Lee', share: 21 },
  { name: 'Dana Kim', share: 14 },
]

function TalkTimeDistribution() {
  return (
    <ChartCard title="Talk-time distribution" sample testId="analytics-talk-time">
      <ul className="space-y-2">
        {TALK_TIME.map((speaker) => (
          <li key={speaker.name} className="flex items-center gap-3">
            <span className="w-28 shrink-0 truncate text-sm text-secondary">{speaker.name}</span>
            <div className="h-2.5 flex-1 rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${speaker.share}%` }}
              />
            </div>
            <span className="tnum w-10 shrink-0 text-right text-sm text-secondary">
              {speaker.share}%
            </span>
          </li>
        ))}
      </ul>
    </ChartCard>
  )
}

/** Six weeks of fabricated sentiment, plotted as one SVG polyline. */
const SENTIMENT = [62, 58, 66, 71, 69, 76]

function SentimentTrend() {
  const width = 240
  const height = 80
  const step = width / (SENTIMENT.length - 1)
  const points = SENTIMENT.map(
    (value, index) => `${index * step},${height - (value / 100) * height}`,
  ).join(' ')

  return (
    <ChartCard title="Sentiment trend" sample testId="analytics-sentiment">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-24 w-full"
        role="img"
        aria-label="Positive sentiment share over six weeks, trending up"
        preserveAspectRatio="none"
      >
        <polyline
          points={points}
          fill="none"
          className="stroke-accent"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p className="tnum text-xs text-muted">
        {SENTIMENT[0]}% → {SENTIMENT[SENTIMENT.length - 1]}% positive over six weeks
      </p>
    </ChartCard>
  )
}

export function AnalyticsCharts() {
  return (
    <div className="grid gap-4 lg:grid-cols-3" data-testid="analytics-charts">
      <MeetingsPerWeek />
      <TalkTimeDistribution />
      <SentimentTrend />
    </div>
  )
}
