import { test as base, type Page } from '@playwright/test'

/**
 * Shared fixtures (T-39.6).
 *
 * Everything here existed inline in the specs first — the frozen clock in four
 * files, clipboard permissions in four more — and was lifted once the pattern
 * had proven itself. New suites import `test`/`expect` from this file instead
 * of `@playwright/test`; the four values below are the reason why.
 */

/**
 * The instant the seeder anchors on — the SAME string as `SEED_ANCHOR_DATE` in
 * `playwright.config.ts` and `E2E_ANCHOR` in `global-setup.ts`. Pinning the
 * browser clock here makes seeded "today" and asserted "Today" the same day
 * regardless of when the suite runs.
 *
 * Two meetings are seeded later the same day (10:00 and 15:30). Date labels
 * are calendar-day granular (`formatRelativeDate`), so a morning clock still
 * renders them as "Today" — a test that genuinely needs a different time of
 * day derives it from this constant rather than hardcoding a second instant.
 */
export const SEED_ANCHOR = '2026-07-26T09:00:00Z'

/** Where the backend listens — same resolution as `00-smoke` and the config. */
export const API_URL =
  process.env.E2E_API_URL ?? `http://localhost:${process.env.E2E_BACKEND_PORT ?? '8100'}`

/** What `page.route` accepts as a matcher. */
type RouteMatcher = string | RegExp | ((url: URL) => boolean)

/**
 * Pin a page's clock to the seed anchor.
 *
 * Exposed for the pages the auto-fixture cannot reach: a second tab from
 * `context.newPage()` gets a fresh clock, so a spec that opens one pins it
 * explicitly (see `09-filters` T13-K).
 *
 * `setFixedTime` freezes `Date.now()` but keeps timers running, so debounces
 * and toast timeouts behave normally.
 */
export async function pinClock(page: Page, at: string = SEED_ANCHOR): Promise<void> {
  await page.clock.setFixedTime(new Date(at))
}

// ── apiMock: page.route wrappers ────────────────────────────────────────────
//
// Standalone functions rather than fixture methods, so a spec that already
// has its own `page.route` choreography can mix them in without adopting the
// whole fixture. They exist to make the three recurring stub shapes one-liners.

/**
 * Fail every matching request with the repo's error envelope.
 *
 * Remember the query client retries a retryable error once (ADR-005), so a
 * test that wants the ERROR STATE must leave this in place for both attempts —
 * see `12-states` T16-D for the pattern of failing exactly n attempts.
 */
export async function failRoute(
  page: Page,
  matcher: RouteMatcher,
  status = 500,
  code = 'INTERNAL_ERROR',
): Promise<void> {
  await page.route(matcher, (route) =>
    route.fulfill({
      status,
      json: { error: { code, message: 'Stubbed failure (e2e failRoute).', details: {} } },
    }),
  )
}

/** Hold every matching request for `ms` before letting it through. */
export async function delayRoute(page: Page, matcher: RouteMatcher, ms: number): Promise<void> {
  await page.route(matcher, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, ms))
    await route.continue()
  })
}

/**
 * Count matching requests without interfering with them.
 *
 * `fallback()` rather than `continue()`: the counter is an observer, so any
 * other handler registered for the same URL still gets its turn.
 */
export async function countRequests(
  page: Page,
  matcher: RouteMatcher,
): Promise<{ readonly count: number }> {
  const counter = { count: 0 }
  await page.route(matcher, async (route) => {
    counter.count++
    await route.fallback()
  })
  return counter
}

// ── Fixtures ────────────────────────────────────────────────────────────────

interface SeededMeeting {
  id: number
  title: string
  /** `/meeting/{id}` — what `page.goto` wants. */
  path: string
}

interface Fixtures {
  /** Auto: every page starts with its clock pinned to `SEED_ANCHOR`. */
  frozenClock: void
  /** Clipboard access granted; `readText()` reads what the app wrote. */
  clipboard: { readText(): Promise<string> }
  /** Call to stub the meetings list empty — the `12-states` T16-A pattern. */
  emptyDb: () => Promise<void>
}

interface WorkerFixtures {
  /** The hero meeting, resolved from the API rather than assumed. */
  seededMeeting: SeededMeeting
}

export const test = base.extend<Fixtures, WorkerFixtures>({
  /*
   * The frozen clock is AUTO: date assertions against seeded data are the rule
   * in this suite, not the exception, and the four specs that pinned the clock
   * ad hoc each rediscovered the need the hard way. Runs before the test body,
   * so every navigation sees the pinned time.
   */
  frozenClock: [
    async ({ page }, use) => {
      await pinClock(page)
      await use()
    },
    { auto: true },
  ],

  clipboard: async ({ context, page }, use) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await use({
      readText: () => page.evaluate(() => navigator.clipboard.readText()),
    })
  },

  /*
   * Stubbed rather than actually emptied: the seeded database is shared, and
   * "no rows" is a response shape, not a database state worth mutating
   * (ADR-037 keeps writers out of the read-only project). The matcher is a
   * predicate because Playwright's glob `?` is a single-character wildcard —
   * a glob of "meetings?*" would also swallow "/api/v1/meetings/facets"
   * (the `12-states` MEETINGS_LIST lesson).
   */
  emptyDb: async ({ page }, use) => {
    await use(async () => {
      await page.route(
        (url) => url.pathname === '/api/v1/meetings',
        (route) =>
          route.fulfill({
            json: { items: [], page: 1, page_size: 20, total: 0, total_pages: 0, has_next: false },
          }),
      )
    })
  },

  /*
   * WORKER-scoped: the answer cannot change mid-run (global-setup reseeds once,
   * before anything else), so one API call per worker is enough.
   *
   * Resolved by TITLE rather than hardcoding id 1: the seeder assigns ids by
   * filename order into a reset database, which today makes the hero meeting
   * id 1 — but that is an implementation detail of the seed, and the fixture
   * failing loudly ("hero meeting not seeded?") beats every dependent test
   * failing obscurely.
   */
  seededMeeting: [
    async ({ playwright }, use) => {
      const api = await playwright.request.newContext({ baseURL: API_URL })
      const response = await api.get('/api/v1/meetings', { params: { page_size: 50 } })
      const body = (await response.json()) as { items?: Array<{ id: number; title: string }> }
      const hero = body.items?.find((item) => item.title === 'Q3 Product Roadmap Sync')
      await api.dispose()

      if (!hero) {
        throw new Error(
          'seededMeeting: "Q3 Product Roadmap Sync" not found — did global-setup seed run?',
        )
      }
      await use({ id: hero.id, title: hero.title, path: `/meeting/${hero.id}` })
    },
    { scope: 'worker' },
  ],
})

export { expect } from '@playwright/test'
