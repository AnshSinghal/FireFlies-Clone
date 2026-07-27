import type { Page } from '@playwright/test'

import { delayRoute, expect, test } from '../fixtures'
import { NotebookPage, NotepadPage, SummaryComponent, TranscriptComponent } from '../pages'

/**
 * Timeouts and malformed payloads (T-40.11) — the failure paths the rest of
 * the suite does NOT already own. 500s, offline, the branded 404/410 pages and
 * mutation rollback live in `12-states`, `90-mutations` and `25-comments`;
 * nothing here repeats them. What is new:
 *
 * - the CLIENT-side 15s timeout (`DEFAULT_TIMEOUT_MS`, lib/api/client.ts)
 *   actually firing — for a query and for a mutation — which no server-stubbed
 *   status code can reach, and
 * - responses broken at the BODY level: invalid JSON bytes, and valid JSON
 *   missing the keys the UI needs. Neither carries the error envelope, so the
 *   client's own parsing/guarding is all that stands between the user and a
 *   white screen.
 *
 * Every test records uncaught page errors and console errors: whatever the
 * server sends, the page must degrade to one of its OWN states — never a blank
 * page, never an unhandled exception.
 */

/** 15s in lib/api/client.ts (`DEFAULT_TIMEOUT_MS`) — the budget these tests outwait. */
const CLIENT_TIMEOUT_MS = 15_000

/**
 * When the list's error state can exist at the earliest: two full client
 * timeouts (the query client retries a NetworkError once, ADR-005), the 1s
 * retry backoff, and slack for paint under four workers.
 */
const ERROR_STATE_BUDGET_MS = CLIENT_TIMEOUT_MS * 2 + 15_000

// ── Matchers ────────────────────────────────────────────────────────────────
// Predicates rather than globs: Playwright's glob `?` is a single-character
// wildcard, so "meetings?*" also swallows "/meetings/facets" (the `12-states`
// MEETINGS_LIST lesson, same as the `emptyDb` fixture).

const MEETINGS_LIST = (url: URL) => url.pathname === '/api/v1/meetings'
const detailOf = (id: number) => (url: URL) => url.pathname === `/api/v1/meetings/${id}`
const summaryOf = (id: number) => (url: URL) => url.pathname === `/api/v1/meetings/${id}/summary`

type RouteMatcher = (url: URL) => boolean

// ── Stubs ───────────────────────────────────────────────────────────────────

/**
 * Hold every matching request open FOREVER — the server that accepts the
 * connection and never answers.
 *
 * Not `delayRoute`: that helper `continue()`s once its delay elapses, and
 * continuing a request the client already abandoned at 15s throws inside the
 * route handler. A promise that never settles keeps the request in flight
 * until the CLIENT gives up, which is exactly the path under test.
 */
async function stallRoute(
  page: Page,
  matcher: RouteMatcher,
  options: { method?: string } = {},
): Promise<void> {
  await page.route(matcher, (route) => {
    if (options.method && route.request().method() !== options.method) return route.continue()
    return new Promise<never>(() => {})
  })
}

/** Bytes that fail `response.json()` — a truncated body behind a healthy 200. */
const TRUNCATED_JSON = '{"items": [{"id": 1, "title": "half a row"'

async function fulfilInvalidJson(page: Page, matcher: RouteMatcher): Promise<void> {
  await page.route(matcher, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: TRUNCATED_JSON }),
  )
}

/** Parses fine, contains nothing the UI needs — the schema-drift failure. */
async function fulfilMissingKeys(page: Page, matcher: RouteMatcher): Promise<void> {
  await page.route(matcher, (route) => route.fulfill({ json: {} }))
}

// ── Error watching ──────────────────────────────────────────────────────────

interface ErrorLog {
  /** `pageerror` events — exceptions nothing caught. Always must be empty. */
  readonly uncaught: string[]
  /** `console.error` output, minus the one exclusion documented below. */
  readonly console: string[]
}

function watchErrors(page: Page): ErrorLog {
  const log: ErrorLog = { uncaught: [], console: [] }

  page.on('pageerror', (error) => log.uncaught.push(String(error)))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    // The audio element's own resource fetch is outside these tests' contract:
    // a stubbed detail payload leaves the player pointing at nothing, and the
    // browser logs that resource failure itself.
    const url = message.location().url
    if (message.text().startsWith('Failed to load resource') && url.includes('/media')) return
    log.console.push(`${message.text()} (${url})`)
  })

  return log
}

// ── Client timeout ──────────────────────────────────────────────────────────

test.describe('errors · client timeout', () => {
  test('ERR-A · a list stalled past the client timeout reaches the error state, and Retry recovers', async ({
    page,
  }) => {
    // Two full 15s client timeouts must elapse before the error state CAN
    // exist — this test is slow by definition, not by accident.
    test.slow()
    const errors = watchErrors(page)
    const notebook = new NotebookPage(page)

    await stallRoute(page, MEETINGS_LIST)
    await notebook.goto()

    // While the request hangs the page is honest about it: skeletons, no error.
    await expect(notebook.skeletons.first()).toBeVisible({ timeout: 15_000 })
    await expect(notebook.error).toBeHidden()

    const error = notebook.error
    await expect(error).toBeVisible({ timeout: ERROR_STATE_BUDGET_MS })
    await expect(error).toContainText("Couldn't load meetings")
    // The client's own deadline produced this, not a server response…
    await expect(error).toContainText('timed out')
    // …so the code is the network one — quiet, a handle for a bug report.
    await expect(error.locator('code')).toContainText('NETWORK_ERROR')

    // Lift the stall: the SAME retry affordance must now succeed.
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await notebook.retry.click()
    await expect(notebook.list).toBeVisible({ timeout: 15_000 })

    expect(errors.uncaught).toEqual([])
    expect(errors.console).toEqual([])
  })

  test('ERR-B · a comment post that times out rolls back, toasts, and keeps the composer text', async ({
    page,
    seededMeeting,
  }) => {
    // One full client timeout must elapse before the mutation can fail.
    test.slow()
    const errors = watchErrors(page)
    const notepad = new NotepadPage(page)
    const transcript = new TranscriptComponent(page)

    await notepad.goto(seededMeeting.id)
    await expect(transcript.list).toBeVisible({ timeout: 20_000 })

    // Only the POST stalls — the comments LIST on the same path must load, or
    // the composer would never open.
    await stallRoute(page, (url) => url.pathname === `/api/v1/meetings/${seededMeeting.id}/comments`, {
      method: 'POST',
    })

    const segment = page.locator('[data-segment-id]').first()
    const segmentId = await segment.getAttribute('data-segment-id')
    await segment.hover()
    await segment.getByRole('button', { name: 'Segment actions' }).click()
    await page.getByTestId(`segment-add-comment-${segmentId}`).click()
    await page.getByTestId('comment-composer-input').fill('Words that must survive the timeout')
    await page.getByTestId('comment-submit').click()

    // Optimistic: the placeholder is on screen while the POST is still
    // (permanently) in flight.
    await expect(page.locator('[data-pending]').first()).toBeVisible()

    // ~15s later the client gives up; the global mutation handler toasts, and
    // a network failure is retryable, so Retry is offered.
    const toast = page.getByTestId('toast').first()
    await expect(toast).toBeVisible({ timeout: CLIENT_TIMEOUT_MS + 10_000 })
    await expect(toast).toHaveAttribute('data-toast-variant', 'error')
    await expect(page.getByTestId('toast-action').first()).toHaveText('Retry')

    // Rolled back — no optimistic remnant…
    await expect(page.locator('[data-pending]')).toHaveCount(0)
    // …and the words are still in the composer, exactly as typed (T31-G's
    // contract, reached through the timeout path instead of a 500).
    await expect(page.getByTestId('comment-composer-input')).toHaveValue(
      'Words that must survive the timeout',
    )

    expect(errors.uncaught).toEqual([])
    expect(errors.console).toEqual([])
  })
})

// ── Malformed payloads ──────────────────────────────────────────────────────

test.describe('errors · malformed payloads', () => {
  test('ERR-C · invalid JSON bytes in the list land in the error state, not a white screen', async ({
    page,
  }) => {
    const errors = watchErrors(page)
    const notebook = new NotebookPage(page)

    await fulfilInvalidJson(page, MEETINGS_LIST)
    await notebook.goto()

    // Both attempts got garbage — the automatic retry refetches the same stub —
    // so this is the settled error state, fast (no 15s deadline involved).
    await expect(notebook.error).toBeVisible()
    await expect(notebook.error.locator('code')).toContainText('NETWORK_ERROR')

    // The shell survived: a parse failure is a data failure, not a page failure.
    await expect(page.getByRole('heading', { name: 'Meetings', level: 1 })).toBeVisible()
    await expect(notebook.toolbar).toBeVisible()

    // With honest bytes restored, the same Retry recovers.
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await notebook.retry.click()
    await expect(notebook.list).toBeVisible({ timeout: 15_000 })

    expect(errors.uncaught).toEqual([])
    expect(errors.console).toEqual([])
  })

  test('ERR-D · a list payload missing its keys degrades to the empty state, never a crash', async ({
    page,
  }) => {
    const errors = watchErrors(page)
    const notebook = new NotebookPage(page)

    await fulfilMissingKeys(page, MEETINGS_LIST)
    await notebook.goto()

    /*
     * `{}` parses, so the query SUCCEEDS — there is no error for the UI to
     * show. The contract under test is that a shape with no `items` cannot
     * take the page down: the view guards (`data?.items ?? []`) and honestly
     * renders "no rows". Locked in as the empty state so a future refactor
     * that starts trusting the payload (`data.items.map`) fails HERE, not as
     * a white screen in production.
     */
    await expect(notebook.empty).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Meetings', level: 1 })).toBeVisible()
    await expect(page.getByTestId('route-error')).toHaveCount(0)

    expect(errors.uncaught).toEqual([])
    expect(errors.console).toEqual([])
  })

  test('ERR-E · invalid JSON bytes in the detail show the Notepad error with the generic copy', async ({
    page,
    seededMeeting,
  }) => {
    const errors = watchErrors(page)
    const notepad = new NotepadPage(page)

    await fulfilInvalidJson(page, detailOf(seededMeeting.id))
    await notepad.goto(seededMeeting.id)

    await expect(notepad.error).toBeVisible({ timeout: 15_000 })
    await expect(notepad.error).toContainText("Couldn't load this meeting")
    // NOT the 404 copy — a broken response is not a deleted meeting.
    await expect(notepad.error).not.toContainText("doesn't exist")
    // And a way back.
    await expect(notepad.error.getByRole('link', { name: 'Back to meetings' })).toBeVisible()

    expect(errors.uncaught).toEqual([])
    expect(errors.console).toEqual([])
  })

  test('ERR-F · a detail payload missing its keys lands in the route error boundary — never blank, never unhandled', async ({
    page,
    seededMeeting,
  }) => {
    const errors = watchErrors(page)
    const notepad = new NotepadPage(page)

    await fulfilMissingKeys(page, detailOf(seededMeeting.id))
    await notepad.goto(seededMeeting.id)

    /*
     * `{}` parses, so the query succeeds and the workspace starts rendering a
     * meeting with no fields. Most of the tree guards (`participants ?? []`,
     * formatters that swallow an invalid date) — but the edit modal, mounted
     * closed alongside the header, diffs its draft against the loaded meeting
     * (`draft.title.trim()`, edit-meeting-modal.tsx) and throws on the
     * undefined title. The route boundary catches it: the user gets the
     * branded "Something went wrong" with a working Try again — an error
     * state, not a white screen, and NOT an uncaught exception. (Guarding
     * `toDraft` per field would keep the panels alive and would be kinder;
     * noted as a followup alongside ERR-H's. This locks in the same floor:
     * never blank, never unhandled.)
     */
    await expect(page.getByTestId('route-error')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('route-error-retry')).toBeVisible()

    expect(errors.uncaught).toEqual([])
    // No console assertion here: the boundary logs the error it caught
    // (app/error.tsx does so deliberately) — that line is the HANDLED path.
  })

  test('ERR-G · invalid JSON bytes in the summary fail ONE panel — the transcript is untouched', async ({
    page,
    seededMeeting,
  }) => {
    const errors = watchErrors(page)
    const notepad = new NotepadPage(page)
    const summary = new SummaryComponent(page)
    const transcript = new TranscriptComponent(page)

    await fulfilInvalidJson(page, summaryOf(seededMeeting.id))
    await notepad.goto(seededMeeting.id)

    // The panel's own error state — whose copy promises exactly what this
    // test asserts: one failing panel does not blank the page.
    await expect(summary.error).toBeVisible({ timeout: 20_000 })
    await expect(summary.error).toContainText("Couldn't load the summary")
    await expect(transcript.list).toBeVisible()
    await expect(transcript.rows.first()).toBeVisible()

    // The panel's retry refetches — and with the stub lifted, succeeds.
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await summary.retry.click()
    await expect(summary.overview).toBeVisible({ timeout: 20_000 })

    expect(errors.uncaught).toEqual([])
    expect(errors.console).toEqual([])
  })

  test('ERR-H · a summary payload missing its keys must not white-screen the Notepad', async ({
    page,
    seededMeeting,
  }) => {
    const errors = watchErrors(page)
    const notepad = new NotepadPage(page)

    await fulfilMissingKeys(page, summaryOf(seededMeeting.id))
    await notepad.goto(seededMeeting.id)

    /*
     * `{}` parses, so the query succeeds and the panel renders a shape with no
     * `outline`. Today the resulting render TypeError is caught by the route
     * error boundary: the user sees the branded "Something went wrong" with a
     * working retry — an error state, not a white screen, and NOT an uncaught
     * exception. (A per-panel guard that kept the transcript alive would be
     * kinder; noted as a followup, but this locks in the floor: never blank,
     * never unhandled.)
     */
    await expect(page.getByTestId('route-error')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('route-error-retry')).toBeVisible()

    expect(errors.uncaught).toEqual([])
    // No console assertion here: the boundary itself logs the error it caught
    // (app/error.tsx does so deliberately) — that line is the HANDLED path.
  })
})

// ── Slow, then fine ─────────────────────────────────────────────────────────

test.describe('errors · slow but healthy', () => {
  test('ERR-I · a slow detail shows the skeleton, then the content — never a flash of error', async ({
    page,
    seededMeeting,
  }) => {
    const errors = watchErrors(page)
    const notepad = new NotepadPage(page)
    const transcript = new TranscriptComponent(page)

    // 3s: well past "instant", well inside the 15s client budget.
    await delayRoute(page, detailOf(seededMeeting.id), 3000)
    await notepad.goto(seededMeeting.id)

    // The pending state, not an error: a slow answer is not a wrong answer.
    await expect(page.getByLabel('Loading meeting')).toBeVisible({ timeout: 15_000 })
    await expect(notepad.error).toHaveCount(0)

    // Poll until the content lands; the error state must never appear en
    // route — a flash of error that self-heals still reads as broken.
    const deadline = Date.now() + 30_000
    while (!(await notepad.header.isVisible())) {
      expect(Date.now(), 'meeting content never arrived').toBeLessThan(deadline)
      await expect(notepad.error).toHaveCount(0)
      await page.waitForTimeout(200)
    }

    await expect(notepad.title).toHaveText(seededMeeting.title)
    await expect(transcript.list).toBeVisible({ timeout: 20_000 })
    await expect(notepad.error).toHaveCount(0)

    expect(errors.uncaught).toEqual([])
    expect(errors.console).toEqual([])
  })
})
