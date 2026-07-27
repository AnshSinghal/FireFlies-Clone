import { expect, test, type Page } from '@playwright/test'

import { API_BASE } from '../api-base'

/**
 * Post-deploy smoke suite (T-40.13) — exactly 12 tests, tagged `@smoke`.
 *
 * This file answers one question in under a minute: is the thing that just
 * shipped actually working? It runs in two modes:
 *
 *   Local (default) — against the stack `playwright.config.ts` boots on
 *   3140/8140, as part of the ordinary suite.
 *
 *   Deployed — against a live URL, catching "works locally, broken in prod":
 *
 *     SMOKE_URL=http://8.231.115.48:8600 npx playwright test 98-smoke --project=read-only
 *
 * Rules this file lives by, because production is on the other end:
 *
 *   READ-ONLY. Nothing here creates, edits or deletes — no `@mutates` tag,
 *   ever. Opening the create modal is as far as it goes.
 *
 *   SELF-CONTAINED. No fixture or helper imports; everything the twelve tests
 *   need is defined below. The file must keep working if the rest of the
 *   harness changes shape.
 *
 *   SEED-RESILIENT. The deployed database is seeded by the same seeder but is
 *   not guaranteed to be byte-identical (ids, counts, dates drift as seeds
 *   evolve). So assertions are about SHAPE — rows exist, timestamps look like
 *   timestamps, counts agree with each other — never about exact strings.
 *   The one exception is the five canonical summary section names, which are
 *   themselves part of the spec (T-23) and must read verbatim everywhere.
 */

const SMOKE_URL = process.env.SMOKE_URL

/*
 * Where the API lives. Deployed, nginx serves app and API from ONE origin
 * (deploy/nginx-fireflies.conf routes /api/* to the backend); locally the
 * backend answers directly on its own port.
 */
const API_URL = SMOKE_URL ?? API_BASE

if (SMOKE_URL) test.use({ baseURL: SMOKE_URL })

async function openNotebook(page: Page): Promise<void> {
  await page.goto('/notebook')
  await expect(page.getByTestId('meeting-list')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('meeting-row').first()).toBeVisible({ timeout: 20_000 })
}

/**
 * Into the most recent meeting THROUGH the list, not via a hard-coded
 * `/meeting/1` — ids are a property of one particular seeding run, and the
 * navigation itself is part of what a smoke test should prove.
 */
async function openFirstMeeting(page: Page): Promise<void> {
  await openNotebook(page)
  await page.getByTestId('meeting-row').first().getByTestId('meeting-row-title').click()
  await page.waitForURL(/\/meeting\/\d+/, { timeout: 20_000 })
  await expect(page.getByTestId('transcript-list')).toBeVisible({ timeout: 20_000 })
}

/** Transcript lines, minus the row-action buttons that share the prefix. */
const segmentRows = (page: Page) =>
  page.locator('[data-testid^="transcript-segment-"]:not([data-testid*="actions"])')

/** The playhead in seconds, from the value a screen reader is given. */
const position = (page: Page) =>
  page.getByTestId('player-seekbar').getAttribute('aria-valuenow').then(Number)

/** The longest word of a title — a query guaranteed to hit its own meeting. */
function distinctiveWord(title: string): string {
  const words = title.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  return words.sort((a, b) => b.length - a.length)[0] ?? title
}

test.describe('smoke', { tag: '@smoke' }, () => {
  /*
   * Wait for the origin to answer before asserting anything about it.
   *
   * This suite's whole job is to run right after a deploy, and the deploy it
   * follows is a container rebuild: CD polls every 90s and swaps both
   * containers. Run inside that window the twelve tests fail on a restarting
   * server and report a broken product — which is the one thing a smoke suite
   * must never do, because the next person stops believing it.
   *
   * Measured: five consecutive deployed runs where the first hit a rebuild
   * (4 failed, 25.4s) and the next four were clean (12 passed, ~6s each).
   *
   * Deployed mode only. Locally, `webServer` has already waited on the health
   * endpoint before any test starts, so this would be dead weight.
   */
  test.beforeAll(async ({ request }) => {
    if (!SMOKE_URL) return
    const deadline = Date.now() + 90_000
    for (;;) {
      const ok = await request
        .get(`${API_URL}/api/health`, { timeout: 5_000 })
        .then((r) => r.ok())
        .catch(() => false)
      if (ok) return
      if (Date.now() > deadline) {
        throw new Error(
          `${SMOKE_URL} did not become healthy within 90s — the deploy is genuinely down, ` +
            'not merely mid-restart.',
        )
      }
      await new Promise((resolve) => setTimeout(resolve, 3_000))
    }
  })

  test('notebook renders seeded meeting rows', async ({ page }) => {
    await openNotebook(page)

    const rows = page.getByTestId('meeting-row')
    const count = await rows.count()
    expect(count).toBeGreaterThan(0)

    // Every row keeps the row's promises: a title, a date, a duration.
    for (const cell of ['meeting-row-title', 'meeting-row-date', 'meeting-row-duration']) {
      const values = await page.getByTestId(cell).allTextContents()
      expect(values).toHaveLength(count)
      for (const value of values) expect(value.trim()).not.toBe('')
    }

    await expect(page.getByTestId('notebook-count')).toContainText(/\d+ meeting/)
  })

  test('searching narrows the list and lands in the URL', async ({ page }) => {
    await openNotebook(page)

    const rows = page.getByTestId('meeting-row')
    const before = await rows.count()
    const word = distinctiveWord(
      (await rows.first().getByTestId('meeting-row-title').innerText()).trim(),
    )

    await page.getByTestId('notebook-search').fill(word)

    // The query is URL state (shareable), and the source meeting still matches.
    await expect(page).toHaveURL(/[?&]q=/, { timeout: 15_000 })
    await expect(rows.first()).toBeVisible({ timeout: 15_000 })
    await expect.poll(() => rows.count(), { timeout: 15_000 }).toBeLessThanOrEqual(before)

    // Narrowing all the way to zero shows the empty state, not a crash. The
    // WHICH variant (`no-results` vs `no-matches`) is 12-states' concern —
    // asserting it here would couple the smoke suite to one build's wording.
    await page.getByTestId('notebook-search').fill('zzqqxxyyveryunlikely')
    await expect(page.getByTestId('notebook-empty')).toBeVisible({ timeout: 15_000 })
    await expect(rows).toHaveCount(0)
  })

  test('a meeting opens from the list', async ({ page }) => {
    await openNotebook(page)
    const title = (
      await page.getByTestId('meeting-row').first().getByTestId('meeting-row-title').innerText()
    ).trim()

    await page.getByTestId('meeting-row').first().getByTestId('meeting-row-title').click()

    await page.waitForURL(/\/meeting\/\d+/, { timeout: 20_000 })
    await expect(page.getByTestId('notepad-header')).toBeVisible({ timeout: 20_000 })
    // The same meeting, not just any meeting — its title travelled with us.
    await expect(page.getByTestId('notepad-title')).toContainText(title)
  })

  test('the five summary sections, in canonical order', async ({ page }) => {
    await openFirstMeeting(page)
    await expect(page.getByTestId('summary-panel')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('summary-overview')).toBeVisible({ timeout: 20_000 })

    // The exception to the no-exact-strings rule: these five names, in this
    // order, are the spec (T-23) — "TL;DR" instead of "Meeting Overview" is
    // a real regression the smoke suite must catch.
    const ids = await page
      .locator('[data-testid^="summary-section-"]')
      .evaluateAll((sections) =>
        sections.map((section) =>
          section.getAttribute('data-testid')?.replace('summary-section-', ''),
        ),
      )
    expect(ids).toEqual(['keywords', 'overview', 'outline', 'notes', 'actions'])

    const labels: Record<string, string> = {
      keywords: 'Keywords',
      overview: 'Meeting Overview',
      outline: 'Meeting Outline',
      notes: 'Bullet-Point Notes',
      actions: 'Action Items',
    }
    for (const [id, label] of Object.entries(labels)) {
      await expect(page.getByTestId(`summary-section-${id}`)).toContainText(label)
    }
  })

  test('transcript renders segments with speakers and timestamps', async ({ page }) => {
    await openFirstMeeting(page)

    await expect(page.getByTestId('transcript-count')).toContainText(/\d+ segments/)

    const rendered = await segmentRows(page).evaluateAll((rows) =>
      rows.map((row) => ({
        time:
          row.querySelector('[data-testid^="transcript-timestamp-"]')?.textContent?.trim() ?? '',
        speaker:
          row.querySelector('[data-testid^="transcript-speaker-"]')?.textContent?.trim() ?? '',
      })),
    )

    expect(rendered.length).toBeGreaterThan(0)
    // Every line is timestamped; speakers appear on group starts (consecutive
    // lines by one voice share a label), so "some named speakers" is the shape.
    for (const row of rendered) expect(row.time).toMatch(/^\d{1,2}:\d{2}$/)
    expect(rendered.filter((row) => row.speaker.length > 0).length).toBeGreaterThan(0)
  })

  test('the player renders and a seek updates the clock', async ({ page }) => {
    await openFirstMeeting(page)

    await expect(page.getByTestId('player')).toBeVisible({ timeout: 20_000 })
    const seekbar = page.getByTestId('player-seekbar')
    const total = Number(await seekbar.getAttribute('aria-valuemax'))
    expect(total).toBeGreaterThan(0)

    const before = (await page.getByTestId('player-time').innerText()).trim()

    // The same seek path every control uses, reached from the keyboard.
    await seekbar.focus()
    await page.keyboard.press('End')

    await expect.poll(() => position(page), { timeout: 10_000 }).toBeGreaterThan(0)
    await expect(page.getByTestId('player-time')).not.toHaveText(before)
    expect((await page.getByTestId('player-time').innerText()).trim()).toMatch(/\d{1,2}:\d{2}/)
  })

  test('clicking a transcript line seeks the player', async ({ page }) => {
    await openFirstMeeting(page)

    const row = segmentRows(page).nth(3)
    await expect(row).toBeVisible()
    const stamp = await row.locator('[data-testid^="transcript-timestamp-"]').innerText()
    const [minutes, seconds] = stamp.trim().split(':').map(Number)
    const expected = minutes! * 60 + seconds!
    expect(expected).toBeGreaterThan(0)

    await row.click()

    // ±1s — the resolution the display and the ARIA value carry (T-21).
    await expect
      .poll(() => position(page), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(expected - 1)
    expect(await position(page)).toBeLessThanOrEqual(expected + 1)
  })

  test('action items render and their count matches the notebook badge', async ({ page }) => {
    await openNotebook(page)

    // The first row advertising open action items — found, not hard-coded.
    const rows = page.getByTestId('meeting-row')
    const total = await rows.count()
    let expected = -1
    for (let index = 0; index < total; index += 1) {
      const badge = rows.nth(index).getByTestId('meeting-row-actions')
      if ((await badge.count()) > 0) {
        expected = Number((await badge.innerText()).match(/\d+/)![0])
        await rows.nth(index).getByTestId('meeting-row-title').click()
        break
      }
    }
    expect(expected, 'no notebook row advertises action items').toBeGreaterThan(-1)

    await page.waitForURL(/\/meeting\/\d+/, { timeout: 20_000 })
    await expect(page.getByTestId('action-items-section')).toBeVisible({ timeout: 20_000 })

    // The badge counts OPEN items; the panel must agree with it exactly —
    // two views over one table, so a mismatch means a stale cache.
    const open = page.locator('[data-testid^="action-item-"][data-status="open"]')
    await expect(open).toHaveCount(expected, { timeout: 15_000 })
  })

  test('global search returns results', async ({ page }) => {
    await openNotebook(page)
    const word = distinctiveWord(
      (
        await page.getByTestId('meeting-row').first().getByTestId('meeting-row-title').innerText()
      ).trim(),
    )

    const search = page.getByTestId('topbar-search')
    await search.click()
    await search.fill(word)

    // At least the meeting the word came from turns up, grouped in the dropdown.
    await expect(page.getByTestId('search-row-meeting-0')).toBeVisible({ timeout: 15_000 })
    expect(
      await page.getByTestId('topbar-search-results').getByRole('option').count(),
    ).toBeGreaterThan(0)
  })

  test('the create modal opens', async ({ page }) => {
    // As far as a read-only suite goes: the modal opens with its dropzone
    // ready. Nothing is uploaded — this may be production.
    await page.goto('/upload?tab=upload')
    await expect(page.getByTestId('create-modal')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('create-dropzone')).toBeVisible()
  })

  test('the API answers over the request context', async ({ request }) => {
    const health = await request.get(`${API_URL}/api/health`)
    expect(health.status()).toBe(200)
    expect((await health.json()).status).toBe('ok')

    /*
     * /docs only when talking to the backend directly: the deployed nginx
     * (deploy/nginx-fireflies.conf) forwards /api/* alone, so FastAPI's docs
     * page is deliberately not public. Asserting a 404 there would be
     * asserting nginx config, not the API.
     */
    if (!SMOKE_URL) {
      expect((await request.get(`${API_URL}/docs`)).status()).toBe(200)
    }
  })

  test('notebook and notepad render without console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', (error) => errors.push(String(error)))

    // One journey covers both graded surfaces: list, then detail.
    await openFirstMeeting(page)
    await expect(page.getByTestId('summary-panel')).toBeVisible({ timeout: 20_000 })

    expect(errors).toEqual([])
  })
})
