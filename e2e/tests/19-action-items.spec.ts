import type { Page } from '@playwright/test'

// `../fixtures`, NOT `@playwright/test` — the auto-fixture there pins the
// browser clock to SEED_ANCHOR. T24-L asserts a "Due today" badge, which
// `describeDueDate` computes client-side from `new Date()`; on the bare
// Playwright `test` that is the real wall clock, so the badge only said
// "today" on the one real-world day that happened to line up with the seeded
// due date. It passed for two days and failed on the third.
import { expect, test } from '../fixtures'

/**
 * Action items (T-24, cases T24-A → T24-Q).
 *
 * The mutating cases live in `90-mutations.spec.ts`, which runs serially — a
 * checkbox toggled by one worker while another counts them is a flake nobody
 * can reproduce.
 */

/** The QBR: seven items, a mix of overdue, due-today and no-date. */
const QBR = 6
/** Seeded with an action item at `due_in_days: 0` — see T24-L. */
const STANDUP = 3

async function openActions(page: Page, meetingId = QBR): Promise<void> {
  await page.goto(`/meeting/${meetingId}`)
  await expect(page.getByTestId('action-items-section')).toBeVisible({ timeout: 20_000 })
}

const rows = (page: Page) =>
  page.locator('[data-testid^="action-item-"][data-status]')

test.describe('action items', () => {
  test('T24-A · seven items, grouped by assignee, open before completed', async ({ page }) => {
    await openActions(page)

    await expect(rows(page)).toHaveCount(7)

    const groups = page.locator('[data-testid^="action-items-group-"]')
    expect(await groups.count()).toBeGreaterThan(1)

    // Unassigned is LAST, whatever order the API returned the items in.
    const ids = await groups.evaluateAll((all) =>
      all.map((group) => group.getAttribute('data-testid')),
    )
    if (ids.includes('action-items-group-unassigned')) {
      expect(ids.at(-1)).toBe('action-items-group-unassigned')
    }

    // Within a group, open items sit above completed ones.
    const containers = page.locator('[data-testid^="action-items-group-container-"]')
    for (const container of await containers.all()) {
      const statuses = await container
        .locator('[data-testid^="action-item-"][data-status]')
        .evaluateAll((items) => items.map((item) => item.getAttribute('data-status')))

      const firstCompleted = statuses.indexOf('completed')
      if (firstCompleted !== -1) {
        expect(statuses.slice(firstCompleted).every((status) => status === 'completed')).toBe(true)
      }
    }
  })

  test('T24-E · the progress bar and the count agree', async ({ page }) => {
    await openActions(page)

    const label = await page.getByTestId('action-items-progress-label').innerText()
    const [completed, total] = label.match(/(\d+) of (\d+)/)!.slice(1).map(Number)

    const width = await page
      .getByTestId('action-items-progress')
      .locator('div')
      .evaluate((bar) => Number.parseFloat(bar.style.width))

    // Compared numerically: the browser stores the inline style rounded to six
    // decimal places, so a string comparison against 2/7 never matches.
    expect(width).toBeCloseTo((completed! / total!) * 100, 3)
  })

  test('T24-K · an overdue item is badged in danger, with the number of days', async ({ page }) => {
    await openActions(page)

    const overdue = page.locator('[data-testid^="action-item-due-"][data-tone="overdue"]').first()
    await expect(overdue).toBeVisible()
    await expect(overdue).toContainText(/\d+ days? overdue/)

    const colour = await overdue.evaluate((el) => getComputedStyle(el).color)
    const danger = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--ff-danger').trim(),
    )
    expect(danger.length).toBeGreaterThan(0)
    // Resolved to rgb() by the browser, so compared against the muted colour
    // rather than against the raw token.
    const muted = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--ff-text-muted').trim(),
    )
    expect(colour).not.toBe(muted)
  })

  test('T24-L · a due-today item is badged as such, in warning', async ({ page }) => {
    /*
     * STANDUP, not the QBR this file otherwise uses. The QBR's action items are
     * seeded at `due_in_days` -12, -11, -8, -4, 1 and 3 — nothing due on the
     * anchor day — so with the clock correctly pinned there is no "today" badge
     * on that meeting at all.
     *
     * It passed anyway until the clock got pinned, which is the interesting
     * part: this file was importing `test` from `@playwright/test` instead of
     * `../fixtures`, so it ran on the real wall clock. The QBR item at
     * `due_in_days: 1` is 2026-07-27, and the suite happened to be run on
     * 2026-07-27. The assertion was reading the calendar, not the seed.
     *
     * The standup has an item at `due_in_days: 0`, which is due-today for ANY
     * anchor. That is the property this test needs.
     */
    await openActions(page, STANDUP)

    const today = page.locator('[data-testid^="action-item-due-"][data-tone="today"]').first()
    await expect(today).toBeVisible()
    await expect(today).toHaveText('Due today')
  })

  test('T24-M · an item with no due date renders no due element at all', async ({ page }) => {
    await openActions(page)

    // Not the string "No due date": nothing.
    const withDates = await page.locator('[data-testid^="action-item-due-"]').count()
    const total = await rows(page).count()
    expect(withDates).toBeLessThan(total)

    for (const row of await rows(page).all()) {
      const id = (await row.getAttribute('data-testid'))!.replace('action-item-', '')
      const due = row.locator(`[data-testid="action-item-due-${id}"]`)
      if ((await due.count()) === 0) {
        await expect(row).not.toContainText('No due date')
      }
    }
  })

  test('T24-N · the timestamp chip seeks to the moment it was said', async ({ page }) => {
    await openActions(page)

    const chip = page.locator('[data-testid^="action-item-timestamp-"]').first()
    const label = (await chip.getAttribute('aria-label'))!
    const [minutes, seconds] = label.match(/(\d{1,2}):(\d{2})/)!.slice(1).map(Number)
    const expected = minutes! * 60 + seconds!

    await chip.click()

    await expect
      .poll(() => page.getByTestId('player-seekbar').getAttribute('aria-valuenow').then(Number))
      .toBeGreaterThanOrEqual(expected - 1)
  })

  test('T24-P · filtering shows only that subset, without changing the count', async ({ page }) => {
    await openActions(page)

    const before = await page.getByTestId('action-items-progress-label').innerText()
    const total = await rows(page).count()

    await page.getByTestId('action-items-filter-completed').click()
    const completedRows = await rows(page).count()
    expect(completedRows).toBeLessThan(total)
    for (const row of await rows(page).all()) {
      await expect(row).toHaveAttribute('data-status', 'completed')
    }

    // The header counts the WHOLE list, not the filtered view — a progress
    // figure that changed with the filter would be meaningless.
    await expect(page.getByTestId('action-items-progress-label')).toHaveText(before)

    await page.getByTestId('action-items-filter-open').click()
    for (const row of await rows(page).all()) {
      await expect(row).toHaveAttribute('data-status', 'open')
    }
  })

  test('T24-G · adding with empty text is blocked before any request', async ({ page }) => {
    await openActions(page)

    let posted = 0
    await page.route('**/api/v1/meetings/*/action-items', (route) => {
      if (route.request().method() === 'POST') posted += 1
      return route.continue()
    })

    await page.getByTestId('action-item-add').click()
    await expect(page.getByTestId('action-item-composer')).toBeVisible()

    await page.getByTestId('action-item-composer-save').click()

    await expect(page.getByTestId('action-item-composer')).toContainText('needs some text')
    expect(posted).toBe(0)
  })

  test('T24-Q · a meeting with no action items says so', async ({ page }) => {
    await page.route('**/api/v1/meetings/*/action-items', (route) =>
      route.fulfill({ json: [] }),
    )
    await openActions(page)

    const empty = page.getByTestId('action-items-empty')
    await expect(empty).toBeVisible()
    await expect(empty).toContainText('No action items')
    await expect(empty).toContainText('regenerate the summary')
  })

  test('T24-D · a failed toggle reverts the checkbox', async ({ page }) => {
    await openActions(page)

    await page.route('**/api/v1/meetings/action-items/*', (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({
            status: 500,
            json: { error: { code: 'INTERNAL_ERROR', message: 'Boom', details: {} } },
          })
        : route.continue(),
    )

    const open = page.locator('[data-testid^="action-item-"][data-status="open"]').first()
    const id = (await open.getAttribute('data-testid'))!.replace('action-item-', '')
    const checkbox = page.getByTestId(`action-item-checkbox-${id}`)

    await checkbox.click()

    // Ticked instantly, then put back when the request fails — and the row is
    // still there, rather than having been optimistically filtered away.
    await expect(checkbox).toHaveAttribute('data-state', 'unchecked', { timeout: 10_000 })
    await expect(page.getByTestId(`action-item-${id}`)).toHaveAttribute('data-status', 'open')
  })
})
